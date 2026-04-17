"""직무 프로필 다건 RAG: 로컬 JSON + OpenAI 임베딩."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

import numpy as np
from openai import OpenAI
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models_hr import JobRoleProfile
from app.services.embedding_store import chunk_text, data_root, embed_batch


def _collection_path(settings: Settings, user_id: uuid.UUID) -> Path:
    return data_root(settings) / "collections" / f"hr_jobs_{user_id!s}.json"


def remove_user_job_roles_rag_file(settings: Settings, user_id: uuid.UUID) -> None:
    """계정 삭제 시 로컬 RAG JSON 제거."""
    path = _collection_path(settings, user_id)
    if path.is_file():
        path.unlink()


def reindex_user_job_roles(settings: Settings, db: Session, user_id: uuid.UUID) -> int:
    """DB의 해당 사용자 직무 행을 모두 임베딩해 단일 컬렉션 파일로 저장. 행이 없으면 파일 삭제."""
    path = _collection_path(settings, user_id)
    rows = list(db.scalars(select(JobRoleProfile).where(JobRoleProfile.user_id == user_id)).all())
    if not rows:
        if path.is_file():
            path.unlink()
        return 0

    chunk_records: list[dict[str, Any]] = []
    for row in rows:
        header = f"{row.department} | {row.job_title}".strip(" |")
        if row.role_grade:
            header += f" | {row.role_grade}"
        full = f"## {header}\n{row.body_text or ''}".strip()
        for piece in chunk_text(full, max_chars=1100):
            if not piece.strip():
                continue
            chunk_records.append(
                {
                    "text": piece.strip(),
                    "job_id": str(row.id),
                    "department": row.department or "",
                    "job_title": row.job_title or "",
                    "role_grade": row.role_grade or "",
                }
            )

    if not chunk_records:
        if path.is_file():
            path.unlink()
        return 0

    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 필요합니다.")
    client = OpenAI(api_key=settings.openai_api_key)
    texts = [c["text"] for c in chunk_records]
    batch_size = 48
    all_vecs: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        all_vecs.extend(embed_batch(client, settings.embedding_model, batch))

    payload = {
        "user_id": str(user_id),
        "embedding_model": settings.embedding_model,
        "chunks": [
            {**chunk_records[i], "embedding": all_vecs[i]} for i in range(len(chunk_records))
        ],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return len(chunk_records)


def search_user_job_roles(
    settings: Settings,
    *,
    user_id: uuid.UUID,
    query: str,
    top_k: int = 10,
) -> list[dict[str, Any]]:
    path = _collection_path(settings, user_id)
    if not path.is_file() or not (query or "").strip():
        return []
    if not settings.openai_api_key:
        return []

    data = json.loads(path.read_text(encoding="utf-8"))
    chunks = data.get("chunks") or []
    if not chunks:
        return []

    texts = [c["text"] for c in chunks]
    matrix_list = [c["embedding"] for c in chunks]
    matrix = np.array(matrix_list, dtype=np.float64)
    client = OpenAI(api_key=settings.openai_api_key)
    qv = np.array(embed_batch(client, settings.embedding_model, [query.strip()])[0], dtype=np.float64)

    qn = np.linalg.norm(qv) + 1e-12
    mn = np.linalg.norm(matrix, axis=1) + 1e-12
    sims = (matrix @ qv) / (mn * qn)
    pool = min(max(top_k * 8, top_k), sims.shape[0])
    idx = np.argpartition(-sims, kth=pool - 1)[:pool]
    idx = idx[np.argsort(-sims[idx])]

    hits: list[dict[str, Any]] = []
    seen_job: set[str] = set()
    for i in idx:
        if len(hits) >= top_k:
            break
        if 0 <= i < len(chunks):
            c = chunks[i]
            jid = str(c.get("job_id") or "")
            if not jid or jid in seen_job:
                continue
            try:
                uid = uuid.UUID(jid)
            except ValueError:
                continue
            seen_job.add(jid)
            hits.append(
                {
                    "job_id": uid,
                    "department": str(c.get("department") or ""),
                    "job_title": str(c.get("job_title") or ""),
                    "role_grade": str(c.get("role_grade") or ""),
                    "snippet": str(c.get("text") or "")[:2000],
                    "score": float(min(1.0, max(0.0, float(sims[i])))),
                }
            )
    return hits


def delete_all_job_roles_for_user(db: Session, user_id: uuid.UUID) -> None:
    db.execute(delete(JobRoleProfile).where(JobRoleProfile.user_id == user_id))
