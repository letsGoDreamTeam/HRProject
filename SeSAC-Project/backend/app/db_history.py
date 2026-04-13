"""DB에 저장된 분석을 API/프론트용 items 구조로 직렬화."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import InterviewAnalysis, InterviewCompetency


def analysis_load_options():
    return selectinload(InterviewAnalysis.competencies).selectinload(InterviewCompetency.questions)


def competency_items_payload(analysis: InterviewAnalysis) -> list[dict]:
    comps = sorted(analysis.competencies, key=lambda c: c.sort_order)
    out: list[dict] = []
    for c in comps:
        qs = sorted(c.questions, key=lambda q: q.sort_order)
        out.append(
            {
                "competency": c.competency,
                "evidence": c.evidence,
                "questions": [q.question_text for q in qs],
            }
        )
    return out


def get_analysis_with_children(db: Session, analysis_id: uuid.UUID) -> InterviewAnalysis | None:
    stmt = (
        select(InterviewAnalysis)
        .where(InterviewAnalysis.id == analysis_id)
        .options(analysis_load_options())
    )
    return db.scalars(stmt).first()
