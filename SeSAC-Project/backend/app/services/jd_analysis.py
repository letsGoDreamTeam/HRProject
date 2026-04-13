import json

from openai import OpenAI

from app.config import Settings
from app.schemas import AnalysisResponse
from app.services.jd_gate import assert_job_posting_or_raise

SYSTEM_INSTRUCTION = """당신은 10년 차 이상의 베테랑 채용 전문가이자 HR 데이터 분석가입니다.
입력된 채용 공고(JD)만을 근거로 면접관을 위한 '면접 질문 코파일럿' 결과를 생성합니다.

[출력 언어 — 반드시 준수]
- analysis_summary, items[].competency, items[].questions 안의 모든 문장은 **한국어**로만 작성합니다.
- 면접 질문도 한국어로 작성합니다. 영어 단어나 문장으로 쓰지 마세요(필요한 고유명사·기술명만 예외).
- items[].evidence만 JD **원문 인용**이므로, JD에 적힌 문자 그대로 복사합니다(JD가 영문이면 evidence는 영문일 수 있음).

[분석 규칙 — 반드시 준수]
1. 역량 도출: JD에 드러난 **직무·인성·협업·자격·우대·도구/환경** 등 면접에서 확인할 가치가 있는 요구를 **중복 없이** 최대한 세분화해 도출합니다. 스키마가 허용하는 **최대 개수(maxItems)까지** 채우는 것을 목표로 하되, JD에 근거 없는 항목은 넣지 마세요. (항목이 적을 수 있는 짧은 공고는 그만큼만 출력해도 됩니다.)
2. 근거 매칭: evidence 필드에는 JD 원문에 실제로 존재하는 문구만을 그대로 인용하세요. 요약·재서술·해석으로 바꾸지 마세요. JD에 없는 표현은 evidence에 넣지 마세요.
3. 질문 설계: 각 역량마다 질문 2개. STAR 기법의 **아이디어만** 반영하고, 질문 문장은 한국어로 작성하세요(상황·과제·행동·결과를 끌어내는 구체적 경험 질문 1개 + 상황 가정 또는 심화 질문 1개).
4. analysis_summary: JD 전체를 한국어로 요약합니다. 역량 항목이 많으면 3~8문장까지 늘려도 됩니다.

출력은 지정된 JSON 스키마에 맞는 유효한 JSON만 반환합니다."""

REPAIR_SYSTEM = """JSON 교정기입니다. 입력 JSON에서 items[].evidence 필드만 수정합니다.
각 evidence는 JD 본문에 그대로 존재하는 **연속된 부분 문자열**이어야 합니다.
analysis_summary·competency·questions는 **한국어**를 유지하고 의미를 바꾸지 마세요. evidence만 JD 인용 규칙에 맞게 고칩니다.
동일한 JSON 스키마로만 응답하세요."""


def _response_json_schema(max_items: int) -> dict:
    item = {
        "type": "object",
        "properties": {
            "competency": {
                "type": "string",
                "description": "도출한 역량 이름. 반드시 한국어.",
            },
            "evidence": {
                "type": "string",
                "description": "JD 원문에서 그대로 인용한 문구(인용만, JD 언어 그대로).",
            },
            "questions": {
                "type": "array",
                "items": {
                    "type": "string",
                    "description": "한국어 면접 질문 한 문장.",
                },
                "minItems": 2,
                "maxItems": 2,
            },
        },
        "required": ["competency", "evidence", "questions"],
        "additionalProperties": False,
    }
    return {
        "name": "interview_copilot_analysis",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "analysis_summary": {
                    "type": "string",
                    "description": "JD 요약 2~4문장. 반드시 한국어.",
                },
                "items": {
                    "type": "array",
                    "items": item,
                    "minItems": 1,
                    "maxItems": max_items,
                    "description": "JD 근거 역량·요구 항목. 가능한 한 많이(상한 maxItems).",
                },
            },
            "required": ["analysis_summary", "items"],
            "additionalProperties": False,
        },
    }


def _normalize_ws(s: str) -> str:
    return " ".join(s.split())


def evidence_in_jd(jd: str, evidence: str) -> bool:
    ev = evidence.strip()
    if not ev:
        return False
    if ev in jd:
        return True
    return _normalize_ws(ev) in _normalize_ws(jd)


def build_evidence_warnings(jd: str, result: AnalysisResponse) -> list[str]:
    warnings: list[str] = []
    for item in result.items:
        if not evidence_in_jd(jd, item.evidence):
            warnings.append(
                f"[근거 검증] 역량 '{item.competency}'의 evidence가 JD 원문과 정확히 일치하지 않을 수 있습니다."
            )
    return warnings


def _run_structured_completion(
    client: OpenAI,
    *,
    model: str,
    temperature: float,
    messages: list[dict],
    schema: dict,
) -> AnalysisResponse:
    completion = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=messages,
        response_format={"type": "json_schema", "json_schema": schema},
    )
    raw = completion.choices[0].message.content
    if not raw:
        raise RuntimeError("모델 응답이 비어 있습니다.")
    data = json.loads(raw)
    return AnalysisResponse.model_validate(data)


def _repair_evidences(
    client: OpenAI,
    jd_text: str,
    result: AnalysisResponse,
    settings: Settings,
    schema: dict,
) -> AnalysisResponse:
    dump = json.dumps(
        result.model_dump(mode="json", exclude={"warnings"}),
        ensure_ascii=False,
    )
    return _run_structured_completion(
        client,
        model=settings.openai_model,
        temperature=settings.openai_temperature,
        messages=[
            {"role": "system", "content": REPAIR_SYSTEM},
            {
                "role": "user",
                "content": f"JD:\n---\n{jd_text}\n---\n\n현재 결과 JSON:\n{dump}",
            },
        ],
        schema=schema,
    )


def analyze_jd(jd_text: str, settings: Settings) -> AnalysisResponse:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")

    assert_job_posting_or_raise(jd_text, settings)

    client = OpenAI(api_key=settings.openai_api_key)
    max_items = settings.jd_max_competencies
    schema = _response_json_schema(max_items)

    result = _run_structured_completion(
        client,
        model=settings.openai_model,
        temperature=settings.openai_temperature,
        messages=[
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            {
                "role": "user",
                "content": (
                    "다음은 채용 공고(JD) 전문입니다. 규칙에 따라 분석하세요.\n"
                    "요약·역량명·면접 질문은 모두 한국어로 작성하세요.\n"
                    f"items 배열은 스키마 상한까지 JD 근거 역량을 **가능한 한 많이** 채우세요(현재 상한: {max_items}개).\n\n"
                    f"---\n{jd_text}\n---"
                ),
            },
        ],
        schema=schema,
    )

    warnings = build_evidence_warnings(jd_text, result)

    if warnings and settings.jd_evidence_repair_enabled:
        try:
            repaired = _repair_evidences(client, jd_text, result, settings, schema)
            repaired_warnings = build_evidence_warnings(jd_text, repaired)
            if not repaired_warnings:
                final = ["[Reflection] evidence 인용을 JD 원문에 맞게 1회 교정했습니다."]
            else:
                final = repaired_warnings + [
                    "[Reflection] 교정 후에도 일부 evidence가 JD와 완전히 일치하지 않을 수 있습니다.",
                ]
            return repaired.model_copy(update={"warnings": final})
        except Exception:
            pass

    if warnings:
        return result.model_copy(update={"warnings": warnings})
    return result
