import base64
import os
import tempfile
from typing import Any

from fastapi import UploadFile

import ParsingToExcel
from ParsingToExcel import export_data_list_to_excel_path, parse_resume_file


def resume_excel_output_basename() -> str:
    return getattr(ParsingToExcel, "OUTPUT_FILENAME", "지원자_통합관리.xlsx")


class ResumeParseRepository:
    """이력서 업로드 → 임시 파일·`parse_resume_file`·xlsx Base64 I/O."""

    @staticmethod
    async def read_upload_to_tempfile(upload: UploadFile) -> str:
        original = upload.filename or "unnamed"
        ext = os.path.splitext(original)[1] or ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(await upload.read())
        return tmp.name

    @staticmethod
    def remove_silent(path: str | None) -> None:
        if not path or not os.path.exists(path):
            return
        try:
            os.remove(path)
        except OSError:
            pass

    @staticmethod
    def parse_file_at_path(path: str) -> dict[str, Any]:
        return parse_resume_file(path)

    @staticmethod
    def records_to_excel_base64(records: list[dict[str, Any]]) -> str:
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as xtmp:
            xls_path = xtmp.name
        try:
            export_data_list_to_excel_path(records, xls_path)
            with open(xls_path, "rb") as f:
                return base64.standard_b64encode(f.read()).decode("ascii")
        finally:
            if os.path.exists(xls_path):
                try:
                    os.remove(xls_path)
                except OSError:
                    pass
