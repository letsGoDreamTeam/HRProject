from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException, ConflictException, NotFoundException
from app.models.interview_booking import InterviewBooking
from app.models.interview_slot import InterviewSlot
from app.repositories.candidate_repository import candidate_repository
from app.repositories.interview_booking_repository import interview_booking_repository
from app.repositories.interview_slot_repository import interview_slot_repository
from app.schemas.interview_booking import (
    ActiveBookingSummaryResponse,
    AvailableInterviewSlotResponse,
    InterviewBookingResponse,
)


KST = ZoneInfo("Asia/Seoul")


class InterviewBookingService:
    async def get_available_slots(
        self,
        db: AsyncSession,
        candidate_id: int,
    ) -> list[AvailableInterviewSlotResponse]:
        candidate = await candidate_repository.find_by_id(db, candidate_id)
        if not candidate:
            raise NotFoundException("지원자를 찾을 수 없습니다.")

        if candidate.position_id is None:
            raise BadRequestException("지원자의 직무 정보가 없습니다.")

        now = datetime.now(KST)
        slots = await interview_booking_repository.find_available_slots_by_position_id(
            db,
            candidate.position_id,
            now,
        )

        return [
            AvailableInterviewSlotResponse(
                slot_id=slot.slot_id,
                interview_round=slot.interview_round,
                interview_starts_at=slot.interview_starts_at,
                interview_ends_at=slot.interview_ends_at,
                interview_location=slot.interview_location,
                remaining_capacity=remaining_capacity,
                interviewer_names=[
                    interviewer.interviewer_name
                    for interviewer in slot.interviewers
                ],
            )
            for slot, remaining_capacity in slots
        ]

    async def create_booking(
        self,
        db: AsyncSession,
        candidate_id: int,
        slot_id: int,
    ) -> InterviewBookingResponse:
        candidate = await candidate_repository.find_by_id(db, candidate_id)
        if not candidate:
            raise NotFoundException("지원자를 찾을 수 없습니다.")

        if candidate.position_id is None:
            raise BadRequestException("지원자의 직무 정보가 없습니다.")

        active_booking = (
            await interview_booking_repository.find_active_by_candidate_id(
                db,
                candidate_id,
            )
        )
        if active_booking:
            raise ConflictException("이미 예약된 면접 일정이 있습니다.")

        slot = await interview_slot_repository.find_by_id_for_update(db, slot_id)
        if not slot:
            raise NotFoundException("면접 일정을 찾을 수 없습니다.")

        self._validate_bookable_slot_for_candidate(slot, candidate.position_id)

        active_booking_count = await interview_booking_repository.count_active_by_slot_id(
            db,
            slot_id,
        )
        if active_booking_count >= slot.capacity:
            raise ConflictException("예약 가능한 인원이 없습니다.")

        booking = InterviewBooking(
            candidate_id=candidate_id,
            slot_id=slot_id,
        )
        interview_booking_repository.save(db, booking)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise ConflictException("이미 예약된 면접 일정이 있습니다.") from None

        await db.refresh(booking)

        return self._to_response(booking, slot)

    async def get_active_bookings_by_position(
        self,
        db: AsyncSession,
        position_id: int,
    ) -> list[ActiveBookingSummaryResponse]:
        """직무에 걸린 모든 활성 booking 일괄 조회.

        스케줄 모달의 "다른 슬롯에 배정됨" 라벨 표시용.
        """
        bookings = await interview_booking_repository.find_active_by_position_id(
            db,
            position_id,
        )

        return [
            ActiveBookingSummaryResponse(
                booking_id=booking.booking_id,
                candidate_id=booking.candidate_id,
                slot_id=booking.slot_id,
                position_id=booking.slot.position_id if booking.slot else None,
                position_name=(
                    booking.slot.position.position_name
                    if booking.slot and booking.slot.position
                    else None
                ),
                interview_round=booking.slot.interview_round if booking.slot else "",
                interview_starts_at=booking.slot.interview_starts_at
                if booking.slot
                else booking.created_at,
                interview_ends_at=booking.slot.interview_ends_at
                if booking.slot
                else booking.created_at,
                interview_location=(
                    booking.slot.interview_location if booking.slot else None
                ),
                booked_at=booking.created_at,
            )
            for booking in bookings
        ]

    async def cancel_booking(
        self,
        db: AsyncSession,
        candidate_id: int,
        booking_id: int,
    ) -> None:
        candidate = await candidate_repository.find_by_id(db, candidate_id)
        if not candidate:
            raise NotFoundException("지원자를 찾을 수 없습니다.")

        booking = (
            await interview_booking_repository.find_active_by_id_and_candidate_id_for_update(
                db,
                booking_id,
                candidate_id,
            )
        )
        if not booking:
            raise NotFoundException("취소할 활성 면접 예약을 찾을 수 없습니다.")

        slot = await interview_slot_repository.find_by_id_for_update(
            db,
            booking.slot_id,
        )
        if not slot:
            raise NotFoundException("면접 일정을 찾을 수 없습니다.")

        now = datetime.now(KST)
        if slot.interview_starts_at <= now:
            raise ConflictException("이미 시작된 면접 예약은 취소할 수 없습니다.")

        booking.cancelled_at = now
        await db.commit()

    def _validate_bookable_slot_for_candidate(
        self,
        slot: InterviewSlot,
        candidate_position_id: int,
    ) -> None:
        if slot.position_id != candidate_position_id:
            raise ConflictException("지원한 직무의 면접 일정만 예약할 수 있습니다.")

        if slot.slot_status != "open":
            raise ConflictException("예약이 가능한 면접 일정이 아닙니다.")

        now = datetime.now(KST)
        if slot.booking_deadline_at is not None and slot.booking_deadline_at <= now:
            raise ConflictException("예약 마감 시간이 지난 면접 일정입니다.")

        if slot.interview_starts_at <= now:
            raise ConflictException("이미 시작된 면접 일정은 예약할 수 없습니다.")

    def _to_response(
        self,
        booking: InterviewBooking,
        slot: InterviewSlot,
    ) -> InterviewBookingResponse:
        return InterviewBookingResponse(
            booking_id=booking.booking_id,
            candidate_id=booking.candidate_id,
            slot_id=booking.slot_id,
            interview_starts_at=slot.interview_starts_at,
            interview_ends_at=slot.interview_ends_at,
            interview_location=slot.interview_location,
            created_at=booking.created_at,
        )


interview_booking_service = InterviewBookingService()
