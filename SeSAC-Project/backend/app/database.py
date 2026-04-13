from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def init_db() -> None:
    global _engine, _SessionLocal
    settings = get_settings()
    if not settings.database_url:
        return
    _engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
    )
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def get_engine():
    return _engine


def get_db() -> Generator[Session | None, None, None]:
    if _SessionLocal is None:
        yield None
        return
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()
