from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.config import Settings
from app.models_hr import (
    InterviewBooking,
    InterviewCandidate,
    InterviewEvaluationSubmission,
    InterviewInterviewer,
    InterviewRound,
    InterviewSlot,
    NotificationOutbox,
)


def booking_correlation_key(booking_id: uuid.UUID) -> str:
    return f"booking:{booking_id}"


def _tz(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name or "Asia/Seoul")
    except Exception:  # noqa: BLE001
        return ZoneInfo("Asia/Seoul")


def delete_unsent_by_correlation(db: Session, correlation_key: str) -> int:
    stmt = delete(NotificationOutbox).where(
        NotificationOutbox.correlation_key == correlation_key,
        NotificationOutbox.sent_at.is_(None),
    )
    res = db.execute(stmt)
    return int(res.rowcount or 0)


def enqueue_candidate_and_hr_final(
    db: Session,
    *,
    user_id,
    hr_email: str,
    candidate_name: str,
    candidate_email: str,
    candidate_phone: str,
    start_at: datetime,
    tz_name: str,
    round_title: str,
    correlation_key: str | None = None,
) -> None:
    tz = _tz(tz_name)
    local = start_at.astimezone(tz)
    human = local.strftime("%Y-%m-%d %H:%M")
    body = (
        f"[{round_title}] 면접 시간이 확정되었습니다.\n"
        f"- 일시: {human} ({tz_name})\n"
        f"- 장소/비대면 링크는 별도 안내를 참고해 주세요.\n"
    )
    now = datetime.now(UTC)
    if candidate_email.strip():
        db.add(
            NotificationOutbox(
                user_id=user_id,
                channel="email",
                recipient=candidate_email.strip(),
                subject=f"[{round_title}] 면접 일정 확정",
                body=body,
                kind="candidate_final",
                scheduled_at=now,
                correlation_key=correlation_key,
            )
        )
    if candidate_phone.strip():
        db.add(
            NotificationOutbox(
                user_id=user_id,
                channel="sms",
                recipient=candidate_phone.strip(),
                subject="",
                body=body[:1200],
                kind="candidate_final_sms",
                scheduled_at=now,
                correlation_key=correlation_key,
            )
        )
    if hr_email.strip():
        db.add(
            NotificationOutbox(
                user_id=user_id,
                channel="email",
                recipient=hr_email.strip(),
                subject=f"[{round_title}] {candidate_name} 일정 확정 알림",
                body=body + f"\n지원자: {candidate_name}\n",
                kind="hr_final",
                scheduled_at=now,
                correlation_key=correlation_key,
            )
        )


def enqueue_interviewer_reminders(
    db: Session,
    *,
    user_id,
    round_row: InterviewRound,
    slot_start: datetime,
    correlation_key: str | None = None,
) -> None:
    tz = _tz(round_row.timezone)
    start_local = slot_start.astimezone(tz)
    day_9_local = start_local.replace(hour=9, minute=0, second=0, microsecond=0)
    before_local = start_local - timedelta(minutes=30)
    day_9_utc = day_9_local.astimezone(UTC)
    before_utc = before_local.astimezone(UTC)
    human = start_local.strftime("%Y-%m-%d %H:%M")
    for inv in round_row.interviewers:
        body9 = f"[면접 당일 9시 알림] {round_row.title}\n{inv.name}님, 오늘 {human} 면접이 있습니다."
        body30 = f"[면접 30분 전] {round_row.title}\n{inv.name}님, 곧 {human} 면접이 시작됩니다."
        if inv.email.strip():
            db.add(
                NotificationOutbox(
                    user_id=user_id,
                    channel="email",
                    recipient=inv.email.strip(),
                    subject=f"[면접 당일] {round_row.title}",
                    body=body9,
                    kind="interviewer_9",
                    scheduled_at=day_9_utc,
                    correlation_key=correlation_key,
                )
            )
            db.add(
                NotificationOutbox(
                    user_id=user_id,
                    channel="email",
                    recipient=inv.email.strip(),
                    subject=f"[면접 30분 전] {round_row.title}",
                    body=body30,
                    kind="interviewer_30",
                    scheduled_at=before_utc,
                    correlation_key=correlation_key,
                )
            )
        if inv.phone.strip():
            db.add(
                NotificationOutbox(
                    user_id=user_id,
                    channel="sms",
                    recipient=inv.phone.strip(),
                    subject="",
                    body=body9[:1200],
                    kind="interviewer_9_sms",
                    scheduled_at=day_9_utc,
                    correlation_key=correlation_key,
                )
            )
            db.add(
                NotificationOutbox(
                    user_id=user_id,
                    channel="sms",
                    recipient=inv.phone.strip(),
                    subject="",
                    body=body30[:1200],
                    kind="interviewer_30_sms",
                    scheduled_at=before_utc,
                    correlation_key=correlation_key,
                )
            )


def notify_booking_confirmed(
    db: Session,
    *,
    booking_id: uuid.UUID,
    cand: InterviewCandidate,
    slot: InterviewSlot,
    rnd: InterviewRound,
) -> None:
    key = booking_correlation_key(booking_id)
    enqueue_candidate_and_hr_final(
        db,
        user_id=rnd.user_id,
        hr_email=rnd.hr_notify_email,
        candidate_name=cand.name,
        candidate_email=cand.email,
        candidate_phone=cand.phone,
        start_at=slot.start_at,
        tz_name=rnd.timezone,
        round_title=rnd.title,
        correlation_key=key,
    )
    enqueue_interviewer_reminders(
        db,
        user_id=rnd.user_id,
        round_row=rnd,
        slot_start=slot.start_at,
        correlation_key=key,
    )


def enqueue_hr_booking_cancelled(
    db: Session,
    *,
    user_id,
    hr_email: str,
    round_title: str,
    candidate_name: str,
) -> None:
    if not (hr_email or "").strip():
        return
    now = datetime.now(UTC)
    body = f"[{round_title}] {candidate_name}님이 면접 예약을 취소했습니다."
    db.add(
        NotificationOutbox(
            user_id=user_id,
            channel="email",
            recipient=hr_email.strip(),
            subject=f"[{round_title}] 예약 취소 알림",
            body=body,
            kind="hr_booking_cancelled",
            scheduled_at=now,
            correlation_key=None,
        )
    )


def maybe_notify_slots_exhausted(db: Session, *, round_id, user_id, hr_email: str, round_title: str) -> None:
    if not hr_email.strip():
        return
    round_row = db.get(InterviewRound, round_id)
    if not round_row:
        return
    stmt_slots = select(InterviewSlot).where(InterviewSlot.round_id == round_id)
    slots = list(db.scalars(stmt_slots).all())
    if not slots:
        return
    for sl in slots:
        used = db.scalar(
            select(func.count()).select_from(InterviewBooking).where(InterviewBooking.slot_id == sl.id)
        ) or 0
        if used < int(sl.capacity or 1):
            return
    cands = list(db.scalars(select(InterviewCandidate).where(InterviewCandidate.round_id == round_id)).all())
    booked_stmt = (
        select(InterviewBooking.candidate_id)
        .join(InterviewCandidate, InterviewCandidate.id == InterviewBooking.candidate_id)
        .where(InterviewCandidate.round_id == round_id)
    )
    booked_ids = set(db.scalars(booked_stmt).all())
    unbooked = [c for c in cands if c.id not in booked_ids]
    if not unbooked:
        return
    now = datetime.now(UTC)
    names = ", ".join(c.name for c in unbooked[:30])
    more = "" if len(unbooked) <= 30 else f" 외 {len(unbooked) - 30}명"
    body = (
        f"[{round_title}] 모든 면접 슬롯이 마감되었으나 아직 선택하지 않은 지원자가 있습니다.\n"
        f"미선택: {names}{more}\n"
        "추가 슬롯을 열거나 개별 연락이 필요할 수 있습니다."
    )
    db.add(
        NotificationOutbox(
            user_id=user_id,
            channel="email",
            recipient=hr_email.strip(),
            subject=f"[{round_title}] 슬롯 마감 · 미선택 지원자 있음",
            body=body,
            kind="hr_slots_full",
            scheduled_at=now,
            correlation_key=None,
        )
    )


def load_round_for_notifications(db: Session, round_id) -> InterviewRound | None:
    stmt = (
        select(InterviewRound)
        .where(InterviewRound.id == round_id)
        .options(selectinload(InterviewRound.interviewers))
    )
    return db.scalars(stmt).first()


def public_schedule_pick_url(settings: Settings, access_token: str) -> str:
    base = (settings.frontend_public_url or "").strip().rstrip("/")
    if not base:
        parts = [p.strip().rstrip("/") for p in (settings.cors_origins or "").split(",") if p.strip()]
        base = parts[0] if parts else "http://localhost:5173"
    return f"{base}/schedule/pick/{access_token}"


def enqueue_candidate_pick_reminder(
    db: Session,
    *,
    settings: Settings,
    user_id,
    round_title: str,
    cand: InterviewCandidate,
) -> tuple[int, int]:
    """미선택 지원자에게 시간 선택 링크 재안내. 반환: (이메일 건수, SMS 건수)."""
    now = datetime.now(UTC)
    url = public_schedule_pick_url(settings, cand.access_token)
    body = (
        f"[{round_title}] 안녕하세요, {cand.name}님.\n"
        "아직 면접 가능 시간을 선택하지 않으셨습니다.\n"
        f"아래 링크에서 시간을 골라 주세요.\n{url}\n"
    )
    n_e = 0
    n_s = 0
    key = f"pick_remind:{cand.id}:{int(now.timestamp())}"
    if (cand.email or "").strip():
        db.add(
            NotificationOutbox(
                user_id=user_id,
                channel="email",
                recipient=cand.email.strip(),
                subject=f"[{round_title}] 면접 시간 선택 안내(재전송)",
                body=body,
                kind="candidate_pick_remind",
                scheduled_at=now,
                correlation_key=key,
            )
        )
        n_e = 1
    if (cand.phone or "").strip():
        db.add(
            NotificationOutbox(
                user_id=user_id,
                channel="sms",
                recipient=cand.phone.strip(),
                subject="",
                body=body[:1200],
                kind="candidate_pick_remind_sms",
                scheduled_at=now,
                correlation_key=f"{key}:sms",
            )
        )
        n_s = 1
    return n_e, n_s


def public_evaluation_url(settings: Settings, access_token: str) -> str:
    base = (settings.frontend_public_url or "").strip().rstrip("/")
    if not base:
        parts = [p.strip().rstrip("/") for p in (settings.cors_origins or "").split(",") if p.strip()]
        base = parts[0] if parts else "http://localhost:5173"
    return f"{base}/evaluate/{access_token}"


def enqueue_interviewer_evaluation_reminder(
    db: Session,
    *,
    settings: Settings,
    user_id,
    round_title: str,
    candidate_name: str,
    inv: InterviewInterviewer,
    submission: InterviewEvaluationSubmission,
) -> tuple[int, int]:
    """미제출 면접관에게 평가 링크(재)안내. 반환: (이메일, SMS)."""
    now = datetime.now(UTC)
    url = public_evaluation_url(settings, submission.access_token)
    body = (
        f"[{round_title}] {inv.name}님, 지원자 {candidate_name} 면접 평가표를 아직 제출하지 않으셨습니다.\n"
        f"아래 링크에서 1~5점과 코멘트를 입력해 제출해 주세요.\n{url}\n"
    )
    n_e = 0
    n_s = 0
    key = f"eval_remind:{submission.id}:{int(now.timestamp())}"
    if (inv.email or "").strip():
        db.add(
            NotificationOutbox(
                user_id=user_id,
                channel="email",
                recipient=inv.email.strip(),
                subject=f"[{round_title}] 면접 평가 제출 요청 · {candidate_name}",
                body=body,
                kind="interviewer_eval_remind",
                scheduled_at=now,
                correlation_key=key,
            )
        )
        n_e = 1
    if (inv.phone or "").strip():
        db.add(
            NotificationOutbox(
                user_id=user_id,
                channel="sms",
                recipient=inv.phone.strip(),
                subject="",
                body=body[:1200],
                kind="interviewer_eval_remind_sms",
                scheduled_at=now,
                correlation_key=f"{key}:sms",
            )
        )
        n_s = 1
    return n_e, n_s
