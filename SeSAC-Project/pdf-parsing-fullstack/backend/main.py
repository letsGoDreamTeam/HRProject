"""레거시 엔트리: `app.main`의 ASGI 앱을 그대로 노출합니다 (fastapi dev / uvicorn 호환)."""

from app.main import app

__all__ = ["app"]
