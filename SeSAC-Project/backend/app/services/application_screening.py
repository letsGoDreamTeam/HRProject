"""지원서 분류: 블라인드 위험(대학 등 직접 언급) + 우대 요건 충족 여부(보조)."""

from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from app.config import Settings

SYSTEM = """당신은 공기업·대기업 채용의 블라인드 전형 보조 검토자입니다.
지원 서류 텍스트만을 보고 JSON 스키마에 맞게 분류합니다.

[블라인드/공정성]
- 특정 대학명·학과명을 **직접** 언급했는지, 학력 차별로 이어질 수 있는 표현이 있는지 평가합니다.
- **제외 판정을 내리지 말고** 등급과 근거만 제시합니다. 최종 판단은 사람이 합니다.
- blind_tier: "none"(문제 소지 낮음), "low"(애매·주의), "high"(명확한 학교명/학력 강조 등)
- blind_snippets: 문제가 될 수 있는 **원문 인용** 짧은 구절 최대 5개(없으면 빈 배열)
- blind_summary: 한국어 2~4문장으로 면접관이 검토할 때 참고할 요약

[우대 요건]
- jd_preferred_text에 적힌 우대·자격 요건이 있으면, 지원서가 그것을 **충족한다고 볼 근거**가 있는지 판단합니다.
- jd_preferred_text가 비어 있으면 preferred_met=false, preferred_reason은 "공고 우대 텍스트 없음" 정도로 짧게.

[keyword_flags]
- 사람이 나중에 필터링하기 쉽게 짧은 태그 문자열 배열 (예: "대학명_직접", "학점_언급", "자격증_일치" 등)"""

SCHEMA: dict[str, Any] = {
    "name": "application_screening",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "blind_tier": {
                "type": "string",
                "enum": ["none", "low", "high"],
                "description": "블라인드 위험 등급",
            },
            "blind_summary": {"type": "string", "description": "한국어 요약"},
            "blind_snippets": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 8,
            },
            "preferred_met": {"type": "boolean"},
            "preferred_reason": {"type": "string"},
            "keyword_flags": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 20,
            },
        },
        "required": [
            "blind_tier",
            "blind_summary",
            "blind_snippets",
            "preferred_met",
            "preferred_reason",
            "keyword_flags",
        ],
        "additionalProperties": False,
    },
}


def screen_application_text(
    *,
    resume_text: str,
    jd_preferred_text: str,
    settings: Settings,
) -> dict[str, Any]:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 설정되어 있지 않습니다.")
    client = OpenAI(api_key=settings.openai_api_key)
    user_msg = (
        "[jd_preferred_text]\n"
        + (jd_preferred_text.strip() or "(없음)")
        + "\n\n[지원서 텍스트]\n"
        + resume_text.strip()[:100_000]
    )
    completion = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.0,
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        response_format={"type": "json_schema", "json_schema": SCHEMA},
    )
    raw = completion.choices[0].message.content
    if not raw:
        raise RuntimeError("모델 응답이 비어 있습니다.")
    return json.loads(raw)
