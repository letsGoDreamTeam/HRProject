"""ORM: questions (면접 질문 풀)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class InterviewQuestion(Base):
    __tablename__ = "questions"

    question_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int | None] = mapped_column(
        ForeignKey("candidates.candidate_id", ondelete="SET NULL"),
        nullable=True,
    )
    position_id: Mapped[int | None] = mapped_column(
        ForeignKey("positions.position_id", ondelete="SET NULL"),
        nullable=True,
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(String(64), nullable=False)  # job_based | candidate_based
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
