from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps_auth import get_current_user
from app.models_hr import CompanyProfile, JobRoleProfile, User
from app.schemas_hr import CandidateInterviewQuestionsRequest, CandidateInterviewQuestionsResponse
from app.services.candidate_interview_questions import generate_candidate_questions

router = APIRouter(prefix="/api/hr/interviews", tags=["hr-interviews"])


@router.post("/candidate-questions", response_model=CandidateInterviewQuestionsResponse)
def candidate_questions(
    body: CandidateInterviewQuestionsRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    settings = get_settings()
    row = db.scalars(select(CompanyProfile).where(CompanyProfile.user_id == user.id)).first()
    if not row:
        row = CompanyProfile(user_id=user.id)
        db.add(row)
        db.commit()
        db.refresh(row)
    extra_ctx = (body.extra_context or "").strip()
    if body.job_role_id is not None:
        jr = db.get(JobRoleProfile, body.job_role_id)
        if jr is not None and jr.user_id == user.id:
            tag = (
                f"[지정 직무 프로필: {jr.department} / {jr.job_title}]\n"
                f"{(jr.body_text or '')[:14_000]}"
            ).strip()
            extra_ctx = f"{extra_ctx}\n\n{tag}".strip()[:20_000]
    try:
        data = generate_candidate_questions(
            department=body.department.strip(),
            applicant_essay=body.applicant_essay,
            applicant_portfolio=body.applicant_portfolio,
            company_name=row.company_name,
            jd_reference=row.jd_reference,
            job_description=row.job_description,
            org_notes=row.org_notes + "\n" + extra_ctx,
            settings=settings,
        )
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"질문 생성 실패: {e!s}") from e
    qs = [str(q) for q in (data.get("questions") or [])]
    notes = str(data.get("notes_for_interviewer") or "")
    return CandidateInterviewQuestionsResponse(questions=qs, notes_for_interviewer=notes)
