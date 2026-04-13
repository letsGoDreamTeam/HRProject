from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import get_engine, init_db
from app.hr_migrations import run_hr_migrations
import app.models_apass  # noqa: F401 — Alembic 없이 메타데이터 등록
import app.models_hr  # noqa: F401
from app.models import Base
from app.routers import (
    admin_hr,
    analyze,
    apass,
    applications_hr,
    auth_hr,
    company_hr,
    job_roles_hr,
    interview_enhanced,
    jd_pdf,
    public_evaluation,
    public_schedule,
    rejections_hr,
    scheduling_hr,
)
from app.services.scheduler_hr import shutdown_hr_scheduler, start_hr_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    engine = get_engine()
    if engine is not None:
        Base.metadata.create_all(bind=engine)
        run_hr_migrations(engine)
    start_hr_scheduler()
    yield
    shutdown_hr_scheduler()


app = FastAPI(title="면접 질문 코파일럿 API", version="0.2.0", lifespan=lifespan)

settings = get_settings()
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
# 프론트가 Vite 프록시 없이 127.0.0.1:8000 으로 직접 붙는 경우(로컬 5173/4173 등) CORS 허용
_local_ui = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:4174",
    "http://127.0.0.1:4174",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
_cors_origins = list(dict.fromkeys([*origins, *_local_ui]))
# Vite --host 0.0.0.0 → 브라우저 Origin 이 http://192.168.x.x:5173 등으로 올 때
_LAN_DEV_ORIGIN_REGEX = (
    r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    r"|^https?://192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$"
    r"|^https?://10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$"
    r"|^https?://172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(:\d+)?$"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["http://localhost:5173"],
    allow_origin_regex=_LAN_DEV_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(jd_pdf.router)
app.include_router(apass.router)
app.include_router(auth_hr.router)
app.include_router(company_hr.router)
app.include_router(job_roles_hr.router)
app.include_router(applications_hr.router)
app.include_router(scheduling_hr.router)
app.include_router(public_schedule.router)
app.include_router(public_evaluation.router)
app.include_router(interview_enhanced.router)
app.include_router(rejections_hr.router)
app.include_router(admin_hr.router)


@app.get("/health")
def health():
    return {"status": "ok"}
