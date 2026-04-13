from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models_hr import NotificationOutbox
from app.services.notifications import send_email_sync, send_sms_twilio

DEAD_PREFIX = "[전송포기]"


def _next_backoff_seconds(settings: Settings, failed_attempts: int) -> int:
    """failed_attempts: 방금 실패 처리 후 값(1부터)."""
    base = max(5, int(settings.notification_retry_base_seconds))
    cap = max(base, int(settings.notification_retry_max_seconds))
    exp = min(cap, base * (2 ** max(0, failed_attempts - 1)))
    return int(exp)


def process_due_outbox(db: Session, settings: Settings, *, limit: int = 50) -> dict[str, int]:
    now = datetime.now(UTC)
    stmt = (
        select(NotificationOutbox)
        .where(NotificationOutbox.sent_at.is_(None), NotificationOutbox.scheduled_at <= now)
        .order_by(NotificationOutbox.scheduled_at.asc())
        .limit(limit)
    )
    rows = list(db.scalars(stmt).all())
    sent = 0
    rescheduled = 0
    dead = 0
    for row in rows:
        if row.channel == "email":
            ok, err = send_email_sync(settings, to_addr=row.recipient, subject=row.subject, body=row.body)
        elif row.channel == "sms":
            ok, err = send_sms_twilio(settings, to_phone=row.recipient, body=row.body)
        else:
            row.sent_at = datetime.now(UTC)
            row.last_error = f"unknown channel: {row.channel}"
            sent += 1
            continue

        if ok:
            row.sent_at = datetime.now(UTC)
            row.last_error = err or ""
            sent += 1
            continue

        row.last_error = err or "send failed"
        row.attempt_count = int(row.attempt_count or 0) + 1
        max_att = max(1, int(settings.notification_max_send_attempts))
        if row.attempt_count >= max_att:
            row.sent_at = datetime.now(UTC)
            row.last_error = f"{DEAD_PREFIX} {row.last_error}"[:8000]
            dead += 1
        else:
            delay = _next_backoff_seconds(settings, row.attempt_count)
            row.scheduled_at = now + timedelta(seconds=delay)
            rescheduled += 1

    db.commit()
    return {"processed": len(rows), "sent": sent, "rescheduled": rescheduled, "dead": dead}
