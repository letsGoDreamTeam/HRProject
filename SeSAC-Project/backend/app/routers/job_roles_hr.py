"""통합 직무소개서 PDF → 부서·직무별 분리(LangGraph) + 저장 후 RAG 인덱스."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps_auth import get_current_user
from app.models_hr import JobRoleProfile, User
from app.schemas_hr import (
    JobRoleBulkUpsert,
    JobRoleParsed,
    JobRoleProfileOut,
    JobRoleRagHit,
    JobRoleRagSearchOut,
    JobsFromPdfOut,
)
from app.services.hr_job_pdf_langgraph import run_job_pdf_pipeline
from app.services.hr_job_roles_rag import delete_all_job_roles_for_user, reindex_user_job_roles, search_user_job_roles
from app.services.pdf_text import extract_text_from_pdf_bytes

router = APIRouter(prefix="/api/hr/job-roles", tags=["hr-job-roles"])


def _looks_like_pdf(name: str, content_type: str, head: bytes) -> bool:
    if name.lower().endswith(".pdf"):
        return True
    if "pdf" in (content_type or "").lower():
        return True
    return len(head) >= 5 and head[:5] == b"%PDF-"


def _row_to_out(row: JobRoleProfile) -> JobRoleProfileOut:
    return JobRoleProfileOut(
        id=row.id,
        source_document_name=row.source_document_name or "",
        department=row.department or "",
        job_title=row.job_title or "",
        role_grade=row.role_grade or "",
        body_text=row.body_text or "",
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post("/from-pdf", response_model=JobsFromPdfOut)
async def parse_jobs_from_pdf(
    _user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")
    if not _looks_like_pdf(file.filename or "", file.content_type or "", raw[:32]):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")
    settings = get_settings()
    if len(raw) > settings.pdf_max_bytes:
        mb = settings.pdf_max_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"PDF 파일이 너무 큽니다. (현재 상한 약 {mb}MB, PDF_MAX_BYTES)")
    try:
        doc_text, ocr_used = extract_text_from_pdf_bytes(raw, settings)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    warnings: list[str] = []
    if ocr_used:
        warnings.append("스캔 PDF로 추정되어 OCR을 사용했습니다. 직무 추출 결과를 반드시 검토하세요.")

    try:
        pipe = run_job_pdf_pipeline(document_text=doc_text, settings=settings)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"직무 추출 파이프라인 실패: {e!s}") from e

    warnings.extend(pipe.get("warnings") or [])
    merged = pipe.get("merged_jobs") or []
    jobs = [
        JobRoleParsed(
            department=str(m.get("department") or "")[:400],
            job_title=str(m.get("job_title") or "")[:400],
            role_grade=str(m.get("role_grade") or "")[:200],
            body_text=str(m.get("body_text") or ""),
        )
        for m in merged
        if (m.get("job_title") or "").strip()
    ]

    return JobsFromPdfOut(
        jobs=jobs,
        warnings=warnings,
        ocr_used=ocr_used,
        chunk_count=int(pipe.get("chunk_count") or 0),
    )


@router.get("", response_model=list[JobRoleProfileOut])
def list_job_roles(
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    rows = db.scalars(
        select(JobRoleProfile)
        .where(JobRoleProfile.user_id == _user.id)
        .order_by(JobRoleProfile.department, JobRoleProfile.job_title)
    ).all()
    return [_row_to_out(r) for r in rows]


@router.put("/bulk", response_model=list[JobRoleProfileOut])
def bulk_replace_job_roles(
    body: JobRoleBulkUpsert,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    """기존 직무 행을 모두 지우고 새 목록으로 교체한 뒤 RAG 인덱스를 다시 만듭니다."""
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    src = (body.source_document_name or "").strip()[:512]
    delete_all_job_roles_for_user(db, user.id)
    db.flush()

    for j in body.jobs:
        if not (j.job_title or "").strip():
            continue
        db.add(
            JobRoleProfile(
                user_id=user.id,
                source_document_name=src,
                department=(j.department or "").strip()[:400],
                job_title=(j.job_title or "").strip()[:400],
                role_grade=(j.role_grade or "").strip()[:200],
                body_text=(j.body_text or "").strip(),
            )
        )
    db.commit()

    settings = get_settings()
    try:
        reindex_user_job_roles(settings, db, user.id)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    rows = db.scalars(
        select(JobRoleProfile)
        .where(JobRoleProfile.user_id == user.id)
        .order_by(JobRoleProfile.department, JobRoleProfile.job_title)
    ).all()
    return [_row_to_out(r) for r in rows]


@router.delete("/{job_id}")
def delete_job_role(
    job_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    row = db.get(JobRoleProfile, job_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="직무를 찾을 수 없습니다.")
    db.delete(row)
    db.commit()
    settings = get_settings()
    try:
        reindex_user_job_roles(settings, db, user.id)
    except ValueError:
        pass
    return {"ok": True}


@router.get("/rag-search", response_model=JobRoleRagSearchOut)
def rag_search_job_roles(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
    query: str = Query(..., min_length=1, max_length=2000),
    top_k: int = Query(8, ge=1, le=30),
):
    _ = db
    settings = get_settings()
    raw = search_user_job_roles(settings, user_id=user.id, query=query, top_k=top_k)
    hits = [
        JobRoleRagHit(
            job_id=h["job_id"],
            department=h["department"],
            job_title=h["job_title"],
            role_grade=h.get("role_grade") or "",
            snippet=h["snippet"],
            score=h["score"],
        )
        for h in raw
    ]
    return JobRoleRagSearchOut(query=query, hits=hits)


@router.post("/reindex", response_model=dict)
def force_reindex(
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    settings = get_settings()
    try:
        n = reindex_user_job_roles(settings, db, _user.id)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return {"ok": True, "chunks": n}
