"""ORM: positions (직무)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Position(Base):
    __tablename__ = "positions"

    position_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    position_name: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
