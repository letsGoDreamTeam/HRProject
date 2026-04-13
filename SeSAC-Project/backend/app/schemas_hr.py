from datetime import datetime
from uuid import UUID

from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class UserPublic(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    is_admin: bool


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field("", max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class DeleteAccountRequest(BaseModel):
    """회원탈퇴 시 본인 확인용."""

    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class CompanyProfileUpsert(BaseModel):
    company_name: str = Field("", max_length=300)
    jd_reference: str = ""
    job_description: str = ""
    org_notes: str = ""


class CompanyProfileOut(BaseModel):
    id: UUID
    company_name: str
    jd_reference: str
    job_description: str
    org_notes: str


class CompanyProfileFromPdfOut(BaseModel):
    """PDF 업로드 후 LLM으로 4필드 분리. DB에 자동 저장하지 않음(폼에 채운 뒤 사용자가 저장)."""

    company_name: str
    jd_reference: str
    job_description: str
    org_notes: str
    ocr_used: bool = False
    warnings: list[str] = Field(default_factory=list)


class JobRoleParsed(BaseModel):
    """PDF 파싱 직후(저장 전) 한 직무."""

    department: str = Field("", max_length=400)
    job_title: str = Field("", max_length=400)
    role_grade: str = Field("", max_length=200)
    body_text: str = ""


class JobsFromPdfOut(BaseModel):
    """LangGraph·LangChain 청크 + 청크별 LLM 추출 → 병합 결과."""

    jobs: list[JobRoleParsed]
    warnings: list[str] = Field(default_factory=list)
    ocr_used: bool = False
    chunk_count: int = 0


class JobRoleProfileOut(BaseModel):
    id: UUID
    source_document_name: str
    department: str
    job_title: str
    role_grade: str
    body_text: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class JobRoleBulkUpsert(BaseModel):
    """저장 시 기존 직무 행을 모두 교체하고 RAG 인덱스를 다시 만듭니다."""

    source_document_name: str = Field("", max_length=512)
    jobs: list[JobRoleParsed] = Field(default_factory=list)


class JobRoleRagHit(BaseModel):
    job_id: UUID
    department: str
    job_title: str
    role_grade: str
    snippet: str
    score: float = Field(..., description="코사인 유사도 대략값(0~1)")


class JobRoleRagSearchOut(BaseModel):
    query: str
    hits: list[JobRoleRagHit]


class ApplicationBatchCreate(BaseModel):
    title: str = Field("지원서 분류", max_length=400)
    jd_preferred_text: str = Field("", description="공고 우대·자격 요건 텍스트")


class ApplicationItemOut(BaseModel):
    id: UUID
    filename: str
    blind_tier: str
    blind_summary: str
    blind_snippets: list[str]
    preferred_met: bool
    preferred_reason: str
    keyword_flags: list[str]
    candidate_name: str = ""
    birth_date: str = ""
    email_extracted: str = ""
    stage: str = "document_review"
    duplicate_key: str = ""
    standardized_text: str = ""
    standardized_resume: dict | list = Field(default_factory=dict)
    source_ext: str = ""
    pdf_conversion_status: str = "native_pdf"
    pdf_conversion_note: str = ""
    text_quality_ok: bool = True
    text_quality_note: str = ""
    analyzed_at: datetime | None


class ApplicationBatchOut(BaseModel):
    id: UUID
    title: str
    jd_preferred_text: str
    created_at: datetime | None
    items: list[ApplicationItemOut]


class ResumeStandardizeOut(BaseModel):
    updated: int
    skipped: int


class DuplicateGroupOut(BaseModel):
    key: str
    item_ids: list[UUID]
    names: list[str]
    birth_dates: list[str]


class DedupeScanOut(BaseModel):
    groups: list[DuplicateGroupOut]


class StageUpdateRequest(BaseModel):
    stage: Literal["document_review", "interview_n", "final_pass", "final_fail"]


class ScheduledResultMailRequest(BaseModel):
    item_ids: list[UUID] = Field(..., min_length=1)
    result: Literal["final_pass", "final_fail"]
    subject_template: str = Field(..., min_length=1, max_length=400)
    body_template: str = Field(..., min_length=1, max_length=8000)
    schedule_at: datetime


class ScheduledResultMailOut(BaseModel):
    queued: int
    skipped_no_email: int


class InterviewSlotIn(BaseModel):
    start_at: datetime
    end_at: datetime
    capacity: int = Field(1, ge=1, le=50)


class InterviewCandidateIn(BaseModel):
    name: str = Field(..., max_length=200)
    email: str = Field("", max_length=320)
    phone: str = Field("", max_length=64)


class InterviewInterviewerIn(BaseModel):
    name: str = Field(..., max_length=200)
    email: str = Field("", max_length=320)
    phone: str = Field("", max_length=64)


IntervieweePerSlot = Literal["single", "multiple"]


class InterviewRoundCreate(BaseModel):
    title: str = Field("면접 일정", max_length=400)
    timezone: str = Field("Asia/Seoul", max_length=64)
    hr_notify_email: str = Field("", max_length=320)
    interviewee_per_slot: IntervieweePerSlot = Field(
        "single",
        description="single: 슬롯당 1명(1:1), multiple: 슬롯당 여러 명(다자·그룹)",
    )
    slots: list[InterviewSlotIn] = Field(..., min_length=1)
    candidates: list[InterviewCandidateIn] = Field(..., min_length=1)
    interviewers: list[InterviewInterviewerIn] = Field(default_factory=list)


class InterviewRoundPatch(BaseModel):
    """부분 수정. 슬롯·지원자·면접관을 바꿀 때는 세 필드를 모두 보내야 하며, 예약이 있으면 409."""

    title: str | None = Field(None, max_length=400)
    timezone: str | None = Field(None, max_length=64)
    hr_notify_email: str | None = Field(None, max_length=320)
    interviewee_per_slot: IntervieweePerSlot | None = None
    slots: list[InterviewSlotIn] | None = None
    candidates: list[InterviewCandidateIn] | None = None
    interviewers: list[InterviewInterviewerIn] | None = None


class InterviewSlotPublic(BaseModel):
    id: UUID
    start_at: datetime
    end_at: datetime
    capacity: int
    remaining: int


class PublicScheduleView(BaseModel):
    round_title: str
    candidate_name: str
    timezone: str
    slots: list[InterviewSlotPublic]
    already_booked_slot_id: UUID | None = None


class BookSlotRequest(BaseModel):
    slot_id: UUID


class PatchBookingRequest(BaseModel):
    slot_id: UUID


class SlotBookingSummaryOut(BaseModel):
    slot_id: UUID
    start_at: datetime
    end_at: datetime
    capacity: int
    booked: int
    remaining: int


class CandidateBookingRowOut(BaseModel):
    id: UUID
    name: str
    email: str
    phone: str
    status: Literal["pending", "confirmed"]
    slot_id: UUID | None = None
    slot_start_at: datetime | None = None
    slot_end_at: datetime | None = None
    pick_url_path: str
    pick_url_absolute: str


class RoundBookingStatusOut(BaseModel):
    """HR용: 지원자별 예약 확정 여부·슬롯별 찼는지 한눈에."""

    round_id: UUID
    title: str
    timezone: str
    confirmed_count: int
    pending_count: int
    candidates: list[CandidateBookingRowOut]
    slots: list[SlotBookingSummaryOut]


class RemindPendingOut(BaseModel):
    emails_queued: int
    sms_queued: int
    skipped_no_contact: int


# --- 면접 평가표(면접관 링크 제출·HR 집계·미제출 알림) ---


class EvaluationCriteriaSetup(BaseModel):
    """평가 항목 이름 목록(지원자·면접관 조합별 평가표 자동 생성)."""

    criteria: list[str] = Field(..., min_length=1, max_length=12)


class EvaluationSetupOut(BaseModel):
    created_pairs: int
    updated_pending_criteria: int
    criteria: list[str]


class EvalInterviewerRowOut(BaseModel):
    interviewer_id: UUID
    interviewer_name: str
    status: Literal["not_issued", "pending", "submitted"]
    submitted_at: datetime | None = None
    eval_url_path: str = ""
    eval_url_absolute: str = ""


class EvalCandidateStatusOut(BaseModel):
    candidate_id: UUID
    candidate_name: str
    interviewers: list[EvalInterviewerRowOut]


class EvaluationsStatusOut(BaseModel):
    round_id: UUID
    title: str
    candidates: list[EvalCandidateStatusOut]


class EvalSubmissionSummaryOut(BaseModel):
    interviewer_name: str
    submitted_at: datetime
    scores: dict[str, int]
    overall_comment: str


class EvaluationAggregateOut(BaseModel):
    candidate_id: UUID
    candidate_name: str
    criteria: list[str]
    submissions: list[EvalSubmissionSummaryOut]


class PublicEvaluationView(BaseModel):
    round_title: str
    candidate_name: str
    interviewer_name: str
    criteria_labels: list[str]
    already_submitted: bool
    scores: dict[str, int] | None = None
    overall_comment: str = ""


class PublicEvaluationSubmit(BaseModel):
    scores: dict[str, int] = Field(default_factory=dict)
    overall_comment: str = Field("", max_length=8000)


class CandidateInterviewQuestionsRequest(BaseModel):
    department: str = Field(..., max_length=200)
    applicant_essay: str = Field("", max_length=80_000)
    applicant_portfolio: str = Field("", max_length=80_000)
    extra_context: str = Field("", max_length=20_000)
    job_role_id: UUID | None = Field(None, description="통합 직무소개서에서 저장한 직무 행 ID(선택)")


class CandidateInterviewQuestionsResponse(BaseModel):
    questions: list[str]
    notes_for_interviewer: str = ""


class RejectionRecipient(BaseModel):
    name: str = Field("", max_length=200)
    email: str = Field("", max_length=320)
    phone: str = Field("", max_length=64)


class RejectionBulkRequest(BaseModel):
    recipients: list[RejectionRecipient] = Field(..., min_length=1, max_length=500)
    subject: str = Field("채용 전형 결과 안내", max_length=400)
    body: str = Field(..., min_length=1, max_length=20_000)
    send_email: bool = True
    send_sms: bool = False
    schedule_in_minutes: int = Field(0, ge=0, le=60 * 24 * 14, description="예약 발송(분). 0이면 즉시 큐에 넣고 스케줄러가 처리.")


class UserAdminPatch(BaseModel):
    is_admin: bool


class UserAdminPatchByEmail(BaseModel):
    """관리자가 이메일로 특정 계정의 관리자 권한을 부여/해지."""

    email: EmailStr
    is_admin: bool = Field(..., description="true: 부여, false: 해지")


class UserAdminPublic(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    is_admin: bool
    created_at: datetime | None
