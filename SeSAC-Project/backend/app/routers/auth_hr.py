from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps_auth import get_current_user, get_user_by_email
from app.models_hr import User
from app.schemas_hr import LoginRequest, RegisterRequest, TokenResponse, UserPublic
from app.services.hr_admin_access import user_public
from app.services.jwt_tokens import create_access_token
from app.services.passwords import hash_password, verify_password

router = APIRouter(prefix="/api/hr/auth", tags=["hr-auth"])


def _bootstrap_admin_email(settings, email: str) -> bool:
    raw = (settings.bootstrap_admin_emails or "").strip()
    if not raw:
        return False
    parts = {p.strip().lower() for p in raw.split(",") if p.strip()}
    return email.strip().lower() in parts


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Annotated[Session | None, Depends(get_db)]):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    settings = get_settings()
    email = body.email.strip().lower()
    if get_user_by_email(db, email):
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다.")
    is_admin = _bootstrap_admin_email(settings, email)
    user = User(
        email=email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name.strip(),
        is_admin=is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(settings, subject=str(user.id))
    return TokenResponse(access_token=token, user=user_public(settings, user))


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Annotated[Session | None, Depends(get_db)]):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    settings = get_settings()
    email = body.email.strip().lower()
    user = get_user_by_email(db, email)
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
    token = create_access_token(settings, subject=str(user.id))
    return TokenResponse(access_token=token, user=user_public(settings, user))


@router.post("/logout")
def logout():
    """JWT는 서버 세션이 없으므로 클라이언트에서 토큰 폐기만 하면 됩니다."""
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
def me(user: Annotated[User, Depends(get_current_user)]):
    settings = get_settings()
    return user_public(settings, user)
