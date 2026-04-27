from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.resume_parse_router import router as resume_parse_api

CORS_ALLOW_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]


def create_app() -> FastAPI:
    application = FastAPI(
        title="이력서 파싱 API",
        version="0.1.0",
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
    return application


app = create_app()
