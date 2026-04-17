"""HR 확장 모델: 인증, 지원서 분류, 면접 일정, 알림."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint, func
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
    headcount_to: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
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
    job_role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("job_role_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(400), nullable=False, default="지원서 분류")
    jd_preferred_text: Mapped[str] = mapped_column(
        Text, nullable=False, default="", comment="공고 내 우대·자격 요건 등"
    )
    # public: 공기업·공공기관 등 블라인드 자소서 필터 적용 / private: 일반 사기업(해당 필터 비적용)
    employer_sector: Mapped[str] = mapped_column(String(16), nullable=False, default="public")
    preferred_include_patterns: Mapped[str] = mapped_column(
        Text, nullable=False, default="", comment="우대 충족 가산 패턴(줄바꿈 구분)"
    )
    preferred_exclude_patterns: Mapped[str] = mapped_column(
        Text, nullable=False, default="", comment="우대 충족 제외 패턴(줄바꿈 구분)"
    )
    preferred_requires_evidence: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, comment="행동동사+결과 증거 필수 여부"
    )
    department_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    position_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    posting_platform: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
        String(32), nullable=False, default="document_screening"
    )  # document_screening | interview_1 | interview_2 | final | hired | rejected (+레거시 호환)
    duplicate_key: Mapped[str] = mapped_column(String(300), nullable=False, default="", index=True)
    source_ext: Mapped[str] = mapped_column(String(16), nullable=False, default="pdf")
    pdf_conversion_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="native_pdf"
    )  # native_pdf | extracted_direct | extract_failed
    pdf_conversion_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    text_quality_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    text_quality_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    schedule_confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="후보자가 일정 확인 링크에서 '확인' 클릭한 시각"
    )
    source_platform: Mapped[str] = mapped_column(String(40), nullable=False, default="unknown")
    role_relevance_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    resume_completeness_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    missing_fields: Mapped[list | dict] = mapped_column(JSON, nullable=False, default=list)
    preferred_rule_hits: Mapped[list | dict] = mapped_column(JSON, nullable=False, default=list)
    preferred_rule_excluded_hits: Mapped[list | dict] = mapped_column(JSON, nullable=False, default=list)
    evidence_level: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    # docx/rtf/txt/md 등 원본(합격 증빙·PDF 재변환용). PDF 업로드는 용량 절약을 위해 비움.
    source_blob: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    batch: Mapped["ApplicationFilterBatch"] = relationship(back_populates="items")


class CandidateMaster(Base):
    """후보자 마스터: 여러 플랫폼/지원서를 동일 인물 단위로 묶는 루트 엔티티."""

    __tablename__ = "candidate_masters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    canonical_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    canonical_birth_date: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    canonical_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    canonical_phone: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    links: Mapped[list["CandidateApplicationLink"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan"
    )


class CandidateApplicationLink(Base):
    """후보자 마스터와 실제 지원서 아이템 간 연결."""

    __tablename__ = "candidate_application_links"
    __table_args__ = (UniqueConstraint("item_id", name="uq_candidate_application_links_item_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("candidate_masters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("application_filter_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_platform: Mapped[str] = mapped_column(String(40), nullable=False, default="unknown")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    candidate: Mapped["CandidateMaster"] = relationship(back_populates="links")
    item: Mapped["ApplicationFilterItem"] = relationship(foreign_keys=[item_id])


class CandidateDedupReviewLog(Base):
    """중복 판정/병합/분리 히스토리."""

    __tablename__ = "candidate_dedup_review_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False, default="review")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="REVIEW_REQUIRED")
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    item_ids: Mapped[list | dict] = mapped_column(JSON, nullable=False, default=list)
    candidate_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("candidate_masters.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

class InterviewRound(Base):
    __tablename__ = "interview_rounds"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(400), nullable=False, default="면접 일정")
    department: Mapped[str] = mapped_column(String(400), nullable=False, default="")
    job_title: Mapped[str] = mapped_column(String(400), nullable=False, default="")
    stage_key: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Seoul")
    hr_notify_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    # 한 슬롯당 지원자: single=1명만(1:1), multiple=같은 시간에 여러 명(다자·그룹 등)
    interviewee_per_slot: Mapped[str] = mapped_column(String(16), nullable=False, default="single")
    # 1차: 원본 이력서 중심 / 2차: 회사 표준 양식 운영 등 안내용(이미지 요구 워크플로)
    interview_phase: Mapped[str] = mapped_column(String(32), nullable=False, default="general")
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
    applied_position: Mapped[str] = mapped_column(String(400), nullable=False, default="")
    access_token: Mapped[str] = mapped_column(String(64), nullable=False, default=_token, unique=True, index=True)
    application_filter_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("application_filter_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    schedule_declined_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="공개 링크에서 면접 불참 응답한 시각"
    )

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
    criteria_comments: Mapped[dict | list] = mapped_column(JSON, nullable=False, default=dict)
    final_summary_line: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    recommendation: Mapped[str] = mapped_column(String(16), nullable=False, default="")
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


class StageConfirmToken(Base):
    """지원자에게 발송하는 일정 확인 링크 토큰."""

    __tablename__ = "stage_confirm_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("application_filter_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, default=_token)
    stage_label: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    next_stage_key: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    schedule_pick_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    location: Mapped[str] = mapped_column(Text, nullable=False, default="")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attendance: Mapped[str | None] = mapped_column(
        String(16), nullable=True, comment="후보자 답변: accepted | declined | None(미응답)"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    item: Mapped["ApplicationFilterItem"] = relationship(foreign_keys=[item_id])


class RecruitmentProcessConfig(Base):
    """부서/직무별 채용 절차 단계 설정. interview_1~interview_10 등 유동적인 면접 라운드 지원."""

    __tablename__ = "recruitment_process_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    department: Mapped[str] = mapped_column(String(400), nullable=False, default="")
    stages: Mapped[list] = mapped_column(
        JSON, nullable=False, default=list,
        comment='[{"key":"document_screening","label":"서류 접수"}, ...]'
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


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


class OpenAITokenUsage(Base):
    """OpenAI 모델별 토큰 사용량 로그(시스템 대시보드 집계용)."""

    __tablename__ = "openai_token_usage"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    feature: Mapped[str] = mapped_column(String(80), nullable=False, default="unknown")
    model: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    request_kind: Mapped[str] = mapped_column(String(24), nullable=False, default="chat")
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
