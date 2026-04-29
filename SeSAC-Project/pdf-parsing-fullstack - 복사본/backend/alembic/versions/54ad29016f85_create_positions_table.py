"""positions 테이블 생성 (department_name 포함)

Revision ID: 54ad29016f85
Revises:
Create Date: 2026-04-28 11:35:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "54ad29016f85"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    if "positions" in inspect(conn).get_table_names():
        return
    op.create_table(
        "positions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "department_name",
            sa.String(length=100),
            nullable=False,
            comment="부서명",
        ),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("positions")
