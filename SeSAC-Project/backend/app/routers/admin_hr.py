"""관리자 전용 HR API."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps_auth import require_admin
from app.models_hr import NotificationOutbox, User
from app.schemas_hr import UserAdminPatch, UserAdminPatchByEmail, UserAdminPublic
from app.services.outbox_runner import DEAD_PREFIX

router = APIRouter(prefix="/api/hr/admin", tags=["hr-admin"])


def _apply_admin_flag(db: Session, *, admin: User, target: User, new_is_admin: bool) -> User:
    new_is_admin = bool(new_is_admin)
    if target.id == admin.id and not new_is_admin:
        raise HTTPException(status_code=400, detail="본인의 관리자 권한은 이 API로 해제할 수 없습니다.")
    if target.is_admin and not new_is_admin:
        cnt = db.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True))) or 0
        if int(cnt) <= 1:
            raise HTTPException(
                status_code=400,
                detail="관리자가 한 명뿐이라 해당 계정의 관리자 권한을 해제할 수 없습니다.",
            )
    target.is_admin = new_is_admin
    db.commit()
    db.refresh(target)
    return target


def _user_to_public(u: User) -> UserAdminPublic:
    return UserAdminPublic(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        is_admin=u.is_admin,
        created_at=u.created_at,
    )


@router.get("/users", response_model=list[UserAdminPublic])
def list_users(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    rows = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return [_user_to_public(u) for u in rows]


@router.patch("/users/by-email", response_model=UserAdminPublic)
def patch_user_admin_by_email(
    body: UserAdminPatchByEmail,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """이메일로 특정 사용자 관리자 권한 부여·해지."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    email = body.email.strip().lower()
    target = db.scalars(select(User).where(User.email == email)).first()
    if not target:
        raise HTTPException(status_code=404, detail="해당 이메일의 사용자를 찾을 수 없습니다.")
    _apply_admin_flag(db, admin=admin, target=target, new_is_admin=body.is_admin)
    return _user_to_public(target)


@router.patch("/users/{user_id}", response_model=UserAdminPublic)
def patch_user_admin_flag(
    user_id: UUID,
    body: UserAdminPatch,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    _apply_admin_flag(db, admin=admin, target=target, new_is_admin=body.is_admin)
    return _user_to_public(target)


@router.get("/notifications/summary")
def notifications_summary(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    now = datetime.now(UTC)
    pending_due = db.scalar(
        select(func.count())
        .select_from(NotificationOutbox)
        .where(NotificationOutbox.sent_at.is_(None), NotificationOutbox.scheduled_at <= now)
    ) or 0
    pending_future = db.scalar(
        select(func.count())
        .select_from(NotificationOutbox)
        .where(NotificationOutbox.sent_at.is_(None), NotificationOutbox.scheduled_at > now)
    ) or 0
    dead = db.scalar(
        select(func.count())
        .select_from(NotificationOutbox)
        .where(
            NotificationOutbox.sent_at.is_not(None),
            NotificationOutbox.last_error.isnot(None),
            NotificationOutbox.last_error.startswith(DEAD_PREFIX),
        )
    ) or 0
    sent_ok = db.scalar(
        select(func.count())
        .select_from(NotificationOutbox)
        .where(
            NotificationOutbox.sent_at.is_not(None),
            or_(
                NotificationOutbox.last_error.is_(None),
                ~NotificationOutbox.last_error.startswith(DEAD_PREFIX),
            ),
        )
    ) or 0
    return {
        "pending_due": int(pending_due),
        "pending_scheduled_future": int(pending_future),
        "dead_letter": int(dead),
        "sent_or_skipped": int(sent_ok),
    }


@router.get("/notifications/recent-failures", response_model=list[dict])
def recent_dead_notifications(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session | None, Depends(get_db)],
    limit: int = 30,
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    stmt = (
        select(NotificationOutbox)
        .where(
            NotificationOutbox.sent_at.is_not(None),
            NotificationOutbox.last_error.isnot(None),
            NotificationOutbox.last_error.startswith(DEAD_PREFIX),
        )
        .order_by(NotificationOutbox.sent_at.desc())
        .limit(min(limit, 200))
    )
    rows = db.scalars(stmt).all()
    return [
        {
            "id": str(r.id),
            "channel": r.channel,
            "recipient": r.recipient,
            "kind": r.kind,
            "attempt_count": r.attempt_count,
            "last_error": r.last_error[:500],
            "sent_at": r.sent_at.isoformat() if r.sent_at else None,
        }
        for r in rows
    ]


@router.post("/notifications/{notification_id}/retry")
def retry_notification(
    notification_id: UUID,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """전송 포기(dead letter)된 건을 다시 큐에 넣습니다."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    row = db.get(NotificationOutbox, notification_id)
    if not row:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
    if not (row.last_error or "").startswith(DEAD_PREFIX):
        raise HTTPException(status_code=400, detail="전송 포기 처리된 알림만 재시도할 수 있습니다.")
    row.sent_at = None
    row.attempt_count = 0
    row.scheduled_at = datetime.now(UTC)
    row.last_error = ""
    db.commit()
    return {"ok": True, "id": str(notification_id)}
