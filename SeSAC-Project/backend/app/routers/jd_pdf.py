from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import get_settings
from app.schemas import JdExtractResponse
from app.services.pdf_text import extract_text_from_pdf_bytes

router = APIRouter(prefix="/api/jd", tags=["jd"])


def _looks_like_pdf(name: str, content_type: str, head: bytes) -> bool:
    if name.lower().endswith(".pdf"):
        return True
    if "pdf" in (content_type or "").lower():
        return True
    return len(head) >= 5 and head[:5] == b"%PDF-"


@router.post("/from-pdf", response_model=JdExtractResponse)
async def jd_from_pdf(file: UploadFile = File(...)) -> JdExtractResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")

    if not _looks_like_pdf(file.filename or "", file.content_type or "", raw[:32]):
        raise HTTPException(
            status_code=400,
            detail="PDF 파일만 업로드할 수 있습니다.",
        )
    settings = get_settings()
    if len(raw) > settings.pdf_max_bytes:
        mb = settings.pdf_max_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"PDF 파일이 너무 큽니다. (현재 상한 약 {mb}MB, PDF_MAX_BYTES)")
    try:
        jd_text, ocr_used = extract_text_from_pdf_bytes(raw, settings)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    return JdExtractResponse(jd_text=jd_text, ocr_used=ocr_used)
