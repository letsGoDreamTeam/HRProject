"""A-PASS 영속 모델 (PostgreSQL JSON 호환)."""

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class ApassFitReport(Base):
    __tablename__ = "apass_fit_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_university: Mapped[str] = mapped_column(String(256), nullable=False)
    target_department: Mapped[str] = mapped_column(String(256), nullable=False)
    fit_score: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
