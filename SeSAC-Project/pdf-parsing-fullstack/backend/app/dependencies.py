from typing import Annotated

from fastapi import Depends

from app.services.resume_parse_service import ResumeParseService

_resume_parse_service = ResumeParseService()


def get_resume_parse_service() -> ResumeParseService:
    return _resume_parse_service


ResumeParseServiceDep = Annotated[ResumeParseService, Depends(get_resume_parse_service)]
