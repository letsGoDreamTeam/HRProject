import os

# 예: postgresql+psycopg://user:pass@host:5432/dbname
# 엔진을 만들 때만 사용. 미설정이면 get_engine()에서 오류.
DATABASE_URL = os.environ.get("DATABASE_URL")
