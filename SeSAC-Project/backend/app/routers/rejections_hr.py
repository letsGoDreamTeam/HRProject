from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps_auth import get_current_user
from app.models_hr import NotificationOutbox, User
from app.schemas_hr import RejectionBulkRequest

router = APIRouter(prefix="/api/hr/rejections", tags=["hr-rejections"])


@router.post("/send")
def send_rejections(
    body: RejectionBulkRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    now = datetime.now(UTC)
    when = now + timedelta(minutes=int(body.schedule_in_minutes))
    n = 0
    for r in body.recipients:
        name = (r.name or "").strip()
        text = body.body
        if name:
            text = f"{name}님,\n\n" + text
        if body.send_email and (r.email or "").strip():
            db.add(
                NotificationOutbox(
                    user_id=user.id,
                    channel="email",
                    recipient=r.email.strip(),
                    subject=body.subject.strip()[:400],
                    body=text,
                    kind="rejection_email",
                    scheduled_at=when,
                )
            )
            n += 1
        if body.send_sms and (r.phone or "").strip():
            db.add(
                NotificationOutbox(
                    user_id=user.id,
                    channel="sms",
                    recipient=r.phone.strip(),
                    subject="",
                    body=text[:1200],
                    kind="rejection_sms",
                    scheduled_at=when,
                )
            )
            n += 1
    db.commit()
    return {"queued": n, "scheduled_at": when.isoformat()}