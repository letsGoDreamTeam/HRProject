"""Persist interviewer availability responses.

Revision ID: d4a1f8c2e9b7
Revises: 955d32368288
Create Date: 2026-05-20 02:30:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4a1f8c2e9b7"
down_revision: Union[str, Sequence[str], None] = "955d32368288"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "interviewer_invites",
        sa.Column("availability_decision", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "interviewer_invites",
        sa.Column("availability_note", sa.String(length=1000), nullable=True),
    )
    op.add_column(
        "interviewer_invites",
        sa.Column("availability_decided_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("interviewer_invites", "availability_decided_at")
    op.drop_column("interviewer_invites", "availability_note")
    op.drop_column("interviewer_invites", "availability_decision")
