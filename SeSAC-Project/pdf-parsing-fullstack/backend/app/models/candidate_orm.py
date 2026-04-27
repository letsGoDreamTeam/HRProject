"""SQLAlchemy: 지원자 연락처 테이블 `candidates` (ERD: 이름·생년월일·성별·주소·휴대폰·이메일 UK)."""

from __future__ import annotations

from datetime import date

from sqlalchemy import Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Candidate(Base):
    __tablename__ = "candidates"

    # ERD에 없는 내부 식별자(관계·ORM용)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # 이름 — varchar
    name: Mapped[str | None] = mapped_column(String(255), nullable=True, doc="이름")
    # 생년월일 — date
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True, doc="생년월일")
    # 성별 — varchar
    gender: Mapped[str | None] = mapped_column(String(100), nullable=True, doc="성별")
    # 현주소 — varchar
    address: Mapped[str | None] = mapped_column(String(2000), nullable=True, doc="현주소")
    # 휴대폰 — varchar
    phone: Mapped[str | None] = mapped_column(String(100), nullable=True, doc="휴대폰")
    # 이메일 — varchar, UK(유일)
    email: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=True,
        doc="이메일",
    )
