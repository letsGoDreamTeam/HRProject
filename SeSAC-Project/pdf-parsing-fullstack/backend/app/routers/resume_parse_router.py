from fastapi import APIRouter, File, HTTPException, UploadFile

from app.dependencies import ResumeParseServiceDep
from app.schemas.resume_parse_schemas import ResumeParseResponse

router = APIRouter()


@router.post(
    "/parse",
    response_model=ResumeParseResponse,
    response_model_by_alias=True,
)
async def parse_resumes(
    service: ResumeParseServiceDep,
    files: list[UploadFile] = File(...),
) -> ResumeParseResponse:
    if not files:
        raise HTTPException(status_code=400, detail="업로드된 파일이 없습니다.")
    return await service.parse_resumes(files)
