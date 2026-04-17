"""표준화/추출 텍스트 → A4 PDF (한글: 시스템 폰트 또는 RESUME_PDF_FONT)."""

from __future__ import annotations

import os
import textwrap
from pathlib import Path

import fitz  # PyMuPDF


def _font_candidates() -> list[Path]:
    env = (os.environ.get("RESUME_PDF_FONT") or "").strip()
    c: list[Path] = []
    if env:
        c.append(Path(env))
    if os.name == "nt":
        windir = os.environ.get("WINDIR", r"C:\Windows")
        c.extend(
            [
                Path(windir) / "Fonts" / "malgun.ttf",
                Path(windir) / "Fonts" / "malgunsl.ttf",
                Path(windir) / "Fonts" / "gulim.ttc",
            ]
        )
    else:
        for p in (
            "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ):
            c.append(Path(p))
    return [p for p in c if p.is_file()]


def text_to_resume_pdf_bytes(*, text: str, title: str = "이력서") -> tuple[bytes, str]:
    """
    plain text를 A4 PDF로 렌더(줄 단위 래핑).
    반환: (pdf_bytes, note)
    """
    font_path = _font_candidates()
    if not font_path:
        raise RuntimeError(
            "한글 PDF 폰트를 찾을 수 없습니다. Windows는 맑은 고딕, Linux는 Nanum/Noto 설치 또는 "
            "환경변수 RESUME_PDF_FONT에 .ttf/.ttc 경로를 지정하세요."
        )
    fontfile = str(font_path[0])

    body = (text or "").strip() or "(내용 없음)"
    head = (title or "이력서").strip()[:200]
    lines: list[str] = [head, "", *body.splitlines()]

    doc = fitz.open()
    pw, ph = fitz.paper_size("a4")
    margin = 48
    x0 = margin
    y0 = margin
    ymax = ph - margin
    xmax = pw - margin
    usable_w = xmax - x0
    fontsize = 10.5
    line_h = fontsize * 1.38
    # 대략적인 글자 수(고정폭 가정) — 맑은 고딕 가변폭이나 A4 본문용으로 충분
    wrap_w = max(20, int(usable_w / (fontsize * 0.55)))

    page = doc.new_page(width=pw, height=ph)
    y = y0

    def new_page() -> None:
        nonlocal page, y
        page = doc.new_page(width=pw, height=ph)
        y = y0

    for raw_line in lines:
        wrapped = textwrap.wrap(raw_line.replace("\t", "    "), width=wrap_w) or [""]
        for seg in wrapped:
            if y + line_h > ymax:
                new_page()
            page.insert_text(
                (x0, y),
                seg,
                fontfile=fontfile,
                fontsize=fontsize,
            )
            y += line_h

    pdf_bytes = doc.tobytes(deflate=True, garbage=3, clean=True)
    doc.close()
    return pdf_bytes, f"텍스트 PDF ({Path(fontfile).name})"
