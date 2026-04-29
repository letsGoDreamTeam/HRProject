import os

# 예: postgresql+psycopg://user:pass@host:5432/dbname
# 엔진을 만들 때만 사용. 미설정이면 get_engine()에서 오류.
DATABASE_URL = os.environ.get("DATABASE_URL")

## 부서·직무기술서 TSV 절대 경로 (POST /api/interview-questions/from-db 기본값)
JOB_DESCRIPTION_TSV_PATH = os.environ.get("JOB_DESCRIPTION_TSV_PATH", "").strip()
