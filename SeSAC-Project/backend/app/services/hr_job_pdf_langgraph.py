"""다중 직무 통합 PDF: LangChain 청크 분할 + LangGraph + 청크별 LLM 병렬 추출 → 병합."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, TypedDict

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langgraph.graph import END, StateGraph
from openai import OpenAI

from app.config import Settings

EXTRACT_SYSTEM = """당신은 공공기관·대기업의 '통합 직무소개서' 또는 대규모 채용 안내 PDF를 구조화하는 전문가입니다.
입력은 **문서의 일부(한 청크)**일 수 있습니다. 이 청크 안에 등장하는 **모든 직무(또는 직렬)**를 빠짐없이 찾아 목록으로 만듭니다.
- department: 실(室)·국·팀·본부 등 **부서·조직 단위**가 있으면 적습니다. 없으면 빈 문자열.
- job_title: 직무명·직렬명·담당 업무 제목 등 **직무를 식별하는 제목**.
- role_grade_or_level: 직급·직렬·계급(예: 3급, 5급, 사무직) 등. 없으면 빈 문자열.
- raw_description: 해당 직무에 대한 **본문 설명**(이 청크에 있는 범위만). 표·목록은 가능한 한 그대로 옮깁니다.
한 청크에 동일 직무가 여러 번 나와도 **한 행으로 합쳐** raw_description만 이어 붙여도 됩니다.
직무가 없는 서론·표지만 있으면 jobs는 빈 배열입니다.
출력은 JSON 스키마만 따릅니다. 한국어 유지."""

# 청크당 직무 상한(표 형 직무 목록 대비). 전체 문서 직무 수에는 제한 없음(청크 수 × 이 값).
EXTRACT_SCHEMA: dict[str, Any] = {
    "name": "chunk_job_roles",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "jobs": {
                "type": "array",
                "maxItems": 200,
                "items": {
                    "type": "object",
                    "properties": {
                        "department": {"type": "string"},
                        "job_title": {"type": "string"},
                        "role_grade_or_level": {"type": "string"},
                        "raw_description": {"type": "string"},
                    },
                    "required": ["department", "job_title", "role_grade_or_level", "raw_description"],
                    "additionalProperties": False,
                },
            },
            "chunk_notes": {"type": "string"},
        },
        "required": ["jobs", "chunk_notes"],
        "additionalProperties": False,
    },
}


class JobPdfGraphState(TypedDict, total=False):
    document_text: str
    warnings: list[str]
    chunks: list[str]
    partial_rows: list[dict[str, Any]]
    merged_jobs: list[dict[str, Any]]


def _extract_chunk(client: OpenAI, model: str, chunk: str) -> tuple[list[dict[str, Any]], str]:
    completion = client.chat.completions.create(
        model=model,
        temperature=0.1,
        messages=[
            {"role": "system", "content": EXTRACT_SYSTEM},
            {"role": "user", "content": "[문서 청크]\n" + chunk},
        ],
        response_format={"type": "json_schema", "json_schema": EXTRACT_SCHEMA},
    )
    raw = completion.choices[0].message.content
    if not raw:
        return [], ""
    data = json.loads(raw)
    jobs = data.get("jobs") or []
    note = (data.get("chunk_notes") or "").strip()
    out: list[dict[str, Any]] = []
    for j in jobs:
        if not isinstance(j, dict):
            continue
        out.append(
            {
                "department": (j.get("department") or "").strip(),
                "job_title": (j.get("job_title") or "").strip(),
                "role_grade": (j.get("role_grade_or_level") or "").strip(),
                "body_text": (j.get("raw_description") or "").strip(),
            }
        )
    return out, note


def _extract_chunk_parallel(idx: int, chunk: str, settings: Settings) -> tuple[int, list[dict[str, Any]], str, str | None]:
    """스레드 워커: OpenAI 클라이언트는 스레드마다 새로 생성."""
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        rows, note = _extract_chunk(client, settings.openai_model, chunk)
        return idx, rows, note, None
    except Exception as e:  # noqa: BLE001
        return idx, [], "", f"{e!s}"


def merge_job_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """(부서, 직무명) 기준 병합 — 청크 경계로 잘린 동일 직무 본문을 이어 붙임."""

    def key(r: dict[str, Any]) -> tuple[str, str]:
        return ((r.get("department") or "").strip().lower(), (r.get("job_title") or "").strip().lower())

    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for r in rows:
        title = (r.get("job_title") or "").strip()
        if not title:
            continue
        k = key(r)
        body = (r.get("body_text") or "").strip()
        grade = (r.get("role_grade") or "").strip()
        dept = (r.get("department") or "").strip()
        if k not in merged:
            merged[k] = {
                "department": dept,
                "job_title": title,
                "role_grade": grade,
                "body_text": body,
            }
        else:
            cur = merged[k]
            if grade and grade not in (cur.get("role_grade") or ""):
                cur["role_grade"] = f"{cur.get('role_grade', '')} {grade}".strip()
            if body:
                prev = (cur.get("body_text") or "").strip()
                if body not in prev and prev not in body:
                    cur["body_text"] = f"{prev}\n\n---\n\n{body}".strip() if prev else body
                elif len(body) > len(prev):
                    cur["body_text"] = body
    return list(merged.values())


def _build_graph(settings: Settings):
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 설정되어 있지 않습니다.")

    chunk_size = int(settings.hr_job_pdf_chunk_size)
    chunk_overlap = int(settings.hr_job_pdf_chunk_overlap)
    extract_workers = int(settings.hr_job_pdf_extract_workers)

    def chunk_node(state: JobPdfGraphState) -> dict[str, Any]:
        text = (state.get("document_text") or "").strip()
        warnings = list(state.get("warnings") or [])
        if len(text) < 100:
            return {"chunks": [], "warnings": warnings + ["문서 텍스트가 너무 짧습니다."]}
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n\n", "\n\n", "\n", " ", ""],
        )
        chunks = splitter.split_text(text)
        if len(chunks) > 200:
            warnings.append(
                f"청크가 {len(chunks)}개입니다. 전부 병렬 처리하므로 시간·API 비용이 큽니다. "
                f"더 빠르게 하려면 .env에서 HR_JOB_PDF_CHUNK_SIZE를 키워 청크 수를 줄이세요(기본 {chunk_size})."
            )
        return {"chunks": chunks, "warnings": warnings}

    def extract_node(state: JobPdfGraphState) -> dict[str, Any]:
        warnings = list(state.get("warnings") or [])
        chunks = state.get("chunks") or []
        if not chunks:
            return {"partial_rows": [], "warnings": warnings}
        workers = max(1, min(extract_workers, 32, len(chunks)))
        all_rows: list[dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=workers) as ex:
            future_map = {
                ex.submit(_extract_chunk_parallel, i, ch, settings): i for i, ch in enumerate(chunks)
            }
            for fut in as_completed(future_map):
                idx, rows, note, err = fut.result()
                if err:
                    warnings.append(f"청크 {idx + 1} 추출 실패: {err}")
                else:
                    all_rows.extend(rows)
                    if note:
                        warnings.append(f"청크 {idx + 1}: {note}")
        return {"partial_rows": all_rows, "warnings": warnings}

    def merge_node(state: JobPdfGraphState) -> dict[str, Any]:
        partial = state.get("partial_rows") or []
        return {"merged_jobs": merge_job_rows(partial)}

    g = StateGraph(JobPdfGraphState)
    g.add_node("chunk", chunk_node)
    g.add_node("extract", extract_node)
    g.add_node("merge", merge_node)
    g.set_entry_point("chunk")
    g.add_edge("chunk", "extract")
    g.add_edge("extract", "merge")
    g.add_edge("merge", END)
    return g.compile()


def run_job_pdf_pipeline(*, document_text: str, settings: Settings) -> dict[str, Any]:
    """
    반환: merged_jobs (list[dict]), warnings, chunk_count
    """
    graph = _build_graph(settings)
    initial: JobPdfGraphState = {
        "document_text": document_text,
        "warnings": [],
    }
    out = graph.invoke(initial)
    chunks = out.get("chunks") or []
    return {
        "merged_jobs": out.get("merged_jobs") or [],
        "warnings": out.get("warnings") or [],
        "chunk_count": len(chunks),
    }
