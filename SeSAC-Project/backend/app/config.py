from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    # 구조화 출력 호출 temperature (강의 structured output 권장: 0)
    openai_temperature: float = 0.0
    # Router+가드레일: 채용 공고 여부 사전 분류 시 True (게이트 모델 1회 추가)
    jd_input_gate_enabled: bool = False
    openai_gate_model: str = "gpt-4o-mini"
    # Reflection: evidence가 JD 부분 문자열이 아니면 1회 교정
    jd_evidence_repair_enabled: bool = True
    # PDF 업로드 상한(바이트). JD·지원서·직무소개서 공통.
    pdf_max_bytes: int = 100 * 1024 * 1024
    # 스캔 PDF: 텍스트 레이어가 부족할 때 Vision OCR (PyMuPDF 래스터 + OpenAI)
    pdf_ocr_enabled: bool = True
    pdf_ocr_model: str = "gpt-4o-mini"
    pdf_ocr_min_chars: int = 80
    # 0 이하 = 페이지 수 제한 없음(전 페이지 OCR). 양수면 해당 페이지까지만.
    pdf_ocr_max_pages: int = 0
    pdf_ocr_zoom: float = 2.0
    pdf_ocr_max_edge_px: int = 2048
    # OCR 페이지 병렬 처리(1~16). LangChain 병렬화 노트와 동일하게 API 호출 분산.
    pdf_ocr_concurrency: int = 6
    # 추출 텍스트 품질 최소 길이(미만이면 low quality로 기록)
    resume_text_min_chars: int = 120
    # 통합 직무소개서: 텍스트 청크 크기·병렬 추출 워커(청크당 1회 LLM)
    hr_job_pdf_chunk_size: int = 8_000
    hr_job_pdf_chunk_overlap: int = 400
    hr_job_pdf_extract_workers: int = 8
    # 회사 프로필 PDF 분리 시 LLM에 넣는 최대 글자(초장문 방지)
    company_profile_split_max_chars: int = 500_000
    # JD에서 도출할 역량(items) 최대 개수 (OpenAI 스키마·토큰 한도로 상한 250)
    jd_max_competencies: int = 100
    database_url: str | None = None
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # 면접 일정 선택 링크(이메일/SMS). 비우면 CORS_ORIGINS 첫 항목 사용.
    frontend_public_url: str = ""
    # A-PASS: 인재상 RAG 임베딩·로컬 벡터 저장 경로
    apass_embedding_model: str = "text-embedding-3-small"
    apass_data_dir: str = ".apass_data"
    # --- HR / 인증 ---
    jwt_secret: str = "dev-change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    default_timezone: str = "Asia/Seoul"
    # 첫 가입 사용자를 관리자로 올릴 이메일(쉼표 구분). 비우면 is_admin은 요청값만 반영.
    bootstrap_admin_emails: str = ""
    # SMTP (불합격·일정·리마인더 메일). 비우면 메일은 로그만.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True
    # Twilio (SMS). 비우면 SMS는 로그만.
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    # 스케줄러(대기 알림 발송)
    notification_scheduler_enabled: bool = True
    notification_poll_seconds: int = 60
    # 알림 실패 시 지수 백오프 재시도 (성공 시 attempt_count 유지)
    notification_max_send_attempts: int = 10
    notification_retry_base_seconds: int = 60
    notification_retry_max_seconds: int = 3600

    @field_validator("jd_max_competencies")
    @classmethod
    def _clamp_jd_max_competencies(cls, v: int) -> int:
        return max(1, min(int(v), 250))

    @field_validator("notification_max_send_attempts")
    @classmethod
    def _clamp_attempts(cls, v: int) -> int:
        return max(1, min(int(v), 100))

    @field_validator("pdf_max_bytes")
    @classmethod
    def _clamp_pdf_max_bytes(cls, v: int) -> int:
        return max(5 * 1024 * 1024, min(int(v), 250 * 1024 * 1024))

    @field_validator("pdf_ocr_concurrency")
    @classmethod
    def _clamp_pdf_ocr_concurrency(cls, v: int) -> int:
        return max(1, min(int(v), 16))

    @field_validator("resume_text_min_chars")
    @classmethod
    def _clamp_resume_min_chars(cls, v: int) -> int:
        return max(20, min(int(v), 5000))

    @field_validator("hr_job_pdf_extract_workers")
    @classmethod
    def _clamp_hr_job_workers(cls, v: int) -> int:
        return max(1, min(int(v), 32))

    @field_validator("hr_job_pdf_chunk_size")
    @classmethod
    def _clamp_hr_chunk(cls, v: int) -> int:
        return max(2_000, min(int(v), 50_000))

    @field_validator("company_profile_split_max_chars")
    @classmethod
    def _clamp_company_split(cls, v: int) -> int:
        return max(50_000, min(int(v), 1_000_000))


@lru_cache
def get_settings() -> Settings:
    return Settings()
