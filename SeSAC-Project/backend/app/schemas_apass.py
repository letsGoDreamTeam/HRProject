"""A-PASS: 생기부·포트폴리오 분석, RAG, Fit, 모의면접 API 스키마."""

from typing import Literal

from pydantic import BaseModel, Field


class RecordSections(BaseModel):
    """생기부/포트폴리오에서 추출한 핵심 텍스트 블록."""

    seuteuk: str = Field(default="", description="세부능력 및 특기사항 요약·전문")
    club: str = Field(default="", description="동아리 활동")
    reading: str = Field(default="", description="독서(교과/자율) 관련")
    other: str = Field(default="", description="기타 눈에 띄는 활동·수상 등")


class ParseRecordResponse(BaseModel):
    full_text: str = Field(..., description="PDF/OCR 등으로 얻은 전체 텍스트(앞부분 미리보기용)")
    sections: RecordSections


class IngestUniversityRequest(BaseModel):
    university_name: str = Field(..., min_length=1)
    department: str = Field(..., min_length=1)
    document_text: str = Field(..., min_length=50, description="인재상·모집요강 등 원문")


class IngestUniversityResponse(BaseModel):
    collection_key: str
    chunks_indexed: int


class CompetencyMappingItem(BaseModel):
    domain: Literal["학업역량", "진로역량", "공동체역량"]
    summary: str
    evidence_quote: str = Field(..., description="생기부/활동에서 인용 또는 근거 요약")


class AnalyzeFitRequest(BaseModel):
    target_university: str
    target_department: str
    sections: RecordSections
    locale: Literal["ko", "en"] = "ko"


class AnalyzeFitResponse(BaseModel):
    fit_score: int = Field(..., ge=0, le=100)
    competency_mapping: list[CompetencyMappingItem]
    coaching_comment: str = Field(..., description="첨삭·보완 가이드")
    rag_snippets_used: list[str] = Field(default_factory=list, description="참고한 인재상 조각(요약)")


class InterviewStartRequest(BaseModel):
    locale: Literal["ko", "en"] = "ko"
    record_summary: str = Field(..., min_length=20, description="생기부 요약 또는 세특 하이라이트")


class InterviewStartResponse(BaseModel):
    thread_id: str
    assistant_message: str
    phase: str


class InterviewTurnRequest(BaseModel):
    thread_id: str
    user_message: str = Field(..., min_length=1)


class InterviewTurnResponse(BaseModel):
    assistant_message: str
    phase: str
    finished: bool


class DashboardStudentPoint(BaseModel):
    label: str
    value: float


class DashboardStudentResponse(BaseModel):
    char_trend: list[DashboardStudentPoint]
    keyword_trend: list[DashboardStudentPoint]
    interview_scores: list[DashboardStudentPoint]
    notes: str


class InstitutionCandidate(BaseModel):
    id: str
    applicant_name: str
    fit_score: int
    band: str = Field(..., description="top10 | mid | screen")
    summary: str


class DashboardInstitutionResponse(BaseModel):
    columns: dict[str, list[InstitutionCandidate]]
    report_hint: str
