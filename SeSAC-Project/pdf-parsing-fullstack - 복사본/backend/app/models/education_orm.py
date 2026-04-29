"""ORM: educations (학력)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Education(Base):
    __tablename__ = "educations"

    education_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resume_id: Mapped[int] = mapped_column(ForeignKey("resumes.resume_id", ondelete="CASCADE"), nullable=False)
    school_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    department: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # 최종학력 구분(고등학교·학사·석사·박사 또는 '대학원'만 있을 때 안내 문구 등)
    completion_status: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attendance_start_period: Mapped[date | None] = mapped_column(Date, nullable=True)
    attendance_end_period: Mapped[date | None] = mapped_column(Date, nullable=True)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    grade: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
