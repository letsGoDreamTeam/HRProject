"""이력서 파싱 + 직무기술서로 면접 질문 생성 (POST /api/interview-questions)."""

from typing import Any

from pydantic import BaseModel, Field


class InterviewQuestionsRequestJson(BaseModel):
    job_description_text: str | None = Field(default=None)
    department_query: str | None = Field(default=None)
    openai_model: str | None = Field(default=None)


class ReactionRequest(BaseModel):
    reaction: str = Field(description="like | dislike | none")
    session_id: int = Field(description="interview_sessions.session_id")


class InterviewQuestionsResponse(BaseModel):
    model_config = {"populate_by_name": True}

    markdown: str = Field(description="면접관용 마크다운 요약")
    bundle: dict[str, Any] = Field(description="JSON 구조체 (각 질문에 _db_id 포함)")
    session_id: int = Field(
        default=0,
        serialization_alias="sessionId",
        description="생성 세션 ID — 재생성 시 전달하면 싫어요 질문을 자동 반영",
    )
    resume_prompt_excerpt: str = Field(default="", serialization_alias="resumePromptExcerpt")
    job_description_excerpt: str = Field(default="", serialization_alias="jobDescriptionExcerpt")
    department_matched: str | None = Field(default=None, serialization_alias="departmentMatched")
    persisted_question_count: int = Field(default=0, serialization_alias="persistedQuestionCount")
