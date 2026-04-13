from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from jose import JWTError, jwt

from app.config import Settings


def create_access_token(settings: Settings, *, subject: str, extra: dict[str, Any] | None = None) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=max(1, int(settings.access_token_expire_minutes)))
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(settings: Settings, token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def parse_user_id(payload: dict[str, Any]) -> UUID | None:
    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        return None
    try:
        return UUID(sub)
    except ValueError:
        return None


def safe_decode_user_id(settings: Settings, token: str) -> UUID | None:
    try:
        data = decode_token(settings, token)
        return parse_user_id(data)
    except JWTError:
        return None
