from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps_auth import get_current_user, get_user_by_email
from app.models_hr import User
from app.schemas_hr import DeleteAccountRequest, LoginRequest, RegisterRequest, TokenResponse, UserPublic
from app.services.hr_job_roles_rag import remove_user_job_roles_rag_file
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
    return TokenResponse(
        access_token=token,
        user=UserPublic(id=user.id, email=user.email, full_name=user.full_name, is_admin=user.is_admin),
    )


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
    return TokenResponse(
        access_token=token,
        user=UserPublic(id=user.id, email=user.email, full_name=user.full_name, is_admin=user.is_admin),
    )


@router.post("/logout")
def logout():
    """JWT는 서버 세션이 없으므로 클라이언트에서 토큰 폐기만 하면 됩니다."""
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
def me(user: Annotated[User, Depends(get_current_user)]):
    return UserPublic(id=user.id, email=user.email, full_name=user.full_name, is_admin=user.is_admin)


@router.post("/delete-account")
def delete_account(
    body: DeleteAccountRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """비밀번호 확인 후 계정 및 CASCADE 연관 HR 데이터 삭제. 유일한 관리자는 탈퇴 불가."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="비밀번호가 올바르지 않습니다.")

    if user.is_admin:
        admin_cnt = int(
            db.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True))) or 0
        )
        if admin_cnt <= 1:
            raise HTTPException(
                status_code=400,
                detail="유일한 관리자 계정은 탈퇴할 수 없습니다. 다른 사용자에게 관리자 권한을 넘긴 뒤 다시 시도하세요.",
            )

    settings = get_settings()
    try:
        remove_user_job_roles_rag_file(settings, user.id)
    except OSError:
        pass

    db.delete(user)
    db.commit()
    return {"ok": True, "deleted": True}
