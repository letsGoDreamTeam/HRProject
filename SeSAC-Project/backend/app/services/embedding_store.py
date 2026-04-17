"""OpenAI 임베딩·로컬 벡터 JSON 경로 공용 유틸(HR 직무 RAG 등)."""

from __future__ import annotations

import re
from pathlib import Path

from openai import OpenAI

from app.config import Settings
from app.services.openai_usage_tracker import record_openai_usage


def data_root(settings: Settings) -> Path:
    root = Path(__file__).resolve().parent.parent.parent / settings.vector_data_dir
    root.mkdir(parents=True, exist_ok=True)
    return root


def chunk_text(text: str, max_chars: int = 900) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    paras = re.split(r"\n{2,}", text)
    out: list[str] = []
    buf = ""
    for p in paras:
        p = p.strip()
        if not p:
            continue
        if len(buf) + len(p) + 2 <= max_chars:
            buf = f"{buf}\n\n{p}".strip() if buf else p
        else:
            if buf:
                out.append(buf)
            buf = p
    if buf:
        out.append(buf)
    return out


def embed_batch(client: OpenAI, model: str, texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    resp = client.embeddings.create(model=model, input=texts)
    record_openai_usage(
        usage=getattr(resp, "usage", None),
        model=model,
        feature="embedding_batch",
        request_kind="embedding",
    )
    data = sorted(resp.data, key=lambda d: d.index)
    return [list(d.embedding) for d in data]
