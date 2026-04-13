from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps_auth import get_current_user
from app.models_hr import CompanyProfile, User
from app.schemas_hr import CompanyProfileFromPdfOut, CompanyProfileOut, CompanyProfileUpsert
from app.services.company_profile_pdf_split import split_company_profile_document
from app.services.pdf_text import extract_text_from_pdf_bytes

router = APIRouter(prefix="/api/hr/company-profile", tags=["hr-company"])


def _looks_like_pdf(name: str, content_type: str, head: bytes) -> bool:
    if name.lower().endswith(".pdf"):
        return True
    if "pdf" in (content_type or "").lower():
        return True
    return len(head) >= 5 and head[:5] == b"%PDF-"


@router.get("", response_model=CompanyProfileOut)
def get_profile(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session | None, Depends(get_db)]):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    row = db.scalars(select(CompanyProfile).where(CompanyProfile.user_id == user.id)).first()
    if not row:
        row = CompanyProfile(user_id=user.id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return CompanyProfileOut(
        id=row.id,
        company_name=row.company_name,
        jd_reference=row.jd_reference,
        job_description=row.job_description,
        org_notes=row.org_notes,
    )


@router.put("", response_model=CompanyProfileOut)
def upsert_profile(
    body: CompanyProfileUpsert,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL이 설정되지 않았습니다.")
    row = db.scalars(select(CompanyProfile).where(CompanyProfile.user_id == user.id)).first()
    if not row:
        row = CompanyProfile(user_id=user.id)
        db.add(row)
        db.flush()
    row.company_name = body.company_name.strip()[:300]
    row.jd_reference = body.jd_reference.strip()
    row.job_description = body.job_description.strip()
    row.org_notes = body.org_notes.strip()
    db.commit()
    db.refresh(row)
    return CompanyProfileOut(
        id=row.id,
        company_name=row.company_name,
        jd_reference=row.jd_reference,
        job_description=row.job_description,
        org_notes=row.org_notes,
    )


@router.post("/from-pdf", response_model=CompanyProfileFromPdfOut)
async def company_profile_from_pdf(
    _user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
):
    """PDF 한 장(또는 통합 문서)을 텍스트로 추출한 뒤, LLM으로 회사명·공고·직무기술서·조직문화 칸을 채웁니다."""
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

    try:
        parsed = split_company_profile_document(document_text=doc_text, settings=settings)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return CompanyProfileFromPdfOut(
        company_name=parsed["company_name"],
        jd_reference=parsed["jd_reference"],
        job_description=parsed["job_description"],
        org_notes=parsed["org_notes"],
        ocr_used=ocr_used,
        warnings=parsed.get("warnings") or [],
    )
