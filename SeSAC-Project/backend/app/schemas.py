from pydantic import BaseModel, Field


class CompetencyItem(BaseModel):
    competency: str = Field(..., description="도출된 역량 명칭")
    evidence: str = Field(..., description="JD 내 인용 문구")
    questions: list[str] = Field(
        ...,
        min_length=2,
        max_length=2,
        description="STAR 기반 질문 2개",
    )


class AnalysisResponse(BaseModel):
    analysis_summary: str
    items: list[CompetencyItem] = Field(..., min_length=1, max_length=250)
    warnings: list[str] = Field(
        default_factory=list,
        description="가드레일·교정 단계에서 생성된 안내 (서버 전용)",
    )


class AnalyzeRequest(BaseModel):
    jd_text: str = Field(..., min_length=50, max_length=120_000, description="채용 공고 전문")


class AnalyzeWithSaveResponse(BaseModel):
    analysis: AnalysisResponse
    saved_id: str | None = None


class JdExtractResponse(BaseModel):
    jd_text: str = Field(..., description="PDF에서 추출한 공고 텍스트")
    ocr_used: bool = Field(False, description="스캔 PDF 등으로 Vision OCR을 사용했는지 여부")
