"""PDF/텍스트에서 회사·직무 프로필 4필드로 분리 (LLM)."""

from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from app.config import Settings

SYSTEM = """당신은 채용·HR 문서를 구조화하는 전문가입니다.
입력은 회사 소개, 채용 공고, 직무 기술서, 조직 문화 등이 한 문서에 섞여 있을 수 있는 한국어(또는 혼합) 텍스트입니다.
내용을 아래 네 칸으로 **의미상** 나누어 채웁니다. 원문에 명확한 구획이 없으면 합리적으로 추정합니다.
- company_name: 회사(또는 사업체) 이름. 불명확하면 빈 문자열.
- jd_reference: 채용 공고에 가까운 부분 — 모집 개요, 지원 자격·우대, 급여·근무지, 지원 방법, 공고 톤의 안내 등.
- job_description: 직무 기술서에 가까운 부분 — 담당 업무, 역할, 필요 기술·역량, 조직 내 위치, KPI 등.
- org_notes: 조직 문화·가치관·복지·팀 분위기·인재상 등 인문·문화 맥락.
한 문단이 두 칸에 겹치면, **한 곳에만** 두고 다른 칸은 요약하거나 빈칸으로 두어도 됩니다.
출력은 JSON 스키마만 따릅니다. 한국어로 작성합니다."""

SCHEMA: dict[str, Any] = {
    "name": "company_profile_split",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "company_name": {
                "type": "string",
                "description": "회사명, 최대 300자 이내",
            },
            "jd_reference": {
                "type": "string",
                "description": "채용 공고·JD 성격의 텍스트",
            },
            "job_description": {
                "type": "string",
                "description": "직무 기술서 성격의 텍스트",
            },
            "org_notes": {
                "type": "string",
                "description": "조직 문화·복지·가치관 등",
            },
            "parsing_notes": {
                "type": "string",
                "description": "분류가 애매했거나 원문이 부족할 때 면접관용 짧은 안내",
            },
        },
        "required": ["company_name", "jd_reference", "job_description", "org_notes", "parsing_notes"],
        "additionalProperties": False,
    },
}


def split_company_profile_document(*, document_text: str, settings: Settings) -> dict[str, Any]:
    """
    반환: company_name, jd_reference, job_description, org_notes, warnings(list[str]).
    """
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 설정되어 있지 않습니다.")

    warnings: list[str] = []
    text = (document_text or "").strip()
    if len(text) < 80:
        raise ValueError("추출된 텍스트가 너무 짧습니다. 다른 PDF를 시도하거나 텍스트를 직접 입력하세요.")

    cap = int(settings.company_profile_split_max_chars)
    if len(text) > cap:
        text = text[:cap]
        warnings.append(
            f"문서가 길어 앞부분만 사용했습니다(약 {cap:,}자, COMPANY_PROFILE_SPLIT_MAX_CHARS). 누락 구간은 수동으로 보완하세요."
        )

    client = OpenAI(api_key=settings.openai_api_key)
    completion = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.15,
        messages=[
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": "[문서 전체]\n" + text,
            },
        ],
        response_format={"type": "json_schema", "json_schema": SCHEMA},
    )
    raw = completion.choices[0].message.content
    if not raw:
        raise RuntimeError("모델 응답이 비어 있습니다.")
    data = json.loads(raw)

    cn = (data.get("company_name") or "").strip()[:300]
    jd = (data.get("jd_reference") or "").strip()
    job = (data.get("job_description") or "").strip()
    org = (data.get("org_notes") or "").strip()
    note = (data.get("parsing_notes") or "").strip()
    if note:
        warnings.append(note)

    return {
        "company_name": cn,
        "jd_reference": jd,
        "job_description": job,
        "org_notes": org,
        "warnings": warnings,
    }
