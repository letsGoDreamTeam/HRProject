from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.config import get_settings
from app.database import get_db
from app.deps_auth import get_current_user
from app.models_hr import (
    ApplicationFilterItem,
    InterviewBooking,
    InterviewCandidate,
    InterviewEvaluationSubmission,
    InterviewInterviewer,
    InterviewRound,
    InterviewSlot,
    User,
)
from app.schemas_hr import (
    CandidateBookingRowOut,
    EvaluationAggregateOut,
    EvaluationSetupOut,
    EvaluationsStatusOut,
    EvalCandidateStatusOut,
    EvalInterviewerRowOut,
    EvaluationCriteriaSetup,
    EvalSubmissionSummaryOut,
    InterviewRoundCreate,
    InterviewRoundPatch,
    RemindPendingOut,
    RoundBookingStatusOut,
    SlotBookingSummaryOut,
)
from app.services.scheduling_notifications import (
    enqueue_candidate_pick_reminder,
    enqueue_interviewer_evaluation_reminder,
    public_evaluation_url,
    public_schedule_pick_url,
)

router = APIRouter(prefix="/api/hr/schedules", tags=["hr-schedules"])


def _validated_application_item_id(db: Session, user_id: UUID, item_id: UUID | None) -> UUID | None:
    if item_id is None:
        return None
    item = db.get(ApplicationFilterItem, item_id)
    if item is None:
        raise HTTPException(status_code=400, detail="연결한 지원서 항목을 찾을 수 없습니다.")
    if item.batch.user_id != user_id:
        raise HTTPException(status_code=400, detail="지원서 항목이 이 계정에 속하지 않습니다.")
    return item_id


def _slot_remaining(db: Session, slot_id: UUID, capacity: int) -> int:
    used = db.scalar(select(func.count()).select_from(InterviewBooking).where(InterviewBooking.slot_id == slot_id)) or 0
    return max(0, int(capacity) - int(used))


def _round_has_bookings(db: Session, round_id: UUID) -> bool:
    q = (
        select(func.count())
        .select_from(InterviewBooking)
        .join(InterviewSlot, InterviewSlot.id == InterviewBooking.slot_id)
        .where(InterviewSlot.round_id == round_id)
    )
    return (db.scalar(q) or 0) > 0


def _normalize_eval_criteria(criteria: list[str]) -> list[str]:
    out: list[str] = []
    for x in criteria[:12]:
        s = (x or "").strip()
        if s and len(s) <= 80:
            out.append(s)
    return out


def _normalize_interviewee_per_slot(value: str) -> str:
    v = (value or "single").lower().strip()
    return v if v in ("single", "multiple") else "single"


def _normalize_interview_phase(value: str) -> str:
    v = (value or "general").lower().strip()
    return v if v in ("general", "first_interview", "second_interview") else "general"


def _effective_slot_capacity(per_slot: str, requested: int) -> int:
    if _normalize_interviewee_per_slot(per_slot) == "single":
        return 1
    return max(1, min(50, int(requested)))


def _interview_round_public_dict(db: Session, r: InterviewRound) -> dict[str, Any]:
    per = getattr(r, "interviewee_per_slot", None) or "single"
    per = _normalize_interviewee_per_slot(str(per))
    slots = list(r.slots)
    total_cap = sum(int(s.capacity or 1) for s in slots)
    cand_n = len(r.candidates)
    return {
        "id": str(r.id),
        "title": r.title,
        "department": getattr(r, "department", "") or "",
        "job_title": getattr(r, "job_title", "") or "",
        "stage_key": getattr(r, "stage_key", "") or "",
        "timezone": r.timezone,
        "hr_notify_email": r.hr_notify_email,
        "interviewee_per_slot": per,
        "interview_phase": str(getattr(r, "interview_phase", None) or "general"),
        "slot_total_capacity": total_cap,
        "candidate_count": cand_n,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "has_bookings": _round_has_bookings(db, r.id),
        "slots": [
            {
                "id": str(s.id),
                "start_at": s.start_at.isoformat(),
                "end_at": s.end_at.isoformat(),
                "capacity": s.capacity,
                "remaining": _slot_remaining(db, s.id, s.capacity),
            }
            for s in sorted(slots, key=lambda x: x.start_at)
        ],
        "candidates": [
            {
                "id": str(c.id),
                "name": c.name,
                "email": c.email,
                "phone": c.phone,
                "applied_position": getattr(c, "applied_position", "") or "",
                "application_filter_item_id": str(c.application_filter_item_id)
                if getattr(c, "application_filter_item_id", None)
                else None,
                "pick_url_path": f"/schedule/pick/{c.access_token}",
                "booked_slot_id": str(c.booking.slot_id)
                if getattr(c, "booking", None) is not None
                else None,
                "declined": getattr(c, "schedule_declined_at", None) is not None,
            }
            for c in r.candidates
        ],
        "interviewers": [{"id": str(i.id), "name": i.name, "email": i.email, "phone": i.phone} for i in r.interviewers],
    }


@router.post("")
def create_schedule(
    body: InterviewRoundCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    per = _normalize_interviewee_per_slot(str(body.interviewee_per_slot))
    caps = [_effective_slot_capacity(per, s.capacity) for s in body.slots]
    total_cap = sum(caps)
    if len(body.candidates) > total_cap:
        raise HTTPException(
            status_code=400,
            detail=(
                f"슬롯 정원 합({total_cap}명)보다 지원자({len(body.candidates)}명)가 많습니다. "
                "슬롯을 늘리거나 정원·면접 방식(1:1/다인원)을 조정하세요."
            ),
        )
    rnd = InterviewRound(
        user_id=user.id,
        title=body.title.strip() or "면접 일정",
        department=(body.department or "").strip()[:400],
        job_title=(body.job_title or "").strip()[:400],
        stage_key=(body.stage_key or "").strip()[:32],
        timezone=body.timezone.strip() or "Asia/Seoul",
        hr_notify_email=(body.hr_notify_email or "").strip(),
        interviewee_per_slot=per,
        interview_phase=_normalize_interview_phase(str(body.interview_phase)),
    )
    db.add(rnd)
    db.flush()
    for s, cap in zip(body.slots, caps, strict=True):
        if s.end_at <= s.start_at:
            raise HTTPException(status_code=400, detail="슬롯 종료 시각이 시작보다 커야 합니다.")
        db.add(
            InterviewSlot(
                round_id=rnd.id,
                start_at=s.start_at,
                end_at=s.end_at,
                capacity=cap,
            )
        )
    for c in body.candidates:
        aid = _validated_application_item_id(db, user.id, c.application_filter_item_id)
        db.add(
            InterviewCandidate(
                round_id=rnd.id,
                name=c.name.strip(),
                email=(c.email or "").strip(),
                phone=(c.phone or "").strip(),
                applied_position=(c.applied_position or "").strip()[:400],
                application_filter_item_id=aid,
            )
        )
    for inv in body.interviewers:
        db.add(
            InterviewInterviewer(
                round_id=rnd.id,
                name=inv.name.strip(),
                email=(inv.email or "").strip(),
                phone=(inv.phone or "").strip(),
            )
        )
    db.commit()
    db.refresh(rnd)
    return {"id": str(rnd.id)}


@router.get("")
def list_schedules(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session | None, Depends(get_db)]):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    stmt = (
        select(InterviewRound)
        .where(InterviewRound.user_id == user.id)
        .options(
            selectinload(InterviewRound.slots),
            selectinload(InterviewRound.candidates).joinedload(InterviewCandidate.booking),
            selectinload(InterviewRound.interviewers),
        )
        .order_by(InterviewRound.created_at.desc())
    )
    rows = db.scalars(stmt).all()
    return [_interview_round_public_dict(db, r) for r in rows]


@router.get("/{round_id}/booking-status", response_model=RoundBookingStatusOut)
def booking_status(
    round_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """지원자별 확정/미선택·슬롯별 예약 수(일정 조율·미확인 추적용)."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    settings = get_settings()
    stmt = (
        select(InterviewRound)
        .where(InterviewRound.id == round_id, InterviewRound.user_id == user.id)
        .options(
            selectinload(InterviewRound.slots),
            selectinload(InterviewRound.candidates)
            .joinedload(InterviewCandidate.booking)
            .joinedload(InterviewBooking.slot),
        )
    )
    r = db.scalars(stmt).first()
    if not r:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")

    slots_out: list[SlotBookingSummaryOut] = []
    for s in sorted(r.slots, key=lambda x: x.start_at):
        booked = (
            int(
                db.scalar(
                    select(func.count()).select_from(InterviewBooking).where(InterviewBooking.slot_id == s.id)
                )
                or 0
            )
        )
        cap = int(s.capacity or 1)
        slots_out.append(
            SlotBookingSummaryOut(
                slot_id=s.id,
                start_at=s.start_at,
                end_at=s.end_at,
                capacity=cap,
                booked=booked,
                remaining=max(0, cap - booked),
            )
        )

    rows_c: list[CandidateBookingRowOut] = []
    for cand in sorted(r.candidates, key=lambda c: (c.name or "").lower()):
        b = cand.booking
        slot = b.slot if b else None
        path = f"/schedule/pick/{cand.access_token}"
        abs_url = public_schedule_pick_url(settings, cand.access_token)
        declined_at = getattr(cand, "schedule_declined_at", None)
        if declined_at:
            rows_c.append(
                CandidateBookingRowOut(
                    id=cand.id,
                    name=cand.name,
                    email=cand.email or "",
                    phone=cand.phone or "",
                    status="declined",
                    slot_id=None,
                    slot_start_at=None,
                    slot_end_at=None,
                    pick_url_path=path,
                    pick_url_absolute=abs_url,
                )
            )
        elif slot:
            rows_c.append(
                CandidateBookingRowOut(
                    id=cand.id,
                    name=cand.name,
                    email=cand.email or "",
                    phone=cand.phone or "",
                    status="confirmed",
                    slot_id=slot.id,
                    slot_start_at=slot.start_at,
                    slot_end_at=slot.end_at,
                    pick_url_path=path,
                    pick_url_absolute=abs_url,
                )
            )
        else:
            rows_c.append(
                CandidateBookingRowOut(
                    id=cand.id,
                    name=cand.name,
                    email=cand.email or "",
                    phone=cand.phone or "",
                    status="pending",
                    slot_id=None,
                    slot_start_at=None,
                    slot_end_at=None,
                    pick_url_path=path,
                    pick_url_absolute=abs_url,
                )
            )

    conf = sum(1 for x in rows_c if x.status == "confirmed")
    decl = sum(1 for x in rows_c if x.status == "declined")
    pend = len(rows_c) - conf - decl
    return RoundBookingStatusOut(
        round_id=r.id,
        title=r.title,
        timezone=r.timezone,
        confirmed_count=conf,
        pending_count=pend,
        declined_count=decl,
        candidates=rows_c,
        slots=slots_out,
    )


@router.post("/{round_id}/remind-pending", response_model=RemindPendingOut)
def remind_pending_candidates(
    round_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """아직 시간을 고르지 않은 지원자에게 선택 링크를 메일/SMS로 다시 넣습니다(발송 큐)."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    settings = get_settings()
    stmt = (
        select(InterviewRound)
        .where(InterviewRound.id == round_id, InterviewRound.user_id == user.id)
        .options(
            selectinload(InterviewRound.candidates).joinedload(InterviewCandidate.booking),
        )
    )
    r = db.scalars(stmt).first()
    if not r:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")

    pending = [
        c
        for c in r.candidates
        if not c.booking and not getattr(c, "schedule_declined_at", None)
    ]
    emails = 0
    sms = 0
    skipped = 0
    for cand in pending:
        if not (cand.email or "").strip() and not (cand.phone or "").strip():
            skipped += 1
            continue
        e, s = enqueue_candidate_pick_reminder(
            db,
            settings=settings,
            user_id=user.id,
            round_title=r.title,
            cand=cand,
        )
        emails += e
        sms += s
    db.commit()
    return RemindPendingOut(emails_queued=emails, sms_queued=sms, skipped_no_contact=skipped)


@router.post("/{round_id}/evaluations/setup", response_model=EvaluationSetupOut)
def setup_evaluations(
    round_id: UUID,
    body: EvaluationCriteriaSetup,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """지원자×면접관별 평가표 행 생성·미제출 행의 평가 항목만 갱신(지원자 이름 등은 후보 행에 연결)."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    labels = _normalize_eval_criteria(body.criteria)
    if not labels:
        raise HTTPException(status_code=400, detail="평가 항목을 한 개 이상 입력하세요.")
    stmt = (
        select(InterviewRound)
        .where(InterviewRound.id == round_id, InterviewRound.user_id == user.id)
        .options(
            selectinload(InterviewRound.candidates),
            selectinload(InterviewRound.interviewers),
        )
    )
    r = db.scalars(stmt).first()
    if not r:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    if not r.interviewers:
        raise HTTPException(status_code=400, detail="면접관을 한 명 이상 등록한 뒤 평가표를 생성하세요.")
    if not r.candidates:
        raise HTTPException(status_code=400, detail="지원자가 없습니다.")
    created = 0
    updated = 0
    for cand in r.candidates:
        for inv in r.interviewers:
            sub = db.scalars(
                select(InterviewEvaluationSubmission).where(
                    InterviewEvaluationSubmission.round_id == r.id,
                    InterviewEvaluationSubmission.candidate_id == cand.id,
                    InterviewEvaluationSubmission.interviewer_id == inv.id,
                )
            ).first()
            if sub is None:
                db.add(
                    InterviewEvaluationSubmission(
                        round_id=r.id,
                        candidate_id=cand.id,
                        interviewer_id=inv.id,
                        criteria_labels=list(labels),
                    )
                )
                created += 1
            elif sub.submitted_at is None:
                sub.criteria_labels = list(labels)
                updated += 1
    db.commit()
    return EvaluationSetupOut(created_pairs=created, updated_pending_criteria=updated, criteria=labels)


@router.get("/{round_id}/evaluations/status", response_model=EvaluationsStatusOut)
def evaluations_status(
    round_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """지원자별·면접관별 제출 여부 및 평가 링크(HR 복사용)."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    settings = get_settings()
    stmt = (
        select(InterviewRound)
        .where(InterviewRound.id == round_id, InterviewRound.user_id == user.id)
        .options(
            selectinload(InterviewRound.candidates),
            selectinload(InterviewRound.interviewers),
            selectinload(InterviewRound.evaluation_submissions),
        )
    )
    r = db.scalars(stmt).first()
    if not r:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    subs_by_key: dict[tuple[UUID, UUID], InterviewEvaluationSubmission] = {}
    for s in r.evaluation_submissions or []:
        subs_by_key[(s.candidate_id, s.interviewer_id)] = s
    cand_rows: list[EvalCandidateStatusOut] = []
    for cand in sorted(r.candidates, key=lambda c: (c.name or "").lower()):
        inv_rows: list[EvalInterviewerRowOut] = []
        for inv in sorted(r.interviewers, key=lambda i: (i.name or "").lower()):
            sub = subs_by_key.get((cand.id, inv.id))
            if sub is None:
                inv_rows.append(
                    EvalInterviewerRowOut(
                        interviewer_id=inv.id,
                        interviewer_name=inv.name,
                        status="not_issued",
                    )
                )
            elif sub.submitted_at is None:
                path = f"/evaluate/{sub.access_token}"
                inv_rows.append(
                    EvalInterviewerRowOut(
                        interviewer_id=inv.id,
                        interviewer_name=inv.name,
                        status="pending",
                        submitted_at=None,
                        eval_url_path=path,
                        eval_url_absolute=public_evaluation_url(settings, sub.access_token),
                    )
                )
            else:
                path = f"/evaluate/{sub.access_token}"
                inv_rows.append(
                    EvalInterviewerRowOut(
                        interviewer_id=inv.id,
                        interviewer_name=inv.name,
                        status="submitted",
                        submitted_at=sub.submitted_at,
                        eval_url_path=path,
                        eval_url_absolute=public_evaluation_url(settings, sub.access_token),
                    )
                )
        cand_rows.append(
            EvalCandidateStatusOut(candidate_id=cand.id, candidate_name=cand.name, interviewers=inv_rows)
        )
    return EvaluationsStatusOut(round_id=r.id, title=r.title, candidates=cand_rows)


@router.get(
    "/{round_id}/evaluations/aggregate/{candidate_id}",
    response_model=EvaluationAggregateOut,
)
def evaluations_aggregate(
    round_id: UUID,
    candidate_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """한 지원자에 대한 제출된 평가만 모아 의사결정용으로 표시."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    stmt = (
        select(InterviewRound)
        .where(InterviewRound.id == round_id, InterviewRound.user_id == user.id)
        .options(selectinload(InterviewRound.candidates))
    )
    r = db.scalars(stmt).first()
    if not r:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    cand = next((c for c in r.candidates if c.id == candidate_id), None)
    if not cand:
        raise HTTPException(status_code=404, detail="지원자를 찾을 수 없습니다.")
    sub_stmt = (
        select(InterviewEvaluationSubmission)
        .where(
            InterviewEvaluationSubmission.round_id == round_id,
            InterviewEvaluationSubmission.candidate_id == candidate_id,
            InterviewEvaluationSubmission.submitted_at.isnot(None),
        )
        .options(selectinload(InterviewEvaluationSubmission.interviewer))
    )
    subs = db.scalars(sub_stmt).all()
    criteria: list[str] = []
    if subs:
        raw = subs[0].criteria_labels
        if isinstance(raw, list):
            criteria = [str(x) for x in raw if str(x).strip()]
    summaries: list[EvalSubmissionSummaryOut] = []
    for sub in subs:
        inv = sub.interviewer
        sc: dict[str, int] = {}
        if isinstance(sub.scores, dict):
            for k, v in sub.scores.items():
                if isinstance(v, (int, float)):
                    sc[str(k)] = int(v)
        assert sub.submitted_at is not None
        cc: dict[str, str] = {}
        raw_cc = sub.criteria_comments
        if isinstance(raw_cc, dict):
            cc = {str(k): str(v)[:4000] for k, v in raw_cc.items() if str(k).strip()}
        summaries.append(
            EvalSubmissionSummaryOut(
                interviewer_name=inv.name if inv else "",
                submitted_at=sub.submitted_at,
                scores=sc,
                criteria_comments=cc,
                final_summary_line=sub.final_summary_line or "",
                recommendation=sub.recommendation or "",
                overall_comment=sub.overall_comment or "",
            )
        )
    return EvaluationAggregateOut(
        candidate_id=cand.id,
        candidate_name=cand.name,
        criteria=criteria,
        submissions=summaries,
    )


@router.post("/{round_id}/evaluations/remind-pending", response_model=RemindPendingOut)
def remind_pending_evaluations(
    round_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """제출하지 않은 면접관에게 평가 링크를 메일/SMS 큐에 넣습니다."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    settings = get_settings()
    stmt = (
        select(InterviewRound)
        .where(InterviewRound.id == round_id, InterviewRound.user_id == user.id)
        .options(selectinload(InterviewRound.candidates))
    )
    r = db.scalars(stmt).first()
    if not r:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    pend_stmt = (
        select(InterviewEvaluationSubmission)
        .where(
            InterviewEvaluationSubmission.round_id == round_id,
            InterviewEvaluationSubmission.submitted_at.is_(None),
        )
        .options(
            selectinload(InterviewEvaluationSubmission.interviewer),
            selectinload(InterviewEvaluationSubmission.candidate),
        )
    )
    pending = db.scalars(pend_stmt).all()
    emails = 0
    sms = 0
    skipped = 0
    for sub in pending:
        inv = sub.interviewer
        cand = sub.candidate
        if inv is None or cand is None:
            skipped += 1
            continue
        if not (inv.email or "").strip() and not (inv.phone or "").strip():
            skipped += 1
            continue
        e, s = enqueue_interviewer_evaluation_reminder(
            db,
            settings=settings,
            user_id=user.id,
            round_title=r.title,
            candidate_name=cand.name,
            inv=inv,
            submission=sub,
        )
        emails += e
        sms += s
    db.commit()
    return RemindPendingOut(emails_queued=emails, sms_queued=sms, skipped_no_contact=skipped)


@router.get("/{round_id}")
def get_schedule(
    round_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    stmt = (
        select(InterviewRound)
        .where(InterviewRound.id == round_id, InterviewRound.user_id == user.id)
        .options(
            selectinload(InterviewRound.slots),
            selectinload(InterviewRound.candidates).joinedload(InterviewCandidate.booking),
            selectinload(InterviewRound.interviewers),
        )
    )
    r = db.scalars(stmt).first()
    if not r:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")

    base = _interview_round_public_dict(db, r)
    return base


@router.patch("/{round_id}")
def patch_schedule(
    round_id: UUID,
    body: InterviewRoundPatch,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    stmt = (
        select(InterviewRound)
        .where(InterviewRound.id == round_id, InterviewRound.user_id == user.id)
        .options(
            selectinload(InterviewRound.slots),
            selectinload(InterviewRound.candidates),
            selectinload(InterviewRound.interviewers),
        )
    )
    r = db.scalars(stmt).first()
    if not r:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")

    if (
        body.title is None
        and body.department is None
        and body.job_title is None
        and body.stage_key is None
        and body.timezone is None
        and body.hr_notify_email is None
        and body.interview_phase is None
        and body.interviewee_per_slot is None
        and body.slots is None
        and body.candidates is None
        and body.interviewers is None
    ):
        raise HTTPException(status_code=400, detail="수정할 필드를 하나 이상 보내세요.")

    if body.title is not None:
        r.title = body.title.strip() or "면접 일정"
    if body.department is not None:
        r.department = body.department.strip()[:400]
    if body.job_title is not None:
        r.job_title = body.job_title.strip()[:400]
    if body.stage_key is not None:
        r.stage_key = body.stage_key.strip()[:32]
    if body.timezone is not None:
        r.timezone = body.timezone.strip() or "Asia/Seoul"
    if body.hr_notify_email is not None:
        r.hr_notify_email = body.hr_notify_email.strip()
    if body.interview_phase is not None:
        r.interview_phase = _normalize_interview_phase(str(body.interview_phase))

    structural = body.slots is not None or body.candidates is not None or body.interviewers is not None

    if body.interviewee_per_slot is not None and not structural:
        nm = _normalize_interviewee_per_slot(str(body.interviewee_per_slot))
        if nm == "single":
            bad = (
                db.scalar(
                    select(func.count())
                    .select_from(InterviewSlot)
                    .where(InterviewSlot.round_id == r.id, InterviewSlot.capacity > 1)
                )
                or 0
            )
            if int(bad) > 0:
                raise HTTPException(
                    status_code=400,
                    detail="1:1(슬롯당 1명)으로 바꾸려면 모든 슬롯 정원이 1이어야 합니다. 예약이 없다면 일정 전체 수정으로 슬롯을 다시 저장하세요.",
                )
            total_cap = int(
                db.scalar(
                    select(func.coalesce(func.sum(InterviewSlot.capacity), 0))
                    .select_from(InterviewSlot)
                    .where(InterviewSlot.round_id == r.id)
                )
                or 0
            )
            n_cand = (
                int(
                    db.scalar(
                        select(func.count()).select_from(InterviewCandidate).where(InterviewCandidate.round_id == r.id)
                    )
                    or 0
                )
            )
            if n_cand > total_cap:
                raise HTTPException(
                    status_code=400,
                    detail=f"1:1 모드에서는 슬롯 정원 합({total_cap}명) 이상으로 지원자({n_cand}명)를 둘 수 없습니다. 슬롯을 늘리거나 다인원 모드로 두세요.",
                )
        r.interviewee_per_slot = nm

    if structural:
        if body.slots is None or body.candidates is None or body.interviewers is None:
            raise HTTPException(
                status_code=400,
                detail="슬롯·지원자·면접관을 바꿀 때는 slots, candidates, interviewers 를 모두 포함해야 합니다.",
            )
        if _round_has_bookings(db, r.id):
            raise HTTPException(
                status_code=409,
                detail="이미 예약이 있어 슬롯·지원자·면접관을 바꿀 수 없습니다. 제목·타임존·담당 메일만 수정할 수 있습니다.",
            )
        if not body.slots:
            raise HTTPException(status_code=400, detail="슬롯은 1개 이상이어야 합니다.")
        if not body.candidates:
            raise HTTPException(status_code=400, detail="지원자는 1명 이상이어야 합니다.")
        for s in body.slots:
            if s.end_at <= s.start_at:
                raise HTTPException(status_code=400, detail="슬롯 종료 시각이 시작보다 커야 합니다.")
        new_mode = _normalize_interviewee_per_slot(
            str(body.interviewee_per_slot)
            if body.interviewee_per_slot is not None
            else str(getattr(r, "interviewee_per_slot", None) or "single")
        )
        caps = [_effective_slot_capacity(new_mode, s.capacity) for s in body.slots]
        if len(body.candidates) > sum(caps):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"슬롯 정원 합({sum(caps)}명)보다 지원자({len(body.candidates)}명)가 많습니다. "
                    "슬롯·정원·면접 방식을 조정하세요."
                ),
            )
        db.execute(delete(InterviewSlot).where(InterviewSlot.round_id == r.id))
        db.execute(delete(InterviewCandidate).where(InterviewCandidate.round_id == r.id))
        db.execute(delete(InterviewInterviewer).where(InterviewInterviewer.round_id == r.id))
        db.flush()
        r.interviewee_per_slot = new_mode
        for s, cap in zip(body.slots, caps, strict=True):
            db.add(
                InterviewSlot(
                    round_id=r.id,
                    start_at=s.start_at,
                    end_at=s.end_at,
                    capacity=cap,
                )
            )
        for c in body.candidates:
            aid = _validated_application_item_id(db, user.id, c.application_filter_item_id)
            db.add(
                InterviewCandidate(
                    round_id=r.id,
                    name=c.name.strip(),
                    email=(c.email or "").strip(),
                    phone=(c.phone or "").strip(),
                    applied_position=(c.applied_position or "").strip()[:400],
                    application_filter_item_id=aid,
                )
            )
        for inv in body.interviewers:
            db.add(
                InterviewInterviewer(
                    round_id=r.id,
                    name=inv.name.strip(),
                    email=(inv.email or "").strip(),
                    phone=(inv.phone or "").strip(),
                )
            )
    db.commit()
    db.refresh(r)
    return {"ok": True, "id": str(r.id)}


@router.delete("/{round_id}")
def delete_schedule(
    round_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    r = db.get(InterviewRound, round_id)
    if not r or r.user_id != user.id:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    db.delete(r)
    db.commit()
    return {"ok": True, "deleted_id": str(round_id)}
