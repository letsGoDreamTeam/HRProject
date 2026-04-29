"""ORM: interview_slots (면접 시간 슬롯)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class InterviewSlot(Base):
    __tablename__ = "interview_slots"

    slot_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    position_id: Mapped[int] = mapped_column(
        ForeignKey("positions.position_id", ondelete="RESTRICT"),
        nullable=False,
    )
    interview_round: Mapped[str] = mapped_column(String(64), nullable=False)
    interview_starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    interview_ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    booking_deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    slot_status: Mapped[str] = mapped_column(String(32), nullable=False)  # open | full | closed
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
