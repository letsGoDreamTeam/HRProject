"""POST /api/interview-questions — 이력서 파일 + 직무기술서(파일 또는 TSV)."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ParsingToExcel import parse_resume_file

from app import config as app_config
from app.db.base import get_db
from app.models.interviewer_orm import Interviewer
from app.models.saved_question_set_orm import SavedQuestionSet
from app.repositories.interview_questions_repository import (
    create_interview_session,
    get_disliked_texts_for_session,
    persist_generated_bundle,
    upsert_reaction,
)
from app.schemas.interview_questions import InterviewQuestionsResponse, ReactionRequest
from app.services.interview_questions_service import (
    bundle_to_markdown,
    generate_bundle_from_parsed_resume,
    generate_more_questions,
)
from app.services.db_resume_for_llm import load_parsed_like_dict_and_meta
from app.services.job_description_text import load_job_description_text, pick_jd_from_tsv
from app.services.parsed_resume_for_llm import build_resume_prompt_text


class SaveSelectedRequest(BaseModel):
    question_ids: list[int]
    interviewer_id: int | None = None
    session_id: int | None = None


def _form_bool(v: object) -> bool:
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in {"1", "true", "yes", "on"}


router = APIRouter()


@router.post(
    "/interview-questions",
    response_model=InterviewQuestionsResponse,
    response_model_by_alias=True,
)
async def generate_interview_questions(
    resume: UploadFile = File(..., description="이력서 .pdf / .docx / .hwp"),
    job_description_file: UploadFile | None = File(None),
    job_tsv_file: UploadFile | None = File(None),
    job_description_text: Annotated[str | None, Form()] = None,
    department_query: Annotated[str | None, Form()] = None,
    openai_model: Annotated[str | None, Form()] = None,
    liked_questions: Annotated[str | None, Form()] = None,
    disliked_questions: Annotated[str | None, Form()] = None,
    session_id: Annotated[int | None, Form()] = None,
    db: Session = Depends(get_db),
) -> InterviewQuestionsResponse:
    if not resume.filename:
        raise HTTPException(status_code=400, detail="이력서 파일이 없습니다.")

    # ── 이력서 파싱 ──
    tmp_resume: str | None = None
    try:
        suffix = Path(resume.filename).suffix or ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(await resume.read())
            tmp_resume = f.name
        parsed = parse_resume_file(tmp_resume)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"이력서 파싱 실패: {e}") from e
    finally:
        if tmp_resume and Path(tmp_resume).exists():
            Path(tmp_resume).unlink(missing_ok=True)

    # ── 직무기술서 ──
    jd = (job_description_text or "").strip()
    if not jd:
        if job_tsv_file and job_tsv_file.filename:
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=Path(job_tsv_file.filename).suffix or ".tsv"
            ) as tf:
                tf.write(await job_tsv_file.read())
                tpath = tf.name
            try:
                _dept, jd = pick_jd_from_tsv(tpath, department_query)
            finally:
                Path(tpath).unlink(missing_ok=True)
            if not jd.strip():
                raise HTTPException(status_code=400, detail="TSV에서 직무기술서를 찾지 못했습니다.")
        elif job_description_file and job_description_file.filename:
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=Path(job_description_file.filename).suffix or ".txt"
            ) as jf:
                jf.write(await job_description_file.read())
                jpath = jf.name
            try:
                jd = load_job_description_text(jpath)
            finally:
                Path(jpath).unlink(missing_ok=True)
        else:
            raise HTTPException(
                status_code=400,
                detail="직무기술서가 필요합니다: job_description_text, job_description_file, job_tsv_file 중 하나.",
            )

    # ── DB 싫어요 자동 로딩 ──
    liked: list[str] = json.loads(liked_questions) if liked_questions else []
    disliked: list[str] = json.loads(disliked_questions) if disliked_questions else []
    if session_id:
        db_dislikes = get_disliked_texts_for_session(db, session_id)
        all_dislikes = list({*db_dislikes, *disliked})
    else:
        all_dislikes = disliked

    # ── 질문 생성 ──
    try:
        bundle = generate_bundle_from_parsed_resume(
            parsed, jd, model=openai_model,
            liked_questions=liked,
            disliked_questions=all_dislikes,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"면접 질문 생성 실패: {e}") from e

    # ── 새 세션 생성 + 질문 DB 저장 ──
    new_session_id = 0
    persisted_count = 0
    try:
        new_session_id = create_interview_session(db)
        ids = persist_generated_bundle(db, candidate_id=None, position_id=None, bundle=bundle)
        db.commit()
        persisted_count = len(ids)
    except Exception:
        db.rollback()

    resume_full = build_resume_prompt_text(parsed)
    return InterviewQuestionsResponse(
        markdown=bundle_to_markdown(bundle),
        bundle=bundle,
        session_id=new_session_id,
        resume_prompt_excerpt=resume_full[:800],
        job_description_excerpt=jd[:800],
        department_matched=None,
        persisted_question_count=persisted_count,
    )


@router.post("/interview-questions/{question_id}/react")
async def react_to_question(
    question_id: int,
    body: ReactionRequest,
    db: Session = Depends(get_db),
) -> dict:
    """좋아요/싫어요를 DB에 UPSERT. reaction: 'like' | 'dislike' | 'none'(취소)."""
    if body.reaction not in {"like", "dislike", "none"}:
        raise HTTPException(status_code=400, detail="reaction은 like | dislike | none 중 하나.")
    upsert_reaction(db, question_id, body.session_id, body.reaction)
    db.commit()
    return {"ok": True}


@router.post(
    "/interview-questions/from-db",
    response_model=InterviewQuestionsResponse,
    response_model_by_alias=True,
)
async def generate_interview_questions_from_db(
    resume_id: Annotated[int, Form()],
    department_query: Annotated[str | None, Form()] = None,
    job_tsv_path: Annotated[str | None, Form()] = None,
    openai_model: Annotated[str | None, Form()] = None,
    persist: Annotated[str | None, Form()] = None,
    session: Session = Depends(get_db),
) -> InterviewQuestionsResponse:
    tsv = (job_tsv_path or "").strip() or app_config.JOB_DESCRIPTION_TSV_PATH
    if not tsv:
        raise HTTPException(status_code=400, detail="TSV 경로가 필요합니다.")
    p = Path(tsv).expanduser().resolve()
    if not p.is_file():
        raise HTTPException(status_code=400, detail=f"TSV 파일 없음: {p}")

    try:
        parsed, candidate_id, position_id, position_name = load_parsed_like_dict_and_meta(session, resume_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    dq = (department_query or "").strip() or (position_name or "").strip()
    dept_label, jd = pick_jd_from_tsv(str(p), dq if dq else None)
    if not (jd or "").strip():
        raise HTTPException(status_code=400, detail="TSV에서 직무기술서를 찾지 못했습니다.")

    try:
        bundle = generate_bundle_from_parsed_resume(parsed, jd, model=openai_model)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"면접 질문 생성 실패: {e}") from e

    new_session_id = 0
    persisted_count = 0
    if _form_bool(persist):
        try:
            new_session_id = create_interview_session(session)
            ids = persist_generated_bundle(
                session, candidate_id=candidate_id, position_id=position_id, bundle=bundle
            )
            session.commit()
            persisted_count = len(ids)
        except Exception:
            session.rollback()
            raise

    resume_full = build_resume_prompt_text(parsed)
    return InterviewQuestionsResponse(
        markdown=bundle_to_markdown(bundle),
        bundle=bundle,
        session_id=new_session_id,
        resume_prompt_excerpt=resume_full[:800],
        job_description_excerpt=jd[:800],
        department_matched=dept_label,
        persisted_question_count=persisted_count,
    )


@router.post(
    "/interview-questions/more",
    response_model=InterviewQuestionsResponse,
    response_model_by_alias=True,
)
async def generate_more_interview_questions(
    resume: UploadFile = File(...),
    focus_type: Annotated[str, Form()] = "behavioral",
    job_description_text: Annotated[str, Form()] = "",
    exclude_questions: Annotated[str | None, Form()] = None,
    openai_model: Annotated[str | None, Form()] = None,
) -> InterviewQuestionsResponse:
    if not resume.filename:
        raise HTTPException(status_code=400, detail="이력서 파일이 없습니다.")

    tmp_resume: str | None = None
    try:
        suffix = Path(resume.filename).suffix or ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(await resume.read())
            tmp_resume = f.name
        from ParsingToExcel import parse_resume_file as _parse  # noqa: PLC0415
        parsed = _parse(tmp_resume)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"이력서 파싱 실패: {e}") from e
    finally:
        if tmp_resume and Path(tmp_resume).exists():
            Path(tmp_resume).unlink(missing_ok=True)

    exclude = json.loads(exclude_questions) if exclude_questions else None
    try:
        bundle = generate_more_questions(
            parsed, job_description_text, focus_type,
            exclude_questions=exclude, model=openai_model,
        )
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"추가 질문 생성 실패: {e}") from e

    return InterviewQuestionsResponse(markdown="", bundle=bundle)


# ── 면접관 목록 ──────────────────────────────────────────────────────

@router.get("/interviewers")
async def list_interviewers(db: Session = Depends(get_db)) -> list[dict]:
    rows = db.query(Interviewer).order_by(Interviewer.interviewer_name).all()
    return [
        {"id": r.interviewer_id, "name": r.interviewer_name, "email": r.interviewer_email}
        for r in rows
    ]


# ── 선택 질문 저장 ───────────────────────────────────────────────────

@router.post("/interview-questions/save-selected")
async def save_selected_questions(
    body: SaveSelectedRequest,
    db: Session = Depends(get_db),
) -> dict:
    """면접관이 선택한 질문 ID 목록을 saved_question_sets 테이블에 저장."""
    if not body.question_ids:
        raise HTTPException(status_code=400, detail="저장할 질문이 없습니다.")
    row = SavedQuestionSet(
        session_id=body.session_id,
        interviewer_id=body.interviewer_id,
        question_ids=body.question_ids,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "set_id": row.set_id, "saved_count": len(body.question_ids)}
