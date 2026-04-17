from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import insert

from app.database import get_engine
from app.models_hr import OpenAITokenUsage


def _to_int(v: Any, default: int = 0) -> int:
    try:
        if v is None:
            return default
        return int(v)
    except Exception:  # noqa: BLE001
        return default


def _read_usage(usage: Any) -> tuple[int, int, int]:
    """OpenAI usage 객체(dict/객체)에서 prompt/completion/total 안전 추출."""
    if usage is None:
        return 0, 0, 0
    if isinstance(usage, dict):
        p = _to_int(usage.get("prompt_tokens"), 0)
        c = _to_int(usage.get("completion_tokens"), 0)
        t = _to_int(usage.get("total_tokens"), p + c)
        return p, c, t
    p = _to_int(getattr(usage, "prompt_tokens", 0), 0)
    c = _to_int(getattr(usage, "completion_tokens", 0), 0)
    t = _to_int(getattr(usage, "total_tokens", p + c), p + c)
    return p, c, t


def record_openai_usage(
    *,
    usage: Any,
    model: str,
    feature: str,
    request_kind: str = "chat",
    user_id: UUID | None = None,
) -> None:
    """OpenAI 호출 토큰 사용량을 DB에 저장. 실패해도 본 요청 흐름은 중단하지 않음."""
    engine = get_engine()
    if engine is None:
        return
    prompt_tokens, completion_tokens, total_tokens = _read_usage(usage)
    try:
        with engine.begin() as conn:
            conn.execute(
                insert(OpenAITokenUsage).values(
                    user_id=user_id,
                    feature=(feature or "unknown")[:80],
                    model=(model or "")[:120],
                    request_kind=(request_kind or "chat")[:24],
                    prompt_tokens=max(0, prompt_tokens),
                    completion_tokens=max(0, completion_tokens),
                    total_tokens=max(0, total_tokens),
                    created_at=datetime.now(UTC),
                )
            )
    except Exception:  # noqa: BLE001
        # 사용량 로깅 실패는 기능 실패로 간주하지 않음
        return
