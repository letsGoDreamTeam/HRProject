import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps_auth import get_current_user
from app.models_hr import ApplicationFilterBatch, ApplicationFilterItem, NotificationOutbox, User
from app.schemas_hr import (
    ApplicationBatchCreate,
    ApplicationBatchOut,
    ApplicationItemOut,
    DedupeScanOut,
    DuplicateGroupOut,
    ResumeStandardizeOut,
    ScheduledResultMailOut,
    ScheduledResultMailRequest,
    StageUpdateRequest,
)
from app.services.application_screening import screen_application_text
from app.services.resume_standardizer import standardize_resume_text, to_standardized_text
from app.services.resume_text_extract import extract_resume_text_from_file
from app.services.xlsx_export import applications_batch_to_xlsx_bytes, filename_for_batch

router = APIRouter(prefix="/api/hr/applications", tags=["hr-applications"])
logger = logging.getLogger(__name__)


def _source_ext(name: str) -> str:
    ext = Path(name or "").suffix.lower().replace(".", "").strip()
    return ext[:15] if ext else "unknown"


def _batch_to_out(batch: ApplicationFilterBatch) -> ApplicationBatchOut:
    items: list[ApplicationItemOut] = []
    for it in batch.items:
        sn = it.blind_snippets if isinstance(it.blind_snippets, list) else []
        kf = it.keyword_flags if isinstance(it.keyword_flags, list) else []
        items.append(
            ApplicationItemOut(
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
                stage=it.stage or "document_review",
                duplicate_key=it.duplicate_key or "",
                standardized_text=it.standardized_text or "",
                standardized_resume=it.standardized_resume if isinstance(it.standardized_resume, dict) else {},
                source_ext=it.source_ext or "",
                pdf_conversion_status=it.pdf_conversion_status or "native_pdf",
                pdf_conversion_note=it.pdf_conversion_note or "",
                text_quality_ok=bool(it.text_quality_ok),
                text_quality_note=it.text_quality_note or "",
                analyzed_at=it.analyzed_at,
            )
        )
    return ApplicationBatchOut(
        id=batch.id,
        title=batch.title,
        jd_preferred_text=batch.jd_preferred_text,
        created_at=batch.created_at,
        items=items,
    )


@router.post("/batches", response_model=ApplicationBatchOut)
async def create_batch(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
    title: str = Form("지원서 분류"),
    jd_preferred_text: str = Form(""),
    files: list[UploadFile] = File(default_factory=list),
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    if not files:
        raise HTTPException(status_code=400, detail="문서 파일을 1개 이상 업로드하세요.")
    settings = get_settings()
    batch = ApplicationFilterBatch(
        user_id=user.id,
        title=title.strip() or "지원서 분류",
        jd_preferred_text=jd_preferred_text.strip(),
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
        item = ApplicationFilterItem(
            batch_id=batch.id,
            filename=(f.filename or "document")[:500],
            content_text=text,
            source_ext=src_ext,
            pdf_conversion_status=extract_status,
            pdf_conversion_note=extract_note,
            text_quality_ok=quality_ok,
            text_quality_note=quality_note,
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
    """PDF 없이 텍스트만으로 배치 생성(테스트·연동용). items는 빈 채로 두고 이후 확장 가능."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    batch = ApplicationFilterBatch(
        user_id=user.id,
        title=body.title.strip() or "지원서 분류",
        jd_preferred_text=body.jd_preferred_text.strip(),
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
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
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
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
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
    it.stage = body.stage
    db.commit()
    db.refresh(it)
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
        stage=it.stage or "document_review",
        duplicate_key=it.duplicate_key or "",
        standardized_text=it.standardized_text or "",
        standardized_resume=it.standardized_resume if isinstance(it.standardized_resume, dict) else {},
        source_ext=it.source_ext or "",
        pdf_conversion_status=it.pdf_conversion_status or "native_pdf",
        pdf_conversion_note=it.pdf_conversion_note or "",
        text_quality_ok=bool(it.text_quality_ok),
        text_quality_note=it.text_quality_note or "",
        analyzed_at=it.analyzed_at,
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
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    if body.schedule_at <= datetime.now(UTC):
        raise HTTPException(status_code=400, detail="예약 시각은 현재보다 이후여야 합니다.")
    item_map = {it.id: it for it in batch.items}
    queued = 0
    skipped = 0
    for item_id in body.item_ids:
        it = item_map.get(item_id)
        if not it:
            continue
        if not (it.email_extracted or "").strip():
            skipped += 1
            continue
        name = it.candidate_name or it.filename
        subj = body.subject_template.replace("{name}", name).replace("{result}", body.result)
        msg = body.body_template.replace("{name}", name).replace("{result}", body.result)
        db.add(
            NotificationOutbox(
                user_id=user.id,
                channel="email",
                recipient=it.email_extracted.strip(),
                subject=subj[:400],
                body=msg[:8000],
                kind="final_result_scheduled",
                scheduled_at=body.schedule_at,
                correlation_key=f"result:{batch.id}:{it.id}:{int(body.schedule_at.timestamp())}",
            )
        )
        it.stage = body.result
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
    fn = (it.candidate_name or it.filename or "resume").replace(" ", "_")
    return Response(
        content=text.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fn}_standardized.txt"'},
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
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
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
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    settings = get_settings()
    for it in batch.items:
        if not (it.content_text or "").strip():
            continue
        try:
            result = screen_application_text(
                resume_text=it.content_text,
                jd_preferred_text=batch.jd_preferred_text,
                settings=settings,
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
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
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
