"""add saved_question_sets table

Revision ID: 002
Revises: 001
Create Date: 2026-04-29
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saved_question_sets",
        sa.Column("set_id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("interviewer_id", sa.Integer(), nullable=True),
        sa.Column("question_ids", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["interviewer_id"],
            ["interviewers.interviewer_id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["interview_sessions.session_id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("set_id"),
    )


def downgrade() -> None:
    op.drop_table("saved_question_sets")
