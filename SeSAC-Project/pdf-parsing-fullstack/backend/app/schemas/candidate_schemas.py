"""Pydantic: ORM `Candidate`(`candidate_orm`)과 동일 필드 — API·검증용 (지원자 연락처)."""

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class CandidateBase(BaseModel):
    """ERD 열에 대응하는 공통 스키마."""

    name: str | None = Field(default=None, max_length=255, description="이름")
    date_of_birth: date | None = Field(default=None, description="생년월일")
    gender: str | None = Field(default=None, max_length=100, description="성별")
    address: str | None = Field(default=None, max_length=2000, description="현주소")
    phone: str | None = Field(default=None, max_length=100, description="휴대폰")
    email: str | None = Field(default=None, max_length=255, description="이메일 (UK)")


class CandidateCreate(CandidateBase):
    pass


class CandidateRead(CandidateBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
