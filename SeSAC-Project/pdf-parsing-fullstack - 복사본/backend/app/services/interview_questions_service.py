"""
면접 질문 생성 서비스 (면접관 전용 포맷)
─────────────────────────────────────────────────────────────────
아키텍처:
  RAG      : 직무기술서를 청크·FAISS 임베딩 → 이력서로 유사도 검색
  LangChain: ChatPromptTemplate + ChatOpenAI + JsonOutputParser 체인
  LangGraph: [RAG 검색] → [질문 생성] → [품질 평가] → (재생성 or 종료)

질문 구조:
  job_basic        (2개) : 직무 기본
  job_intermediate (3개) : 직무 중간
  job_advanced     (2개) : 직무 심화
  personality      (3개) : 인성·실무 스타일
"""

from __future__ import annotations

import os
from typing import Any, TypedDict

from dotenv import load_dotenv

from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langgraph.graph import END, StateGraph

from app.services.parsed_resume_for_llm import build_resume_prompt_text

load_dotenv()

# ══════════════════════════════════════════════════════════════════
# 프롬프트
# ══════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """당신은 한국 채용 시장에 정통한 수석 면접관이다.
지원자 이력서(구조화된 파싱 결과)와 직무기술서를 근거로 실전 면접에 바로 활용할 질문을 생성한다.

규칙:
- 문서에 없는 정보는 가정하지 말 것.
- 직무기술서의 핵심 키워드와 이력서의 구체 경험이 맞물리는 지점을 우선한다.
- 각 질문에 type(기술|경험|상황|인성), difficulty(기본|중간|심화), evaluation_point 반드시 포함.
- 질문은 한국어 한 문장으로, 면접장에서 바로 말할 수 있게 끝맺는다.
- score 기준: 직무 연관성(40점) + 이력서 근거 구체성(30점) + 변별력·깊이(30점)."""

USER_TEMPLATE = """아래 이력서와 직무기술서를 바탕으로 면접 질문을 생성하라.

출력은 JSON 한 개만 (다른 설명 없이). 형식:
{{
  "applicant_summary": "지원자 프로필 한 줄 요약",
  "job_basic": [
    {{"q":"질문(한 문장)","type":"기술|경험|상황","difficulty":"기본","intent":"평가 의도 한 줄","reason":"선정 근거 한두 문장","evaluation_point":"평가 포인트 한 줄","score":0,"score_reason":"점수 이유 한 줄"}}
  ],
  "job_intermediate": [
    {{"q":"...","type":"기술|경험|상황","difficulty":"중간","intent":"...","reason":"...","evaluation_point":"...","score":0,"score_reason":"..."}}
  ],
  "job_advanced": [
    {{"q":"...","type":"기술|경험|상황","difficulty":"심화","intent":"...","reason":"...","evaluation_point":"...","score":0,"score_reason":"..."}}
  ],
  "personality": [
    {{"q":"...","type":"인성","difficulty":"기본|중간","intent":"...","reason":"...","evaluation_point":"...","score":0,"score_reason":"..."}}
  ]
}}

목표 개수: job_basic=2, job_intermediate=3, job_advanced=2, personality=3 (총 10개)

{feedback_section}
{refine_hint}

--- 이력서(RAG 기반 파싱 결과) ---
{resume}

--- 직무기술서(RAG 검색 결과) ---
{job_desc}
"""

# ══════════════════════════════════════════════════════════════════
# 유틸
# ══════════════════════════════════════════════════════════════════

def _truncate(s: str, max_len: int) -> str:
    s = (s or "").strip()
    if len(s) <= max_len:
        return s
    return s[:max_len - 60] + "\n...[중략]..."


def _api_key() -> str:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError(".env 또는 환경 변수에 OPENAI_API_KEY 가 필요합니다.")
    return key


def _llm(model: str, temperature: float = 0.65) -> ChatOpenAI:
    return ChatOpenAI(
        model=model,
        temperature=temperature,
        api_key=_api_key(),
        model_kwargs={"response_format": {"type": "json_object"}},
    )


def _build_resume_queries(
    resume_text: str,
    *,
    full_max_len: int = 12_000,
    section_max_len: int = 2_200,
    max_sections: int = 4,
) -> list[str]:
    """RAG 검색용 질의 세트: 전체 요약 + 섹션별(경력/프로젝트/자기소개 우선)."""
    base = (resume_text or "").strip()
    if not base:
        return []

    queries: list[str] = [_truncate(base, full_max_len)]

    # markdown heading(##/###) 기준으로 섹션 분리
    sections: list[str] = []
    buf: list[str] = []
    for line in base.splitlines():
        if line.startswith("## "):
            if buf:
                sec = "\n".join(buf).strip()
                if sec:
                    sections.append(sec)
            buf = [line]
        else:
            buf.append(line)
    if buf:
        sec = "\n".join(buf).strip()
        if sec:
            sections.append(sec)

    # 실무 관련 섹션 가중치(경력/프로젝트/자기소개 우선)
    keywords = ("경력", "프로젝트", "자기소개", "경험", "직무", "역할", "성과")

    def sec_score(sec: str) -> tuple[int, int]:
        head = sec.splitlines()[0] if sec else ""
        bonus = 1 if any(k in head for k in keywords) else 0
        return (bonus, len(sec))

    selected = sorted(sections, key=sec_score, reverse=True)[:max_sections]
    for sec in selected:
        q = _truncate(sec, section_max_len)
        if q and q not in queries:
            queries.append(q)

    return queries


def _retrieve_jd_context(job_description: str, resume_text: str, *, top_k: int = 5) -> str:
    """JD를 벡터화한 뒤 전체+섹션 질의로 검색해 컨텍스트를 병합한다."""
    splitter = RecursiveCharacterTextSplitter(chunk_size=600, chunk_overlap=80)
    jd_chunks = splitter.split_text((job_description or "").strip())
    if not jd_chunks:
        return job_description

    embeddings = OpenAIEmbeddings(api_key=_api_key())
    vectorstore = FAISS.from_texts(jd_chunks, embeddings)
    k = min(top_k, len(jd_chunks))

    merged: list[str] = []
    seen: set[str] = set()
    queries = _build_resume_queries(resume_text)
    if not queries:
        queries = [_truncate(resume_text, 12_000)]

    for q in queries:
        docs = vectorstore.similarity_search(q, k=k)
        for d in docs:
            txt = (d.page_content or "").strip()
            if txt and txt not in seen:
                seen.add(txt)
                merged.append(txt)

    return "\n\n".join(merged) if merged else job_description


# ══════════════════════════════════════════════════════════════════
# LangGraph 상태
# ══════════════════════════════════════════════════════════════════

class InterviewState(TypedDict):
    resume_text: str
    job_description: str
    retrieved_context: str
    questions_bundle: dict
    liked_questions: list[str]
    disliked_questions: list[str]
    model_name: str
    iteration: int


# ══════════════════════════════════════════════════════════════════
# LangGraph 노드
# ══════════════════════════════════════════════════════════════════

def node_rag_retrieve(state: InterviewState) -> dict:
    retrieved = _retrieve_jd_context(state["job_description"], state["resume_text"], top_k=5)
    return {"retrieved_context": retrieved or state["job_description"]}


def node_generate_questions(state: InterviewState) -> dict:
    feedback_lines: list[str] = []
    if state.get("liked_questions"):
        feedback_lines.append("선호 질문 스타일 (유사하게 생성):")
        feedback_lines.extend(f"- {q}" for q in state["liked_questions"])
    if state.get("disliked_questions"):
        feedback_lines.append("지양할 질문 스타일:")
        feedback_lines.extend(f"- {q}" for q in state["disliked_questions"])

    refine_hint = ""
    if state.get("iteration", 0) > 0:
        refine_hint = "※ 이전 생성 결과의 평균 점수가 낮았습니다. 더 구체적이고 직무 연관성이 높은 질문으로 개선하세요."

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human",  USER_TEMPLATE),
    ])
    temperature = 0.65 + state.get("iteration", 0) * 0.08
    chain = prompt | _llm(state["model_name"], temperature) | JsonOutputParser()
    result = chain.invoke({
        "resume":           _truncate(state["resume_text"], 15_000),
        "job_desc":         _truncate(state["retrieved_context"] or state["job_description"], 10_000),
        "feedback_section": "\n".join(feedback_lines),
        "refine_hint":      refine_hint,
    })
    return {
        "questions_bundle": result if isinstance(result, dict) else {},
        "iteration":        state.get("iteration", 0) + 1,
    }


def should_refine(state: InterviewState) -> str:
    bundle = state.get("questions_bundle") or {}
    scores = [
        q["score"]
        for key in ("job_basic", "job_intermediate", "job_advanced", "personality")
        for q in (bundle.get(key) or [])
        if isinstance(q, dict) and isinstance(q.get("score"), (int, float))
    ]
    if scores and (sum(scores) / len(scores)) < 55 and state.get("iteration", 1) < 2:
        return "refine"
    return "end"


# ══════════════════════════════════════════════════════════════════
# LangGraph 컴파일
# ══════════════════════════════════════════════════════════════════

def _build_graph():
    wf = StateGraph(InterviewState)
    wf.add_node("rag_retrieve", node_rag_retrieve)
    wf.add_node("generate",     node_generate_questions)
    wf.set_entry_point("rag_retrieve")
    wf.add_edge("rag_retrieve", "generate")
    wf.add_conditional_edges("generate", should_refine, {"refine": "generate", "end": END})
    return wf.compile()


_graph = _build_graph()


# ══════════════════════════════════════════════════════════════════
# 공개 API
# ══════════════════════════════════════════════════════════════════

def generate_bundle_from_parsed_resume(
    parsed: dict[str, Any],
    job_description: str,
    *,
    model: str | None = None,
    liked_questions: list[str] | None = None,
    disliked_questions: list[str] | None = None,
) -> dict[str, Any]:
    _api_key()
    resume_text = build_resume_prompt_text(parsed)
    model_name  = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    initial: InterviewState = {
        "resume_text":       resume_text,
        "job_description":   job_description.strip(),
        "retrieved_context": "",
        "questions_bundle":  {},
        "liked_questions":   liked_questions  or [],
        "disliked_questions":disliked_questions or [],
        "model_name":        model_name,
        "iteration":         0,
    }
    result = _graph.invoke(initial)
    return result["questions_bundle"]


# ══════════════════════════════════════════════════════════════════
# 텍스트 포맷터
# ══════════════════════════════════════════════════════════════════

def bundle_to_text(data: dict[str, Any]) -> str:
    lines: list[str] = []

    if data.get("applicant_summary"):
        lines.append(f"지원자 요약: {data['applicant_summary']}")

    SECTION_LABELS = [
        ("직무 기본 질문",   "job_basic"),
        ("직무 중간 질문",   "job_intermediate"),
        ("직무 심화 질문",   "job_advanced"),
        ("인성/실무 스타일", "personality"),
    ]

    for title, key in SECTION_LABELS:
        items = data.get(key) or []
        if not items:
            continue
        lines.append(f"\n[ {title} ]")
        for i, item in enumerate(items, 1):
            if isinstance(item, dict):
                score = item.get("score")
                score_str = f" [{score}점]" if score is not None else ""
                diff  = item.get("difficulty", "")
                qtype = item.get("type", "")
                lines.append(f"  Q{i}.{score_str} [{qtype}][{diff}] {item.get('q','')}")
                if item.get("intent"):           lines.append(f"       의도: {item['intent']}")
                if item.get("reason"):           lines.append(f"       근거: {item['reason']}")
                if item.get("evaluation_point"): lines.append(f"       평가포인트: {item['evaluation_point']}")
                if item.get("score_reason"):     lines.append(f"       점수근거: {item['score_reason']}")

    return "\n".join(lines).strip()


bundle_to_markdown = bundle_to_text


# generate_more_questions 은 레거시 호환 유지
def generate_more_questions(
    parsed: dict[str, Any],
    job_description: str,
    focus_type: str,
    exclude_questions: list[str] | None = None,
    *,
    model: str | None = None,
) -> dict[str, Any]:
    """추가 질문 생성 (레거시 엔드포인트 호환용)."""
    MORE_TEMPLATE = """이력서와 직무기술서를 참고해 '{focus_type}' 유형 질문을 3개 추가 생성하라.
기존 질문과 다른 관점·사례로 만들 것.

출력은 JSON 한 개만:
{{
  "questions": [
    {{"q":"...","type":"기술|경험|상황|인성","difficulty":"기본|중간|심화","intent":"...","reason":"...","evaluation_point":"...","score":0,"score_reason":"..."}}
  ]
}}

--- 기존 질문 (중복 금지) ---
{exclude_list}

--- 이력서 ---
{resume}

--- 직무기술서 ---
{job_desc}
"""
    resume_text = build_resume_prompt_text(parsed)
    model_name  = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    exclude_str = "\n".join(f"- {q}" for q in (exclude_questions or [])) or "(없음)"

    jd_ctx = _retrieve_jd_context(job_description, resume_text, top_k=5)

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human",  MORE_TEMPLATE),
    ])
    chain  = prompt | _llm(model_name, 0.70) | JsonOutputParser()
    result = chain.invoke({
        "focus_type":   focus_type,
        "exclude_list": exclude_str,
        "resume":       _truncate(resume_text, 15_000),
        "job_desc":     _truncate(jd_ctx, 10_000),
    })
    return result if isinstance(result, dict) else {}
