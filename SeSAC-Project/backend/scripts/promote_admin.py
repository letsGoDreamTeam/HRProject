"""지정 이메일 사용자를 관리자로 승격 (일회성 스크립트)."""

from sqlalchemy import text

from app.database import init_db, get_engine

TARGET = "admin@admin.com"


def main() -> None:
    init_db()
    engine = get_engine()
    if engine is None:
        raise SystemExit("DATABASE_URL이 없습니다.")
    sql = text(
        "UPDATE users SET is_admin = true WHERE lower(trim(email)) = lower(trim(:email))"
    )
    with engine.begin() as conn:
        r = conn.execute(sql, {"email": TARGET})
        n = r.rowcount
    print("rows_updated", n)


if __name__ == "__main__":
    main()
