from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.candidate_repository import candidate_repository
from app.repositories.interview_booking_repository import interview_booking_repository
from app.models.candidate import Candidate
from app.models.interviewer import Interviewer
from app.schemas.candidate import (
    CandidateBookingRead,
    CandidateDetailRead,
    CandidateRead,
    CandidateUpdate,
)


class CandidateService:
    def _to_candidate_read(self, candidate: Candidate) -> CandidateRead:
        return CandidateRead(
            candidate_id=candidate.candidate_id,
            position_id=candidate.position_id,
            name=candidate.name,
            date_of_birth=candidate.date_of_birth,
            gender=candidate.gender,
            address=candidate.address,
            phone=candidate.phone,
            email=candidate.email,
            experience_level=candidate.experience_level,
            application_status=candidate.application_status,
            final_status=candidate.final_status,
            meets_preferred_criteria=candidate.meets_preferred_criteria or [],
            position_name=(
                candidate.position.position_name
                if candidate.position is not None
                else None
            ),
        )

    async def get_candidates(self, db: AsyncSession) -> list[CandidateRead]:
        candidates = await candidate_repository.find_all(db)
        return [self._to_candidate_read(candidate) for candidate in candidates]

    async def get_candidates_for_interviewer(
        self,
        db: AsyncSession,
        interviewer: Interviewer,
    ) -> list[CandidateRead]:
        if interviewer.position_id is None:
            return []
        candidates = await candidate_repository.find_all_by_position_id(
            db,
            interviewer.position_id,
        )
        return [self._to_candidate_read(candidate) for candidate in candidates]

    async def get_candidate(
        self, db: AsyncSession, candidate_id: int
    ) -> CandidateRead | None:
        candidate = await candidate_repository.find_by_id_with_position(
            db, candidate_id
        )
        if not candidate:
            return None
        return self._to_candidate_read(candidate)

    async def get_candidate_detail(
        self, db: AsyncSession, candidate_id: int
    ) -> CandidateDetailRead | None:
        candidate = await candidate_repository.find_by_id_with_details(db, candidate_id)
        if not candidate:
            return None

        active_booking = (
            await interview_booking_repository.find_active_by_candidate_id_with_slot(
                db,
                candidate_id,
            )
        )

        invitations = sorted(
            candidate.booking_invitations,
            key=lambda invitation: invitation.created_at,
            reverse=True,
        )

        return CandidateDetailRead(
            candidate_id=candidate.candidate_id,
            position_id=candidate.position_id,
            name=candidate.name,
            date_of_birth=candidate.date_of_birth,
            gender=candidate.gender,
            address=candidate.address,
            phone=candidate.phone,
            email=candidate.email,
            experience_level=candidate.experience_level,
            application_status=candidate.application_status,
            final_status=candidate.final_status,
            meets_preferred_criteria=candidate.meets_preferred_criteria,
            position_name=candidate.position.position_name
            if candidate.position is not None
            else None,
            created_at=candidate.created_at,
            updated_at=candidate.updated_at,
            current_booking=(
                CandidateBookingRead(
                    booking_id=active_booking.booking_id,
                    candidate_id=active_booking.candidate_id,
                    slot_id=active_booking.slot_id,
                    interview_round=active_booking.slot.interview_round
                    if active_booking.slot is not None
                    else None,
                    interview_starts_at=active_booking.slot.interview_starts_at
                    if active_booking.slot is not None
                    else None,
                    interview_ends_at=active_booking.slot.interview_ends_at
                    if active_booking.slot is not None
                    else None,
                    interview_location=active_booking.slot.interview_location
                    if active_booking.slot is not None
                    else None,
                    position_name=(
                        active_booking.slot.position.position_name
                        if active_booking.slot is not None
                        and active_booking.slot.position is not None
                        else None
                    ),
                    created_at=active_booking.created_at,
                    cancelled_at=active_booking.cancelled_at,
                )
                if active_booking is not None
                else None
            ),
            booking_invitations=[
                {
                    "invitation_id": invitation.invitation_id,
                    "candidate_id": invitation.candidate_id,
                    "slot_ids": invitation.allowed_slot_ids or [],
                    "expires_at": invitation.expires_at,
                    "created_at": invitation.created_at,
                    "revoked_at": invitation.revoked_at,
                }
                for invitation in invitations
            ],
        )

    async def update_candidate(
        self, db: AsyncSession, candidate_id: int, data: CandidateUpdate
    ) -> CandidateRead | None:
        update_data = data.model_dump(exclude_unset=True)
        updated_candidate = await candidate_repository.update_candidate(
            db, candidate_id, update_data
        )

        if not updated_candidate:
            return None

        await db.commit()
        candidate = await candidate_repository.find_by_id_with_position(
            db, candidate_id
        )
        if not candidate:
            return None
        return self._to_candidate_read(candidate)

    async def delete_candidate(self, db: AsyncSession, candidate_id: int):
        success = await candidate_repository.delete_candidate(db, candidate_id)
        if success:
            await db.commit()
        return success


candidate_service = CandidateService()
