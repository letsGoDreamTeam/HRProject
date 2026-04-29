"""ORM: interviewers (면접관)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Interviewer(Base):
    __tablename__ = "interviewers"

    interviewer_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    interviewer_email: Mapped[str] = mapped_column(String(320), nullable=False)
    interviewer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
