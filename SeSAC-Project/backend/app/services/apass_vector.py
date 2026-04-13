"""대학·학과 인재상 텍스트 청킹·임베딩·로컬 JSON 벡터 저장 및 코사인 검색."""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import Any

import numpy as np
from openai import OpenAI

from app.config import Settings


def _data_root(settings: Settings) -> Path:
    root = Path(__file__).resolve().parent.parent.parent / settings.apass_data_dir
    root.mkdir(parents=True, exist_ok=True)
    return root


def collection_key(university: str, department: str) -> str:
    raw = f"{university.strip()}::{department.strip()}".lower()
    slug = re.sub(r"[^a-z0-9가-힣]+", "-", raw, flags=re.I).strip("-")
    return slug[:180] or str(uuid.uuid4())


def _chunks(text: str, max_chars: int = 900) -> list[str]:
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


def _embed_batch(client: OpenAI, model: str, texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    resp = client.embeddings.create(model=model, input=texts)
    # OpenAI returns ordered by index
    data = sorted(resp.data, key=lambda d: d.index)
    return [list(d.embedding) for d in data]


def _cosine_top(
    query_vec: np.ndarray,
    matrix: np.ndarray,
    k: int,
) -> list[int]:
    if matrix.size == 0:
        return []
    q = query_vec.astype(np.float64)
    m = matrix.astype(np.float64)
    qn = np.linalg.norm(q) + 1e-12
    mn = np.linalg.norm(m, axis=1) + 1e-12
    sims = (m @ q) / (mn * qn)
    k = min(k, sims.shape[0])
    idx = np.argpartition(-sims, kth=k - 1)[:k]
    idx = idx[np.argsort(-sims[idx])]
    return idx.tolist()


def ingest_university_document(
    settings: Settings,
    *,
    university_name: str,
    department: str,
    document_text: str,
) -> tuple[str, int]:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 필요합니다.")
    key = collection_key(university_name, department)
    chunks = _chunks(document_text)
    if not chunks:
        raise ValueError("인재상·모집요강 텍스트가 비어 있습니다.")
    client = OpenAI(api_key=settings.openai_api_key)
    vecs = _embed_batch(client, settings.apass_embedding_model, chunks)
    path = _data_root(settings) / "collections" / f"{key}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload: dict[str, Any] = {
        "university_name": university_name,
        "department": department,
        "embedding_model": settings.apass_embedding_model,
        "chunks": [{"text": c, "embedding": v} for c, v in zip(chunks, vecs, strict=True)],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return key, len(chunks)


def search_collection(
    settings: Settings,
    *,
    collection_key: str,
    query: str,
    top_k: int = 5,
) -> list[str]:
    if not settings.openai_api_key:
        return []
    path = _data_root(settings) / "collections" / f"{collection_key}.json"
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    chunks = data.get("chunks") or []
    if not chunks:
        return []
    texts = [c["text"] for c in chunks]
    matrix_list = [c["embedding"] for c in chunks]
    matrix = np.array(matrix_list, dtype=np.float64)
    client = OpenAI(api_key=settings.openai_api_key)
    qv = np.array(
        _embed_batch(client, settings.apass_embedding_model, [query])[0],
        dtype=np.float64,
    )
    idx = _cosine_top(qv, matrix, top_k)
    return [texts[i] for i in idx if 0 <= i < len(texts)]
