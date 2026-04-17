from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import get_engine, init_db
from app.hr_migrations import run_hr_migrations
import app.models_hr  # noqa: F401
from app.models import Base
from app.routers import (
    admin_hr,
    applications_hr,
    auth_hr,
    company_hr,
    confirm_stage,
    job_roles_hr,
    interview_enhanced,
    public_evaluation,
    public_schedule,
    recruitment_process_hr,
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


app = FastAPI(title="HR 채용 운영 API", version="0.3.0", lifespan=lifespan)

settings = get_settings()
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
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
app.include_router(recruitment_process_hr.router)
app.include_router(confirm_stage.router)


@app.get("/health")
def health():
    return {"status": "ok"}
