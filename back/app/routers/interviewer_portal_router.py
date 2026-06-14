from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_async_db
from app.dependencies.dependencies import get_current_interviewer
from app.models.interviewer import Interviewer
from app.schemas.candidate import CandidateRead
from app.services.candidate_service import candidate_service


router = APIRouter(prefix="/api/interviewer", tags=["Interviewer Portal"])


@router.get("/candidates", response_model=list[CandidateRead])
async def list_interviewer_candidates(
    db: AsyncSession = Depends(get_async_db),
    interviewer: Interviewer = Depends(get_current_interviewer),
):
    return await candidate_service.get_candidates_for_interviewer(db, interviewer)
