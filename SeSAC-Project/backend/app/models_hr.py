"""HR 확장 모델: 인증, 지원서 분류, 면접 일정, 알림."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


def _token() -> str:
    return secrets.token_urlsafe(24)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CompanyProfile(Base):
    """회사·직무 맥락(면접 질문 품질용). 사용자(기업 계정)당 1건."""

    __tablename__ = "company_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    company_name: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    jd_reference: Mapped[str] = mapped_column(Text, nullable=False, default="")
    job_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    org_notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class JobRoleProfile(Base):
    """통합 직무소개서 PDF 등에서 추출한 부서·직무별 행. 사용자당 여러 건 + RAG 인덱스."""

    __tablename__ = "job_role_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_document_name: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    department: Mapped[str] = mapped_column(String(400), nullable=False, default="")
    job_title: Mapped[str] = mapped_column(String(400), nullable=False, default="")
    role_grade: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    body_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ApplicationFilterBatch(Base):
    __tablename__ = "application_filter_batches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(400), nullable=False, default="지원서 분류")
    jd_preferred_text: Mapped[str] = mapped_column(
        Text, nullable=False, default="", comment="공고 내 우대·자격 요건 등"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["ApplicationFilterItem"]] = relationship(
        back_populates="batch", cascade="all, delete-orphan"
    )


class ApplicationFilterItem(Base):
    __tablename__ = "application_filter_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("application_filter_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename: Mapped[str] = mapped_column(String(512), nullable=False, default="document.pdf")
    content_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    blind_tier: Mapped[str] = mapped_column(
        String(32), nullable=False, default="unknown"
    )  # none | low | high | unknown
    blind_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    blind_snippets: Mapped[list | dict] = mapped_column(JSON, nullable=False, default=list)
    preferred_met: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    preferred_reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    keyword_flags: Mapped[list | dict] = mapped_column(JSON, nullable=False, default=list)
    standardized_resume: Mapped[dict | list] = mapped_column(JSON, nullable=False, default=dict)
    standardized_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    candidate_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    birth_date: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    email_extracted: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    stage: Mapped[str] = mapped_column(
        String(32), nullable=False, default="document_review"
    )  # document_review | interview_n | final_pass | final_fail
    duplicate_key: Mapped[str] = mapped_column(String(300), nullable=False, default="", index=True)
    source_ext: Mapped[str] = mapped_column(String(16), nullable=False, default="pdf")
    pdf_conversion_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="native_pdf"
    )  # native_pdf | extracted_direct | extract_failed
    pdf_conversion_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    text_quality_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    text_quality_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    batch: Mapped["ApplicationFilterBatch"] = relationship(back_populates="items")


class InterviewRound(Base):
    __tablename__ = "interview_rounds"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(400), nullable=False, default="면접 일정")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Seoul")
    hr_notify_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    # 한 슬롯당 지원자: single=1명만(1:1), multiple=같은 시간에 여러 명(다자·그룹 등)
    interviewee_per_slot: Mapped[str] = mapped_column(String(16), nullable=False, default="single")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    slots: Mapped[list["InterviewSlot"]] = relationship(
        back_populates="round", cascade="all, delete-orphan", order_by="InterviewSlot.start_at"
    )
    candidates: Mapped[list["InterviewCandidate"]] = relationship(
        back_populates="round", cascade="all, delete-orphan"
    )
    interviewers: Mapped[list["InterviewInterviewer"]] = relationship(
        back_populates="round", cascade="all, delete-orphan"
    )
    evaluation_submissions: Mapped[list["InterviewEvaluationSubmission"]] = relationship(
        back_populates="round", cascade="all, delete-orphan"
    )


class InterviewSlot(Base):
    __tablename__ = "interview_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    round_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_rounds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    round: Mapped["InterviewRound"] = relationship(back_populates="slots")
    bookings: Mapped[list["InterviewBooking"]] = relationship(
        back_populates="slot", cascade="all, delete-orphan"
    )


class InterviewCandidate(Base):
    __tablename__ = "interview_candidates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    round_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_rounds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    access_token: Mapped[str] = mapped_column(String(64), nullable=False, default=_token, unique=True, index=True)

    round: Mapped["InterviewRound"] = relationship(back_populates="candidates")
    booking: Mapped["InterviewBooking | None"] = relationship(
        back_populates="candidate", uselist=False, cascade="all, delete-orphan"
    )
    evaluation_submissions: Mapped[list["InterviewEvaluationSubmission"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan"
    )


class InterviewInterviewer(Base):
    __tablename__ = "interview_interviewers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    round_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_rounds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    round: Mapped["InterviewRound"] = relationship(back_populates="interviewers")
    evaluation_submissions: Mapped[list["InterviewEvaluationSubmission"]] = relationship(
        back_populates="interviewer", cascade="all, delete-orphan"
    )


class InterviewEvaluationSubmission(Base):
    """지원자×면접관별 면접 평가표(공개 링크로 제출)."""

    __tablename__ = "interview_evaluation_submissions"
    __table_args__ = (
        UniqueConstraint("round_id", "candidate_id", "interviewer_id", name="uq_interview_eval_round_cand_inv"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    round_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_rounds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_candidates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    interviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_interviewers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    access_token: Mapped[str] = mapped_column(String(64), nullable=False, default=_token, unique=True, index=True)
    criteria_labels: Mapped[list | dict] = mapped_column(JSON, nullable=False, default=list)
    scores: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    overall_comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    round: Mapped["InterviewRound"] = relationship(back_populates="evaluation_submissions")
    candidate: Mapped["InterviewCandidate"] = relationship(back_populates="evaluation_submissions")
    interviewer: Mapped["InterviewInterviewer"] = relationship(back_populates="evaluation_submissions")


class InterviewBooking(Base):
    __tablename__ = "interview_bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_slots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_candidates.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    slot: Mapped["InterviewSlot"] = relationship(back_populates="bookings")
    candidate: Mapped["InterviewCandidate"] = relationship(back_populates="booking")


class NotificationOutbox(Base):
    __tablename__ = "notification_outbox"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    channel: Mapped[str] = mapped_column(String(16), nullable=False)  # email | sms
    recipient: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(String(400), nullable=False, default="")
    body: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False, default="generic")
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str] = mapped_column(Text, nullable=False, default="")
    correlation_key: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
