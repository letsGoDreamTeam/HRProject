import base64

import os

import re

import tempfile

from datetime import date, datetime

from typing import Any


from fastapi import UploadFile

from sqlalchemy import select

from sqlalchemy.orm import Session


import ParsingToExcel

from ParsingToExcel import (
    K_ADDR,
    K_BIRTH_DATE,
    K_CONTACT,
    K_CAREER_CO,
    K_CAREER_PD,
    K_CAREER_ROLE,
    K_DESIRED_LOCATION,
    K_DESIRED_SALARY,
    K_DISABILITY,
    K_EDUCATION_ROWS,
    K_EMAIL,
    K_EXPERIENCE_ROWS,
    K_FILE_TYPE,
    K_FINAL_EDU,
    K_GENDER,
    K_ID,
    K_MILITARY_ROWS,
    K_NAME,
    K_QUALIFICATION_ROWS,
    K_STATEMENT_ROWS,
    K_VETERAN_ELIGIBILITY,
    export_data_list_to_excel_path,
    parse_education_period_raw_pair,
    parse_resume_file,
    split_merged_education_text,
    infer_education_level,
)

from app.models.candidate_orm import Candidate

from app.models.education_orm import Education

from app.models.experience_orm import Experience

from app.models.military_orm import Military

from app.models.position_orm import Position

from app.models.qualification_orm import Qualification

from app.models.resume_orm import Resume

from app.models.statement_orm import Statement


PARSE_UPLOAD_POSITION_NAME = "파싱_미분류"


def resume_excel_output_basename() -> str:
    return getattr(ParsingToExcel, "OUTPUT_FILENAME", "지원자_통합관리.xlsx")


def _empty_to_none(v: object) -> str | None:
    if v is None:
        return None

    s = str(v).strip()

    return s if s else None


def _parse_birth_date(value: object) -> date | None:
    raw = _empty_to_none(value)

    if not raw:
        return None

    m = re.match(r"^\s*(\d{4})\D?(\d{1,2})\D?(\d{1,2})", raw.replace(" ", ""))

    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))

        try:
            return date(y, mo, d)

        except ValueError:
            # 표/깨진 PDF·HWP: 1990.0.0, 1990.01.0 등
            if mo == 0 and d == 0:
                try:
                    return date(y, 1, 1)

                except ValueError:
                    return None

            if 1 <= mo <= 12 and d == 0:
                try:
                    return date(y, mo, 1)

                except ValueError:
                    return None

            return None

    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw[:19], fmt).date()

        except ValueError:
            continue

    return None


def _parse_loose_date(value: object) -> date | None:
    raw = _empty_to_none(value)

    if not raw:
        return None

    m = re.match(r"^(\d{4})\D(\d{1,2})(?:\D(\d{1,2}))?", raw.strip())

    if not m:
        return None

    y = int(m.group(1))

    mo = int(m.group(2))

    day = int(m.group(3)) if m.group(3) else 1

    try:
        return date(y, mo, day)

    except ValueError:
        return None


def _desired_salary_to_int(raw: object) -> int | None:
    s = _empty_to_none(raw)

    if not s:
        return None

    digits = re.sub(r"\D", "", s)

    if not digits:
        return None

    try:
        n = int(digits)

        return n if n > 0 else None

    except ValueError:
        return None


def _ensure_parse_position(session: Session) -> Position:
    row = session.execute(
        select(Position)
        .where(Position.position_name == PARSE_UPLOAD_POSITION_NAME)
        .limit(1)
    ).scalar_one_or_none()

    if row:
        return row

    row = Position(position_name=PARSE_UPLOAD_POSITION_NAME)

    session.add(row)

    session.flush()

    return row


def _iso_date(d: date | None) -> str | None:
    return d.isoformat() if d else None


def _enrich_record_child_ids_from_db(
    session: Session, resume_id: int, record: dict[str, Any]
) -> dict[str, Any]:
    """커밋 후 DB에 실제로 들어간 행만 읽어 각 PK(`*Id`)를 붙여 반환. 빈 리스트는 빈 테이블 그대로."""

    merged = dict(record)

    quals = session.scalars(
        select(Qualification)
        .where(Qualification.resume_id == resume_id)
        .order_by(Qualification.qualification_id.asc())
    ).all()

    merged[K_QUALIFICATION_ROWS] = [
        {
            "qualificationId": q.qualification_id,
            "certificate": q.certificate,
            "organization": q.organization,
            "issue_date_raw": _iso_date(q.issue_date),
            "certificate_number": q.certificate_number,
        }
        for q in quals
    ]

    edus = session.scalars(
        select(Education)
        .where(Education.resume_id == resume_id)
        .order_by(Education.education_id.asc())
    ).all()

    merged[K_EDUCATION_ROWS] = [
        {
            "educationId": e.education_id,
            "school_name": e.school_name,
            "department": e.department,
            "completion_status": e.completion_status,
            "attendance_start_period_raw": _iso_date(e.attendance_start_period),
            "attendance_end_period_raw": _iso_date(e.attendance_end_period),
            "location": e.location,
            "grade": e.grade,
        }
        for e in edus
    ]

    exps = session.scalars(
        select(Experience)
        .where(Experience.resume_id == resume_id)
        .order_by(Experience.experience_id.asc())
    ).all()

    merged[K_EXPERIENCE_ROWS] = [
        {
            "experienceId": x.experience_id,
            "company": x.company,
            "role": x.role,
            "job_title": x.job_title,
            "salary_raw": str(x.salary) if x.salary is not None else None,
            "reason_for_leaving": x.reason_for_leaving,
            "employment_start_period_raw": _iso_date(x.employment_start_period),
            "employment_end_period_raw": _iso_date(x.employment_end_period),
        }
        for x in exps
    ]

    mils = session.scalars(
        select(Military)
        .where(Military.resume_id == resume_id)
        .order_by(Military.military_id.asc())
    ).all()

    merged[K_MILITARY_ROWS] = [
        {
            "militaryId": m.military_id,
            "military_type": m.military_type,
            "military_service": m.military_service,
            "military_start_period_raw": _iso_date(m.military_start_period),
            "military_end_period_raw": _iso_date(m.military_end_period),
            "military_rank": m.military_rank,
            "exemption_reason": m.exemption_reason,
        }
        for m in mils
    ]

    stmts = session.scalars(
        select(Statement)
        .where(Statement.resume_id == resume_id)
        .order_by(Statement.statement_id.asc())
    ).all()

    merged[K_STATEMENT_ROWS] = [
        {
            "statementId": s.statement_id,
            "question": s.question,
            "answer": s.answer,
        }
        for s in stmts
    ]

    return merged


class ResumeParseRepository:
    """이력서 업로드 -> 파싱 -> ERD 테이블 저장·엑셀 Base64."""

    @staticmethod
    async def read_upload_to_tempfile(upload: UploadFile) -> str:
        original = upload.filename or "unnamed"

        ext = os.path.splitext(original)[1] or ".bin"

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(await upload.read())

        return tmp.name

    @staticmethod
    def remove_silent(path: str | None) -> None:
        if not path or not os.path.exists(path):
            return

        try:
            os.remove(path)

        except OSError:
            pass

    @staticmethod
    def parse_file_at_path(path: str) -> dict[str, Any]:
        return parse_resume_file(path)

    @staticmethod
    def persist_parse_to_db(
        session: Session,
        record: dict[str, Any],
        uploaded_original_name: str | None = None,
    ) -> dict[str, Any]:
        """파싱 dict를 ERD 테이블에 저장. API용 `id`는 `resume_id` 문자열."""

        pos = _ensure_parse_position(session)

        dob = _parse_birth_date(record.get(K_BIRTH_DATE))

        email_val = _empty_to_none(record.get(K_EMAIL))

        phone_val = _empty_to_none(record.get(K_CONTACT))

        name_val = _empty_to_none(record.get(K_NAME))

        cand = None

        if email_val:
            cand = session.execute(
                select(Candidate)
                .where(Candidate.email == email_val)
                .order_by(Candidate.candidate_id.asc())
                .limit(1)
            ).scalar_one_or_none()

        if cand is None and phone_val and name_val:
            cand = session.execute(
                select(Candidate)
                .where(
                    Candidate.phone == phone_val,
                    Candidate.name == name_val,
                )
                .order_by(Candidate.candidate_id.asc())
                .limit(1)
            ).scalar_one_or_none()

        if cand is None:
            cand = Candidate(
                position_id=pos.position_id,
                name=_empty_to_none(record.get(K_NAME)),
                date_of_birth=dob,
                gender=_empty_to_none(record.get(K_GENDER)),
                address=_empty_to_none(record.get(K_ADDR)),
                phone=_empty_to_none(record.get(K_CONTACT)),
                email=email_val,
                application_status="서류",
            )

            session.add(cand)

            session.flush()

        else:
            if _empty_to_none(record.get(K_NAME)):
                cand.name = _empty_to_none(record.get(K_NAME))

            if dob:
                cand.date_of_birth = dob

            g = _empty_to_none(record.get(K_GENDER))

            if g:
                cand.gender = g

            if _empty_to_none(record.get(K_ADDR)):
                cand.address = _empty_to_none(record.get(K_ADDR))

            if _empty_to_none(record.get(K_CONTACT)):
                cand.phone = _empty_to_none(record.get(K_CONTACT))

            em = _empty_to_none(record.get(K_EMAIL))

            if em and not _empty_to_none(getattr(cand, "email", None)):
                cand.email = em

        res = Resume(
            candidate_id=cand.candidate_id,
            position_id=pos.position_id,
            desired_location=_empty_to_none(record.get(K_DESIRED_LOCATION)),
            second_position_id=None,
            desired_salary=_desired_salary_to_int(record.get(K_DESIRED_SALARY)),
            veteran_eligibility=_empty_to_none(record.get(K_VETERAN_ELIGIBILITY)),
            disability=_empty_to_none(record.get(K_DISABILITY)),
            file_path=_empty_to_none(uploaded_original_name),
        )

        session.add(res)

        session.flush()

        resume_id = res.resume_id

        for st in record.get(K_STATEMENT_ROWS) or []:
            if not isinstance(st, dict):
                continue

            ans = _empty_to_none(st.get("answer"))

            q = _empty_to_none(st.get("question"))

            if ans:
                session.add(Statement(resume_id=resume_id, question=q, answer=ans))

        for edu in record.get(K_EDUCATION_ROWS) or []:
            if not isinstance(edu, dict):
                continue

            if not (
                _empty_to_none(edu.get("school_name"))
                or _empty_to_none(edu.get("department"))
                or _empty_to_none(edu.get("grade"))
                or _empty_to_none(edu.get("completion_status"))
            ):
                continue

            session.add(
                Education(
                    resume_id=resume_id,
                    school_name=_empty_to_none(edu.get("school_name")),
                    department=_empty_to_none(edu.get("department")),
                    completion_status=_empty_to_none(edu.get("completion_status")),
                    attendance_start_period=_parse_loose_date(
                        edu.get("attendance_start_period_raw")
                    ),
                    attendance_end_period=_parse_loose_date(
                        edu.get("attendance_end_period_raw")
                    ),
                    location=_empty_to_none(edu.get("location")),
                    grade=_empty_to_none(edu.get("grade")),
                )
            )

        if not record.get(K_EDUCATION_ROWS) and _empty_to_none(record.get(K_FINAL_EDU)):
            fe = _empty_to_none(record.get(K_FINAL_EDU))

            if fe and fe != "기타":
                try:
                    sp = split_merged_education_text(fe)

                except Exception:
                    sp = {}

                fe_ast = sp.get("attendance_start_period_raw")

                fe_aen = sp.get("attendance_end_period_raw")

                if not fe_ast and not fe_aen:
                    fe_ast, fe_aen = parse_education_period_raw_pair("", fe)

                sch = _empty_to_none(sp.get("school_name")) or fe

                dept = _empty_to_none(sp.get("department"))

                cstat = _empty_to_none(
                    infer_education_level(
                        sp.get("school_name"),
                        sp.get("department"),
                        None,
                        fe,
                    )
                )

                session.add(
                    Education(
                        resume_id=resume_id,
                        school_name=sch,
                        department=dept,
                        completion_status=cstat,
                        attendance_start_period=_parse_loose_date(fe_ast),
                        attendance_end_period=_parse_loose_date(fe_aen),
                    )
                )

        experience_rows_added = 0

        for ex in record.get(K_EXPERIENCE_ROWS) or []:
            if not isinstance(ex, dict):
                continue

            if not any(
                _empty_to_none(ex.get(k))
                for k in (
                    "company",
                    "role",
                    "employment_start_period_raw",
                    "employment_end_period_raw",
                )
            ):
                continue

            session.add(
                Experience(
                    resume_id=resume_id,
                    company=_empty_to_none(ex.get("company")),
                    role=_empty_to_none(ex.get("role")),
                    job_title=_empty_to_none(ex.get("job_title")),
                    salary=_desired_salary_to_int(ex.get("salary_raw")),
                    reason_for_leaving=_empty_to_none(ex.get("reason_for_leaving")),
                    employment_start_period=_parse_loose_date(
                        ex.get("employment_start_period_raw")
                    ),
                    employment_end_period=_parse_loose_date(
                        ex.get("employment_end_period_raw")
                    ),
                )
            )

            experience_rows_added += 1

        if experience_rows_added == 0 and any(
            _empty_to_none(record.get(k))
            for k in (K_CAREER_CO, K_CAREER_PD, K_CAREER_ROLE)
        ):
            session.add(
                Experience(
                    resume_id=resume_id,
                    company=_empty_to_none(record.get(K_CAREER_CO)),
                    role=_empty_to_none(record.get(K_CAREER_ROLE)),
                    job_title=None,
                    salary=None,
                    reason_for_leaving=None,
                    employment_start_period=None,
                    employment_end_period=None,
                )
            )

        for row in record.get(K_MILITARY_ROWS) or []:
            if not isinstance(row, dict):
                continue

            session.add(
                Military(
                    resume_id=resume_id,
                    military_type=_empty_to_none(row.get("military_type")),
                    military_service=_empty_to_none(row.get("military_service")),
                    military_start_period=_parse_loose_date(
                        row.get("military_start_period_raw")
                    ),
                    military_end_period=_parse_loose_date(
                        row.get("military_end_period_raw")
                    ),
                    military_rank=_empty_to_none(row.get("military_rank")),
                    exemption_reason=_empty_to_none(row.get("exemption_reason")),
                )
            )

        for row in record.get(K_QUALIFICATION_ROWS) or []:
            if not isinstance(row, dict):
                continue

            cert = _empty_to_none(row.get("certificate"))

            if not cert:
                continue

            session.add(
                Qualification(
                    resume_id=resume_id,
                    certificate=cert,
                    organization=_empty_to_none(row.get("organization")),
                    issue_date=_parse_loose_date(row.get("issue_date_raw")),
                    certificate_number=_empty_to_none(row.get("certificate_number")),
                )
            )

        try:
            session.commit()

            session.refresh(res)

            session.refresh(cand)

        except Exception:
            session.rollback()

            raise

        out = _enrich_record_child_ids_from_db(session, resume_id, record)

        out[K_ID] = str(res.resume_id)

        return out

    @staticmethod
    def records_to_excel_base64(records: list[dict[str, Any]]) -> str:
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as xtmp:
            xls_path = xtmp.name

        try:
            export_data_list_to_excel_path(records, xls_path)

            with open(xls_path, "rb") as f:
                return base64.standard_b64encode(f.read()).decode("ascii")

        finally:
            if os.path.exists(xls_path):
                try:
                    os.remove(xls_path)

                except OSError:
                    pass
