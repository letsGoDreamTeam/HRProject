"""면접 링크 응답 시 지원서(파이프라인) 상태와 면접 후보 행 동기화."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.models_hr import ApplicationFilterItem, InterviewCandidate, InterviewRound
from app.services.hr_recruitment_stages import TERMINAL_REJECTED, normalize_application_stage


def _linked_item(db: Session, cand: InterviewCandidate, owner_user_id: UUID) -> ApplicationFilterItem | None:
    iid = getattr(cand, "application_filter_item_id", None)
    if iid is None:
        return None
    item = db.get(ApplicationFilterItem, iid)
    if item is None:
        return None
    if item.batch.user_id != owner_user_id:
        return None
    return item


def on_slot_reserved(db: Session, *, cand: InterviewCandidate, rnd: InterviewRound) -> None:
    """슬롯 예약·변경 확정 시: 불참 플래그 해제, 연결된 지원서에 일정 확정·단계 반영."""
    now = datetime.now(UTC)
    cand.schedule_declined_at = None
    item = _linked_item(db, cand, rnd.user_id)
    if item is None:
        return
    item.schedule_confirmed_at = now
    sk = (rnd.stage_key or "").strip()
    if sk:
        item.stage = normalize_application_stage(sk)


def on_slot_released(db: Session, *, cand: InterviewCandidate, rnd: InterviewRound) -> None:
    """예약 취소(재선택 가능): 일정 확정 시각만 해제. 채용 단계는 자동 되돌리지 않음."""
    item = _linked_item(db, cand, rnd.user_id)
    if item is None:
        return
    item.schedule_confirmed_at = None


def on_interview_declined(db: Session, *, cand: InterviewCandidate, rnd: InterviewRound) -> None:
    """면접 불참 응답: 후보 행에 불참 시각, 연결 지원서는 불합격 처리 및 일정 확정 해제."""
    now = datetime.now(UTC)
    cand.schedule_declined_at = now
    item = _linked_item(db, cand, rnd.user_id)
    if item is None:
        return
    item.schedule_confirmed_at = None
    item.stage = TERMINAL_REJECTED
