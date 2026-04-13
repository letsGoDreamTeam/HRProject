import json
from typing import Literal

from openai import OpenAI
from pydantic import BaseModel, Field

from app.config import Settings


class JdGateRejected(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class JdGateResult(BaseModel):
    category: Literal["job_posting", "not_job_posting"]
    reason: str = Field(..., description="분류 근거 한두 문장")


def _gate_json_schema() -> dict:
    return {
        "name": "jd_input_gate",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "enum": ["job_posting", "not_job_posting"]},
                "reason": {"type": "string"},
            },
            "required": ["category", "reason"],
            "additionalProperties": False,
        },
    }


def run_jd_input_gate(jd_text: str, settings: Settings) -> JdGateResult:
    """Router+가드레일: 입력이 채용 공고 성격인지 LLM으로 1회 분류."""
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")

    client = OpenAI(api_key=settings.openai_api_key)
    preview = jd_text.strip()[:8000]
    completion = client.chat.completions.create(
        model=settings.openai_gate_model,
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "당신은 입력 분류기입니다. 텍스트가 채용 공고(채용/JD/지원 자격/담당 업무 등)이면 "
                    "job_posting, 그렇지 않으면(일반 대화·코드·무관 텍스트 등) not_job_posting 입니다. "
                    "reason은 한국어로 짧게 적습니다."
                ),
            },
            {
                "role": "user",
                "content": f"다음 텍스트를 분류하세요.\n\n---\n{preview}\n---",
            },
        ],
        response_format={"type": "json_schema", "json_schema": _gate_json_schema()},
    )
    raw = completion.choices[0].message.content
    if not raw:
        raise RuntimeError("게이트 모델 응답이 비어 있습니다.")
    data = json.loads(raw)
    return JdGateResult.model_validate(data)


def assert_job_posting_or_raise(jd_text: str, settings: Settings) -> None:
    if not settings.jd_input_gate_enabled:
        return
    result = run_jd_input_gate(jd_text, settings)
    if result.category != "job_posting":
        raise JdGateRejected(result.reason)
