from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.database import get_engine
from app.services.outbox_runner import process_due_outbox

log = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _tick_outbox() -> None:
    engine = get_engine()
    if engine is None:
        return
    settings = get_settings()
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = Session()
    try:
        stats = process_due_outbox(db, settings)
        if stats.get("processed"):
            log.debug("notification tick %s", stats)
    except Exception:  # noqa: BLE001
        log.exception("notification tick failed")
    finally:
        db.close()


def start_hr_scheduler() -> BackgroundScheduler | None:
    global _scheduler
    settings = get_settings()
    if not settings.notification_scheduler_enabled:
        return None
    if get_engine() is None:
        return None
    if _scheduler is not None:
        return _scheduler
    sec = max(15, int(settings.notification_poll_seconds))
    sched = BackgroundScheduler()
    sched.add_job(_tick_outbox, "interval", seconds=sec, id="hr_outbox", replace_existing=True)
    sched.start()
    _scheduler = sched
    log.info("HR notification scheduler started (every %ss)", sec)
    return sched


def shutdown_hr_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
