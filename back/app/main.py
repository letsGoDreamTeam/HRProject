import os
from dotenv import load_dotenv

# Important: load .env before importing routers/dependencies.
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.interview_booking_invitation_router import (
    router as interview_booking_invitation_router,
)
from app.routers.interview_booking_router import router as interview_booking_router
from app.routers.interview_slot_router import router as interview_slot_router
from app.routers.position_router import router as position_router
from app.routers.question_router import router as question_router
from app.routers.resume_parse_router import router as resume_parse_router
from app.routers.mail_router import router as mail_router
from app.core.exception_handlers import register_exception_handlers

from app.routers.auth_router import router as auth_router
from app.routers.user_router import router as user_router
from app.routers.admin_router import router as admin_router
from app.routers.hr_router import router as hr_router
from app.routers.candidate_router import router as candidate_router
from app.routers.email_template_router import router as email_template_router
from app.routers.candidate_mail_router import router as candidate_mail_router
from app.routers.interviewer_mail_router import router as interviewer_mail_router
from app.routers.interviewer_router import router as interviewer_router
from app.routers.interviewer_invite_router import router as interviewer_invite_router
from app.routers.interviewer_question_router import (
    router as interviewer_question_router,
)
from app.routers.interviewer_portal_router import router as interviewer_portal_router


app = FastAPI()

register_exception_handlers(app)

app.include_router(auth_router)
app.include_router(interview_booking_invitation_router)
app.include_router(interview_booking_router)
app.include_router(interview_slot_router)
app.include_router(position_router)
app.include_router(user_router)
app.include_router(admin_router)
app.include_router(hr_router)
app.include_router(question_router)
app.include_router(resume_parse_router)
app.include_router(interviewer_router)
app.include_router(interviewer_invite_router)
app.include_router(interviewer_portal_router)
app.include_router(interviewer_question_router)
app.include_router(candidate_router)
app.include_router(mail_router)
app.include_router(email_template_router)
app.include_router(candidate_mail_router)
app.include_router(interviewer_mail_router)


raw_cors_origins = os.getenv("CORS_ORIGINS", "").strip()
if raw_cors_origins:
    allow_origins = [
        origin.strip()
        for origin in raw_cors_origins.split(",")
        if origin.strip()
    ]
else:
    allow_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://[::1]:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Server is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}


