"""A-PASS: 생기부 파싱, 인재상 RAG 적재, Fit 분석, LangGraph 모의면접, 대시보드."""

from __future__ import annotations

import uuid
from datetime import UTC

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.graphs.apass_interview import interview_start_invoke, interview_turn_invoke
from app.models_apass import ApassFitReport
from app.schemas_apass import (
    AnalyzeFitRequest,
    AnalyzeFitResponse,
    DashboardInstitutionResponse,
    DashboardStudentPoint,
    DashboardStudentResponse,
    IngestUniversityRequest,
    IngestUniversityResponse,
    InstitutionCandidate,
    InterviewStartRequest,
    InterviewStartResponse,
    InterviewTurnRequest,
    InterviewTurnResponse,
    ParseRecordResponse,
)
from app.services.apass_extract import extract_sections_from_full_text
from app.services.apass_fit import run_fit_analysis
from app.services.apass_vector import collection_key, ingest_university_document
from app.services.pdf_text import extract_text_from_pdf_bytes

router = APIRouter(prefix="/api/apass", tags=["apass"])

_ACTIVE_INTERVIEW_THREADS: set[str] = set()

_PHASE_KO = {
    "icebreaker": "아이스브레이킹",
    "verify": "서류 검증",
    "major": "전공 심층",
    "values": "인성·가치관",
    "done": "종료",
}


@router.post("/parse-record", response_model=ParseRecordResponse)
async def parse_record(
    file: UploadFile | None = File(None),
    full_text: str | None = Form(None),
):
    """PDF 업로드 또는 `full_text` 폼으로 생기부 원문을 넣으면 섹션별로 휴리스틱 분리합니다."""
    text = (full_text or "").strip()
    ocr_used = False
    if file is not None and file.filename:
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="빈 파일입니다.")
        try:
            if (file.filename or "").lower().endswith(".pdf"):
                text, ocr_used = extract_text_from_pdf_bytes(raw, get_settings())
            else:
                text = raw.decode("utf-8", errors="replace").strip()
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except UnicodeDecodeError as e:
            raise HTTPException(status_code=400, detail="텍스트 파일은 UTF-8 인코딩을 권장합니다.") from e
    if len(text) < 20:
        raise HTTPException(status_code=400, detail="분석할 텍스트가 너무 짧습니다. PDF를 업로드하거나 full_text를 입력하세요.")
    sections = extract_sections_from_full_text(text)
    # 응답에 OCR 여부를 full_text 앞주석으로 넣지 않고, 클라이언트는 별도 필드가 없으면 생략 — 필요 시 확장
    _ = ocr_used
    return ParseRecordResponse(full_text=text[:50000], sections=sections)


@router.post("/ingest-university", response_model=IngestUniversityResponse)
def ingest_university(body: IngestUniversityRequest):
    """목표 대학·학과 인재상(또는 모집요강) 텍스트를 임베딩해 로컬 컬렉션에 저장합니다."""
    settings = get_settings()
    try:
        key, n = ingest_university_document(
            settings,
            university_name=body.university_name,
            department=body.department,
            document_text=body.document_text,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return IngestUniversityResponse(collection_key=key, chunks_indexed=n)


@router.post("/analyze-fit", response_model=AnalyzeFitResponse)
def analyze_fit(
    body: AnalyzeFitRequest,
    db: Session | None = Depends(get_db),
):
    """RAG(등록된 인재상) + 구조화 출력으로 Fit-Score·역량 매핑·첨삭 코멘트를 생성합니다."""
    settings = get_settings()
    ck = collection_key(body.target_university, body.target_department)
    try:
        result = run_fit_analysis(settings, body, collection_key=ck)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if db is not None:
        row = ApassFitReport(
            target_university=body.target_university,
            target_department=body.target_department,
            fit_score=result.fit_score,
            payload={
                "competency_mapping": [m.model_dump() for m in result.competency_mapping],
                "coaching_comment": result.coaching_comment,
                "rag_snippets_used": result.rag_snippets_used,
                "sections": body.sections.model_dump(),
            },
        )
        db.add(row)
        db.commit()

    return result


@router.post("/interview/start", response_model=InterviewStartResponse)
def interview_start(body: InterviewStartRequest):
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY가 설정되어 있지 않습니다.")
    thread_id = str(uuid.uuid4())
    try:
        msg = interview_start_invoke(
            thread_id=thread_id,
            locale=body.locale,
            record_summary=body.record_summary.strip(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"면접 시작 실패: {e!s}") from e
    _ACTIVE_INTERVIEW_THREADS.add(thread_id)
    return InterviewStartResponse(
        thread_id=thread_id,
        assistant_message=msg,
        phase=_PHASE_KO["icebreaker"],
    )


@router.post("/interview/turn", response_model=InterviewTurnResponse)
def interview_turn(body: InterviewTurnRequest):
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY가 설정되어 있지 않습니다.")
    if body.thread_id not in _ACTIVE_INTERVIEW_THREADS:
        raise HTTPException(status_code=404, detail="유효하지 않은 thread_id입니다. /interview/start를 먼저 호출하세요.")
    try:
        ai, finished, phase = interview_turn_invoke(thread_id=body.thread_id, user_message=body.user_message.strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"면접 진행 실패: {e!s}") from e
    return InterviewTurnResponse(
        assistant_message=ai,
        phase=_PHASE_KO.get(phase, phase),
        finished=finished,
    )


def _demo_student_dashboard() -> DashboardStudentResponse:
    return DashboardStudentResponse(
        char_trend=[
            DashboardStudentPoint(label="1학기", value=4200),
            DashboardStudentPoint(label="2학기", value=4580),
            DashboardStudentPoint(label="누적", value=5100),
        ],
        keyword_trend=[
            DashboardStudentPoint(label="리더십", value=12),
            DashboardStudentPoint(label="수학", value=18),
            DashboardStudentPoint(label="프로젝트", value=9),
        ],
        interview_scores=[
            DashboardStudentPoint(label="1회차", value=72),
            DashboardStudentPoint(label="2회차", value=78),
            DashboardStudentPoint(label="3회차", value=81),
        ],
        notes="DB에 저장된 Fit 분석이 쌓이면 실제 추이로 대체됩니다. 지금은 데모 곡선입니다.",
    )


@router.get("/dashboard/student", response_model=DashboardStudentResponse)
def dashboard_student(db: Session | None = Depends(get_db)):
    """B2C: Fit 점수 추이·(데모) 글자수·키워드·모의면접 점수 시각화용 데이터."""
    if db is None:
        return _demo_student_dashboard()

    rows = (
        db.query(ApassFitReport)
        .order_by(ApassFitReport.created_at.asc())
        .limit(30)
        .all()
    )
    if not rows:
        return _demo_student_dashboard()

    char_trend: list[DashboardStudentPoint] = []
    interview_scores: list[DashboardStudentPoint] = []
    for i, r in enumerate(rows):
        label = (r.created_at.astimezone(UTC).strftime("%m/%d") if r.created_at else str(i))
        sec = (r.payload or {}).get("sections") or {}
        approx = sum(len((sec.get(k) or "")) for k in ("seuteuk", "club", "reading", "other"))
        char_trend.append(DashboardStudentPoint(label=label, value=float(approx)))
        interview_scores.append(DashboardStudentPoint(label=label, value=float(r.fit_score)))

    # 키워드: 역량 요약에서 간단 빈도 대용
    kw_bucket: dict[str, int] = {"학업역량": 0, "진로역량": 0, "공동체역량": 0}
    for r in rows:
        for m in (r.payload or {}).get("competency_mapping") or []:
            d = (m or {}).get("domain")
            if d in kw_bucket:
                kw_bucket[d] += 1
    keyword_trend = [DashboardStudentPoint(label=k, value=float(v)) for k, v in kw_bucket.items()]

    return DashboardStudentResponse(
        char_trend=char_trend[-12:],
        keyword_trend=keyword_trend,
        interview_scores=interview_scores[-12:],
        notes="DB에 저장된 A-PASS Fit 분석 기록을 바탕으로 한 차트입니다.",
    )


@router.get("/dashboard/institution", response_model=DashboardInstitutionResponse)
def dashboard_institution(db: Session | None = Depends(get_db)):
    """B2B: 전공 적합도 상위 구간별 칸반용 카드 + 종합 리포트 힌트."""
    if db is None:
        demo = [
            InstitutionCandidate(id="d1", applicant_name="데모 지원자 A", fit_score=92, band="top10", summary="수학·알고리즘 세특 강점, 동아리 협업 서술 보완 필요"),
            InstitutionCandidate(id="d2", applicant_name="데모 지원자 B", fit_score=81, band="mid", summary="공동체역량 균형, 전공 연결 문장 보강"),
            InstitutionCandidate(id="d3", applicant_name="데모 지원자 C", fit_score=64, band="screen", summary="인재상 키워드와 활동 연결이 약함"),
        ]
        return DashboardInstitutionResponse(
            columns={"전공 적합도 상위 10%": [demo[0]], "중위권 검토": [demo[1]], "스크리닝": [demo[2]]},
            report_hint="DATABASE_URL을 설정하고 Fit 분석을 실행하면 실제 지원자 카드가 채워집니다.",
        )

    rows = (
        db.query(ApassFitReport)
        .order_by(ApassFitReport.fit_score.desc())
        .limit(120)
        .all()
    )
    top10, mid, screen = [], [], []
    for r in rows:
        band: str
        if r.fit_score >= 88:
            band = "top10"
        elif r.fit_score >= 72:
            band = "mid"
        else:
            band = "screen"
        name = f"{r.target_university[:8]}… / {r.target_department[:10]}…"
        summary = ((r.payload or {}).get("coaching_comment") or "")[:180]
        c = InstitutionCandidate(
            id=str(r.id),
            applicant_name=name,
            fit_score=r.fit_score,
            band=band,
            summary=summary + ("…" if len(summary) >= 180 else ""),
        )
        if band == "top10":
            top10.append(c)
        elif band == "mid":
            mid.append(c)
        else:
            screen.append(c)

    n = db.query(func.count(ApassFitReport.id)).scalar() or 0
    return DashboardInstitutionResponse(
        columns={
            "전공 적합도 상위 10%": top10[:40],
            "중위권 검토": mid[:40],
            "스크리닝": screen[:40],
        },
        report_hint=f"누적 Fit 리포트 {n}건 기준입니다. 행 클릭 시 상세 payload.coaching_comment를 API로 조회해 확장할 수 있습니다.",
    )
