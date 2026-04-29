"""ORM: resumes (이력서)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Resume(Base):
    __tablename__ = "resumes"

    resume_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    position_id: Mapped[int] = mapped_column(
        ForeignKey("positions.position_id", ondelete="RESTRICT"),
        nullable=False,
    )
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidates.candidate_id", ondelete="RESTRICT"),
        nullable=False,
    )
    desired_location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    second_position_id: Mapped[int | None] = mapped_column(
        ForeignKey("positions.position_id", ondelete="SET NULL"),
        nullable=True,
    )
    desired_salary: Mapped[int | None] = mapped_column(Integer, nullable=True)
    veteran_eligibility: Mapped[str | None] = mapped_column(String(500), nullable=True)
    disability: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
