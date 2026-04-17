from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import Annotated
from fastapi import Depends

from app.database import get_db
from app.models_hr import ApplicationFilterItem, StageConfirmToken
from app.services.hr_recruitment_stages import normalize_application_stage
from app.schemas_hr import StageAttendanceRequest, StageConfirmResult, StageConfirmView

router = APIRouter(prefix="/api/public/confirm", tags=["public-confirm"])


@router.get("/{token}", response_model=StageConfirmView)
def get_confirm_view(
    token: str,
    db: Annotated[Session | None, Depends(get_db)],
):
    """후보자 일정 확인 링크 — 인증 불필요."""
    if db is None:
        raise HTTPException(503, "SERVICE_UNAVAILABLE")
    row = db.scalars(
        select(StageConfirmToken).where(StageConfirmToken.token == token)
    ).first()
    if not row:
        raise HTTPException(404, "유효하지 않은 링크입니다.")

    item = db.get(ApplicationFilterItem, row.item_id)
    candidate_name = (item.candidate_name or "지원자") if item else "지원자"

    return StageConfirmView(
        token=token,
        candidate_name=candidate_name,
        stage_label=row.stage_label,
        scheduled_at=row.scheduled_at,
        location=row.location,
        note=row.note,
        schedule_pick_url=row.schedule_pick_url or "",
        confirmed_at=row.confirmed_at,
        already_confirmed=row.confirmed_at is not None,
        attendance=row.attendance,
    )


@router.post("/{token}", response_model=StageConfirmResult)
def confirm_stage(
    token: str,
    body: StageAttendanceRequest,
    db: Annotated[Session | None, Depends(get_db)],
):
    """후보자 참석 여부 응답 — 인증 불필요."""
    if db is None:
        raise HTTPException(503, "SERVICE_UNAVAILABLE")
    row = db.scalars(
        select(StageConfirmToken).where(StageConfirmToken.token == token)
    ).first()
    if not row:
        raise HTTPException(404, "유효하지 않은 링크입니다.")

    now = datetime.now(UTC)

    # 이미 응답한 경우 재응답 불가 (한 번만 허용)
    if row.attendance is not None:
        raise HTTPException(409, "이미 응답하셨습니다.")

    row.attendance = body.attendance
    row.confirmed_at = now

    item = db.get(ApplicationFilterItem, row.item_id)
    if item and body.attendance == "accepted":
        item.schedule_confirmed_at = now
        if (row.next_stage_key or "").strip():
            item.stage = normalize_application_stage(row.next_stage_key)

    db.commit()
    return StageConfirmResult(ok=True, confirmed_at=row.confirmed_at, attendance=row.attendance)
