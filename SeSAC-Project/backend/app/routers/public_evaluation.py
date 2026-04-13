from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models_hr import InterviewEvaluationSubmission
from app.schemas_hr import PublicEvaluationSubmit, PublicEvaluationView

router = APIRouter(prefix="/api/public/evaluation", tags=["public-evaluation"])


def _criteria_list(raw: list | dict | None) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x) for x in raw if str(x).strip()]
    return []


@router.get("/{token}", response_model=PublicEvaluationView)
def get_evaluation_form(token: str, db: Annotated[Session | None, Depends(get_db)]):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    sub = db.scalars(
        select(InterviewEvaluationSubmission)
        .where(InterviewEvaluationSubmission.access_token == token)
        .options(
            selectinload(InterviewEvaluationSubmission.candidate),
            selectinload(InterviewEvaluationSubmission.interviewer),
            selectinload(InterviewEvaluationSubmission.round),
        )
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="평가 링크가 유효하지 않습니다.")
    rnd = sub.round
    cand = sub.candidate
    inv = sub.interviewer
    labels = _criteria_list(sub.criteria_labels)
    submitted = sub.submitted_at is not None
    scores_out = None
    if submitted and isinstance(sub.scores, dict):
        scores_out = {str(k): int(v) for k, v in sub.scores.items() if isinstance(v, (int, float))}
    return PublicEvaluationView(
        round_title=rnd.title if rnd else "",
        candidate_name=cand.name if cand else "",
        interviewer_name=inv.name if inv else "",
        criteria_labels=labels,
        already_submitted=submitted,
        scores=scores_out,
        overall_comment=(sub.overall_comment or "") if submitted else "",
    )


@router.put("/{token}", response_model=PublicEvaluationView)
def submit_evaluation(
    token: str,
    body: PublicEvaluationSubmit,
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    from sqlalchemy import select

    sub = db.scalars(
        select(InterviewEvaluationSubmission)
        .where(InterviewEvaluationSubmission.access_token == token)
        .options(
            selectinload(InterviewEvaluationSubmission.candidate),
            selectinload(InterviewEvaluationSubmission.interviewer),
            selectinload(InterviewEvaluationSubmission.round),
        )
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="평가 링크가 유효하지 않습니다.")
    if sub.submitted_at is not None:
        raise HTTPException(status_code=409, detail="이미 제출된 평가입니다.")
    labels = _criteria_list(sub.criteria_labels)
    if not labels:
        raise HTTPException(status_code=400, detail="평가 항목이 설정되지 않았습니다. 담당자에게 문의하세요.")
    if set(body.scores.keys()) != set(labels):
        raise HTTPException(
            status_code=400,
            detail=f"점수 키가 평가 항목과 일치해야 합니다. 항목: {labels}",
        )
    clean: dict[str, int] = {}
    for lab in labels:
        v = body.scores.get(lab)
        if v is None or not isinstance(v, (int, float)):
            raise HTTPException(status_code=400, detail=f"'{lab}' 점수를 입력하세요.")
        iv = int(v)
        if iv < 1 or iv > 5:
            raise HTTPException(status_code=400, detail="각 항목은 1~5 정수만 가능합니다.")
        clean[lab] = iv
    sub.scores = clean
    sub.overall_comment = (body.overall_comment or "").strip()[:8000]
    sub.submitted_at = datetime.now(UTC)
    db.commit()
    db.refresh(sub)
    return get_evaluation_form(token, db)
