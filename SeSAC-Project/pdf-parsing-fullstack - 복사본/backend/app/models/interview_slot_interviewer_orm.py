"""ORM: interview_slot_interviewers (면접관 배정 — N:M)."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InterviewSlotInterviewer(Base):
    __tablename__ = "interview_slot_interviewers"

    slot_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("interview_slots.slot_id", ondelete="CASCADE"),
        primary_key=True,
    )
    interviewer_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("interviewers.interviewer_id", ondelete="RESTRICT"),
        primary_key=True,
    )
