"""ORM: military (병역)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Military(Base):
    __tablename__ = "military"

    military_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resume_id: Mapped[int] = mapped_column(ForeignKey("resumes.resume_id", ondelete="CASCADE"), nullable=False)
    military_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    military_service: Mapped[str | None] = mapped_column(String(255), nullable=True)
    military_start_period: Mapped[date | None] = mapped_column(Date, nullable=True)
    military_end_period: Mapped[date | None] = mapped_column(Date, nullable=True)
    military_rank: Mapped[str | None] = mapped_column(String(255), nullable=True)
    exemption_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
