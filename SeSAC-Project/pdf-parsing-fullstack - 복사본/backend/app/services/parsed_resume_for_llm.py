"""`parse_resume_file` 결과 dict → 면접 질문용 한국어 프롬프트 텍스트."""

from __future__ import annotations

import json
import os
import re
from typing import Any

from ParsingToExcel import (
    K_ADDR,
    K_BIRTH_DATE,
    K_CAREER_CO,
    K_CAREER_PD,
    K_CAREER_ROLE,
    K_CONTACT,
    K_DESIRED_LOCATION,
    K_DESIRED_SALARY,
    K_DISABILITY,
    K_EDUCATION_ROWS,
    K_EMAIL,
    K_EXPERIENCE_ROWS,
    K_FINAL_EDU,
    K_GENDER,
    K_MILITARY_ROWS,
    K_NAME,
    K_ORIGINAL_JOB_ROLE,
    K_QUALIFICATION_ROWS,
    K_STATEMENT_ROWS,
    K_VETERAN_ELIGIBILITY,
)


def _anonymize_text_if_enabled(body: str) -> str:
    if os.getenv("AI_ANONYMIZE", "true").strip().lower() not in {"1", "true", "yes", "on"}:
        return body
    masked = body
    email_pat = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
    masked = email_pat.sub("[이메일]", masked)
    phone_pat = re.compile(
        r"(?:010|011|016|017|018|019|02|0[3-6]\d|070)[-\s]?\d{3,4}[-\s]?\d{4}"
    )
    masked = phone_pat.sub("[전화]", masked)
    rrn_pat = re.compile(r"\b\d{6}[-\s]?\d{7}\b")
    masked = rrn_pat.sub("[주민번호]", masked)
    return masked


def _row_lines(title: str, rows: list[dict[str, Any]]) -> list[str]:
    out: list[str] = [f"### {title}"]
    if not rows:
        out.append("(추출 없음)")
        return out
    for i, r in enumerate(rows, 1):
        out.append(f"- 항목 {i}: {json.dumps(r, ensure_ascii=False)}")
    return out


def build_resume_prompt_text(parsed: dict[str, Any]) -> str:
    """파싱 레코드를 면접 생성 LLM 입력용 문자열로 직렬화한다."""
    lines: list[str] = [
        "## 지원자 요약",
        f"- 성명·식별: {parsed.get(K_NAME, '')}",
        f"- 생년월일: {parsed.get(K_BIRTH_DATE, '')}",
        f"- 연락처: {parsed.get(K_CONTACT, '')}",
        f"- 이메일: {parsed.get(K_EMAIL, '')}",
        f"- 주소: {parsed.get(K_ADDR, '')}",
        f"- 지원/희망 직무(원본 문구): {parsed.get(K_ORIGINAL_JOB_ROLE, '')}",
        f"- 최종학력(요약): {parsed.get(K_FINAL_EDU, '')}",
        f"- 성별: {parsed.get(K_GENDER, '')}",
        f"- 보훈: {parsed.get(K_VETERAN_ELIGIBILITY, '')}",
        f"- 장애: {parsed.get(K_DISABILITY, '')}",
        f"- 희망 근무지: {parsed.get(K_DESIRED_LOCATION, '')}",
        f"- 희망 연봉: {parsed.get(K_DESIRED_SALARY, '')}",
        "",
        "## 경력(단일 블록 추출값)",
        f"- 재직 기간: {parsed.get(K_CAREER_PD, '')}",
        f"- 회사: {parsed.get(K_CAREER_CO, '')}",
        f"- 역할·직무: {parsed.get(K_CAREER_ROLE, '')}",
        "",
    ]
    lines.extend(_row_lines("학력(표·구조 추출 행)", parsed.get(K_EDUCATION_ROWS) or []))
    lines.append("")
    lines.extend(_row_lines("경력(구조 추출 행)", parsed.get(K_EXPERIENCE_ROWS) or []))
    lines.append("")
    lines.extend(_row_lines("자격·어학 등", parsed.get(K_QUALIFICATION_ROWS) or []))
    lines.append("")
    lines.extend(_row_lines("병역", parsed.get(K_MILITARY_ROWS) or []))
    lines.append("")
    lines.extend(_row_lines("자기소개·자유항목 블록", parsed.get(K_STATEMENT_ROWS) or []))

    body = "\n".join(lines).strip()
    return _anonymize_text_if_enabled(body)
