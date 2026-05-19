from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.interview_booking import InterviewBooking
from app.models.interview_slot import InterviewSlot


class InterviewBookingRepository:
    def save(
        self,
        db: AsyncSession,
        booking: InterviewBooking,
    ) -> InterviewBooking:
        db.add(booking)
        return booking

    async def has_active_bookings(
        self,
        db: AsyncSession,
        slot_id: int,
    ) -> bool:
        active_booking_id = await db.scalar(
            select(InterviewBooking.booking_id)
            .where(
                InterviewBooking.slot_id == slot_id,
                InterviewBooking.cancelled_at.is_(None),
            )
            .limit(1)
        )
        return active_booking_id is not None

    async def find_active_by_candidate_id(
        self,
        db: AsyncSession,
        candidate_id: int,
    ) -> InterviewBooking | None:
        return await db.scalar(
            select(InterviewBooking)
            .where(
                InterviewBooking.candidate_id == candidate_id,
                InterviewBooking.cancelled_at.is_(None),
            )
            .order_by(InterviewBooking.booking_id.desc())
            .limit(1)
        )

    async def find_active_by_candidate_id_with_slot(
        self,
        db: AsyncSession,
        candidate_id: int,
    ) -> InterviewBooking | None:
        return await db.scalar(
            select(InterviewBooking)
            .where(
                InterviewBooking.candidate_id == candidate_id,
                InterviewBooking.cancelled_at.is_(None),
            )
            .options(
                selectinload(InterviewBooking.slot).selectinload(
                    InterviewSlot.position
                )
            )
            .order_by(InterviewBooking.booking_id.desc())
            .limit(1)
        )

    async def find_active_by_id_and_candidate_id_for_update(
        self,
        db: AsyncSession,
        booking_id: int,
        candidate_id: int,
    ) -> InterviewBooking | None:
        return await db.scalar(
            select(InterviewBooking)
            .where(
                InterviewBooking.booking_id == booking_id,
                InterviewBooking.candidate_id == candidate_id,
                InterviewBooking.cancelled_at.is_(None),
            )
            .with_for_update()
        )

    async def find_active_by_position_id(
        self,
        db: AsyncSession,
        position_id: int,
    ) -> list[InterviewBooking]:
        """해당 직무의 슬롯들에 걸린 활성(active) booking 목록을 한 번에 조회.

        같은 직무 지원자 카드에서 "다른 슬롯에 배정됨" 라벨을 보여주기 위한 batch fetch.
        """
        result = await db.scalars(
            select(InterviewBooking)
            .join(InterviewSlot, InterviewBooking.slot_id == InterviewSlot.slot_id)
            .where(
                InterviewSlot.position_id == position_id,
                InterviewBooking.cancelled_at.is_(None),
            )
            .options(
                selectinload(InterviewBooking.slot).selectinload(
                    InterviewSlot.position
                ),
            )
            .order_by(InterviewBooking.candidate_id, InterviewBooking.booking_id)
        )
        return list(result.all())

    async def delete_all_by_slot_id(
        self,
        db: AsyncSession,
        slot_id: int,
    ) -> int:
        """슬롯에 연결된 모든 예약(취소 포함)을 삭제. slot FK RESTRICT 해제용."""
        result = await db.execute(
            delete(InterviewBooking).where(InterviewBooking.slot_id == slot_id)
        )
        await db.flush()
        return int(result.rowcount or 0)

    async def count_active_by_slot_id(
        self,
        db: AsyncSession,
        slot_id: int,
    ) -> int:
        active_booking_count = await db.scalar(
            select(func.count(InterviewBooking.booking_id)).where(
                InterviewBooking.slot_id == slot_id,
                InterviewBooking.cancelled_at.is_(None),
            )
        )
        return active_booking_count or 0

    async def find_available_slots_by_position_id(
        self,
        db: AsyncSession,
        position_id: int,
        now: datetime,
    ) -> list[tuple[InterviewSlot, int]]:
        active_booking_count = func.count(InterviewBooking.booking_id)

        result = await db.execute(
            select(
                InterviewSlot,
                (InterviewSlot.capacity - active_booking_count).label(
                    "remaining_capacity"
                ),
            )
            .outerjoin(
                InterviewBooking,
                (InterviewBooking.slot_id == InterviewSlot.slot_id)
                & (InterviewBooking.cancelled_at.is_(None)),
            )
            .where(
                InterviewSlot.position_id == position_id,
                InterviewSlot.slot_status == "open",
                InterviewSlot.interview_starts_at > now,
                (
                    (InterviewSlot.booking_deadline_at.is_(None))
                    | (InterviewSlot.booking_deadline_at > now)
                ),
            )
            .options(selectinload(InterviewSlot.interviewers))
            .group_by(InterviewSlot.slot_id)
            .having(active_booking_count < InterviewSlot.capacity)
            .order_by(InterviewSlot.interview_starts_at, InterviewSlot.slot_id)
        )

        return [(slot, remaining_capacity) for slot, remaining_capacity in result.all()]


interview_booking_repository = InterviewBookingRepository()
