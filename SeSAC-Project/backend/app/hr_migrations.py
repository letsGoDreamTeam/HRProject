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
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS source_blob BYTEA",
        "ALTER TABLE job_role_profiles ADD COLUMN IF NOT EXISTS headcount_to INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE application_filter_batches ADD COLUMN IF NOT EXISTS job_role_id UUID",
        "ALTER TABLE interview_candidates ADD COLUMN IF NOT EXISTS applied_position VARCHAR(400) NOT NULL DEFAULT ''",
        "ALTER TABLE interview_rounds ADD COLUMN IF NOT EXISTS interview_phase VARCHAR(32) NOT NULL DEFAULT 'general'",
        "ALTER TABLE interview_rounds ADD COLUMN IF NOT EXISTS department VARCHAR(400) NOT NULL DEFAULT ''",
        "ALTER TABLE interview_rounds ADD COLUMN IF NOT EXISTS job_title VARCHAR(400) NOT NULL DEFAULT ''",
        "ALTER TABLE interview_rounds ADD COLUMN IF NOT EXISTS stage_key VARCHAR(32) NOT NULL DEFAULT ''",
        "ALTER TABLE interview_evaluation_submissions ADD COLUMN IF NOT EXISTS criteria_comments JSON NOT NULL DEFAULT '{}'::json",
        "ALTER TABLE interview_evaluation_submissions ADD COLUMN IF NOT EXISTS final_summary_line VARCHAR(500) NOT NULL DEFAULT ''",
        "ALTER TABLE interview_evaluation_submissions ADD COLUMN IF NOT EXISTS recommendation VARCHAR(16) NOT NULL DEFAULT ''",
        # FK는 컬럼 존재 후 한 번만 생성
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_application_filter_batches_job_role_id'
          ) THEN
            ALTER TABLE application_filter_batches
              ADD CONSTRAINT fk_application_filter_batches_job_role_id
              FOREIGN KEY (job_role_id) REFERENCES job_role_profiles(id) ON DELETE SET NULL;
          END IF;
        END $$;
        """,
        "UPDATE application_filter_items SET stage = 'document_screening' WHERE stage = 'document_review'",
        "UPDATE application_filter_items SET stage = 'interview_1' WHERE stage = 'interview_n'",
        "UPDATE application_filter_items SET stage = 'hired' WHERE stage = 'final_pass'",
        "UPDATE application_filter_items SET stage = 'rejected' WHERE stage = 'final_fail'",
        "ALTER TABLE application_filter_batches ADD COLUMN IF NOT EXISTS employer_sector VARCHAR(16) NOT NULL DEFAULT 'public'",
        "ALTER TABLE application_filter_batches ADD COLUMN IF NOT EXISTS preferred_include_patterns TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE application_filter_batches ADD COLUMN IF NOT EXISTS preferred_exclude_patterns TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE application_filter_batches ADD COLUMN IF NOT EXISTS preferred_requires_evidence BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE application_filter_batches ADD COLUMN IF NOT EXISTS department_name VARCHAR(200) NOT NULL DEFAULT ''",
        "ALTER TABLE application_filter_batches ADD COLUMN IF NOT EXISTS position_name VARCHAR(200) NOT NULL DEFAULT ''",
        "ALTER TABLE application_filter_batches ADD COLUMN IF NOT EXISTS posting_platform VARCHAR(80) NOT NULL DEFAULT ''",
        "ALTER TABLE application_filter_batches ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ",
        "ALTER TABLE application_filter_batches ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ",
        # 채용 절차 설정 테이블 (interview_1~10 지원)
        """
        CREATE TABLE IF NOT EXISTS recruitment_process_configs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(200) NOT NULL,
            department VARCHAR(400) NOT NULL DEFAULT '',
            stages JSON NOT NULL DEFAULT '[]'::json,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_recruitment_process_configs_user_id ON recruitment_process_configs (user_id)",
        # 후보자 일정 확인 토큰 테이블
        """
        CREATE TABLE IF NOT EXISTS stage_confirm_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            item_id UUID NOT NULL REFERENCES application_filter_items(id) ON DELETE CASCADE,
            token VARCHAR(64) NOT NULL UNIQUE,
            stage_label VARCHAR(80) NOT NULL DEFAULT '',
            scheduled_at TIMESTAMPTZ,
            location TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            confirmed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_stage_confirm_tokens_token ON stage_confirm_tokens (token)",
        "CREATE INDEX IF NOT EXISTS ix_stage_confirm_tokens_item_id ON stage_confirm_tokens (item_id)",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS schedule_confirmed_at TIMESTAMPTZ",
        # 지원자 참석 여부 답변 컬럼 (accepted | declined | NULL=미응답)
        "ALTER TABLE stage_confirm_tokens ADD COLUMN IF NOT EXISTS attendance VARCHAR(16)",
        "ALTER TABLE stage_confirm_tokens ADD COLUMN IF NOT EXISTS next_stage_key VARCHAR(32) NOT NULL DEFAULT ''",
        "ALTER TABLE stage_confirm_tokens ADD COLUMN IF NOT EXISTS schedule_pick_url TEXT NOT NULL DEFAULT ''",
        # OpenAI 토큰 사용량 로그
        """
        CREATE TABLE IF NOT EXISTS openai_token_usage (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            feature VARCHAR(80) NOT NULL DEFAULT 'unknown',
            model VARCHAR(120) NOT NULL DEFAULT '',
            request_kind VARCHAR(24) NOT NULL DEFAULT 'chat',
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_openai_token_usage_created_at ON openai_token_usage (created_at)",
        "CREATE INDEX IF NOT EXISTS ix_openai_token_usage_model ON openai_token_usage (model)",
        "ALTER TABLE interview_candidates ADD COLUMN IF NOT EXISTS application_filter_item_id UUID",
        "ALTER TABLE interview_candidates ADD COLUMN IF NOT EXISTS schedule_declined_at TIMESTAMPTZ",
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_interview_candidates_application_filter_item_id'
          ) THEN
            ALTER TABLE interview_candidates
              ADD CONSTRAINT fk_interview_candidates_application_filter_item_id
              FOREIGN KEY (application_filter_item_id) REFERENCES application_filter_items(id) ON DELETE SET NULL;
          END IF;
        END $$;
        """,
        "CREATE INDEX IF NOT EXISTS ix_interview_candidates_application_filter_item_id ON interview_candidates (application_filter_item_id)",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS source_platform VARCHAR(40) NOT NULL DEFAULT 'unknown'",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS role_relevance_score DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS resume_completeness_score DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS missing_fields JSON NOT NULL DEFAULT '[]'::json",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS preferred_rule_hits JSON NOT NULL DEFAULT '[]'::json",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS preferred_rule_excluded_hits JSON NOT NULL DEFAULT '[]'::json",
        "ALTER TABLE application_filter_items ADD COLUMN IF NOT EXISTS evidence_level VARCHAR(16) NOT NULL DEFAULT 'unknown'",
        # 중복지원 후보자 마스터/링크/검토로그
        """
        CREATE TABLE IF NOT EXISTS candidate_masters (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            canonical_name VARCHAR(200) NOT NULL DEFAULT '',
            canonical_birth_date VARCHAR(32) NOT NULL DEFAULT '',
            canonical_email VARCHAR(320) NOT NULL DEFAULT '',
            canonical_phone VARCHAR(64) NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_candidate_masters_user_id ON candidate_masters (user_id)",
        """
        CREATE TABLE IF NOT EXISTS candidate_application_links (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            candidate_id UUID NOT NULL REFERENCES candidate_masters(id) ON DELETE CASCADE,
            item_id UUID NOT NULL REFERENCES application_filter_items(id) ON DELETE CASCADE,
            source_platform VARCHAR(40) NOT NULL DEFAULT 'unknown',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_candidate_application_links_item_id UNIQUE (item_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_candidate_application_links_user_id ON candidate_application_links (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_candidate_application_links_candidate_id ON candidate_application_links (candidate_id)",
        "CREATE INDEX IF NOT EXISTS ix_candidate_application_links_item_id ON candidate_application_links (item_id)",
        """
        CREATE TABLE IF NOT EXISTS candidate_dedup_review_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            action VARCHAR(32) NOT NULL DEFAULT 'review',
            status VARCHAR(24) NOT NULL DEFAULT 'REVIEW_REQUIRED',
            score DOUBLE PRECISION NOT NULL DEFAULT 0,
            reason TEXT NOT NULL DEFAULT '',
            item_ids JSON NOT NULL DEFAULT '[]'::json,
            candidate_id UUID REFERENCES candidate_masters(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_candidate_dedup_review_logs_user_id ON candidate_dedup_review_logs (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_candidate_dedup_review_logs_candidate_id ON candidate_dedup_review_logs (candidate_id)",
        "CREATE INDEX IF NOT EXISTS ix_candidate_dedup_review_logs_created_at ON candidate_dedup_review_logs (created_at)",
    ]
    with engine.begin() as conn:
        for sql in stmts:
            conn.execute(text(sql))
