"""ORM: interview_bookings."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class InterviewBooking(Base):
    __tablename__ = "interview_bookings"

    booking_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slot_id: Mapped[int] = mapped_column(
        ForeignKey("interview_slots.slot_id", ondelete="RESTRICT"),
        nullable=False,
    )
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidates.candidate_id", ondelete="RESTRICT"),
        nullable=False,
    )
    booking_status: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
