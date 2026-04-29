import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.interview_questions_router import router as interview_questions_api
from app.routers.resume_parse_router import router as resume_parse_api

CORS_ALLOW_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """DATABASE_URL 설정 시 Alembic과 동일한 ORM 스키마로 테이블이 없으면 생성(checkfirst)."""
    from app import config

    if (getattr(config, "DATABASE_URL", None) or "").strip():
        try:
            import app.models  # noqa: F401
            from app.db.base import Base, get_engine

            Base.metadata.create_all(bind=get_engine(), checkfirst=True)
        except Exception:
            logger.exception(
                "DB create_all 실패 (`uv run alembic upgrade head`로 마이그레이션을 맞춰 보세요)."
            )
    yield


def create_app() -> FastAPI:
    application = FastAPI(
        title="이력서 파싱 API",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ALLOW_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(
        resume_parse_api,
        prefix="/api",
        tags=["parse"],
    )
    application.include_router(
        interview_questions_api,
        prefix="/api",
        tags=["interview"],
    )
    return application


app = create_app()
