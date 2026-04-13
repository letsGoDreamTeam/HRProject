"""기존 DB에 HR 컬럼 추가(PostgreSQL). Alembic 없이 최소 마이그레이션."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine


def run_hr_migrations(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return
    stmts = [
        "ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS correlation_key VARCHAR(128)",
        "ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0",
        "CREATE INDEX IF NOT EXISTS ix_notification_outbox_correlation_key ON notification_outbox (correlation_key)",
        "ALTER TABLE interview_rounds ADD COLUMN IF NOT EXISTS interviewee_per_slot VARCHAR(16) NOT NULL DEFAULT 'single'",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS standardized_resume JSON NOT NULL DEFAULT '{}'::json",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS standardized_text TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS candidate_name VARCHAR(200) NOT NULL DEFAULT ''",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS birth_date VARCHAR(32) NOT NULL DEFAULT ''",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS email_extracted VARCHAR(320) NOT NULL DEFAULT ''",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS stage VARCHAR(32) NOT NULL DEFAULT 'document_review'",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS duplicate_key VARCHAR(300) NOT NULL DEFAULT ''",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS source_ext VARCHAR(16) NOT NULL DEFAULT 'pdf'",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS pdf_conversion_status VARCHAR(32) NOT NULL DEFAULT 'native_pdf'",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS pdf_conversion_note TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS text_quality_ok BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS text_quality_note TEXT NOT NULL DEFAULT ''",
        "CREATE INDEX IF NOT EXISTS ix_application_filter_items_duplicate_key ON application_filter_items (duplicate_key)",
    ]
    with engine.begin() as conn:
        for sql in stmts:
            conn.execute(text(sql))
