"""지원자 맞춤 면접 질문: 회사 프로필·직무기술서·자소서·포폴을 반영."""

from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from app.config import Settings

SYSTEM = """당신은 해당 부서의 면접관을 돕는 시니어 HRBP입니다.
입력된 회사·직무 맥락, 지원 부서, 지원서/포트폴리오 내용을 바탕으로 **한국어** 면접 질문만 생성합니다.
- 질문은 STAR·역행·기술심화·가치관을 고르게 섞되, 직무 기술서와 지원자 경험의 교차점을 우선합니다.
- 고유명사·기술명은 필요 시 그대로 사용 가능합니다.
- 출력은 JSON 스키마만 따릅니다."""

SCHEMA: dict[str, Any] = {
    "name": "candidate_interview_questions",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 8,
                "maxItems": 16,
            },
            "notes_for_interviewer": {
                "type": "string",
                "description": "면접관이 참고할 짧은 메모(한국어)",
            },
        },
        "required": ["questions", "notes_for_interviewer"],
        "additionalProperties": False,
    },
}


def generate_candidate_questions(
    *,
    department: str,
    applicant_essay: str,
    applicant_portfolio: str,
    company_name: str,
    jd_reference: str,
    job_description: str,
    org_notes: str,
    settings: Settings,
) -> dict[str, Any]:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 설정되어 있지 않습니다.")
    client = OpenAI(api_key=settings.openai_api_key)
    user_payload = (
        f"[회사명]\n{company_name}\n\n"
        f"[직무·채용 참고 텍스트]\n{jd_reference[:40_000]}\n\n"
        f"[직무 기술서]\n{job_description[:40_000]}\n\n"
        f"[조직/문화 메모]\n{org_notes[:20_000]}\n\n"
        f"[지원 부서]\n{department}\n\n"
        f"[자기소개서]\n{applicant_essay[:40_000]}\n\n"
        f"[포트폴리오/추가 서류]\n{applicant_portfolio[:40_000]}\n"
    )
    completion = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.2,
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_payload},
        ],
        response_format={"type": "json_schema", "json_schema": SCHEMA},
    )
    raw = completion.choices[0].message.content
    if not raw:
        raise RuntimeError("모델 응답이 비어 있습니다.")
    return json.loads(raw)
