"""ORM: saved_question_sets (면접관이 최종 선택·저장한 질문 세트)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class SavedQuestionSet(Base):
    __tablename__ = "saved_question_sets"

    set_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("interview_sessions.session_id", ondelete="SET NULL"),
        nullable=True,
    )
    interviewer_id: Mapped[int | None] = mapped_column(
        ForeignKey("interviewers.interviewer_id", ondelete="SET NULL"),
        nullable=True,
    )
    question_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
