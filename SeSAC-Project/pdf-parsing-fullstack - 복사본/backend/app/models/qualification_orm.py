"""ORM: qualifications (자격)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Qualification(Base):
    __tablename__ = "qualifications"

    qualification_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resume_id: Mapped[int] = mapped_column(ForeignKey("resumes.resume_id", ondelete="CASCADE"), nullable=False)
    certificate: Mapped[str | None] = mapped_column(String(500), nullable=True)
    organization: Mapped[str | None] = mapped_column(String(500), nullable=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    certificate_number: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
