"""삭제된 statements 테이블 재생성(resumes FK, ORM Statement와 동일).

Revision ID: d4e9b102a3fc
Revises: c8f1a2044b9a

이미 statements가 있으면 upgrade는 아무 것도 하지 않습니다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = "d4e9b102a3fc"
down_revision: Union[str, Sequence[str], None] = "c8f1a2044b9a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    if "statements" in insp.get_table_names():
        return

    op.create_table(
        "statements",
        sa.Column(
            "statement_id",
            sa.Integer(),
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("resume_id", sa.Integer(), nullable=False),
        sa.Column("question", sa.String(length=2000), nullable=True),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("statement_id", name="statements_pkey"),
        sa.ForeignKeyConstraint(
            ["resume_id"],
            ["resumes.resume_id"],
            name="statements_resume_id_fkey",
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    if "statements" not in insp.get_table_names():
        return
    op.drop_table("statements")
