from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models_hr import (
    InterviewBooking,
    InterviewCandidate,
    InterviewRound,
    InterviewSlot,
)
from app.schemas_hr import BookSlotRequest, PatchBookingRequest, PublicScheduleView, InterviewSlotPublic
from app.services.scheduling_notifications import (
    booking_correlation_key,
    delete_unsent_by_correlation,
    enqueue_hr_booking_cancelled,
    load_round_for_notifications,
    maybe_notify_slots_exhausted,
    notify_booking_confirmed,
)

router = APIRouter(prefix="/api/public/schedule", tags=["public-schedule"])


def _remaining(db: Session, slot: InterviewSlot) -> int:
    used = db.scalar(select(func.count()).select_from(InterviewBooking).where(InterviewBooking.slot_id == slot.id)) or 0
    return max(0, int(slot.capacity) - int(used))


@router.get("/{token}", response_model=PublicScheduleView)
def public_view(token: str, db: Annotated[Session | None, Depends(get_db)]):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    cand = db.scalars(select(InterviewCandidate).where(InterviewCandidate.access_token == token)).first()
    if not cand:
        raise HTTPException(status_code=404, detail="링크가 유효하지 않습니다.")
    stmt = (
        select(InterviewRound)
        .where(InterviewRound.id == cand.round_id)
        .options(selectinload(InterviewRound.slots))
    )
    rnd = db.scalars(stmt).first()
    if not rnd:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    slots_out: list[InterviewSlotPublic] = []
    booked_slot_id = None
    existing = db.scalars(select(InterviewBooking).where(InterviewBooking.candidate_id == cand.id)).first()
    if existing:
        booked_slot_id = existing.slot_id
    for s in sorted(rnd.slots, key=lambda x: x.start_at):
        slots_out.append(
            InterviewSlotPublic(
                id=s.id,
                start_at=s.start_at,
                end_at=s.end_at,
                capacity=s.capacity,
                remaining=_remaining(db, s),
            )
        )
    return PublicScheduleView(
        round_title=rnd.title,
        candidate_name=cand.name,
        timezone=rnd.timezone,
        slots=slots_out,
        already_booked_slot_id=booked_slot_id,
    )


@router.post("/{token}/book")
def book_slot(
    token: str,
    body: BookSlotRequest,
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    cand = db.scalars(select(InterviewCandidate).where(InterviewCandidate.access_token == token)).first()
    if not cand:
        raise HTTPException(status_code=404, detail="링크가 유효하지 않습니다.")
    if db.scalars(select(InterviewBooking).where(InterviewBooking.candidate_id == cand.id)).first():
        raise HTTPException(status_code=409, detail="이미 면접 시간을 선택하셨습니다.")
    slot = db.get(InterviewSlot, body.slot_id)
    if not slot or slot.round_id != cand.round_id:
        raise HTTPException(status_code=400, detail="잘못된 슬롯입니다.")
    rem = _remaining(db, slot)
    if rem <= 0:
        raise HTTPException(status_code=409, detail="해당 시간은 마감되었습니다.")
    booking = InterviewBooking(slot_id=slot.id, candidate_id=cand.id)
    db.add(booking)
    db.flush()
    rnd = load_round_for_notifications(db, cand.round_id)
    if rnd is None:
        raise HTTPException(status_code=500, detail="일정 로드 실패")
    notify_booking_confirmed(db, booking_id=booking.id, cand=cand, slot=slot, rnd=rnd)
    maybe_notify_slots_exhausted(
        db,
        round_id=rnd.id,
        user_id=rnd.user_id,
        hr_email=rnd.hr_notify_email,
        round_title=rnd.title,
    )
    db.commit()
    return {"ok": True, "slot_id": str(slot.id), "start_at": slot.start_at.isoformat()}


@router.patch("/{token}/booking")
def change_booking(
    token: str,
    body: PatchBookingRequest,
    db: Annotated[Session | None, Depends(get_db)],
):
    """예약된 슬롯을 다른 시간으로 변경합니다. 미발송 알림(동일 예약 correlation)은 삭제 후 새 일정으로 다시 예약합니다."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    cand = db.scalars(select(InterviewCandidate).where(InterviewCandidate.access_token == token)).first()
    if not cand:
        raise HTTPException(status_code=404, detail="링크가 유효하지 않습니다.")
    booking = db.scalars(select(InterviewBooking).where(InterviewBooking.candidate_id == cand.id)).first()
    if not booking:
        raise HTTPException(status_code=409, detail="먼저 면접 시간을 선택해 주세요.")
    new_slot = db.get(InterviewSlot, body.slot_id)
    if not new_slot or new_slot.round_id != cand.round_id:
        raise HTTPException(status_code=400, detail="잘못된 슬롯입니다.")
    if new_slot.id == booking.slot_id:
        return {"ok": True, "slot_id": str(new_slot.id), "start_at": new_slot.start_at.isoformat(), "changed": False}

    rem = _remaining(db, new_slot)
    if rem <= 0:
        raise HTTPException(status_code=409, detail="해당 시간은 마감되었습니다.")

    corr = booking_correlation_key(booking.id)
    delete_unsent_by_correlation(db, corr)
    booking.slot_id = new_slot.id
    db.flush()
    rnd = load_round_for_notifications(db, cand.round_id)
    if rnd is None:
        raise HTTPException(status_code=500, detail="일정 로드 실패")
    notify_booking_confirmed(db, booking_id=booking.id, cand=cand, slot=new_slot, rnd=rnd)
    maybe_notify_slots_exhausted(
        db,
        round_id=rnd.id,
        user_id=rnd.user_id,
        hr_email=rnd.hr_notify_email,
        round_title=rnd.title,
    )
    db.commit()
    return {"ok": True, "slot_id": str(new_slot.id), "start_at": new_slot.start_at.isoformat(), "changed": True}


@router.delete("/{token}/booking")
def cancel_booking(token: str, db: Annotated[Session | None, Depends(get_db)]):
    """면접 예약을 취소합니다. 해당 예약에 묶인 미발송 알림은 제거됩니다."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    cand = db.scalars(select(InterviewCandidate).where(InterviewCandidate.access_token == token)).first()
    if not cand:
        raise HTTPException(status_code=404, detail="링크가 유효하지 않습니다.")
    booking = db.scalars(select(InterviewBooking).where(InterviewBooking.candidate_id == cand.id)).first()
    if not booking:
        raise HTTPException(status_code=409, detail="취소할 예약이 없습니다.")
    rnd = load_round_for_notifications(db, cand.round_id)
    delete_unsent_by_correlation(db, booking_correlation_key(booking.id))
    db.delete(booking)
    if rnd:
        enqueue_hr_booking_cancelled(
            db,
            user_id=rnd.user_id,
            hr_email=rnd.hr_notify_email,
            round_title=rnd.title,
            candidate_name=cand.name,
        )
    db.commit()
    return {"ok": True, "cancelled": True}
