"""LangGraph: 아이스브레이킹 → 서류 검증 → 전공 심층 → 인성/가치관 (스레드별 MemorySaver)."""

from __future__ import annotations

from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from openai import OpenAI

from app.config import get_settings

MAGIC = "__APASS_INTERVIEW_START__"
ORDER = ["icebreaker", "verify", "major", "values"]


class InterviewState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    locale: str
    record_summary: str


def _phase_for_messages(msgs: list[BaseMessage]) -> str:
    """마지막 메시지가 Human일 때만 호출한다(스냅샷+신규 발화 미리보기 등)."""
    if not msgs:
        return ORDER[0]
    last = msgs[-1]
    if not isinstance(last, HumanMessage):
        raise ValueError("phase 계산은 마지막이 HumanMessage일 때만 지원합니다.")
    if (last.content or "").strip() == MAGIC:
        return ORDER[0]
    n_ai = sum(1 for m in msgs[:-1] if isinstance(m, AIMessage))
    if n_ai >= len(ORDER):
        return "done"
    return ORDER[n_ai]


def _to_chat_messages(msgs: list[BaseMessage]) -> list[dict]:
    out: list[dict] = []
    for m in msgs:
        if isinstance(m, HumanMessage):
            c = (m.content or "").strip()
            if c == MAGIC:
                continue
            out.append({"role": "user", "content": c})
        elif isinstance(m, AIMessage):
            out.append({"role": "assistant", "content": m.content or ""})
    return out


def _phase_instruction(phase: str, locale: str) -> str:
    en = locale == "en"
    if phase == "icebreaker":
        return (
            "Phase: Icebreaker. Greet briefly and ask one light opening question about the applicant."
            if en
            else "단계: 아이스브레이킹. 짧게 인사하고 부담 없는 첫 질문 1개만 하세요."
        )
    if phase == "verify":
        return (
            "Phase: Document depth. Ask one sharp follow-up that tests whether activities in the record are understood "
            "(like an admissions officer probing the file)."
            if en
            else "단계: 서류(생기부) 진위·심층 확인. 입학사정관처럼 기록에 적힌 내용을 한 점 찍어 꼬리 질문 1개만 하세요."
        )
    if phase == "major":
        return (
            "Phase: Major knowledge stress. One challenging question tied to concepts or terms implied by the record."
            if en
            else "단계: 전공 심층. 생기부·요약에 나온 용어나 활동을 바탕으로 압박 면접형 질문 1개만 하세요."
        )
    if phase == "values":
        return (
            "Phase: Character/values. One question about ethics, collaboration, failure, or responsibility."
            if en
            else "단계: 인성·가치관. 협업, 실패, 책임, 공동체 등과 연결된 질문 1개만 하세요."
        )
    return "Phase: Closing. Thank the applicant and end the mock interview in 2 short sentences." if en else "면접을 짧게 마무리하며 격려와 종료 인사만 하세요."


def _turn_node(state: InterviewState) -> dict:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY가 필요합니다.")

    msgs = list(state["messages"])
    if not msgs:
        raise RuntimeError("메시지가 비어 있습니다.")
    if not isinstance(msgs[-1], HumanMessage):
        raise RuntimeError("그래프 노드는 사용자(Human) 발화 직후에만 실행되어야 합니다.")

    locale = (state.get("locale") or "ko").strip() or "ko"
    record = (state.get("record_summary") or "").strip()
    phase = _phase_for_messages(msgs)

    client = OpenAI(api_key=settings.openai_api_key)
    master = (
        "You are a university admissions interviewer. Stay concise (2~4 Korean sentences) unless locale is English."
        if locale == "en"
        else "당신은 대학 입학사정관입니다. 답변은 2~4문장으로 간결하게, 한 번에 질문 하나만 하세요."
    )
    master += f"\n\n[학생 기록 요약]\n{record[:6000]}"

    if phase == "done":
        closing = (
            "Thank you for your time. This mock interview ends here. Continue refining your narrative and evidence."
            if locale == "en"
            else "수고하셨습니다. 이 모의면접을 종료합니다. 서류 근거와 서술을 다듬는 연습을 이어가세요."
        )
        return {"messages": [AIMessage(content=closing)]}

    sys = f"{master}\n\n{_phase_instruction(phase, locale)}"
    chat_tail = _to_chat_messages(msgs)[-14:]
    completion = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.35,
        messages=[{"role": "system", "content": sys}, *chat_tail],
    )
    text = (completion.choices[0].message.content or "").strip()
    if not text:
        text = "다음 질문으로 넘어가겠습니다. 방금 답을 한 문장으로만 요약해 주실래요?" if locale != "en" else "Could you summarize your last answer in one sentence?"
    return {"messages": [AIMessage(content=text)]}


_checkpointer = MemorySaver()
_builder = StateGraph(InterviewState)
_builder.add_node("turn", _turn_node)
_builder.add_edge(START, "turn")
_builder.add_edge("turn", END)
interview_app = _builder.compile(checkpointer=_checkpointer)


def interview_start_invoke(*, thread_id: str, locale: str, record_summary: str) -> str:
    cfg = {"configurable": {"thread_id": thread_id}}
    out = interview_app.invoke(
        {
            "messages": [HumanMessage(content=MAGIC)],
            "locale": locale,
            "record_summary": record_summary,
        },
        config=cfg,
    )
    msgs = out.get("messages") or []
    for m in reversed(msgs):
        if isinstance(m, AIMessage) and (m.content or "").strip():
            return (m.content or "").strip()
    return "면접을 시작하겠습니다. 자기소개 부탁드립니다."


def interview_turn_invoke(*, thread_id: str, user_message: str) -> tuple[str, bool, str]:
    cfg = {"configurable": {"thread_id": thread_id}}
    snapshot = interview_app.get_state(cfg)
    values = snapshot.values
    prev_msgs: list[BaseMessage] = list(values.get("messages") or [])
    preview = prev_msgs + [HumanMessage(content=user_message)]
    phase_in = _phase_for_messages(preview)

    out = interview_app.invoke(
        {"messages": [HumanMessage(content=user_message)]},
        config=cfg,
    )
    msgs = list(out.get("messages") or [])
    last_ai = ""
    for m in reversed(msgs):
        if isinstance(m, AIMessage) and (m.content or "").strip():
            last_ai = (m.content or "").strip()
            break

    finished = phase_in == "done"
    return last_ai, finished, phase_in
