"""ORM: experiences (경력)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Experience(Base):
    __tablename__ = "experiences"

    experience_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resume_id: Mapped[int] = mapped_column(ForeignKey("resumes.resume_id", ondelete="CASCADE"), nullable=False)
    company: Mapped[str | None] = mapped_column(String(500), nullable=True)
    role: Mapped[str | None] = mapped_column(String(500), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    salary: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason_for_leaving: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    employment_start_period: Mapped[date | None] = mapped_column(Date, nullable=True)
    employment_end_period: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
