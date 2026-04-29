"""candidates.email UNIQUE 제약.

Revision ID: c8f1a2044b9a
Revises: edb4c9012f63

비NULL 동일 이메일 행은 `__dup_<id>` 접미부를 붙여 유일하게 만든 뒤 UNIQUE를 추가합니다.
SQLite는 batch_alter_table로 테이블 복사 전략을 사용합니다(PostgreSQL 등은 일반 DDL).
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect
from sqlalchemy import text


revision: str = "c8f1a2044b9a"
down_revision: Union[str, Sequence[str], None] = "edb4c9012f63"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names_on_table(connection, table: str) -> set[str]:
    insp = inspect(connection)
    return {ix["name"] for ix in insp.get_indexes(table) if ix.get("name")}


def _has_email_unique_already(bind) -> bool:
    """이미 UNIQUE(email) 또는 동일 이름 제약이 있으면 스킵."""
    insp = inspect(bind)
    for uq in insp.get_unique_constraints("candidates") or []:
        if uq.get("column_names") == ["email"]:
            return True
    return False


def _dedupe_candidate_emails(bind) -> None:
    """
    같은 email(공백·대소문자 무시)을 가진 행 중 candidate_id가 큰 행부터
    email 끝에 `__dup_<id>` 접미부를 붙여 UNIQUE 적용 가능하게 함.
    """
    dialect = bind.dialect.name
    if dialect == "postgresql":
        bind.execute(
            text(
                """
                UPDATE candidates AS c SET email = left(
                  trim(c.email) || '__dup_' || c.candidate_id::text,
                  255
                )
                FROM (
                  SELECT candidate_id FROM (
                    SELECT candidate_id,
                      ROW_NUMBER() OVER (
                        PARTITION BY lower(trim(email))
                        ORDER BY candidate_id ASC
                      ) AS rn
                    FROM candidates
                    WHERE email IS NOT NULL AND trim(email) <> ''
                  ) z WHERE rn > 1
                ) dup
                WHERE c.candidate_id = dup.candidate_id
                """
            )
        )
        return
    # SQLite / 기타
    bind.execute(
        text(
            """
            UPDATE candidates
            SET email = substr(trim(email) || '__dup_' || candidate_id, 1, 255)
            WHERE candidate_id IN (
              SELECT candidate_id FROM (
                SELECT candidate_id,
                  ROW_NUMBER() OVER (
                    PARTITION BY lower(trim(email))
                    ORDER BY candidate_id ASC
                  ) AS rn
                FROM candidates
                WHERE email IS NOT NULL AND trim(email) <> ''
              ) WHERE rn > 1
            )
            """
        )
    )


def upgrade() -> None:
    bind = op.get_bind()
    if _has_email_unique_already(bind):
        return
    names = _index_names_on_table(bind, "candidates")
    dialect = bind.dialect.name

    _dedupe_candidate_emails(bind)

    if dialect == "sqlite":
        with op.batch_alter_table("candidates") as batch_op:
            if "ix_candidates_email" in names:
                batch_op.drop_index("ix_candidates_email")
            batch_op.create_unique_constraint("uq_candidates_email", ["email"])
        return

    if "ix_candidates_email" in names:
        op.drop_index("ix_candidates_email", table_name="candidates")
    op.create_unique_constraint("uq_candidates_email", "candidates", ["email"])


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        with op.batch_alter_table("candidates") as batch_op:
            batch_op.drop_constraint("uq_candidates_email", type_="unique")
            batch_op.create_index("ix_candidates_email", ["email"], unique=False)
        return

    op.drop_constraint("uq_candidates_email", "candidates", type_="unique")
    op.create_index("ix_candidates_email", "candidates", ["email"], unique=False)
