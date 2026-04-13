from __future__ import annotations

import io
from datetime import datetime
from typing import Iterable
from uuid import UUID

from openpyxl import Workbook
from openpyxl.styles import Font


def applications_batch_to_xlsx_bytes(
    *,
    batch_title: str,
    jd_preferred: str,
    rows: Iterable[dict],
) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "분류결과"
    bold = Font(bold=True)
    ws.append(["배치 제목", batch_title])
    ws.append(["우대·자격 텍스트", jd_preferred])
    ws.append([])
    headers = [
        "파일명",
        "블라인드 등급",
        "우대충족",
        "블라인드 요약",
        "우대 근거",
        "키워드 태그",
        "인용 스니펫",
        "분석시각",
    ]
    ws.append(headers)
    for c in range(1, len(headers) + 1):
        ws.cell(row=4, column=c).font = bold
    for r in rows:
        snippets = r.get("blind_snippets") or []
        if isinstance(snippets, list):
            sn = " | ".join(str(x) for x in snippets[:12])
        else:
            sn = str(snippets)
        flags = r.get("keyword_flags") or []
        if isinstance(flags, list):
            fl = ", ".join(str(x) for x in flags)
        else:
            fl = str(flags)
        analyzed = r.get("analyzed_at")
        if isinstance(analyzed, datetime):
            analyzed_s = analyzed.isoformat()
        else:
            analyzed_s = str(analyzed or "")
        ws.append(
            [
                r.get("filename", ""),
                r.get("blind_tier", ""),
                "Y" if r.get("preferred_met") else "N",
                r.get("blind_summary", ""),
                r.get("preferred_reason", ""),
                fl,
                sn,
                analyzed_s,
            ]
        )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def filename_for_batch(batch_id: UUID) -> str:
    return f"applications_{batch_id}.xlsx"
