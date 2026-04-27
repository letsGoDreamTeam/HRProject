"""이력서 파일 업로드 `POST /api/parse` 응답·항목 (파싱 파이프라인 전용)."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ResumeParseItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    filename: str
    record: dict[str, Any]


class ResumeParseFileError(BaseModel):
    filename: str
    detail: str


class ResumeParseResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[ResumeParseItem]
    errors: list[ResumeParseFileError]
    excel_base64: str | None = Field(
        default=None,
        serialization_alias="excelBase64",
    )
    excel_file_name: str | None = Field(
        default=None,
        serialization_alias="excelFileName",
    )
