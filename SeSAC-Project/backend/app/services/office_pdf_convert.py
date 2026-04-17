"""Office/RTF/TXT 등 → PDF. 우선순위: (1) 외부 HTTP 변환 API (2) 로컬 LibreOffice(soffice)."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from app.config import Settings

logger = logging.getLogger(__name__)

_OFFICE_EXT = {".docx", ".rtf", ".txt", ".md", ".odt", ".hwp", ".hwpx"}


def is_office_like_ext(ext: str) -> bool:
    e = (ext or "").lower()
    if not e.startswith("."):
        e = f".{e}"
    return e in _OFFICE_EXT


def _convert_via_http(*, raw: bytes, filename: str, settings: "Settings") -> tuple[bytes, str]:
    """
    POST multipart/form-data 로 외부 서비스에 위임.
    - 필드 `file`: 원본 바이트
    - 필드 `filename`(선택): 원본 파일명(확장자 판별용)
    응답: status 200, body = PDF 바이트, Content-Type 에 pdf 포함 권장.
    선택 헤더: Authorization: Bearer <resume_office_to_pdf_http_bearer>
    (Gotenberg, 자체 Lambda+API Gateway, CloudConvert 등 어댑터에 맞춰 구현)
    """
    url = (settings.resume_office_to_pdf_http_url or "").strip()
    if not url:
        raise RuntimeError("HTTP 변환 URL 미설정")

    fname = Path(filename or "document.docx").name[:500] or "document.docx"
    headers: dict[str, str] = {}
    bearer = (settings.resume_office_to_pdf_http_bearer or "").strip()
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"

    with httpx.Client(timeout=httpx.Timeout(120.0, connect=15.0)) as client:
        resp = client.post(
            url,
            headers=headers,
            files={"file": (fname, raw, "application/octet-stream")},
            data={"filename": fname},
        )
    if resp.status_code >= 400:
        body = (resp.text or "")[:600]
        raise RuntimeError(f"HTTP 변환 실패 HTTP {resp.status_code}: {body}")
    ct = (resp.headers.get("content-type") or "").lower()
    data = resp.content
    if len(data) < 200:
        raise RuntimeError("HTTP 변환 응답이 비어 있거나 너무 짧습니다.")
    if "pdf" not in ct and not data.startswith(b"%PDF"):
        logger.warning("office http convert unexpected content-type=%s", ct)
    return data, "외부 HTTP 변환 서비스"


def _candidate_soffice_paths() -> list[Path]:
    env = (os.environ.get("LIBREOFFICE_PATH") or "").strip()
    out: list[Path] = []
    if env:
        out.append(Path(env))
    if os.name == "nt":
        pf = os.environ.get("ProgramFiles", r"C:\Program Files")
        pfx86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        out.extend(
            [
                Path(pf) / "LibreOffice" / "program" / "soffice.exe",
                Path(pfx86) / "LibreOffice" / "program" / "soffice.exe",
            ]
        )
    else:
        for p in (
            "/usr/bin/soffice",
            "/usr/bin/libreoffice",
            "/snap/bin/libreoffice",
            "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        ):
            out.append(Path(p))
    return out


def find_soffice() -> Path | None:
    for p in _candidate_soffice_paths():
        if p and p.is_file():
            return p
    w = shutil.which("soffice") or shutil.which("libreoffice")
    return Path(w) if w else None


def _convert_via_libreoffice(*, raw: bytes, filename: str) -> tuple[bytes, str]:
    ext = Path(filename or "document.docx").suffix.lower() or ".docx"
    if ext == ".md":
        ext = ".txt"
    soffice = find_soffice()
    if not soffice:
        raise RuntimeError("LibreOffice(soffice) 없음")
    if not is_office_like_ext(ext):
        raise ValueError(f"PDF 변환 미지원 형식: {ext}")

    with tempfile.TemporaryDirectory(prefix="lo_pdf_") as tmp:
        tdir = Path(tmp)
        stem = "upload"
        src = tdir / f"{stem}{ext}"
        src.write_bytes(raw)
        cmd = [
            str(soffice),
            "--headless",
            "--norestore",
            "--nologo",
            "--nodefault",
            "--nolockcheck",
            "--convert-to",
            "pdf",
            "--outdir",
            str(tdir),
            str(src),
        ]
        try:
            proc = subprocess.run(
                cmd,
                check=False,
                capture_output=True,
                text=True,
                timeout=180,
                env={**os.environ, "HOME": str(tdir)},
            )
        except subprocess.TimeoutExpired as e:
            raise RuntimeError("LibreOffice PDF 변환 시간 초과") from e
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "")[:800]
            logger.warning("soffice failed rc=%s err=%s", proc.returncode, err)
            raise RuntimeError(f"LibreOffice 변환 실패(rc={proc.returncode}): {err or 'stderr 없음'}")

        out_pdf = tdir / f"{stem}.pdf"
        if not out_pdf.is_file():
            alt = tdir / f"{Path(filename).stem}.pdf"
            out_pdf = alt if alt.is_file() else out_pdf
        if not out_pdf.is_file():
            raise RuntimeError("변환된 PDF 파일을 찾을 수 없습니다.")
        data = out_pdf.read_bytes()
        if len(data) < 200:
            raise RuntimeError("변환된 PDF가 비어 있습니다.")
        return data, f"LibreOffice 로컬 ({soffice.name})"


def convert_office_bytes_to_pdf(*, raw: bytes, filename: str, settings: "Settings | None" = None) -> tuple[bytes, str]:
    """
    Office 계열 바이트 → PDF.
    1) settings.resume_office_to_pdf_http_url 이 있으면 HTTP 위임(배포 권장)
    2) 없으면 로컬 LibreOffice(개발 PC용)
    """
    ext = Path(filename or "document.docx").suffix.lower() or ".docx"
    if ext == ".md":
        ext = ".txt"
    if not is_office_like_ext(ext):
        raise ValueError(f"PDF 변환 미지원 형식: {ext}")

    if settings and (settings.resume_office_to_pdf_http_url or "").strip():
        return _convert_via_http(raw=raw, filename=filename, settings=settings)

    try:
        return _convert_via_libreoffice(raw=raw, filename=filename)
    except RuntimeError as e_lo:
        hint = (
            "AWS 등에서는 앱 서버에 LibreOffice를 두지 말고, "
            "`RESUME_OFFICE_TO_PDF_HTTP_URL`에 DOCX→PDF를 반환하는 HTTP 엔드포인트를 연결하세요."
        )
        raise RuntimeError(f"{e_lo!s} {hint}") from e_lo
