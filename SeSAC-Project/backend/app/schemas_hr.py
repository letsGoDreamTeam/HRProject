from datetime import datetime
from uuid import UUID

from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class UserPublic(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    is_admin: bool
    can_manage_admin_roles: bool = Field(
        False,
        description="다른 사용자에게 관리자 권한 부여·해제 가능(최고 관리자 또는 제한 미설정 시)",
    )


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field("", max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
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
    headcount_to: int = Field(0, ge=0, le=9999, description="TO(정원) — 직무별 채용 목표 인원")
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
    headcount_to: int = 0
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
    title: str = Field("", max_length=400)
    jd_preferred_text: str = Field("", description="공고 우대·자격 요건 텍스트")
    job_role_id: UUID | None = Field(None, description="통합 직무 행과 연결 시 TO 대비 현황에 반영")
    employer_sector: Literal["public", "private"] = Field(
        "public",
        description="public=공기업·공공기관(블라인드 자소서 필터 적용), private=일반 사기업(해당 필터 비적용)",
    )
    preferred_include_patterns: str = Field("", description="우대 충족으로 보는 패턴(줄바꿈 구분)")
    preferred_exclude_patterns: str = Field("", description="우대 제외 패턴(줄바꿈 구분)")
    preferred_requires_evidence: bool = Field(True, description="행동동사+결과 증거 필수")
    department_name: str = Field("", max_length=200)
    position_name: str = Field("", max_length=200)
    posting_platform: str = Field("", max_length=80)
    posted_at: datetime | None = None
    deadline_at: datetime | None = None


class ApplicationBatchPatch(BaseModel):
    """지원서 묶음 메타 수정(직무 연결, 채용 주체 등)."""

    title: str | None = Field(None, max_length=400)
    jd_preferred_text: str | None = Field(None, description="공고 우대·자격 요건 텍스트")
    employer_sector: Literal["public", "private"] | None = None
    preferred_include_patterns: str | None = None
    preferred_exclude_patterns: str | None = None
    preferred_requires_evidence: bool | None = None
    department_name: str | None = Field(None, max_length=200)
    position_name: str | None = Field(None, max_length=200)
    posting_platform: str | None = Field(None, max_length=80)
    posted_at: datetime | None = None
    deadline_at: datetime | None = None
    job_role_id: UUID | None = None
    clear_job_role: bool = Field(False, description="true이면 직무 연결 해제")


class JobRoleHeadcountPatch(BaseModel):
    headcount_to: int = Field(..., ge=0, le=9999)


class FunnelStageCountOut(BaseModel):
    stage: str
    label_ko: str
    count: int


class PositionToVsPipelineRowOut(BaseModel):
    """직무별 TO(정원) 대비 입사 확정·파이프라인 인원."""

    job_role_id: UUID | None = None
    label: str
    headcount_to: int
    hired_count: int
    active_in_pipeline: int


class RecruitmentSummaryOut(BaseModel):
    """경영용 1페이지 요약에 필요한 수치·한 줄 코멘트."""

    total_applicants: int
    funnel: list[FunnelStageCountOut]
    rejected_count: int
    by_position: list[PositionToVsPipelineRowOut]
    bottleneck_line: str
    weekly_action_line: str


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
    # 표준화 JSON·본문 등에서 보완한 발송용 주소(비어 있으면 추출 실패)
    notify_email: str = ""
    stage: str = "document_screening"
    duplicate_key: str = ""
    standardized_text: str = ""
    standardized_resume: dict | list = Field(default_factory=dict)
    source_ext: str = ""
    pdf_conversion_status: str = "native_pdf"
    pdf_conversion_note: str = ""
    has_source_attachment: bool = False
    text_quality_ok: bool = True
    text_quality_note: str = ""
    analyzed_at: datetime | None
    schedule_confirmed_at: datetime | None = None
    latest_confirm_token: str | None = None  # 가장 최근 발송된 확인 토큰
    latest_confirm_stage_label: str | None = None
    confirm_status: Literal["pending", "accepted", "declined"] | None = None
    source_platform: str = "unknown"
    role_relevance_score: float = 0.0
    resume_completeness_score: float = 0.0
    missing_fields: list[str] = Field(default_factory=list)
    preferred_rule_hits: list[str] = Field(default_factory=list)
    preferred_rule_excluded_hits: list[str] = Field(default_factory=list)
    evidence_level: str = "unknown"


class ApplicationBatchOut(BaseModel):
    id: UUID
    title: str
    jd_preferred_text: str
    employer_sector: Literal["public", "private"] = "public"
    preferred_include_patterns: str = ""
    preferred_exclude_patterns: str = ""
    preferred_requires_evidence: bool = True
    department_name: str = ""
    position_name: str = ""
    posting_platform: str = ""
    posted_at: datetime | None = None
    deadline_at: datetime | None = None
    job_role_id: UUID | None = None
    created_at: datetime | None
    items: list[ApplicationItemOut]


class ApplicantStatusDashboardRowOut(BaseModel):
    batch_id: UUID
    department_name: str
    position_name: str
    posted_at: datetime | None = None
    deadline_at: datetime | None = None
    posting_platform: str
    duplicate_suspected_count: int


class ApplicantStatusDashboardOut(BaseModel):
    rows: list[ApplicantStatusDashboardRowOut]


class BatchResumeInsightRowOut(BaseModel):
    item_id: UUID
    filename: str
    candidate_name: str = ""
    inferred_position: str = ""
    blind_tier: str = "none"
    blind_summary: str = ""
    preferred_met: bool = False
    preferred_reason: str = ""
    role_relevance_score: float = 0.0
    resume_completeness_score: float = 0.0
    missing_fields: list[str] = Field(default_factory=list)
    source_platform: str = "unknown"
    duplicate_suspected: bool = False
    duplicate_reason: str = ""
    evidence_level: str = "unknown"


class BatchResumeInsightsOut(BaseModel):
    batch_id: UUID
    batch_title: str
    total_count: int
    duplicate_suspected_count: int
    blind_risk_count: int
    preferred_met_count: int
    rows: list[BatchResumeInsightRowOut]


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


class CandidateDedupeApplicationOut(BaseModel):
    item_id: UUID
    batch_id: UUID
    batch_title: str = ""
    candidate_name: str = ""
    birth_date: str = ""
    email: str = ""
    phone: str = ""
    stage: str = ""
    source_platform: str = "unknown"
    created_at: datetime | None = None


class CandidateDedupeGroupOut(BaseModel):
    status: Literal["AUTO_MERGED", "REVIEW_REQUIRED", "SEPARATE"]
    score: float
    reason: str
    application_ids: list[UUID]
    auto_candidate_id: UUID | None = None
    applications: list[CandidateDedupeApplicationOut]


class CandidateDedupeReviewOut(BaseModel):
    groups: list[CandidateDedupeGroupOut]


class CandidateDedupMergeRequest(BaseModel):
    item_ids: list[UUID] = Field(..., min_length=2)
    reason: str = Field("", max_length=500)


class CandidateDedupSeparateRequest(BaseModel):
    item_ids: list[UUID] = Field(..., min_length=1)
    reason: str = Field("", max_length=500)


class CandidateMasterOut(BaseModel):
    id: UUID
    canonical_name: str
    canonical_birth_date: str
    canonical_email: str
    canonical_phone: str
    application_count: int
    applications: list[CandidateDedupeApplicationOut]
    created_at: datetime | None = None


class CandidateDedupLogOut(BaseModel):
    id: UUID
    action: str
    status: str
    score: float
    reason: str
    item_ids: list[UUID]
    candidate_id: UUID | None = None
    created_at: datetime | None = None

ApplicationStageInput = Literal[
    "document_screening",
    "document_review",
    "interview_1",
    "interview_2",
    "interview_3",
    "interview_4",
    "interview_5",
    "interview_6",
    "interview_7",
    "interview_8",
    "interview_9",
    "interview_10",
    "interview_n",
    "final",
    "final_pass",
    "final_fail",
    "hired",
    "rejected",
]


class StageUpdateRequest(BaseModel):
    stage: ApplicationStageInput


class GenConfirmUrlRequest(BaseModel):
    """확인 링크 미리 생성 요청 (이메일 미발송)."""
    site_base_url: str = Field("http://localhost:5173", description="확인 링크 기본 URL")


class GenConfirmUrlOut(BaseModel):
    confirm_url: str
    token: str


class StagePassNotifyRequest(BaseModel):
    """단계 합격 이메일 발송 요청."""
    stage_label: str = Field(..., max_length=80, description="이동된 단계 이름 (예: 1차 코딩테스트)")
    notify_at: datetime | None = Field(
        None, description="메일 예약 발송 시각 (없으면 즉시 큐)"
    )
    scheduled_at: datetime | None = Field(
        None, description="해당 단계 일정 (없으면 '추후 안내' 문구 사용)"
    )
    location: str = Field("", max_length=300, description="장소 (선택)")
    note: str = Field("", max_length=500, description="추가 안내 메시지 (선택)")
    site_base_url: str = Field("http://localhost:5173", description="확인 링크 기본 URL")
    pre_token: str | None = Field(None, description="미리 생성된 토큰 재사용 시 지정")
    next_stage_key: ApplicationStageInput | None = Field(None, description="승인 시 이동할 다음 단계 key")
    schedule_pick_url: str | None = Field(None, description="지원자 시간선택 링크(/schedule/pick/:token)")


class StagePassNotifyOut(BaseModel):
    queued: int
    scheduled_at: datetime | None
    confirm_url: str | None = None
    delivery_note: str = ""


class StageAttendanceRequest(BaseModel):
    """후보자 참석 여부 응답."""
    attendance: Literal["accepted", "declined"]


class StageConfirmView(BaseModel):
    """후보자용 일정 확인 페이지 데이터."""
    token: str
    candidate_name: str
    stage_label: str
    scheduled_at: datetime | None
    location: str
    note: str
    schedule_pick_url: str = ""
    confirmed_at: datetime | None
    already_confirmed: bool
    attendance: str | None = None  # accepted | declined | None(미응답)


class StageConfirmResult(BaseModel):
    ok: bool
    confirmed_at: datetime
    attendance: str  # accepted | declined


class ScheduledResultMailRequest(BaseModel):
    item_ids: list[UUID] = Field(..., min_length=1)
    result: Literal["hired", "rejected", "final_pass", "final_fail"]
    subject_template: str = Field(..., min_length=1, max_length=400)
    body_template: str = Field(..., min_length=1, max_length=8000)
    # None 또는 send_immediately=True → 수 초 뒤 즉시 발송 큐(예약 시각 자동)
    schedule_at: datetime | None = None
    send_immediately: bool = False


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
    applied_position: str = Field("", max_length=400, description="지원 직무(평가표 자동 표시)")
    application_filter_item_id: UUID | None = Field(
        None,
        description="지원서(분류) 항목 ID — 링크 응답 시 단계·일정 확정 자동 반영",
    )


class InterviewInterviewerIn(BaseModel):
    name: str = Field(..., max_length=200)
    email: str = Field("", max_length=320)
    phone: str = Field("", max_length=64)


IntervieweePerSlot = Literal["single", "multiple"]

InterviewPhase = Literal["general", "first_interview", "second_interview"]


class InterviewRoundCreate(BaseModel):
    title: str = Field("면접 일정", max_length=400)
    department: str = Field("", max_length=400)
    job_title: str = Field("", max_length=400)
    stage_key: str = Field("", max_length=32, description="연결할 채용 단계 key (예: interview_2)")
    timezone: str = Field("Asia/Seoul", max_length=64)
    hr_notify_email: str = Field("", max_length=320)
    interview_phase: InterviewPhase = Field(
        "general",
        description="1차: 원본 이력서 활용 / 2차: 회사 표준 평가·양식 운영(가이드)",
    )
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
    department: str | None = Field(None, max_length=400)
    job_title: str | None = Field(None, max_length=400)
    stage_key: str | None = Field(None, max_length=32)
    timezone: str | None = Field(None, max_length=64)
    hr_notify_email: str | None = Field(None, max_length=320)
    interview_phase: InterviewPhase | None = None
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
    participation: Literal["pending", "confirmed", "declined"] = Field(
        "pending",
        description="pending: 미예약·미불참 / confirmed: 슬롯 예약 / declined: 면접 불참 응답",
    )


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
    status: Literal["pending", "confirmed", "declined"]
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
    declined_count: int = 0
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
    criteria_comments: dict[str, str] = Field(default_factory=dict)
    final_summary_line: str = ""
    recommendation: str = ""
    overall_comment: str


class EvaluationAggregateOut(BaseModel):
    candidate_id: UUID
    candidate_name: str
    criteria: list[str]
    submissions: list[EvalSubmissionSummaryOut]


class PublicEvaluationView(BaseModel):
    round_title: str
    candidate_name: str
    applied_position: str = ""
    interviewer_name: str
    interview_phase: str = "general"
    interview_slot_start_at: datetime | None = None
    interview_slot_end_at: datetime | None = None
    criteria_labels: list[str]
    already_submitted: bool
    scores: dict[str, int] | None = None
    criteria_comments: dict[str, str] | None = None
    final_summary_line: str = ""
    recommendation: str = ""
    overall_comment: str = ""


class PublicEvaluationSubmit(BaseModel):
    scores: dict[str, int] = Field(default_factory=dict)
    criteria_comments: dict[str, str] = Field(default_factory=dict)
    final_summary_line: str = Field(..., min_length=1, max_length=500, description="종합 한 줄 요약")
    overall_comment: str = Field("", max_length=8000, description="항목별 외 추가 의견(서술형)")
    recommendation: Literal["pass", "hold", "fail"] = Field(..., description="합격·보류·불합격")


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


class OpenAITokenUsageByModelOut(BaseModel):
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    requests: int


class OpenAITokenUsageSummaryOut(BaseModel):
    from_at: datetime
    to_at: datetime
    total_prompt_tokens: int
    total_completion_tokens: int
    total_tokens: int
    total_requests: int
    by_model: list[OpenAITokenUsageByModelOut]


# ── 채용 절차 설정 ──────────────────────────────────────────────

class ProcessStageItem(BaseModel):
    """채용 절차 단계 1개. key는 ApplicationStageInput 중 하나."""
    key: str = Field(..., max_length=32)
    label: str = Field(..., max_length=80)


class RecruitmentProcessCreate(BaseModel):
    name: str = Field(..., max_length=200, description="절차 이름 (예: 개발직군 채용절차)")
    department: str = Field("", max_length=400)
    stages: list[ProcessStageItem] = Field(..., min_length=2, max_length=15)


class RecruitmentProcessPatch(BaseModel):
    name: str | None = Field(None, max_length=200)
    department: str | None = Field(None, max_length=400)
    stages: list[ProcessStageItem] | None = None


class RecruitmentProcessOut(BaseModel):
    id: UUID
    name: str
    department: str
    stages: list[ProcessStageItem]
    created_at: datetime | None
    updated_at: datetime | None
