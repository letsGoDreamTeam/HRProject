import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.db_history import analysis_load_options, competency_items_payload, get_analysis_with_children
from app.models import InterviewAnalysis, InterviewCompetency, InterviewQuestion
from app.schemas import AnalysisResponse, AnalyzeRequest, AnalyzeWithSaveResponse
from app.services.jd_analysis import analyze_jd
from app.services.jd_gate import JdGateRejected

router = APIRouter(prefix="/api", tags=["analyze"])


@router.post("/analyze", response_model=AnalysisResponse)
def analyze_only(body: AnalyzeRequest) -> AnalysisResponse:
    settings = get_settings()
    try:
        return analyze_jd(body.jd_text.strip(), settings)
    except JdGateRejected as e:
        raise HTTPException(
            status_code=422,
            detail=f"채용 공고로 보이지 않습니다: {e.reason}",
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"분석 처리 중 오류: {e!s}") from e


@router.post("/analyze/save", response_model=AnalyzeWithSaveResponse)
def analyze_and_save(
    body: AnalyzeRequest,
    db: Session | None = Depends(get_db),
) -> AnalyzeWithSaveResponse:
    settings = get_settings()
    if db is None:
        raise HTTPException(
            status_code=503,
            detail="DATABASE_URL이 설정되지 않아 저장할 수 없습니다.",
        )
    try:
        result = analyze_jd(body.jd_text.strip(), settings)
    except JdGateRejected as e:
        raise HTTPException(
            status_code=422,
            detail=f"채용 공고로 보이지 않습니다: {e.reason}",
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"분석 처리 중 오류: {e!s}") from e

    row = InterviewAnalysis(
        jd_text=body.jd_text.strip(),
        analysis_summary=result.analysis_summary,
    )
    for i, item in enumerate(result.items):
        comp = InterviewCompetency(
            competency=item.competency,
            evidence=item.evidence,
            sort_order=i,
        )
        for j, q in enumerate(item.questions):
            comp.questions.append(InterviewQuestion(question_text=q, sort_order=j))
        row.competencies.append(comp)

    db.add(row)
    db.commit()
    db.refresh(row)
    return AnalyzeWithSaveResponse(analysis=result, saved_id=str(row.id))


@router.get("/history", response_model=list[dict])
def list_history(
    limit: int = 20,
    db: Session | None = Depends(get_db),
) -> list[dict]:
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    stmt = (
        select(InterviewAnalysis)
        .options(analysis_load_options())
        .order_by(InterviewAnalysis.created_at.desc())
        .limit(min(limit, 100))
    )
    rows = db.scalars(stmt).all()
    return [
        {
            "id": str(r.id),
            "analysis_summary": r.analysis_summary,
            "items": competency_items_payload(r),
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "jd_preview": r.jd_text[:200] + ("…" if len(r.jd_text) > 200 else ""),
        }
        for r in rows
    ]


@router.get("/history/{analysis_id}", response_model=dict)
def get_history_item(
    analysis_id: uuid.UUID,
    db: Session | None = Depends(get_db),
) -> dict:
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    row = get_analysis_with_children(db, analysis_id)
    if not row:
        raise HTTPException(status_code=404, detail="분석 기록을 찾을 수 없습니다.")
    return {
        "id": str(row.id),
        "jd_text": row.jd_text,
        "analysis_summary": row.analysis_summary,
        "items": competency_items_payload(row),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
