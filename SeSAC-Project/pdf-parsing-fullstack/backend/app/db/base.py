"""SQLAlchemy 선언적 베이스 & 엔진(선택)."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


class Base(DeclarativeBase):
    pass


def get_engine(
    *,
    echo: bool = False,
) -> Engine:
    """프로세스당 단일 엔진. `DATABASE_URL` 필수."""
    global _engine
    if _engine is not None:
        return _engine
    from app import config

    dsn = (config.DATABASE_URL or "").strip()
    if not dsn:
        msg = "DATABASE_URL 환경 변수를 설정하세요. (SQLAlchemy 엔진 생성 시 필요)"
        raise RuntimeError(msg)
    _engine = create_engine(
        dsn,
        echo=echo,
        pool_pre_ping=True,
    )
    return _engine


def _get_session_local() -> sessionmaker[Session]:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=get_engine(),
        )
    return _SessionLocal


def get_db() -> Generator[Session, None, None]:
    """FastAPI `Depends`용 동기 세션."""
    SessionLocal = _get_session_local()
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
