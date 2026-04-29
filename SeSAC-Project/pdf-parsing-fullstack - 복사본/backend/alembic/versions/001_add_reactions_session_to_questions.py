"""create interview_sessions and question_reactions tables

Revision ID: 001
Revises:
Create Date: 2026-04-29
"""
import sqlalchemy as sa
from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "interview_sessions",
        sa.Column("session_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "question_reactions",
        sa.Column("reaction_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "question_id",
            sa.Integer(),
            sa.ForeignKey("questions.question_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            sa.Integer(),
            sa.ForeignKey("interview_sessions.session_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reaction", sa.String(16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("session_id", "question_id", name="uq_reaction_session_question"),
    )
    op.create_index("ix_question_reactions_question_id", "question_reactions", ["question_id"])
    op.create_index("ix_question_reactions_session_id", "question_reactions", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_question_reactions_session_id", table_name="question_reactions")
    op.drop_index("ix_question_reactions_question_id", table_name="question_reactions")
    op.drop_table("question_reactions")
    op.drop_table("interview_sessions")
