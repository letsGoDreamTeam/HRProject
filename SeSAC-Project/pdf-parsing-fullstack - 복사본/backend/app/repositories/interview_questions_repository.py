"""생성된 면접 질문 번들 → DB 저장 + 세션·반응 관리."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.interview_question_orm import InterviewQuestion
from app.models.interview_session_orm import InterviewSession
from app.models.question_reaction_orm import QuestionReaction


# ── 질문 저장 ──────────────────────────────────────────────────────

def persist_generated_bundle(
    session: Session,
    *,
    candidate_id: int | None,
    position_id: int | None,
    bundle: dict[str, Any],
) -> list[int]:
    """질문을 questions 테이블에 저장하고 각 질문 dict에 _db_id를 주입한다. 커밋은 호출 측."""
    inserted_ids: list[int] = []

    def append_item(item_ref: dict | None, q_text: str, q_type: str) -> None:
        qt = q_text.strip()
        if not qt:
            return
        row = InterviewQuestion(
            candidate_id=candidate_id,
            position_id=position_id,
            question_text=qt,
            question_type=q_type,
        )
        session.add(row)
        session.flush()
        inserted_ids.append(row.question_id)
        if item_ref is not None:
            item_ref["_db_id"] = row.question_id

    def from_list(key: str, q_type: str) -> None:
        for item in bundle.get(key) or []:
            if isinstance(item, dict):
                append_item(item, item.get("q") or "", q_type)
            elif isinstance(item, str):
                append_item(None, item, q_type)

    from_list("questions_behavioral", "behavioral")
    from_list("questions_job", "job")
    from_list("questions_situational", "situational")

    for fu in bundle.get("follow_ups") or []:
        if isinstance(fu, str):
            append_item(None, fu, "follow_up")

    # Interviewer-format bundle keys
    from_list("job_basic",        "job_basic")
    from_list("job_intermediate", "job_intermediate")
    from_list("job_advanced",     "job_advanced")
    from_list("personality",      "personality")

    return inserted_ids


# ── 세션 ───────────────────────────────────────────────────────────

def create_interview_session(session: Session) -> int:
    """새 interview_sessions 행을 삽입하고 자동증가 session_id를 반환. 커밋은 호출 측."""
    row = InterviewSession()
    session.add(row)
    session.flush()
    return row.session_id


# ── 반응(좋아요/싫어요) ─────────────────────────────────────────────

def upsert_reaction(
    session: Session,
    question_id: int,
    session_id: int,
    reaction: str,
) -> None:
    """question_reactions를 UPSERT. reaction='none'이면 해당 행 삭제. 커밋은 호출 측.

    reaction: "like" | "dislike" | "none"
    """
    row = (
        session.query(QuestionReaction)
        .filter_by(question_id=question_id, session_id=session_id)
        .first()
    )
    if reaction == "none":
        if row:
            session.delete(row)
    else:
        if row:
            row.reaction = reaction
        else:
            session.add(QuestionReaction(
                question_id=question_id,
                session_id=session_id,
                reaction=reaction,
            ))


def get_disliked_texts_for_session(session: Session, session_id: int) -> list[str]:
    """해당 세션에서 싫어요(dislike)를 받은 질문 텍스트 목록을 반환한다."""
    rows = (
        session.query(InterviewQuestion.question_text)
        .join(QuestionReaction, QuestionReaction.question_id == InterviewQuestion.question_id)
        .filter(
            QuestionReaction.session_id == session_id,
            QuestionReaction.reaction == "dislike",
        )
        .all()
    )
    return [r.question_text for r in rows]
