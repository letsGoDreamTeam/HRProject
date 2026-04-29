"""동일 이메일 재지원 허용: candidates.email UNIQUE 제거.

Revision ID: e7a2bd4019f1
Revises: d4e9b102a3fc

여러 차례 지원 시 같은 사람(email) 하나에 여러 resumes를 두기 위해
메일 주소 문자열 단독 UNIQUE는 해제합니다(인덱스는 재생성 가능).
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


revision: str = "e7a2bd4019f1"
down_revision: Union[str, Sequence[str], None] = "d4e9b102a3fc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _drop_email_unique(bind) -> None:
    dialect = bind.dialect.name
    insp = inspect(bind)
    for uq in insp.get_unique_constraints("candidates") or []:
        cols = list(uq.get("column_names") or ())
        name = uq.get("name")
        if cols == ["email"] and name:
            if dialect == "sqlite":
                with op.batch_alter_table("candidates") as batch_op:
                    batch_op.drop_constraint(name, type_="unique")
            else:
                op.drop_constraint(name, "candidates", type_="unique")
            return
    # 레거시 이름 (PostgreSQL 기본 이름 등)
    for try_name in ("uq_candidates_email", "candidates_email_key"):
        try:
            if dialect == "sqlite":
                with op.batch_alter_table("candidates") as batch_op:
                    batch_op.drop_constraint(try_name, type_="unique")
            else:
                op.drop_constraint(try_name, "candidates", type_="unique")
            return
        except Exception:
            continue


def _ensure_email_index(bind) -> None:
    dialect = bind.dialect.name
    insp = inspect(bind)
    idx_names = _index_names(bind, "candidates")
    if "ix_candidates_email" in idx_names:
        return
    if dialect == "sqlite":
        with op.batch_alter_table("candidates") as batch_op:
            batch_op.create_index("ix_candidates_email", ["email"], unique=False)
    else:
        op.create_index("ix_candidates_email", "candidates", ["email"], unique=False)


def _index_names(bind, table: str) -> set[str]:
    return {ix["name"] for ix in inspect(bind).get_indexes(table) if ix.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    _drop_email_unique(bind)
    _ensure_email_index(bind)


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    idx = _index_names(bind, "candidates")
    if "ix_candidates_email" in idx:
        if dialect == "sqlite":
            with op.batch_alter_table("candidates") as batch_op:
                batch_op.drop_index("ix_candidates_email")
        else:
            op.drop_index("ix_candidates_email", table_name="candidates")
    if dialect == "sqlite":
        with op.batch_alter_table("candidates") as batch_op:
            batch_op.create_unique_constraint("uq_candidates_email", ["email"])
        return
    op.create_unique_constraint("uq_candidates_email", "candidates", ["email"])
