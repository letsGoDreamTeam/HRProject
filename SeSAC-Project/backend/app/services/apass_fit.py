"""RAG + 구조화 출력으로 Fit-Score·역량 매핑·첨삭 코멘트 생성."""

import json

from openai import OpenAI

from app.config import Settings
from app.schemas_apass import AnalyzeFitRequest, AnalyzeFitResponse, CompetencyMappingItem, RecordSections
from app.services.apass_vector import search_collection


def _fit_json_schema() -> dict:
    comp = {
        "type": "object",
        "properties": {
            "domain": {
                "type": "string",
                "enum": ["학업역량", "진로역량", "공동체역량"],
            },
            "summary": {"type": "string"},
            "evidence_quote": {"type": "string"},
        },
        "required": ["domain", "summary", "evidence_quote"],
        "additionalProperties": False,
    }
    return {
        "name": "apass_fit_analysis",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "fit_score": {"type": "integer", "minimum": 0, "maximum": 100},
                "competency_mapping": {
                    "type": "array",
                    "items": comp,
                    "minItems": 3,
                    "maxItems": 8,
                },
                "coaching_comment": {"type": "string"},
            },
            "required": ["fit_score", "competency_mapping", "coaching_comment"],
            "additionalProperties": False,
        },
    }


def _sections_blob(sec: RecordSections) -> str:
    parts = []
    if sec.seuteuk.strip():
        parts.append(f"[세특·교과]\n{sec.seuteuk.strip()}")
    if sec.club.strip():
        parts.append(f"[동아리·창체]\n{sec.club.strip()}")
    if sec.reading.strip():
        parts.append(f"[독서]\n{sec.reading.strip()}")
    if sec.other.strip():
        parts.append(f"[기타]\n{sec.other.strip()}")
    return "\n\n".join(parts).strip()


def run_fit_analysis(
    settings: Settings,
    req: AnalyzeFitRequest,
    *,
    collection_key: str | None,
) -> AnalyzeFitResponse:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 필요합니다.")

    blob = _sections_blob(req.sections)
    if len(blob) < 30:
        raise ValueError("분석할 생기부·활동 텍스트가 너무 짧습니다. PDF를 다시 업로드하거나 내용을 붙여 넣으세요.")

    rag_parts: list[str] = []
    if collection_key:
        q = f"{req.target_university} {req.target_department} 인재상과 다음 학생 활동의 적합성: {blob[:2000]}"
        rag_parts = search_collection(settings, collection_key=collection_key, query=q, top_k=5)

    rag_block = "\n\n---\n\n".join(rag_parts) if rag_parts else "(등록된 인재상 문서가 없거나 검색 결과가 없습니다. 일반적인 대입 관점으로 평가하세요.)"

    lang_note = "모든 설명·코멘트는 한국어로 작성하세요." if req.locale == "ko" else "Write coaching_comment and summaries in clear English suitable for university admissions."

    user = f"""목표: {req.target_university} / {req.target_department}

[학생 기록(추출 블록)]
{blob[:24000]}

[대학 인재상·요강에서 검색된 발췌 (RAG)]
{rag_block[:12000]}

역량 매핑은 반드시 **학업역량·진로역량·공동체역량** 세 축을 골고루 다루되, 동일 역량에 여러 근거가 있으면 항목을 나눠도 됩니다(최소 3개).
fit_score는 0~100 정수. coaching_comment는 구체적 보완·첨삭 가이드(예: 동아리 서술 보강, 전공 연결 문장 등).
evidence_quote는 학생 기록에서 짧게 인용하거나, 직접 인용이 어렵면 근거가 되는 활동을 한 문장으로 적습니다.
{lang_note}"""

    client = OpenAI(api_key=settings.openai_api_key)
    schema = _fit_json_schema()
    completion = client.chat.completions.create(
        model=settings.openai_model,
        temperature=settings.openai_temperature,
        messages=[
            {
                "role": "system",
                "content": "당신은 대학 입학사정관 경험이 있는 교육 데이터 분석가입니다. 주어진 기록과 인재상 발췌만 근거로 전공 적합도를 평가합니다. 환각 금지: 기록에 없는 수상·활동을 지어내지 마세요.",
            },
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_schema", "json_schema": schema},
    )
    raw = completion.choices[0].message.content
    if not raw:
        raise RuntimeError("모델 응답이 비어 있습니다.")
    data = json.loads(raw)
    items = [CompetencyMappingItem.model_validate(x) for x in data.get("competency_mapping", [])]
    return AnalyzeFitResponse(
        fit_score=int(data["fit_score"]),
        competency_mapping=items,
        coaching_comment=str(data["coaching_comment"]),
        rag_snippets_used=[s[:400] + ("…" if len(s) > 400 else "") for s in rag_parts],
    )
