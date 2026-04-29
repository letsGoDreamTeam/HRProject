"""직무기술서: 플레인 텍스트·TSV·PDF·DOCX에서 본문 추출."""

from __future__ import annotations

from pathlib import Path


def pick_jd_from_tsv(tsv_path: str | Path, department_query: str | None = None) -> tuple[str | None, str]:
    """
    부서별 `부서\\t직무기술서...` 형식 TSV에서 직무기술서 문자열 선택.
    - department_query 있음: 첫 열 또는 본문 부분 일치 첫 행.
    - 없음: 데이터 행이 정확히 하나일 때만 사용.
    """
    raw = Path(tsv_path).read_text(encoding="utf-8", errors="replace")
    rows_raw: list[tuple[str, str]] = []
    for ln in raw.splitlines():
        if not ln.strip():
            continue
        cols = ln.split("\t")
        if len(cols) < 2:
            continue
        dept = cols[0].strip()
        jd = "\t".join(c.strip() for c in cols[1:]).strip()
        rows_raw.append((dept, jd))

    if not rows_raw:
        return None, ""

    header_like = rows_raw[0][0].replace(" ", "") == "부서"
    body = rows_raw[1:] if header_like else rows_raw
    if not body:
        return None, ""

    if department_query:
        dq = department_query.strip().lower()
        for dept, jd in body:
            blob = (dept + "\n" + jd).lower()
            if dq in dept.lower() or dq in jd.lower() or dq in blob:
                return dept, jd
        return None, ""

    if len(body) == 1:
        return body[0]

    return None, ""


def load_job_description_text(path: str | Path) -> str:
    """확장자별 직무기술서 본문."""
    p = Path(path).resolve()
    if not p.is_file():
        raise FileNotFoundError(str(p))

    ext = p.suffix.lower()
    if ext == ".pdf":
        return _pdf_text(str(p))
    if ext == ".docx":
        return _docx_text(str(p))
    if ext in {".txt", ".md", ".tsv"}:
        return p.read_text(encoding="utf-8", errors="replace").strip()

    raise ValueError(f"직무기술서 미지원 확장자: {ext} (.pdf, .docx, .txt, .md, .tsv)")


def _pdf_text(path: str) -> str:
    import fitz

    parts: list[str] = []
    with fitz.open(path) as doc:
        for page in doc:
            t = page.get_text("text", sort=True).strip()
            if t:
                parts.append(t)
    return "\n\n".join(parts).strip()


def _docx_text(path: str) -> str:
    from docx import Document

    doc = Document(path)
    return "\n".join(p.text.strip() for p in doc.paragraphs if p.text.strip()).strip()
