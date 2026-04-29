"""ORM: question_reactions (면접 질문 좋아요/싫어요)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class QuestionReaction(Base):
    __tablename__ = "question_reactions"
    __table_args__ = (
        UniqueConstraint("session_id", "question_id", name="uq_reaction_session_question"),
    )

    reaction_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.question_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[int] = mapped_column(
        ForeignKey("interview_sessions.session_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reaction: Mapped[str] = mapped_column(String(16), nullable=False)  # like | dislike
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
