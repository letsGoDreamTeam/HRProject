"""ERD 전체 테이블 — Base.metadata 재생성(레거시 스키마 대체).

Revision ID: edb4c9012f63
Revises: f1a9c2b8d431
"""

from typing import Sequence, Union

from alembic import op

revision: str = "edb4c9012f63"
down_revision: Union[str, Sequence[str], None] = "f1a9c2b8d431"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    import app.models  # noqa: F401
    from app.db.base import Base

    Base.metadata.drop_all(bind=bind)
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    import app.models  # noqa: F401
    from app.db.base import Base

    Base.metadata.drop_all(bind=bind)
