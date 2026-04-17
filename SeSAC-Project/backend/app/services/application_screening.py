"""지원서 분류: 공공 채용 시 블라인드 자소서 보조 + 우대 요건(전 주체 공통)."""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from openai import OpenAI

from app.config import Settings
from app.services.openai_usage_tracker import record_openai_usage

SYSTEM_PUBLIC = """당신은 공기업·공공기관 채용의 블라인드 자기소개서(서류) 전형 보조 검토자입니다.
지원 서류 텍스트만을 보고 JSON 스키마에 맞게 분류합니다.

[블라인드/공정성 — 공기업·공공기관 전형에만 해당]
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

SYSTEM_PRIVATE = """당신은 일반 사기업 등 **공공 채용이 아닌** 전형의 서류 검토를 돕습니다.

[블라인드 자기소개서 필터 — 적용하지 않음]
- 공기업·공공기관 채용의 블라인드 자기소개서 필터(학력 직접 언급 위험 등)는 **일반 사기업 전형에는 해당되지 않습니다.**
- blind_tier는 반드시 "none".
- blind_snippets는 반드시 빈 배열 [].
- blind_summary에는 반드시 다음 취지를 한국어 한 문장으로 넣습니다: "일반 사기업 전형이므로 공공기관용 블라인드·자소서 필터는 적용하지 않습니다. 우대 요건 매칭만 참고하세요."

[우대 요건]
- jd_preferred_text에 적힌 우대·자격 요건이 있으면, 지원서가 그것을 **충족한다고 볼 근거**가 있는지 판단합니다.
- jd_preferred_text가 비어 있으면 preferred_met=false, preferred_reason은 "공고 우대 텍스트 없음" 정도로 짧게.

[keyword_flags]
- 직무·경력·자격·스킬 관련 태그 위주 (예: "자격증_일치", "경력_언급", "직무_키워드"). 블라인드 전형 전용 태그(예: "대학명_직접")는 넣지 마세요."""

SCHEMA: dict[str, Any] = {
    "name": "application_screening",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "blind_tier": {
                "type": "string",
                "enum": ["none", "low", "high"],
                "description": "블라인드 위험 등급(사기업 전형 시 none 고정)",
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


def _normalize_sector(employer_sector: str | None) -> Literal["public", "private"]:
    s = (employer_sector or "public").strip().lower()
    return "private" if s == "private" else "public"


def screen_application_text(
    *,
    resume_text: str,
    jd_preferred_text: str,
    settings: Settings,
    employer_sector: str | None = "public",
    preferred_include_patterns: list[str] | None = None,
    preferred_exclude_patterns: list[str] | None = None,
    preferred_requires_evidence: bool = True,
    role_context_text: str = "",
) -> dict[str, Any]:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 설정되어 있지 않습니다.")
    sector = _normalize_sector(employer_sector)
    system = SYSTEM_PRIVATE if sector == "private" else SYSTEM_PUBLIC
    client = OpenAI(api_key=settings.openai_api_key)
    user_msg = (
        "[jd_preferred_text]\n"
        + (jd_preferred_text.strip() or "(없음)")
        + "\n\n[role_context]\n"
        + (role_context_text.strip()[:5_000] or "(없음)")
        + "\n\n[지원서 텍스트]\n"
        + resume_text.strip()[:100_000]
    )
    completion = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.0,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        response_format={"type": "json_schema", "json_schema": SCHEMA},
    )
    record_openai_usage(
        usage=getattr(completion, "usage", None),
        model=settings.openai_model,
        feature="application_screening",
        request_kind="chat",
    )
    raw = completion.choices[0].message.content
    if not raw:
        raise RuntimeError("모델 응답이 비어 있습니다.")
    out = json.loads(raw)
    if sector == "private":
        out["blind_tier"] = "none"
        out["blind_snippets"] = []
    include_hits: list[str] = []
    exclude_hits: list[str] = []
    t = (resume_text or "").lower()
    for p in preferred_include_patterns or []:
        pp = p.strip().lower()
        if pp and pp in t:
            include_hits.append(p.strip())
    for p in preferred_exclude_patterns or []:
        pp = p.strip().lower()
        if pp and pp in t:
            exclude_hits.append(p.strip())
    evidence_level = "unknown"
    has_action = bool(re.search(r"(구현|운영|배포|개선|최적화|설계|리팩터링|트러블슈팅)", resume_text))
    has_result = bool(re.search(r"(\d+[%명건회배]|성과|지표|증가|감소|개선)", resume_text))
    if has_action and has_result:
        evidence_level = "strong"
    elif has_action:
        evidence_level = "medium"
    else:
        evidence_level = "weak"

    if exclude_hits:
        out["preferred_met"] = False
        out["preferred_reason"] = f"제외 패턴 감지: {', '.join(exclude_hits[:5])}"
    elif preferred_requires_evidence and evidence_level == "weak":
        out["preferred_met"] = False
        out["preferred_reason"] = "행동·결과 근거가 약해 우대 충족으로 보기 어렵습니다."
    elif include_hits:
        out["preferred_met"] = True
        out["preferred_reason"] = f"가산 패턴 감지: {', '.join(include_hits[:5])}"

    out["preferred_rule_hits"] = include_hits[:20]
    out["preferred_rule_excluded_hits"] = exclude_hits[:20]
    out["evidence_level"] = evidence_level
    role_kw = [x.strip().lower() for x in re.split(r"[\s,;/]+", role_context_text or "") if len(x.strip()) >= 2]
    role_kw = role_kw[:30]
    if role_kw:
        hit = sum(1 for k in role_kw if k in t)
        out["role_relevance_score"] = round(min(1.0, hit / max(5, len(role_kw))), 3)
    else:
        out["role_relevance_score"] = 0.0
    return out
