"""DB 이력(resume 및 자식 행) → `build_resume_prompt_text`용 dict."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ParsingToExcel import (
    K_ADDR,
    K_BIRTH_DATE,
    K_CAREER_CO,
    K_CAREER_PD,
    K_CAREER_ROLE,
    K_CONTACT,
    K_DESIRED_LOCATION,
    K_DESIRED_SALARY,
    K_DISABILITY,
    K_EDUCATION_ROWS,
    K_EMAIL,
    K_EXPERIENCE_ROWS,
    K_FINAL_EDU,
    K_GENDER,
    K_MILITARY_ROWS,
    K_NAME,
    K_ORIGINAL_JOB_ROLE,
    K_QUALIFICATION_ROWS,
    K_STATEMENT_ROWS,
    K_VETERAN_ELIGIBILITY,
)
from app.models.candidate_orm import Candidate
from app.models.education_orm import Education
from app.models.experience_orm import Experience
from app.models.military_orm import Military
from app.models.position_orm import Position
from app.models.qualification_orm import Qualification
from app.models.resume_orm import Resume
from app.models.statement_orm import Statement


def _iso(d: date | None) -> str | None:
    return d.isoformat() if d else None


def _salary_display(v: int | None) -> str:
    return str(v) if v is not None else ""


def load_parsed_like_dict_and_meta(
    session: Session,
    resume_id: int,
) -> tuple[dict[str, Any], int, int, str | None]:
    """
    저장된 resumes·자식 테이블로 파싱 dict 형태 복원.
    반환: (parsed_like, candidate_id, position_id, position_name)
    """
    resume = session.get(Resume, resume_id)
    if resume is None:
        raise ValueError(f"resume_id={resume_id} 없음")

    cand = session.get(Candidate, resume.candidate_id)
    if cand is None:
        raise ValueError("지원자(candidates) 행 없음")

    pos = session.get(Position, resume.position_id)

    edu_rows_db = session.scalars(
        select(Education)
        .where(Education.resume_id == resume_id)
        .order_by(Education.education_id.asc())
    ).all()

    exp_rows_db = session.scalars(
        select(Experience)
        .where(Experience.resume_id == resume_id)
        .order_by(Experience.experience_id.asc())
    ).all()

    mil_rows_db = session.scalars(
        select(Military)
        .where(Military.resume_id == resume_id)
        .order_by(Military.military_id.asc())
    ).all()

    qual_rows_db = session.scalars(
        select(Qualification)
        .where(Qualification.resume_id == resume_id)
        .order_by(Qualification.qualification_id.asc())
    ).all()

    stmt_rows_db = session.scalars(
        select(Statement)
        .where(Statement.resume_id == resume_id)
        .order_by(Statement.statement_id.asc())
    ).all()

    edu_rows = [
        {
            "educationId": e.education_id,
            "school_name": e.school_name,
            "department": e.department,
            "completion_status": e.completion_status,
            "attendance_start_period_raw": _iso(e.attendance_start_period),
            "attendance_end_period_raw": _iso(e.attendance_end_period),
            "location": e.location,
            "grade": e.grade,
        }
        for e in edu_rows_db
    ]

    exp_rows = [
        {
            "experienceId": x.experience_id,
            "company": x.company,
            "role": x.role,
            "job_title": x.job_title,
            "salary_raw": str(x.salary) if x.salary is not None else None,
            "reason_for_leaving": x.reason_for_leaving,
            "employment_start_period_raw": _iso(x.employment_start_period),
            "employment_end_period_raw": _iso(x.employment_end_period),
        }
        for x in exp_rows_db
    ]

    mil_rows = [
        {
            "militaryId": m.military_id,
            "military_type": m.military_type,
            "military_service": m.military_service,
            "military_start_period_raw": _iso(m.military_start_period),
            "military_end_period_raw": _iso(m.military_end_period),
            "military_rank": m.military_rank,
            "exemption_reason": m.exemption_reason,
        }
        for m in mil_rows_db
    ]

    qual_rows = [
        {
            "qualificationId": q.qualification_id,
            "certificate": q.certificate,
            "organization": q.organization,
            "issue_date_raw": _iso(q.issue_date),
            "certificate_number": q.certificate_number,
        }
        for q in qual_rows_db
    ]

    stmt_rows = [
        {
            "statementId": s.statement_id,
            "question": s.question,
            "answer": s.answer,
        }
        for s in stmt_rows_db
    ]

    first_exp = exp_rows_db[0] if exp_rows_db else None

    final_edu_hint = ""
    if edu_rows_db:
        ei = edu_rows_db[-1]
        parts = [p for p in (ei.completion_status, ei.school_name, ei.department) if p]
        final_edu_hint = " / ".join(parts) if parts else ""

    parsed_like: dict[str, Any] = {
        K_NAME: cand.name or "",
        K_BIRTH_DATE: cand.date_of_birth.isoformat() if cand.date_of_birth else "",
        K_CONTACT: cand.phone or "",
        K_EMAIL: cand.email or "",
        K_ADDR: cand.address or "",
        K_ORIGINAL_JOB_ROLE: (pos.position_name if pos else "") or "",
        K_FINAL_EDU: final_edu_hint,
        K_GENDER: cand.gender or "",
        K_VETERAN_ELIGIBILITY: resume.veteran_eligibility or "",
        K_DISABILITY: resume.disability or "",
        K_DESIRED_LOCATION: resume.desired_location or "",
        K_DESIRED_SALARY: _salary_display(resume.desired_salary),
        K_CAREER_PD: "",
        K_CAREER_CO: "",
        K_CAREER_ROLE: "",
        K_EDUCATION_ROWS: edu_rows,
        K_EXPERIENCE_ROWS: exp_rows,
        K_QUALIFICATION_ROWS: qual_rows,
        K_MILITARY_ROWS: mil_rows,
        K_STATEMENT_ROWS: stmt_rows,
    }

    if first_exp:
        parsed_like[K_CAREER_CO] = first_exp.company or ""
        parsed_like[K_CAREER_ROLE] = first_exp.role or ""

        sta = first_exp.employment_start_period
        end = first_exp.employment_end_period
        parts = [_iso(sta), _iso(end)]
        parsed_like[K_CAREER_PD] = "~".join(p for p in parts if p) if any(parts) else ""

    position_name = pos.position_name if pos else None
    return parsed_like, cand.candidate_id, resume.position_id, position_name
