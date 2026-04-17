from __future__ import annotations

from io import BytesIO
from pathlib import Path

from docx import Document
from striprtf.striprtf import rtf_to_text

from app.config import Settings
from app.services.office_pdf_convert import convert_office_bytes_to_pdf
from app.services.pdf_text import extract_text_from_pdf_bytes


def _decode_text(raw: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "cp949", "euc-kr", "latin-1"):
        try:
            return raw.decode(enc)
        except Exception:  # noqa: BLE001
            continue
    return raw.decode("utf-8", errors="ignore")


def extract_resume_text_from_file(
    *,
    raw: bytes,
    filename: str,
    content_type: str,
    settings: Settings,
) -> tuple[str, str, str]:
    """
    지원서 텍스트 추출(uv 패키지 기반, soffice 비의존).
    반환: (text, status, note)
      - status: native_pdf | extracted_direct | extract_failed
    """
    ext = Path(filename or "").suffix.lower()
    is_pdf = ext == ".pdf" or "pdf" in (content_type or "").lower() or raw[:5] == b"%PDF-"
    if is_pdf:
        text, _ocr = extract_text_from_pdf_bytes(raw, settings)
        return text, "native_pdf", "pdf 추출 완료"
    if ext in (".hwp", ".hwpx"):
        try:
            pdf_bytes, conv_note = convert_office_bytes_to_pdf(
                raw=raw, filename=filename or "document.hwp", settings=settings
            )
            text, _ocr = extract_text_from_pdf_bytes(pdf_bytes, settings)
            return text, "native_pdf", f"hwp/hwpx → PDF 후 추출 ({conv_note})"
        except Exception as e:  # noqa: BLE001
            raise ValueError(
                "HWP/HWPX는 `RESUME_OFFICE_TO_PDF_HTTP_URL` 등 PDF 변환 경로가 필요합니다. "
                f"또는 한글에서 PDF로 저장 후 업로드하세요. ({e!s})"
            ) from e
    if ext == ".docx":
        doc = Document(BytesIO(raw))
        text = "\n".join(p.text for p in doc.paragraphs)
        return text, "extracted_direct", "docx 직접 추출 완료"
    if ext in {".txt", ".md"}:
        return _decode_text(raw), "extracted_direct", f"{ext.replace('.', '')} 직접 추출 완료"
    if ext == ".rtf":
        return rtf_to_text(_decode_text(raw)), "extracted_direct", "rtf 직접 추출 완료"
    raise ValueError(
        f"지원하지 않는 형식입니다: {ext or '(확장자 없음)'} "
        "(pdf/docx/txt/md/rtf 및 HWP/HWPX는 PDF 변환 API 연결 시 지원)"
    )
