import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class InterviewAnalysis(Base):
    """JD 원문·요약 단위 (1건의 분석 세션)."""

    __tablename__ = "interview_analyses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jd_text: Mapped[str] = mapped_column(Text, nullable=False)
    analysis_summary: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    competencies: Mapped[list["InterviewCompetency"]] = relationship(
        back_populates="analysis",
        cascade="all, delete-orphan",
        order_by="InterviewCompetency.sort_order",
    )


class InterviewCompetency(Base):
    """역량 1개 (직무/인성/협업 등) — 분석 1건당 여러 행, sort_order로 순서 고정."""

    __tablename__ = "interview_competencies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_analyses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    competency: Mapped[str] = mapped_column(Text, nullable=False, comment="역량 명칭")
    evidence: Mapped[str] = mapped_column(Text, nullable=False, comment="JD 인용 근거")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    analysis: Mapped["InterviewAnalysis"] = relationship(back_populates="competencies")
    questions: Mapped[list["InterviewQuestion"]] = relationship(
        back_populates="competency",
        cascade="all, delete-orphan",
        order_by="InterviewQuestion.sort_order",
    )


class InterviewQuestion(Base):
    """역량별 면접 질문 1개 — 역량당 여러 행, sort_order로 질문 순서."""

    __tablename__ = "interview_questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_competencies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    competency: Mapped["InterviewCompetency"] = relationship(back_populates="questions")
