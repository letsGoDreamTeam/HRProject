import logging
import io
import re
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import quote
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.database import get_db
from app.deps_auth import get_current_user
from app.models_hr import (
    ApplicationFilterBatch,
    ApplicationFilterItem,
    CandidateApplicationLink,
    CandidateDedupReviewLog,
    CandidateMaster,
    InterviewEvaluationSubmission,
    InterviewRound,
    JobRoleProfile,
    NotificationOutbox,
    StageConfirmToken,
    User,
)
from app.schemas_hr import (
    ApplicationBatchCreate,
    ApplicationBatchOut,
    ApplicationBatchPatch,
    ApplicationItemOut,
    BatchResumeInsightRowOut,
    BatchResumeInsightsOut,
    ApplicantStatusDashboardOut,
    ApplicantStatusDashboardRowOut,
    CandidateDedupLogOut,
    CandidateDedupMergeRequest,
    CandidateDedupSeparateRequest,
    CandidateDedupeApplicationOut,
    CandidateDedupeGroupOut,
    CandidateDedupeReviewOut,
    CandidateMasterOut,
    DedupeScanOut,
    DuplicateGroupOut,
    FunnelStageCountOut,
    GenConfirmUrlOut,
    GenConfirmUrlRequest,
    PositionToVsPipelineRowOut,
    RecruitmentSummaryOut,
    ResumeStandardizeOut,
    ScheduledResultMailOut,
    ScheduledResultMailRequest,
    StagePassNotifyOut,
    StagePassNotifyRequest,
    StageUpdateRequest,
)
from app.services.application_screening import screen_application_text
from app.services.office_pdf_convert import convert_office_bytes_to_pdf
from app.services.resume_pdf_export import text_to_resume_pdf_bytes
from app.services.outbox_runner import process_due_outbox
from app.services.resume_standardizer import standardize_resume_text, to_standardized_text
from app.services.resume_text_extract import extract_resume_text_from_file
from app.services.xlsx_export import (
    applications_batch_to_xlsx_bytes,
    batch_resume_insights_to_xlsx_bytes,
    filename_for_batch,
)
from app.services.hr_job_roles_rag import search_user_job_roles
from app.services.hr_recruitment_stages import (
    ALLOWED_STAGE_INPUTS,
    FUNNEL_STAGE_ORDER,
    STAGE_LABEL_KO,
    funnel_counts_by_stage,
    normalize_application_stage,
    suggest_bottleneck_line,
    suggest_weekly_action_line,
)

router = APIRouter(prefix="/api/hr/applications", tags=["hr-applications"])
logger = logging.getLogger(__name__)

_NOTIFY_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _notify_email_for_item(it: ApplicationFilterItem) -> str:
    """DB email_extracted → 표준화 JSON email → 표준화 텍스트 내 첫 이메일."""
    v = (it.email_extracted or "").strip()
    if v:
        return v[:320]
    sr = it.standardized_resume
    if isinstance(sr, dict):
        e = str(sr.get("email") or "").strip()
        if e:
            return e[:320]
    txt = (it.standardized_text or "").strip()
    m = _NOTIFY_EMAIL_RE.search(txt)
    if m:
        return m.group(0).strip()[:320]
    return ""


def _content_disposition_attachment(*, stem: str, extension: str) -> str:
    """
    한글 등 비 ASCII 파일명: ASCII filename + RFC5987 filename*=UTF-8''…
    (Starlette 헤더는 latin-1만 허용)
    """
    ext = extension if extension.startswith(".") else f".{extension}"
    raw_stem = re.sub(r"\s+", "_", (stem or "file").strip())[:180] or "file"
    display = f"{raw_stem}{ext}" if not raw_stem.lower().endswith(ext.lower()) else raw_stem
    ascii_stem = "".join(
        c if ord(c) < 128 and c not in '\\/"<>|:?*' and not c.isspace() else "_" for c in raw_stem
    ).strip("_") or "file"
    ascii_name = f"{ascii_stem[:160]}{ext}"
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(display, safe='')}"


def _default_bundle_title() -> str:
    """묶음 이름을 비웠을 때 접수 시각이 드러나도록 기본값 생성."""
    settings = get_settings()
    tzname = (settings.default_timezone or "Asia/Seoul").strip()
    try:
        tz = ZoneInfo(tzname)
    except Exception:  # noqa: BLE001
        tz = UTC
    return datetime.now(tz).strftime("지원서 접수 %Y-%m-%d %H:%M")


def _source_ext(name: str) -> str:
    ext = Path(name or "").suffix.lower().replace(".", "").strip()
    return ext[:15] if ext else "unknown"


def _split_patterns(raw: str) -> list[str]:
    return [x.strip() for x in (raw or "").splitlines() if x.strip()]


def _guess_source_platform(filename: str, content_text: str) -> str:
    s = f"{(filename or '').lower()} {(content_text or '').lower()[:300]}"
    if "saramin" in s or "사람인" in s:
        return "saramin"
    if "jobkorea" in s or "잡코리아" in s:
        return "jobkorea"
    if "wanted" in s or "원티드" in s:
        return "wanted"
    if "jumpit" in s or "점핏" in s:
        return "jumpit"
    if "linkedin" in s:
        return "linkedin"
    return "unknown"


def _missing_fields_from_standardized(std: dict | list) -> list[str]:
    if not isinstance(std, dict):
        return ["name", "birth_date", "email", "phone", "education", "experiences", "skills"]
    missing: list[str] = []
    if not str(std.get("name") or "").strip():
        missing.append("name")
    if not str(std.get("birth_date") or "").strip():
        missing.append("birth_date")
    if not str(std.get("email") or "").strip():
        missing.append("email")
    if not str(std.get("phone") or "").strip():
        missing.append("phone")
    if not isinstance(std.get("education"), list) or not (std.get("education") or []):
        missing.append("education")
    if not isinstance(std.get("experiences"), list) or not (std.get("experiences") or []):
        missing.append("experiences")
    if not isinstance(std.get("skills"), list) or not (std.get("skills") or []):
        missing.append("skills")
    return missing


def _infer_position_for_item(
    *,
    user_id: UUID,
    item: ApplicationFilterItem,
    batch: ApplicationFilterBatch,
    db: Session,
) -> str:
    explicit = (getattr(batch, "position_name", "") or "").strip()
    if explicit:
        return explicit
    if batch.job_role_id:
        role = db.get(JobRoleProfile, batch.job_role_id)
        if role and role.user_id == user_id:
            p = (role.job_title or "").strip()
            if p:
                return p
    query = ((item.standardized_text or "").strip() or (item.content_text or "").strip())[:1200]
    if not query:
        return ""
    try:
        settings = get_settings()
        hits = search_user_job_roles(settings, user_id=user_id, query=query, top_k=1)
        if hits:
            return str(hits[0].get("job_title") or "").strip()
    except Exception:
        return ""
    return ""


def _item_to_out(
    it: ApplicationFilterItem,
    latest_confirm_token: str | None = None,
    latest_confirm_stage_label: str | None = None,
    confirm_status: str | None = None,
) -> ApplicationItemOut:
    sn = it.blind_snippets if isinstance(it.blind_snippets, list) else []
    kf = it.keyword_flags if isinstance(it.keyword_flags, list) else []
    return ApplicationItemOut(
        id=it.id,
        filename=it.filename,
        blind_tier=it.blind_tier,
        blind_summary=it.blind_summary,
        blind_snippets=[str(x) for x in sn],
        preferred_met=it.preferred_met,
        preferred_reason=it.preferred_reason,
        keyword_flags=[str(x) for x in kf],
        candidate_name=it.candidate_name or "",
        birth_date=it.birth_date or "",
        email_extracted=it.email_extracted or "",
        notify_email=_notify_email_for_item(it),
        stage=normalize_application_stage(it.stage),
        duplicate_key=it.duplicate_key or "",
        standardized_text=it.standardized_text or "",
        standardized_resume=it.standardized_resume if isinstance(it.standardized_resume, dict) else {},
        source_ext=it.source_ext or "",
        pdf_conversion_status=it.pdf_conversion_status or "native_pdf",
        pdf_conversion_note=it.pdf_conversion_note or "",
        has_source_attachment=bool(it.source_blob),
        text_quality_ok=bool(it.text_quality_ok),
        text_quality_note=it.text_quality_note or "",
        analyzed_at=it.analyzed_at,
        schedule_confirmed_at=it.schedule_confirmed_at,
        latest_confirm_token=latest_confirm_token,
        latest_confirm_stage_label=latest_confirm_stage_label,
        confirm_status=confirm_status,
        source_platform=it.source_platform or "unknown",
        role_relevance_score=float(getattr(it, "role_relevance_score", 0) or 0),
        resume_completeness_score=float(getattr(it, "resume_completeness_score", 0) or 0),
        missing_fields=[str(x) for x in (it.missing_fields if isinstance(it.missing_fields, list) else [])],
        preferred_rule_hits=[str(x) for x in (it.preferred_rule_hits if isinstance(it.preferred_rule_hits, list) else [])],
        preferred_rule_excluded_hits=[
            str(x) for x in (it.preferred_rule_excluded_hits if isinstance(it.preferred_rule_excluded_hits, list) else [])
        ],
        evidence_level=getattr(it, "evidence_level", "unknown") or "unknown",
    )


def _employer_sector(batch: ApplicationFilterBatch) -> str:
    v = (getattr(batch, "employer_sector", None) or "public").strip().lower()
    return v if v in ("public", "private") else "public"


def _norm_email(v: str) -> str:
    return (v or "").strip().lower()


def _norm_phone(v: str) -> str:
    return re.sub(r"\D+", "", v or "")


def _norm_name(v: str) -> str:
    return re.sub(r"\s+", "", (v or "").strip().lower())


def _platform_for_item(it: ApplicationFilterItem) -> str:
    fn = (it.filename or "").lower()
    txt = (it.content_text or "").lower()
    merged = f"{fn}\n{txt[:500]}"
    if "saramin" in merged or "사람인" in merged:
        return "saramin"
    if "jobkorea" in merged or "잡코리아" in merged:
        return "jobkorea"
    if "wanted" in merged or "원티드" in merged:
        return "wanted"
    if "linkedin" in merged:
        return "linkedin"
    return "unknown"


def _phone_from_item(it: ApplicationFilterItem) -> str:
    sr = it.standardized_resume if isinstance(it.standardized_resume, dict) else {}
    return _norm_phone(str(sr.get("phone") or ""))


def _calc_pair_score(a: ApplicationFilterItem, b: ApplicationFilterItem, ba: ApplicationFilterBatch, bb: ApplicationFilterBatch) -> tuple[float, str]:
    score = 0.0
    reasons: list[str] = []
    a_email = _norm_email(_notify_email_for_item(a))
    b_email = _norm_email(_notify_email_for_item(b))
    a_phone = _phone_from_item(a)
    b_phone = _phone_from_item(b)
    a_name = _norm_name(a.candidate_name)
    b_name = _norm_name(b.candidate_name)
    a_birth = (a.birth_date or "").strip()
    b_birth = (b.birth_date or "").strip()

    if a_email and b_email and a_email == b_email:
        score += 0.55
        reasons.append("이메일 일치")
    if a_phone and b_phone and a_phone == b_phone:
        score += 0.45
        reasons.append("전화번호 일치")
    if a_name and b_name and a_name == b_name:
        score += 0.2
        reasons.append("이름 일치")
    if a_birth and b_birth and a_birth == b_birth:
        score += 0.2
        reasons.append("생년월일 일치")

    a_std = a.standardized_resume if isinstance(a.standardized_resume, dict) else {}
    b_std = b.standardized_resume if isinstance(b.standardized_resume, dict) else {}
    a_major = ""
    b_major = ""
    a_edu = a_std.get("education")
    b_edu = b_std.get("education")
    if isinstance(a_edu, list) and a_edu:
        a_major = str((a_edu[0] or {}).get("major") or "").strip().lower()
    if isinstance(b_edu, list) and b_edu:
        b_major = str((b_edu[0] or {}).get("major") or "").strip().lower()
    if a_major and b_major and a_major == b_major:
        score += 0.05
        reasons.append("전공 일치")

    a_exp = a_std.get("experiences")
    b_exp = b_std.get("experiences")
    a_company = ""
    b_company = ""
    if isinstance(a_exp, list) and a_exp:
        a_company = str((a_exp[0] or {}).get("company") or "").strip().lower()
    if isinstance(b_exp, list) and b_exp:
        b_company = str((b_exp[0] or {}).get("company") or "").strip().lower()
    if a_company and b_company and a_company == b_company:
        score += 0.05
        reasons.append("경력회사 일치")

    if ba.job_role_id and bb.job_role_id and ba.job_role_id == bb.job_role_id:
        score += 0.1
        reasons.append("같은 직무 공고")

    score = min(score, 1.0)
    return score, ", ".join(reasons) if reasons else "약한 일치"


def _dedupe_status(score: float) -> str:
    if score >= 0.85:
        return "AUTO_MERGED"
    if score >= 0.45:
        return "REVIEW_REQUIRED"
    return "SEPARATE"


def _item_to_dedupe_app(it: ApplicationFilterItem, batch: ApplicationFilterBatch) -> CandidateDedupeApplicationOut:
    return CandidateDedupeApplicationOut(
        item_id=it.id,
        batch_id=batch.id,
        batch_title=batch.title or "",
        candidate_name=it.candidate_name or "",
        birth_date=it.birth_date or "",
        email=_notify_email_for_item(it),
        phone=_phone_from_item(it),
        stage=normalize_application_stage(it.stage),
        source_platform=_platform_for_item(it),
        created_at=batch.created_at,
    )


def _batch_to_out(batch: ApplicationFilterBatch, token_map: dict | None = None) -> ApplicationBatchOut:
    """token_map: {item_id: (token_str, attendance_str|None, stage_label|None)} — 없으면 토큰 미포함."""
    tm = token_map or {}
    items = []
    for it in batch.items:
        info = tm.get(str(it.id))  # (token, attendance, stage_label) | None
        token = info[0] if info else None
        attendance = info[1] if info else None
        stage_label = info[2] if info else None
        if token and not (stage_label or "").strip():
            # 링크만 미리 생성하고 아직 발송하지 않은 상태는 카드에 노출하지 않음
            token = None
            stage_label = None
        if token is None:
            status = None
        elif attendance == "accepted":
            status = "accepted"
        elif attendance == "declined":
            status = "declined"
        else:
            status = "pending"
        items.append(_item_to_out(it, token, stage_label, status))
    return ApplicationBatchOut(
        id=batch.id,
        title=batch.title,
        jd_preferred_text=batch.jd_preferred_text,
        employer_sector=_employer_sector(batch),
        preferred_include_patterns=(getattr(batch, "preferred_include_patterns", "") or ""),
        preferred_exclude_patterns=(getattr(batch, "preferred_exclude_patterns", "") or ""),
        preferred_requires_evidence=bool(getattr(batch, "preferred_requires_evidence", True)),
        department_name=(getattr(batch, "department_name", "") or ""),
        position_name=(getattr(batch, "position_name", "") or ""),
        posting_platform=(getattr(batch, "posting_platform", "") or ""),
        posted_at=getattr(batch, "posted_at", None),
        deadline_at=getattr(batch, "deadline_at", None),
        job_role_id=getattr(batch, "job_role_id", None),
        created_at=batch.created_at,
        items=items,
    )


@router.post("/batches", response_model=ApplicationBatchOut)
async def create_batch(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
    title: str = Form(""),
    jd_preferred_text: str = Form(""),
    job_role_id: str = Form(""),
    employer_sector: str = Form("public"),
    preferred_include_patterns: str = Form(""),
    preferred_exclude_patterns: str = Form(""),
    preferred_requires_evidence: bool = Form(True),
    department_name: str = Form(""),
    position_name: str = Form(""),
    posting_platform: str = Form(""),
    posted_at: str = Form(""),
    deadline_at: str = Form(""),
    files: list[UploadFile] = File(default_factory=list),
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    if not files:
        raise HTTPException(status_code=400, detail="문서 파일을 1개 이상 업로드하세요.")
    settings = get_settings()
    jr_uuid: UUID | None = None
    if (job_role_id or "").strip():
        try:
            jr_uuid = UUID(job_role_id.strip())
        except ValueError as e:
            raise HTTPException(status_code=400, detail="job_role_id 형식이 올바르지 않습니다.") from e
        jr = db.get(JobRoleProfile, jr_uuid)
        if not jr or jr.user_id != user.id:
            raise HTTPException(status_code=404, detail="직무를 찾을 수 없습니다.")
    es = (employer_sector or "public").strip().lower()
    if es not in ("public", "private"):
        es = "public"
    posted_dt: datetime | None = None
    deadline_dt: datetime | None = None
    if (posted_at or "").strip():
        try:
            posted_dt = datetime.fromisoformat(posted_at.strip().replace("Z", "+00:00"))
        except ValueError as e:
            raise HTTPException(status_code=400, detail="posted_at 형식이 올바르지 않습니다.") from e
    if (deadline_at or "").strip():
        try:
            deadline_dt = datetime.fromisoformat(deadline_at.strip().replace("Z", "+00:00"))
        except ValueError as e:
            raise HTTPException(status_code=400, detail="deadline_at 형식이 올바르지 않습니다.") from e
    batch = ApplicationFilterBatch(
        user_id=user.id,
        title=title.strip() or _default_bundle_title(),
        jd_preferred_text=jd_preferred_text.strip(),
        job_role_id=jr_uuid,
        employer_sector=es,
        preferred_include_patterns=(preferred_include_patterns or "").strip(),
        preferred_exclude_patterns=(preferred_exclude_patterns or "").strip(),
        preferred_requires_evidence=bool(preferred_requires_evidence),
        department_name=(department_name or "").strip()[:200],
        position_name=(position_name or "").strip()[:200],
        posting_platform=(posting_platform or "").strip()[:80],
        posted_at=posted_dt,
        deadline_at=deadline_dt,
    )
    db.add(batch)
    db.flush()
    success_count = 0
    fail_count = 0
    for f in files:
        raw = await f.read()
        if not raw:
            continue
        if len(raw) > settings.pdf_max_bytes:
            raise HTTPException(status_code=413, detail=f"파일이 너무 큽니다: {f.filename}")
        src_ext = _source_ext(f.filename or "")
        try:
            text, extract_status, extract_note = extract_resume_text_from_file(
                raw=raw,
                filename=f.filename or "document",
                content_type=f.content_type or "",
                settings=settings,
            )
        except ValueError as e:
            fail_count += 1
            logger.warning("resume unsupported format filename=%s error=%s", f.filename, e)
            db.add(
                ApplicationFilterItem(
                    batch_id=batch.id,
                    filename=(f.filename or "document")[:500],
                    content_text="",
                    source_ext=src_ext,
                    pdf_conversion_status="extract_failed",
                    pdf_conversion_note=str(e)[:500],
                    text_quality_ok=False,
                    text_quality_note="지원 형식 아님",
                )
            )
            continue
        except Exception as e:  # noqa: BLE001
            fail_count += 1
            logger.warning("resume text extraction failed filename=%s error=%s", f.filename, e)
            db.add(
                ApplicationFilterItem(
                    batch_id=batch.id,
                    filename=(f.filename or "document")[:500],
                    content_text="",
                    source_ext=src_ext,
                    pdf_conversion_status="extract_failed",
                    pdf_conversion_note=f"텍스트 추출 실패: {str(e)[:240]}",
                    text_quality_ok=False,
                    text_quality_note="텍스트 추출 실패",
                )
            )
            continue
        quality_ok = len((text or "").strip()) >= int(settings.resume_text_min_chars)
        quality_note = "" if quality_ok else f"추출 글자 수 부족({len((text or '').strip())} chars)"
        if not quality_ok:
            logger.info("resume low-quality text filename=%s chars=%s", f.filename, len((text or "").strip()))
        blob: bytes | None = None
        if src_ext != "pdf" and len(raw) <= int(settings.resume_source_blob_max_bytes):
            blob = raw
        item = ApplicationFilterItem(
            batch_id=batch.id,
            filename=(f.filename or "document")[:500],
            content_text=text,
            source_ext=src_ext,
            pdf_conversion_status=extract_status,
            pdf_conversion_note=extract_note,
            text_quality_ok=quality_ok,
            text_quality_note=quality_note,
            source_blob=blob,
            source_platform=_guess_source_platform(f.filename or "", text),
        )
        db.add(item)
        success_count += 1
    if success_count == 0:
        db.commit()
        raise HTTPException(
            status_code=422,
            detail=f"업로드 문서를 처리하지 못했습니다. 실패 {fail_count}건. 변환 로그를 확인하세요.",
        )
    db.commit()
    db.refresh(batch)
    # reload items
    db.refresh(batch, attribute_names=["items"])
    return _batch_to_out(batch)


@router.post("/batches/json", response_model=ApplicationBatchOut)
def create_batch_json(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
    body: ApplicationBatchCreate,
):
    """PDF 없이 텍스트만으로 지원서 묶음 생성(테스트·연동용). items는 빈 채로 두고 이후 확장 가능."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    jr_uuid = body.job_role_id
    if jr_uuid is not None:
        jr = db.get(JobRoleProfile, jr_uuid)
        if not jr or jr.user_id != user.id:
            raise HTTPException(status_code=404, detail="직무를 찾을 수 없습니다.")
    es = body.employer_sector if body.employer_sector in ("public", "private") else "public"
    batch = ApplicationFilterBatch(
        user_id=user.id,
        title=body.title.strip() or _default_bundle_title(),
        jd_preferred_text=body.jd_preferred_text.strip(),
        job_role_id=jr_uuid,
        employer_sector=es,
        preferred_include_patterns=(body.preferred_include_patterns or "").strip(),
        preferred_exclude_patterns=(body.preferred_exclude_patterns or "").strip(),
        preferred_requires_evidence=bool(body.preferred_requires_evidence),
        department_name=(body.department_name or "").strip()[:200],
        position_name=(body.position_name or "").strip()[:200],
        posting_platform=(body.posting_platform or "").strip()[:80],
        posted_at=body.posted_at,
        deadline_at=body.deadline_at,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return _batch_to_out(batch)


@router.post("/batches/{batch_id}/standardize", response_model=ResumeStandardizeOut)
def standardize_batch_resumes(
    batch_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """AI로 이력서 양식 표준화(JSON/정리 텍스트), 중복키(name+birth_date) 생성."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    batch = db.get(ApplicationFilterBatch, batch_id)
    if not batch or batch.user_id != user.id:
        raise HTTPException(status_code=404, detail="지원서 묶음을 찾을 수 없습니다.")
    settings = get_settings()
    updated = 0
    skipped = 0
    for it in batch.items:
        txt = (it.content_text or "").strip()
        if not txt:
            skipped += 1
            continue
        try:
            std = standardize_resume_text(resume_text=txt, settings=settings)
        except ValueError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"표준화 실패: {e!s}") from e
        it.standardized_resume = std
        it.standardized_text = to_standardized_text(std)
        it.candidate_name = str(std.get("name") or "").strip()[:200]
        it.birth_date = str(std.get("birth_date") or "").strip()[:32]
        it.email_extracted = str(std.get("email") or "").strip()[:320]
        n = it.candidate_name.replace(" ", "").lower()
        b = it.birth_date.replace(" ", "")
        it.duplicate_key = f"{n}|{b}" if n and b else ""
        missing = _missing_fields_from_standardized(std)
        it.missing_fields = missing
        it.resume_completeness_score = max(0.0, round(1.0 - (len(missing) / 7), 3))
        updated += 1
    db.commit()
    return ResumeStandardizeOut(updated=updated, skipped=skipped)


@router.get("/batches/{batch_id}/dedupe", response_model=DedupeScanOut)
def dedupe_scan_batch(
    batch_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """이름+생년월일 기준 중복 후보 그룹만 반환(최종 제거는 사람이 결정)."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    batch = db.get(ApplicationFilterBatch, batch_id)
    if not batch or batch.user_id != user.id:
        raise HTTPException(status_code=404, detail="지원서 묶음을 찾을 수 없습니다.")
    groups: dict[str, list[ApplicationFilterItem]] = {}
    for it in batch.items:
        key = (it.duplicate_key or "").strip()
        if not key:
            continue
        groups.setdefault(key, []).append(it)
    out: list[DuplicateGroupOut] = []
    for key, items in groups.items():
        if len(items) < 2:
            continue
        out.append(
            DuplicateGroupOut(
                key=key,
                item_ids=[x.id for x in items],
                names=[x.candidate_name for x in items],
                birth_dates=[x.birth_date for x in items],
            )
        )
    return DedupeScanOut(groups=out)


@router.get("/dedupe/review", response_model=CandidateDedupeReviewOut)
def dedupe_review_candidates(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
    batch_id: UUID | None = Query(None),
):
    """강/약한 키 스코어로 중복 의심 후보군을 계산한다."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    stmt = (
        select(ApplicationFilterItem, ApplicationFilterBatch)
        .join(ApplicationFilterBatch, ApplicationFilterBatch.id == ApplicationFilterItem.batch_id)
        .where(ApplicationFilterBatch.user_id == user.id)
    )
    if batch_id is not None:
        stmt = stmt.where(ApplicationFilterBatch.id == batch_id)
    rows = db.execute(stmt).all()
    if len(rows) < 2:
        return CandidateDedupeReviewOut(groups=[])

    items: list[tuple[ApplicationFilterItem, ApplicationFilterBatch]] = list(rows)
    n = len(items)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    pair_meta: dict[tuple[int, int], tuple[float, str]] = {}
    for i in range(n):
        ai, abi = items[i]
        for j in range(i + 1, n):
            bj, bbj = items[j]
            score, reason = _calc_pair_score(ai, bj, abi, bbj)
            if score < 0.45:
                continue
            pair_meta[(i, j)] = (score, reason)
            union(i, j)

    groups_idx: dict[int, list[int]] = {}
    for idx in range(n):
        root = find(idx)
        groups_idx.setdefault(root, []).append(idx)

    out_groups: list[CandidateDedupeGroupOut] = []
    for members in groups_idx.values():
        if len(members) < 2:
            continue
        pair_scores: list[float] = []
        reasons: list[str] = []
        for a in range(len(members)):
            for b in range(a + 1, len(members)):
                key = (min(members[a], members[b]), max(members[a], members[b]))
                v = pair_meta.get(key)
                if v:
                    pair_scores.append(v[0])
                    reasons.append(v[1])
        top_score = max(pair_scores) if pair_scores else 0.0
        status = _dedupe_status(top_score)
        app_rows = [_item_to_dedupe_app(items[x][0], items[x][1]) for x in members]
        out_groups.append(
            CandidateDedupeGroupOut(
                status=status, score=round(top_score, 3), reason=", ".join(sorted(set(reasons))),
                application_ids=[a.item_id for a in app_rows], applications=app_rows,
            )
        )
    out_groups.sort(key=lambda g: g.score, reverse=True)
    return CandidateDedupeReviewOut(groups=out_groups)


@router.post("/dedupe/merge", response_model=CandidateMasterOut)
def merge_duplicate_candidates(
    body: CandidateDedupMergeRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """선택한 지원서들을 동일 후보자로 병합."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    item_ids = list(dict.fromkeys(body.item_ids))
    if len(item_ids) < 2:
        raise HTTPException(status_code=400, detail="병합하려면 2건 이상 필요합니다.")
    rows = db.execute(
        select(ApplicationFilterItem, ApplicationFilterBatch)
        .join(ApplicationFilterBatch, ApplicationFilterBatch.id == ApplicationFilterItem.batch_id)
        .where(ApplicationFilterBatch.user_id == user.id, ApplicationFilterItem.id.in_(item_ids))
    ).all()
    if len(rows) != len(item_ids):
        raise HTTPException(status_code=404, detail="병합 대상 지원서를 찾을 수 없습니다.")

    by_item_id = {it.id: (it, b) for it, b in rows}
    primary_it, _ = by_item_id[item_ids[0]]
    candidate = CandidateMaster(
        user_id=user.id,
        canonical_name=primary_it.candidate_name or "",
        canonical_birth_date=primary_it.birth_date or "",
        canonical_email=_notify_email_for_item(primary_it),
        canonical_phone=_phone_from_item(primary_it),
    )
    db.add(candidate)
    db.flush()

    apps: list[CandidateDedupeApplicationOut] = []
    for item_id in item_ids:
        it, batch = by_item_id[item_id]
        link = db.scalars(
            select(CandidateApplicationLink).where(
                CandidateApplicationLink.user_id == user.id,
                CandidateApplicationLink.item_id == it.id,
            )
        ).first()
        if link:
            link.candidate_id = candidate.id
            link.source_platform = _platform_for_item(it)
        else:
            db.add(
                CandidateApplicationLink(
                    user_id=user.id,
                    candidate_id=candidate.id,
                    item_id=it.id,
                    source_platform=_platform_for_item(it),
                )
            )
        apps.append(_item_to_dedupe_app(it, batch))
    db.add(
        CandidateDedupReviewLog(
            user_id=user.id,
            action="merge",
            status="AUTO_MERGED" if len(item_ids) >= 3 else "REVIEW_REQUIRED",
            score=1.0,
            reason=(body.reason or "채용담당자 병합").strip()[:500],
            item_ids=[str(x) for x in item_ids],
            candidate_id=candidate.id,
        )
    )
    db.commit()
    db.refresh(candidate)
    return CandidateMasterOut(
        id=candidate.id,
        canonical_name=candidate.canonical_name,
        canonical_birth_date=candidate.canonical_birth_date,
        canonical_email=candidate.canonical_email,
        canonical_phone=candidate.canonical_phone,
        application_count=len(apps),
        applications=apps,
        created_at=candidate.created_at,
    )


@router.post("/dedupe/separate")
def separate_duplicate_candidates(
    body: CandidateDedupSeparateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """중복 후보군을 분리 처리하여 자동 병합 대상에서 제외."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    item_ids = list(dict.fromkeys(body.item_ids))
    if not item_ids:
        raise HTTPException(status_code=400, detail="분리할 item_ids가 비어 있습니다.")
    links = db.scalars(
        select(CandidateApplicationLink).where(
            CandidateApplicationLink.user_id == user.id,
            CandidateApplicationLink.item_id.in_(item_ids),
        )
    ).all()
    for link in links:
        db.delete(link)
    db.add(
        CandidateDedupReviewLog(
            user_id=user.id,
            action="separate",
            status="SEPARATE",
            score=0.0,
            reason=(body.reason or "채용담당자 분리").strip()[:500],
            item_ids=[str(x) for x in item_ids],
            candidate_id=None,
        )
    )
    db.commit()
    return {"ok": True, "separated": len(item_ids)}


@router.get("/dedupe/candidates", response_model=list[CandidateMasterOut])
def list_candidate_masters(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    masters = db.scalars(
        select(CandidateMaster)
        .where(CandidateMaster.user_id == user.id)
        .order_by(CandidateMaster.created_at.desc())
    ).all()
    out: list[CandidateMasterOut] = []
    for m in masters:
        links = db.execute(
            select(CandidateApplicationLink, ApplicationFilterItem, ApplicationFilterBatch)
            .join(ApplicationFilterItem, ApplicationFilterItem.id == CandidateApplicationLink.item_id)
            .join(ApplicationFilterBatch, ApplicationFilterBatch.id == ApplicationFilterItem.batch_id)
            .where(CandidateApplicationLink.candidate_id == m.id)
        ).all()
        apps: list[CandidateDedupeApplicationOut] = []
        for link, it, batch in links:
            apps.append(
                CandidateDedupeApplicationOut(
                    item_id=it.id,
                    batch_id=batch.id,
                    batch_title=batch.title or "",
                    candidate_name=it.candidate_name or "",
                    birth_date=it.birth_date or "",
                    email=_notify_email_for_item(it),
                    phone=_phone_from_item(it),
                    stage=normalize_application_stage(it.stage),
                    source_platform=link.source_platform or _platform_for_item(it),
                    created_at=batch.created_at,
                )
            )
        out.append(
            CandidateMasterOut(
                id=m.id,
                canonical_name=m.canonical_name,
                canonical_birth_date=m.canonical_birth_date,
                canonical_email=m.canonical_email,
                canonical_phone=m.canonical_phone,
                application_count=len(apps),
                applications=apps,
                created_at=m.created_at,
            )
        )
    return out


@router.get("/dedupe/logs", response_model=list[CandidateDedupLogOut])
def list_dedup_logs(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
    limit: int = Query(50, ge=1, le=300),
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    rows = db.scalars(
        select(CandidateDedupReviewLog)
        .where(CandidateDedupReviewLog.user_id == user.id)
        .order_by(CandidateDedupReviewLog.created_at.desc())
        .limit(limit)
    ).all()
    return [
        CandidateDedupLogOut(
            id=r.id,
            action=r.action,
            status=r.status,
            score=float(r.score or 0),
            reason=r.reason or "",
            item_ids=[UUID(str(x)) for x in (r.item_ids if isinstance(r.item_ids, list) else [])],
            candidate_id=r.candidate_id,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.patch("/items/{item_id}/stage", response_model=ApplicationItemOut)
def update_application_stage(
    item_id: UUID,
    body: StageUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """칸반 이동: 서류→n차면접→최종합/불."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    stmt = (
        select(ApplicationFilterItem)
        .join(ApplicationFilterBatch, ApplicationFilterBatch.id == ApplicationFilterItem.batch_id)
        .where(ApplicationFilterItem.id == item_id, ApplicationFilterBatch.user_id == user.id)
    )
    it = db.scalars(stmt).first()
    if not it:
        raise HTTPException(status_code=404, detail="지원자를 찾을 수 없습니다.")
    raw_stage = (body.stage or "").strip()
    if raw_stage not in ALLOWED_STAGE_INPUTS:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 단계입니다: {raw_stage}")
    it.stage = normalize_application_stage(raw_stage)
    db.commit()
    db.refresh(it)
    return _item_to_out(it)


@router.post("/items/{item_id}/gen-confirm-url", response_model=GenConfirmUrlOut)
def gen_confirm_url(
    item_id: UUID,
    body: GenConfirmUrlRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """확인 링크 미리 생성(이메일 미발송). 모달 열릴 때 호출해 미리보기에 실제 URL을 표시하는 용도.
    미응답 상태의 기존 토큰이 있으면 재사용하고, 없으면 새로 생성한다.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    stmt = (
        select(ApplicationFilterItem)
        .join(ApplicationFilterBatch, ApplicationFilterBatch.id == ApplicationFilterItem.batch_id)
        .where(ApplicationFilterItem.id == item_id, ApplicationFilterBatch.user_id == user.id)
    )
    it = db.scalars(stmt).first()
    if not it:
        raise HTTPException(status_code=404, detail="지원자를 찾을 수 없습니다.")

    # 미응답 기존 토큰 재사용
    existing = db.scalars(
        select(StageConfirmToken)
        .where(
            StageConfirmToken.item_id == it.id,
            StageConfirmToken.attendance.is_(None),
        )
        .order_by(StageConfirmToken.created_at.desc())
    ).first()

    if existing:
        tok = existing
    else:
        tok = StageConfirmToken(user_id=user.id, item_id=it.id, stage_label="")
        db.add(tok)
        db.commit()
        db.refresh(tok)

    site_base = (body.site_base_url or "http://localhost:5173").rstrip("/")
    return GenConfirmUrlOut(
        confirm_url=f"{site_base}/confirm/{tok.token}",
        token=tok.token,
    )


@router.post("/items/{item_id}/pass-notify", response_model=StagePassNotifyOut)
def send_stage_pass_notify(
    item_id: UUID,
    body: StagePassNotifyRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """단계 합격 축하 이메일 발송 큐 등록.
    지원자의 email_extracted로 '축하합니다. 다음 단계는 ○○이며, 일정은 ○월 ○일' 형식으로 발송.
    pre_token을 넘기면 해당 토큰을 재사용하고(내용 업데이트), 없으면 새로 생성한다.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    stmt = (
        select(ApplicationFilterItem)
        .join(ApplicationFilterBatch, ApplicationFilterBatch.id == ApplicationFilterItem.batch_id)
        .where(ApplicationFilterItem.id == item_id, ApplicationFilterBatch.user_id == user.id)
    )
    it = db.scalars(stmt).first()
    if not it:
        raise HTTPException(status_code=404, detail="지원자를 찾을 수 없습니다.")

    email = _notify_email_for_item(it)
    if not email:
        raise HTTPException(
            status_code=422,
            detail="지원자 이메일을 찾을 수 없습니다. 표준화 JSON에 email이 있는지, 또는 이력서 본문에 메일 주소가 있는지 확인한 뒤 표준화를 다시 실행해 주세요.",
        )
    if email and not (it.email_extracted or "").strip():
        it.email_extracted = email
        db.flush()

    name = (it.candidate_name or "지원자").strip()
    stage_label = body.stage_label.strip()
    is_rejection_notify = (body.next_stage_key or "").strip() in {"rejected", "final_fail"}
    schedule_pick_url = (body.schedule_pick_url or "").strip()

    confirm_url: str | None = None
    if not is_rejection_notify:
        # --- 확인 토큰: pre_token 재사용 또는 신규 생성 ---
        confirm_token: StageConfirmToken | None = None
        if body.pre_token:
            confirm_token = db.scalars(
                select(StageConfirmToken).where(
                    StageConfirmToken.token == body.pre_token,
                    StageConfirmToken.item_id == it.id,
                )
            ).first()
        if confirm_token is None:
            confirm_token = StageConfirmToken(
                user_id=user.id,
                item_id=it.id,
            )
            db.add(confirm_token)

        # 최신 내용으로 업데이트
        confirm_token.stage_label = stage_label
        confirm_token.next_stage_key = (body.next_stage_key or "").strip()
        confirm_token.schedule_pick_url = schedule_pick_url
        confirm_token.scheduled_at = body.scheduled_at
        confirm_token.location = (body.location or "").strip()
        confirm_token.note = (body.note or "").strip()
        db.flush()

        site_base = (body.site_base_url or "http://localhost:5173").rstrip("/")
        confirm_url = f"{site_base}/confirm/{confirm_token.token}"

    KST = ZoneInfo("Asia/Seoul")
    if body.scheduled_at:
        dt = body.scheduled_at.astimezone(KST)
        schedule_line = (
            f"📅 일정: {dt.year}년 {dt.month}월 {dt.day}일 "
            f"{dt.hour:02d}시 {dt.minute:02d}분"
        )
    else:
        schedule_line = "📅 일정: 추후 별도 안내 예정"

    location_line = f"📍 장소: {body.location.strip()}\n" if (body.location or "").strip() else ""
    note_section = f"\n{body.note.strip()}\n" if (body.note or "").strip() else ""

    if is_rejection_notify:
        subject = "[채용 안내] 전형 결과를 안내드립니다"
        mail_body = (
            f"{name}님, 안녕하세요.\n\n"
            f"이번 채용 전형에 지원해 주셔서 감사합니다.\n\n"
            f"아쉽게도 이번 전형에서는 함께하지 못하게 되었습니다.\n"
            f"({stage_label})\n\n"
            f"{note_section}\n"
            f"보내주신 시간과 노력에 진심으로 감사드립니다.\n"
            f"감사합니다."
        )
    else:
        subject = f"[채용 안내] {stage_label} 합격을 축하드립니다"
        guide_line = (
            f"아래 링크에서 참석/불참석을 선택해 주세요.\n👉 {confirm_url}\n\n"
            + ("참석을 선택하면 날짜/시간 선택 화면으로 이동합니다.\n\n" if schedule_pick_url else "")
        )
        mail_body = (
            f"{name}님, 안녕하세요.\n\n"
            f"이번 채용 전형에 지원해 주셔서 감사합니다.\n\n"
            f"축하합니다! 다음 단계 전형에 선발되셨습니다.\n\n"
            f"✅ 단계: {stage_label}\n"
            f"{schedule_line}\n"
            f"{location_line}"
            f"{note_section}\n"
            f"{guide_line}"
            f"궁금하신 사항은 채용 담당자에게 문의해 주세요.\n"
            f"감사합니다."
        )

    now = datetime.now(UTC)
    reserved_at = body.notify_at or now
    db.add(
        NotificationOutbox(
            user_id=user.id,
            channel="email",
            recipient=email,
            subject=subject[:400],
            body=mail_body,
            kind="stage_pass_notify",
            scheduled_at=reserved_at,
        )
    )
    db.commit()

    settings = get_settings()
    delivery_note = ""
    if reserved_at > now + timedelta(seconds=3):
        delivery_note = "예약 시각 이후에 스케줄러가 발송합니다."
    elif not ((settings.smtp_host or "").strip() and (settings.smtp_from or "").strip()):
        delivery_note = (
            "SMTP_HOST / SMTP_FROM 이 비어 있어 실제 메일은 발송되지 않고 대기열에만 저장됐습니다. "
            "서버 .env에 SMTP 설정을 넣으면 전송됩니다."
        )
    else:
        try:
            st = process_due_outbox(db, settings, limit=50)
            if (st.get("sent") or 0) > 0:
                delivery_note = "메일 서버로 전송을 시도했습니다."
            else:
                delivery_note = "대기열을 처리했으나 아직 발송 완료 행이 없을 수 있습니다. 잠시 후 다시 시도됩니다."
        except Exception:
            logger.exception("process_due_outbox after pass-notify")
            delivery_note = "대기열 즉시 처리 중 오류가 났습니다. 스케줄러가 재시도합니다."

    return StagePassNotifyOut(
        queued=1,
        scheduled_at=reserved_at,
        confirm_url=confirm_url,
        delivery_note=delivery_note,
    )


@router.delete("/items/{item_id}")
def delete_application_item(
    item_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """중복 정리 등 사람 판단으로 개별 카드 제거."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    stmt = (
        select(ApplicationFilterItem)
        .join(ApplicationFilterBatch, ApplicationFilterBatch.id == ApplicationFilterItem.batch_id)
        .where(ApplicationFilterItem.id == item_id, ApplicationFilterBatch.user_id == user.id)
    )
    it = db.scalars(stmt).first()
    if not it:
        raise HTTPException(status_code=404, detail="지원자를 찾을 수 없습니다.")
    db.delete(it)
    db.commit()
    return {"ok": True}


@router.post("/batches/{batch_id}/results/schedule", response_model=ScheduledResultMailOut)
def schedule_result_mails(
    batch_id: UUID,
    body: ScheduledResultMailRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """최종 합/불 열로 옮긴 카드들에 대해 특정 시각 자동 발송 예약."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    batch = db.get(ApplicationFilterBatch, batch_id)
    if not batch or batch.user_id != user.id:
        raise HTTPException(status_code=404, detail="지원서 묶음을 찾을 수 없습니다.")
    now = datetime.now(UTC)
    if body.send_immediately or body.schedule_at is None:
        schedule_at = now + timedelta(seconds=3)
    else:
        schedule_at = body.schedule_at
        if schedule_at <= now:
            raise HTTPException(
                status_code=400,
                detail="예약 시각은 현재보다 이후여야 합니다. 바로내려면 '즉시 발송'을 선택하세요.",
            )
    item_map = {it.id: it for it in batch.items}
    queued = 0
    skipped = 0
    for item_id in body.item_ids:
        it = item_map.get(item_id)
        if not it:
            continue
        dest = _notify_email_for_item(it)
        if not dest:
            skipped += 1
            continue
        if dest and not (it.email_extracted or "").strip():
            it.email_extracted = dest
        name = it.candidate_name or it.filename
        hired = body.result in ("hired", "final_pass")
        result_ko = "입사(합격) 확정" if hired else "최종 불합격"
        subj = body.subject_template.replace("{name}", name).replace("{result}", result_ko)
        msg = body.body_template.replace("{name}", name).replace("{result}", result_ko)
        db.add(
            NotificationOutbox(
                user_id=user.id,
                channel="email",
                recipient=dest,
                subject=subj[:400],
                body=msg[:8000],
                kind="final_result_scheduled",
                scheduled_at=schedule_at,
                correlation_key=f"result:{batch.id}:{it.id}:{int(schedule_at.timestamp())}",
            )
        )
        it.stage = "hired" if hired else "rejected"
        queued += 1
    db.commit()
    return ScheduledResultMailOut(queued=queued, skipped_no_email=skipped)


@router.get("/items/{item_id}/standardized.txt")
def download_standardized_text(
    item_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """표준 이력서 텍스트 다운로드(이후 PDF 저장/공유 용도)."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    stmt = (
        select(ApplicationFilterItem)
        .join(ApplicationFilterBatch, ApplicationFilterBatch.id == ApplicationFilterItem.batch_id)
        .where(ApplicationFilterItem.id == item_id, ApplicationFilterBatch.user_id == user.id)
    )
    it = db.scalars(stmt).first()
    if not it:
        raise HTTPException(status_code=404, detail="지원자를 찾을 수 없습니다.")
    text = (it.standardized_text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="표준화된 이력서가 없습니다. 먼저 표준화 실행하세요.")
    fn_stem = (it.candidate_name or Path(it.filename or "resume").stem or "resume").strip() or "resume"
    cd = _content_disposition_attachment(stem=f"{fn_stem}_standardized", extension=".txt")
    return Response(
        content=text.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": cd},
    )


@router.get("/items/{item_id}/export.pdf")
def export_application_pdf(
    item_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
    mode: Literal["text", "source"] = Query(
        "text",
        description="text=표준화·추출 텍스트 PDF, source=원본(docx 등) HTTP 변환 API 또는 LibreOffice",
    ),
):
    """이력서 PDF: 정리본(text) 또는 원본 변환(source, HTTP 변환 URL 또는 로컬 LibreOffice)."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    settings = get_settings()
    stmt = (
        select(ApplicationFilterItem)
        .join(ApplicationFilterBatch, ApplicationFilterBatch.id == ApplicationFilterItem.batch_id)
        .where(ApplicationFilterItem.id == item_id, ApplicationFilterBatch.user_id == user.id)
    )
    it = db.scalars(stmt).first()
    if not it:
        raise HTTPException(status_code=404, detail="지원자를 찾을 수 없습니다.")
    fn_stem = (it.candidate_name or Path(it.filename or "resume").stem or "resume").strip() or "resume"
    fn_stem = re.sub(r"\s+", "_", fn_stem)[:120]

    if mode == "source":
        if not it.source_blob:
            raise HTTPException(
                status_code=400,
                detail="원본 파일 바이트가 없습니다(PDF만 올렸거나 용량 한도 초과). '정리본 PDF(text)'를 사용하세요.",
            )
        if (it.source_ext or "").lower() == "pdf":
            raise HTTPException(
                status_code=400,
                detail="PDF 원본은 DB에 보관하지 않습니다. 정리본 PDF(mode=text)를 사용하세요.",
            )
        try:
            pdf_bytes, _note = convert_office_bytes_to_pdf(
                raw=it.source_blob,
                filename=it.filename or "document.docx",
                settings=settings,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"PDF 변환 실패: {e!s}") from e
    else:
        txt = (it.standardized_text or "").strip() or (it.content_text or "").strip()
        if not txt:
            raise HTTPException(status_code=400, detail="PDF로 만들 텍스트가 없습니다. 표준화 또는 AI 분류를 먼저 실행하세요.")
        title = (it.candidate_name or it.filename or "이력서").strip()
        try:
            pdf_bytes, _note = text_to_resume_pdf_bytes(text=txt, title=title)
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e

    cd = _content_disposition_attachment(stem=fn_stem, extension=".pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": cd},
    )


@router.get("/recruitment/summary", response_model=RecruitmentSummaryOut)
def recruitment_summary(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """경영용 1페이지 요약: 퍼널, 지원자 수, 직무별 TO 대비, 병목·주간 액션 한 줄."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    batches = db.scalars(
        select(ApplicationFilterBatch)
        .where(ApplicationFilterBatch.user_id == user.id)
        .options(selectinload(ApplicationFilterBatch.items))
    ).all()
    all_stages: list[str] = []
    for b in batches:
        for it in b.items or []:
            all_stages.append(it.stage or "")
    funnel_d = funnel_counts_by_stage(all_stages)
    funnel_rows = [
        FunnelStageCountOut(stage=k, label_ko=STAGE_LABEL_KO.get(k, k), count=int(funnel_d.get(k, 0)))
        for k in FUNNEL_STAGE_ORDER
    ]
    rejected_count = int(funnel_d.get("rejected", 0))
    total_applicants = sum(len(b.items or []) for b in batches)

    roles = db.scalars(select(JobRoleProfile).where(JobRoleProfile.user_id == user.id)).all()
    by_pos: list[PositionToVsPipelineRowOut] = []

    def _counts_for_batches(batch_ids: set[UUID]) -> tuple[int, int]:
        hired_c = 0
        active_c = 0
        for b in batches:
            if b.id not in batch_ids:
                continue
            for it in b.items or []:
                st = normalize_application_stage(it.stage)
                if st == "hired":
                    hired_c += 1
                elif st != "rejected":
                    active_c += 1
        return hired_c, active_c

    linked_by_role: dict[UUID, set[UUID]] = {}
    unlinked_batch_ids: set[UUID] = set()
    for b in batches:
        jid = getattr(b, "job_role_id", None)
        if jid is None:
            unlinked_batch_ids.add(b.id)
        else:
            linked_by_role.setdefault(jid, set()).add(b.id)

    for role in roles:
        bids = linked_by_role.get(role.id, set())
        hc = int(getattr(role, "headcount_to", 0) or 0)
        if not bids and hc == 0:
            continue
        hired_c, active_c = _counts_for_batches(bids)
        label = f"{(role.department or '').strip() or '—'} / {(role.job_title or '').strip() or '—'}"
        by_pos.append(
            PositionToVsPipelineRowOut(
                job_role_id=role.id,
                label=label,
                headcount_to=hc,
                hired_count=hired_c,
                active_in_pipeline=active_c,
            )
        )
    if unlinked_batch_ids:
        h2, a2 = _counts_for_batches(unlinked_batch_ids)
        if h2 + a2 > 0:
            by_pos.append(
                PositionToVsPipelineRowOut(
                    job_role_id=None,
                    label="직무 미연결 지원서 묶음",
                    headcount_to=0,
                    hired_count=h2,
                    active_in_pipeline=a2,
                )
            )

    pending_eval = (
        db.scalar(
            select(func.count())
            .select_from(InterviewEvaluationSubmission)
            .join(InterviewRound, InterviewRound.id == InterviewEvaluationSubmission.round_id)
            .where(InterviewRound.user_id == user.id, InterviewEvaluationSubmission.submitted_at.is_(None))
        )
        or 0
    )

    return RecruitmentSummaryOut(
        total_applicants=total_applicants,
        funnel=funnel_rows,
        rejected_count=rejected_count,
        by_position=by_pos,
        bottleneck_line=suggest_bottleneck_line(funnel_d),
        weekly_action_line=suggest_weekly_action_line(pending_eval_submissions=int(pending_eval)),
    )


@router.get("/batches", response_model=list[ApplicationBatchOut])
def list_batches(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session | None, Depends(get_db)]):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    rows = (
        db.query(ApplicationFilterBatch)
        .filter(ApplicationFilterBatch.user_id == user.id)
        .order_by(ApplicationFilterBatch.created_at.desc())
        .all()
    )
    return [_batch_to_out(b) for b in rows]


@router.get("/dashboard/applicant-status", response_model=ApplicantStatusDashboardOut)
def applicant_status_dashboard(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    batches = db.scalars(
        select(ApplicationFilterBatch)
        .where(ApplicationFilterBatch.user_id == user.id)
        .options(selectinload(ApplicationFilterBatch.items))
        .order_by(ApplicationFilterBatch.created_at.desc())
    ).all()

    out_rows: list[ApplicantStatusDashboardRowOut] = []
    for b in batches:
        email_group: dict[str, int] = {}
        phone_group: dict[str, int] = {}
        key_group: dict[str, int] = {}
        for it in b.items or []:
            em = _norm_email(_notify_email_for_item(it))
            ph = _phone_from_item(it)
            dk = (it.duplicate_key or "").strip().lower()
            if em:
                email_group[em] = email_group.get(em, 0) + 1
            if ph:
                phone_group[ph] = phone_group.get(ph, 0) + 1
            if dk:
                key_group[dk] = key_group.get(dk, 0) + 1
        suspect_item_ids: set[UUID] = set()
        for it in b.items or []:
            em = _norm_email(_notify_email_for_item(it))
            ph = _phone_from_item(it)
            dk = (it.duplicate_key or "").strip().lower()
            if (em and email_group.get(em, 0) > 1) or (ph and phone_group.get(ph, 0) > 1) or (dk and key_group.get(dk, 0) > 1):
                suspect_item_ids.add(it.id)
        inferred_platform = (getattr(b, "posting_platform", "") or "").strip()
        if not inferred_platform:
            p_count: dict[str, int] = {}
            for it in b.items or []:
                p = (it.source_platform or "unknown").strip().lower()
                p_count[p] = p_count.get(p, 0) + 1
            inferred_platform = max(p_count, key=p_count.get) if p_count else "unknown"
        out_rows.append(
            ApplicantStatusDashboardRowOut(
                batch_id=b.id,
                department_name=(getattr(b, "department_name", "") or "").strip(),
                position_name=(getattr(b, "position_name", "") or "").strip() or (b.title or ""),
                posted_at=getattr(b, "posted_at", None),
                deadline_at=getattr(b, "deadline_at", None),
                posting_platform=inferred_platform,
                duplicate_suspected_count=len(suspect_item_ids),
            )
        )
    return ApplicantStatusDashboardOut(rows=out_rows)


@router.get("/batches/{batch_id}/insights", response_model=BatchResumeInsightsOut)
def batch_resume_insights(
    batch_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """포지션별 지원 이력서 인사이트 대시보드 데이터."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    batch = db.scalars(
        select(ApplicationFilterBatch)
        .where(ApplicationFilterBatch.id == batch_id, ApplicationFilterBatch.user_id == user.id)
        .options(selectinload(ApplicationFilterBatch.items))
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="지원서 묶음을 찾을 수 없습니다.")

    email_group: dict[str, int] = {}
    phone_group: dict[str, int] = {}
    key_group: dict[str, int] = {}
    for it in batch.items or []:
        em = _norm_email(_notify_email_for_item(it))
        ph = _phone_from_item(it)
        dk = (it.duplicate_key or "").strip().lower()
        if em:
            email_group[em] = email_group.get(em, 0) + 1
        if ph:
            phone_group[ph] = phone_group.get(ph, 0) + 1
        if dk:
            key_group[dk] = key_group.get(dk, 0) + 1

    rows: list[BatchResumeInsightRowOut] = []
    for it in batch.items or []:
        em = _norm_email(_notify_email_for_item(it))
        ph = _phone_from_item(it)
        dk = (it.duplicate_key or "").strip().lower()
        reasons: list[str] = []
        if em and email_group.get(em, 0) > 1:
            reasons.append("이메일 중복")
        if ph and phone_group.get(ph, 0) > 1:
            reasons.append("전화번호 중복")
        if dk and key_group.get(dk, 0) > 1:
            reasons.append("이름+생년월일 중복")
        rows.append(
            BatchResumeInsightRowOut(
                item_id=it.id,
                filename=it.filename or "",
                candidate_name=it.candidate_name or "",
                inferred_position=_infer_position_for_item(user_id=user.id, item=it, batch=batch, db=db),
                blind_tier=it.blind_tier or "none",
                blind_summary=it.blind_summary or "",
                preferred_met=bool(it.preferred_met),
                preferred_reason=it.preferred_reason or "",
                role_relevance_score=float(getattr(it, "role_relevance_score", 0) or 0),
                resume_completeness_score=float(getattr(it, "resume_completeness_score", 0) or 0),
                missing_fields=[str(x) for x in (it.missing_fields if isinstance(it.missing_fields, list) else [])],
                source_platform=it.source_platform or "unknown",
                duplicate_suspected=bool(reasons),
                duplicate_reason=", ".join(reasons),
                evidence_level=it.evidence_level or "unknown",
            )
        )
    dup_count = sum(1 for r in rows if r.duplicate_suspected)
    blind_risk_count = sum(1 for r in rows if (r.blind_tier or "").lower() in {"low", "high"})
    preferred_count = sum(1 for r in rows if r.preferred_met)
    return BatchResumeInsightsOut(
        batch_id=batch.id,
        batch_title=batch.title or "",
        total_count=len(rows),
        duplicate_suspected_count=dup_count,
        blind_risk_count=blind_risk_count,
        preferred_met_count=preferred_count,
        rows=rows,
    )


@router.get("/batches/{batch_id}/insights.xlsx")
def export_batch_resume_insights_xlsx(
    batch_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    data = batch_resume_insights(batch_id=batch_id, user=user, db=db)
    rows = [x.model_dump() for x in data.rows]
    xlsx = batch_resume_insights_to_xlsx_bytes(batch_title=data.batch_title, rows=rows)
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="batch_{batch_id}_insights.xlsx"'},
    )


@router.get("/batches/{batch_id}", response_model=ApplicationBatchOut)
def get_batch(
    batch_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    batch = db.get(ApplicationFilterBatch, batch_id)
    if not batch or batch.user_id != user.id:
        raise HTTPException(status_code=404, detail="지원서 묶음을 찾을 수 없습니다.")

    # 각 아이템의 가장 최근 confirm 토큰 + attendance 로드
    item_ids = [it.id for it in batch.items]
    token_map: dict[str, tuple[str, str | None, str | None]] = {}
    if item_ids:
        rows = db.execute(
            select(
                StageConfirmToken.item_id,
                StageConfirmToken.token,
                StageConfirmToken.attendance,
                StageConfirmToken.stage_label,
            )
            .where(StageConfirmToken.item_id.in_(item_ids))
            .order_by(StageConfirmToken.created_at.desc())
        ).all()
        for row in rows:
            key = str(row.item_id)
            if key not in token_map:  # 가장 최근 것만 유지
                token_map[key] = (row.token, row.attendance, row.stage_label)

    return _batch_to_out(batch, token_map)


@router.patch("/batches/{batch_id}", response_model=ApplicationBatchOut)
def patch_application_batch(
    batch_id: UUID,
    body: ApplicationBatchPatch,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    batch = db.get(ApplicationFilterBatch, batch_id)
    if not batch or batch.user_id != user.id:
        raise HTTPException(status_code=404, detail="지원서 묶음을 찾을 수 없습니다.")
    payload = body.model_dump(exclude_unset=True)
    updated = False
    if body.clear_job_role:
        batch.job_role_id = None
        updated = True
    elif body.job_role_id is not None:
        jr = db.get(JobRoleProfile, body.job_role_id)
        if not jr or jr.user_id != user.id:
            raise HTTPException(status_code=404, detail="직무를 찾을 수 없습니다.")
        batch.job_role_id = body.job_role_id
        updated = True
    if "title" in payload and body.title is not None:
        batch.title = body.title.strip() or batch.title
        updated = True
    if "jd_preferred_text" in payload and body.jd_preferred_text is not None:
        batch.jd_preferred_text = body.jd_preferred_text.strip()
        updated = True
    if body.employer_sector is not None:
        batch.employer_sector = body.employer_sector
        updated = True
    if body.preferred_include_patterns is not None:
        batch.preferred_include_patterns = body.preferred_include_patterns.strip()
        updated = True
    if body.preferred_exclude_patterns is not None:
        batch.preferred_exclude_patterns = body.preferred_exclude_patterns.strip()
        updated = True
    if body.preferred_requires_evidence is not None:
        batch.preferred_requires_evidence = bool(body.preferred_requires_evidence)
        updated = True
    if body.department_name is not None:
        batch.department_name = body.department_name.strip()[:200]
        updated = True
    if body.position_name is not None:
        batch.position_name = body.position_name.strip()[:200]
        updated = True
    if body.posting_platform is not None:
        batch.posting_platform = body.posting_platform.strip()[:80]
        updated = True
    if "posted_at" in payload:
        batch.posted_at = body.posted_at
        updated = True
    if "deadline_at" in payload:
        batch.deadline_at = body.deadline_at
        updated = True
    if not updated:
        raise HTTPException(
            status_code=400,
            detail="수정할 필드를 하나 이상 보내세요. (직무 연결, 제목, 공고 우대 텍스트, 채용 주체 등)",
        )
    db.commit()
    db.refresh(batch)
    db.refresh(batch, attribute_names=["items"])
    return _batch_to_out(batch)


@router.post("/batches/{batch_id}/run", response_model=ApplicationBatchOut)
def run_batch(
    batch_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    batch = db.get(ApplicationFilterBatch, batch_id)
    if not batch or batch.user_id != user.id:
        raise HTTPException(status_code=404, detail="지원서 묶음을 찾을 수 없습니다.")
    settings = get_settings()
    role_ctx = ""
    if batch.job_role_id:
        role = db.get(JobRoleProfile, batch.job_role_id)
        if role:
            role_ctx = " ".join(
                x for x in [role.department or "", role.job_title or "", role.role_grade or "", role.body_text or ""] if x
            )
    include_patterns = _split_patterns(getattr(batch, "preferred_include_patterns", "") or "")
    exclude_patterns = _split_patterns(getattr(batch, "preferred_exclude_patterns", "") or "")
    needs_evidence = bool(getattr(batch, "preferred_requires_evidence", True))
    for it in batch.items:
        if not (it.content_text or "").strip():
            continue
        try:
            result = screen_application_text(
                resume_text=it.content_text,
                jd_preferred_text=batch.jd_preferred_text,
                settings=settings,
                employer_sector=_employer_sector(batch),
                preferred_include_patterns=include_patterns,
                preferred_exclude_patterns=exclude_patterns,
                preferred_requires_evidence=needs_evidence,
                role_context_text=role_ctx,
            )
        except ValueError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"분석 실패: {e!s}") from e
        it.blind_tier = str(result.get("blind_tier") or "unknown")
        it.blind_summary = str(result.get("blind_summary") or "")
        it.blind_snippets = result.get("blind_snippets") or []
        it.preferred_met = bool(result.get("preferred_met"))
        it.preferred_reason = str(result.get("preferred_reason") or "")
        it.keyword_flags = result.get("keyword_flags") or []
        it.source_platform = it.source_platform or _guess_source_platform(it.filename or "", it.content_text or "")
        it.role_relevance_score = float(result.get("role_relevance_score") or 0.0)
        it.preferred_rule_hits = result.get("preferred_rule_hits") or []
        it.preferred_rule_excluded_hits = result.get("preferred_rule_excluded_hits") or []
        it.evidence_level = str(result.get("evidence_level") or "unknown")[:16]
        missing = _missing_fields_from_standardized(it.standardized_resume)
        it.missing_fields = missing
        it.resume_completeness_score = max(0.0, round(1.0 - (len(missing) / 7), 3))
        it.analyzed_at = datetime.now(UTC)
    db.commit()
    db.refresh(batch)
    return _batch_to_out(batch)


@router.get("/batches/{batch_id}/export.xlsx")
def export_batch_xlsx(
    batch_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    batch = db.get(ApplicationFilterBatch, batch_id)
    if not batch or batch.user_id != user.id:
        raise HTTPException(status_code=404, detail="지원서 묶음을 찾을 수 없습니다.")
    row_dicts = []
    for it in batch.items:
        row_dicts.append(
            {
                "filename": it.filename,
                "blind_tier": it.blind_tier,
                "preferred_met": it.preferred_met,
                "blind_summary": it.blind_summary,
                "preferred_reason": it.preferred_reason,
                "keyword_flags": it.keyword_flags if isinstance(it.keyword_flags, list) else [],
                "blind_snippets": it.blind_snippets if isinstance(it.blind_snippets, list) else [],
                "source_platform": it.source_platform or "unknown",
                "role_relevance_score": float(getattr(it, "role_relevance_score", 0) or 0),
                "resume_completeness_score": float(getattr(it, "resume_completeness_score", 0) or 0),
                "missing_fields": it.missing_fields if isinstance(it.missing_fields, list) else [],
                "preferred_rule_hits": it.preferred_rule_hits if isinstance(it.preferred_rule_hits, list) else [],
                "preferred_rule_excluded_hits": (
                    it.preferred_rule_excluded_hits if isinstance(it.preferred_rule_excluded_hits, list) else []
                ),
                "evidence_level": it.evidence_level or "unknown",
                "analyzed_at": it.analyzed_at,
            }
        )
    data = applications_batch_to_xlsx_bytes(
        batch_title=batch.title, jd_preferred=batch.jd_preferred_text, rows=row_dicts
    )
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename_for_batch(batch.id)}"'},
    )


@router.get("/batches/{batch_id}/export-all-pdf.zip")
def export_batch_all_pdf_zip(
    batch_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """묶음 전체를 PDF(정리본)로 변환해 ZIP으로 다운로드."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    batch = db.get(ApplicationFilterBatch, batch_id)
    if not batch or batch.user_id != user.id:
        raise HTTPException(status_code=404, detail="지원서 묶음을 찾을 수 없습니다.")

    mem = io.BytesIO()
    with zipfile.ZipFile(mem, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for i, it in enumerate(batch.items, start=1):
            txt = (it.standardized_text or "").strip() or (it.content_text or "").strip()
            if not txt:
                continue
            title = (it.candidate_name or Path(it.filename or "").stem or f"resume_{i}").strip()
            try:
                pdf_bytes, _note = text_to_resume_pdf_bytes(text=txt, title=title)
            except Exception:  # noqa: BLE001
                continue
            safe_stem = re.sub(r"[^\w가-힣._-]+", "_", title)[:80] or f"resume_{i}"
            zf.writestr(f"{i:03d}_{safe_stem}.pdf", pdf_bytes)
    mem.seek(0)
    zip_name = re.sub(r"[^\w가-힣._-]+", "_", batch.title or "applications")[:80] or "applications"
    return Response(
        content=mem.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}_pdf_bundle.zip"'},
    )
