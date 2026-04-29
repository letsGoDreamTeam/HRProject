"""(레거시) parsed_applicants — 이후 erd 마이그레이션에서 제거되며 no-op 처리

Revision ID: f1a9c2b8d431
Revises: 52ca960a5f75
"""

from typing import Sequence, Union

from alembic import op


revision: str = "f1a9c2b8d431"
down_revision: Union[str, Sequence[str], None] = "52ca960a5f75"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """과거 브랜치 호환만 유지. 실제 테이블은 `edb4c9012f63` ERD 마이그레이션에서 정의된다."""
    pass


def downgrade() -> None:
    pass
