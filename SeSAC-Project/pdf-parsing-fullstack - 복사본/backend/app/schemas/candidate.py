"""Pydantic: ORM `Candidate`와 검증 공통 필드."""

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class CandidateBase(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=2000)
    phone: str | None = Field(default=None, max_length=100)
    email: str | None = Field(default=None, max_length=255)


class CandidateCreate(CandidateBase):
    position_id: int


class CandidateRead(CandidateBase):
    model_config = ConfigDict(from_attributes=True)

    candidate_id: int
    position_id: int
    application_status: str
