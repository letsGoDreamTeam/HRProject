from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class InterviewBookingCreate(CaseModel):
    candidate_id: int = Field(..., gt=0)
    slot_id: int = Field(..., gt=0)


class InterviewBookingCancelRequest(CaseModel):
    candidate_id: int = Field(..., gt=0)


class AvailableInterviewSlotResponse(CaseModel):
    slot_id: int
    interview_round: str
    interview_starts_at: datetime
    interview_ends_at: datetime
    interview_location: str | None
    remaining_capacity: int
    interviewer_names: list[str] = Field(default_factory=list)


class InterviewBookingResponse(CaseModel):
    booking_id: int
    candidate_id: int
    slot_id: int
    interview_starts_at: datetime
    interview_ends_at: datetime
    interview_location: str | None
    created_at: datetime


class ActiveBookingSummaryResponse(CaseModel):
    """직무별 활성 예약 batch 조회 응답 (지원자 → 어떤 슬롯에 배정되어 있는지)"""

    booking_id: int
    candidate_id: int
    slot_id: int
    position_id: int | None
    position_name: str | None
    interview_round: str
    interview_starts_at: datetime
    interview_ends_at: datetime
    interview_location: str | None
    booked_at: datetime
