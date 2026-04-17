import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO

from openai import OpenAI

from app.config import Settings
from app.services.openai_usage_tracker import record_openai_usage

OCR_USER_PROMPT = """이 이미지는 채용 공고 등 문서 PDF의 한 페이지입니다.
보이는 모든 인쇄 텍스트를 원래 읽는 순서대로 전사(transcribe)하세요.
- 제목·본문·목록·표를 구분해 줄바꿈으로 정리하세요.
- 한국어·영어·숫자·기호를 가능한 한 정확히 옮기세요.
- 로고·도장만 있고 본문 글자가 없으면 "(본문 텍스트 없음)"만 출력하세요."""


def _extract_pypdf_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as e:
        raise RuntimeError("pypdf 패키지가 필요합니다.") from e

    reader = PdfReader(BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        t = page.extract_text()
        if t and t.strip():
            parts.append(t.strip())
    return "\n\n".join(parts).strip()


def _render_pdf_pages_png(data: bytes, settings: Settings) -> list[bytes]:
    import fitz

    doc = fitz.open(stream=data, filetype="pdf")
    try:
        page_count = doc.page_count
        if settings.pdf_ocr_max_pages <= 0:
            n = page_count
        else:
            n = min(page_count, settings.pdf_ocr_max_pages)
        out: list[bytes] = []
        base_zoom = float(settings.pdf_ocr_zoom)
        max_edge = int(settings.pdf_ocr_max_edge_px)

        for i in range(n):
            page = doc.load_page(i)
            rect = page.rect
            w, h = rect.width, rect.height
            if w <= 0 or h <= 0:
                continue
            scale = base_zoom
            if w * scale > max_edge:
                scale = max_edge / w
            if h * scale > max_edge:
                scale = min(scale, max_edge / h)
            mat = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            out.append(pix.tobytes("png"))
        return out
    finally:
        doc.close()


def _ocr_single_page_worker(idx: int, png: bytes, total: int, settings: Settings) -> tuple[int, str]:
    if not settings.openai_api_key:
        raise ValueError("OCR(비전)을 쓰려면 OPENAI_API_KEY가 필요합니다.")
    client = OpenAI(api_key=settings.openai_api_key)
    model = settings.pdf_ocr_model
    b64 = base64.standard_b64encode(png).decode("ascii")
    completion = client.chat.completions.create(
        model=model,
        temperature=0,
        max_tokens=16_384,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"{OCR_USER_PROMPT}\n(문서 페이지 {idx + 1} / {total})",
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{b64}",
                            "detail": "high",
                        },
                    },
                ],
            }
        ],
    )
    record_openai_usage(
        usage=getattr(completion, "usage", None),
        model=model,
        feature="pdf_ocr_page",
        request_kind="chat",
    )
    part = (completion.choices[0].message.content or "").strip()
    return idx, part


def _ocr_png_pages_with_openai(png_pages: list[bytes], settings: Settings) -> str:
    if not settings.openai_api_key:
        raise ValueError("OCR(비전)을 쓰려면 OPENAI_API_KEY가 필요합니다.")
    total = len(png_pages)
    if total == 0:
        return ""
    workers = max(1, min(int(settings.pdf_ocr_concurrency), 16, total))
    ordered: list[str | None] = [None] * total
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {
            ex.submit(_ocr_single_page_worker, i, png, total, settings): i for i, png in enumerate(png_pages)
        }
        for fut in as_completed(futures):
            idx, part = fut.result()
            ordered[idx] = part
    return "\n\n".join(p for p in ordered if p).strip()


def extract_text_from_pdf_bytes(data: bytes, settings: Settings) -> tuple[str, bool]:
    """
    1) pypdf로 **전 페이지** 텍스트 레이어 추출
    2) 짧으면 PyMuPDF로 **전 페이지**(또는 pdf_ocr_max_pages) 이미지 렌더 → OpenAI Vision OCR(병렬)
    반환: (본문, ocr_used)
    """
    limit = int(settings.pdf_max_bytes)
    if len(data) > limit:
        raise ValueError(
            f"PDF 파일이 너무 큽니다. (현재 상한 약 {limit // (1024 * 1024)}MB, .env의 PDF_MAX_BYTES로 조정)"
        )

    try:
        digital = _extract_pypdf_text(data)
    except RuntimeError:
        raise
    except Exception as e:
        raise ValueError(f"PDF를 읽을 수 없습니다. 손상되었거나 암호가 걸려 있을 수 있습니다: {e!s}") from e
    if len(digital) >= settings.pdf_ocr_min_chars:
        return digital, False

    if not settings.pdf_ocr_enabled:
        raise ValueError(
            "텍스트 레이어가 거의 없습니다(스캔 PDF 가능성). "
            "PDF_OCR_ENABLED=true로 Vision OCR을 켜거나 텍스트가 포함된 PDF를 사용하세요."
        )

    try:
        png_pages = _render_pdf_pages_png(data, settings)
    except Exception as e:
        raise ValueError(f"PDF를 이미지로 변환하지 못했습니다: {e!s}") from e

    if not png_pages:
        raise ValueError("PDF에서 OCR할 페이지를 만들 수 없습니다.")

    try:
        ocr_text = _ocr_png_pages_with_openai(png_pages, settings)
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Vision OCR 처리 중 오류: {e!s}") from e

    merged = ocr_text.strip()
    if len(merged) < 10 or merged == "(본문 텍스트 없음)":
        raise ValueError(
            "OCR로도 본문을 거의 읽지 못했습니다. 해상도가 낮거나 손글씨·복잡한 레이아웃일 수 있습니다."
        )

    if len(digital) >= 10:
        merged = f"{digital}\n\n---\n\n[OCR 보완]\n{merged}"

    return merged.strip(), True
