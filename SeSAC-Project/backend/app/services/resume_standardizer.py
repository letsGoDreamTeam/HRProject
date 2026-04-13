from __future__ import annotations

import json
import re
from typing import Any

from openai import OpenAI

from app.config import Settings

SYSTEM = """당신은 채용팀의 이력서 표준화 엔진입니다.
목표: 어떤 자유 양식 이력서든 사전에 정한 스키마 JSON으로만 변환합니다.

규칙:
- 절대 설명문/서론/사족을 출력하지 말고 JSON만 출력
- 원문의 의미를 바꾸지 말고 추정은 최소화
- 없는 정보는 빈 문자열/빈 배열
- 날짜는 가능한 YYYY-MM 또는 YYYY-MM-DD
- 개인정보 중 이름, 생년월일, 이메일은 추출 시 그대로 보존
"""

SCHEMA: dict[str, Any] = {
    "name": "resume_standardized",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "birth_date": {"type": "string"},
            "email": {"type": "string"},
            "phone": {"type": "string"},
            "summary": {"type": "string"},
            "education": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "school": {"type": "string"},
                        "major": {"type": "string"},
                        "degree": {"type": "string"},
                        "start": {"type": "string"},
                        "end": {"type": "string"},
                    },
                    "required": ["school", "major", "degree", "start", "end"],
                    "additionalProperties": False,
                },
                "maxItems": 20,
            },
            "experiences": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "company": {"type": "string"},
                        "role": {"type": "string"},
                        "start": {"type": "string"},
                        "end": {"type": "string"},
                        "highlights": {"type": "array", "items": {"type": "string"}, "maxItems": 12},
                    },
                    "required": ["company", "role", "start", "end", "highlights"],
                    "additionalProperties": False,
                },
                "maxItems": 30,
            },
            "projects": {"type": "array", "items": {"type": "string"}, "maxItems": 30},
            "skills": {"type": "array", "items": {"type": "string"}, "maxItems": 60},
            "certificates": {"type": "array", "items": {"type": "string"}, "maxItems": 40},
            "awards": {"type": "array", "items": {"type": "string"}, "maxItems": 40},
        },
        "required": [
            "name",
            "birth_date",
            "email",
            "phone",
            "summary",
            "education",
            "experiences",
            "projects",
            "skills",
            "certificates",
            "awards",
        ],
        "additionalProperties": False,
    },
}


def normalize_birth_date(value: str) -> str:
    s = (value or "").strip()
    if not s:
        return ""
    m = re.search(r"(\d{4})[.\-/년 ]?(\d{1,2})?[.\-/월 ]?(\d{1,2})?", s)
    if not m:
        return s[:20]
    y = m.group(1)
    mm = m.group(2)
    dd = m.group(3)
    if mm and dd:
        return f"{y}-{int(mm):02d}-{int(dd):02d}"
    if mm:
        return f"{y}-{int(mm):02d}"
    return y


def to_standardized_text(data: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"이름: {data.get('name', '')}")
    lines.append(f"생년월일: {data.get('birth_date', '')}")
    lines.append(f"이메일: {data.get('email', '')}")
    lines.append(f"전화: {data.get('phone', '')}")
    lines.append("")
    lines.append("[요약]")
    lines.append(str(data.get("summary", "")))
    lines.append("")
    lines.append("[학력]")
    for e in data.get("education", []) or []:
        lines.append(f"- {e.get('school','')} / {e.get('major','')} / {e.get('degree','')} ({e.get('start','')}~{e.get('end','')})")
    lines.append("")
    lines.append("[경력]")
    for x in data.get("experiences", []) or []:
        lines.append(f"- {x.get('company','')} {x.get('role','')} ({x.get('start','')}~{x.get('end','')})")
        for h in x.get("highlights", []) or []:
            lines.append(f"  · {h}")
    lines.append("")
    lines.append("[프로젝트]")
    for p in data.get("projects", []) or []:
        lines.append(f"- {p}")
    lines.append("")
    lines.append("[기술]")
    for s in data.get("skills", []) or []:
        lines.append(f"- {s}")
    lines.append("")
    lines.append("[자격증]")
    for c in data.get("certificates", []) or []:
        lines.append(f"- {c}")
    lines.append("")
    lines.append("[수상]")
    for a in data.get("awards", []) or []:
        lines.append(f"- {a}")
    return "\n".join(lines).strip()


def standardize_resume_text(*, resume_text: str, settings: Settings) -> dict[str, Any]:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 설정되어 있지 않습니다.")
    client = OpenAI(api_key=settings.openai_api_key)
    completion = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.0,
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": resume_text[:120_000]},
        ],
        response_format={"type": "json_schema", "json_schema": SCHEMA},
    )
    raw = completion.choices[0].message.content
    if not raw:
        raise RuntimeError("모델 응답이 비어 있습니다.")
    data = json.loads(raw)
    data["birth_date"] = normalize_birth_date(str(data.get("birth_date") or ""))
    return data
