"""최고 관리자(권한 부여·해제) 판별. HR_SUPER_ADMIN_EMAILS 비어 있으면 기존처럼 모든 관리자 허용."""

from __future__ import annotations

from app.config import Settings
from app.models_hr import User
from app.schemas_hr import UserPublic


def can_manage_admin_roles(settings: Settings, user: User) -> bool:
    """다른 계정의 is_admin 변경 가능 여부."""
    if not user.is_admin:
        return False
    raw = (settings.hr_super_admin_emails or "").strip()
    if not raw:
        return True
    allowed = {p.strip().lower() for p in raw.split(",") if p.strip()}
    return (user.email or "").strip().lower() in allowed


def user_public(settings: Settings, user: User) -> UserPublic:
    return UserPublic(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_admin=user.is_admin,
        can_manage_admin_roles=can_manage_admin_roles(settings, user),
    )
