"""메일·SMS 발송 (설정 없으면 로그만)."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import TYPE_CHECKING

import httpx

from app.config import Settings

if TYPE_CHECKING:
    pass

log = logging.getLogger(__name__)


def send_email_sync(settings: Settings, *, to_addr: str, subject: str, body: str) -> tuple[bool, str]:
    to_addr = (to_addr or "").strip()
    if not to_addr:
        return False, "수신 이메일 없음"
    if not settings.smtp_host or not settings.smtp_from:
        log.info("[email:skipped] to=%s subject=%s", to_addr, subject[:80])
        return True, "SMTP 미설정(로그만)"
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to_addr
    msg.set_content(body)
    try:
        if settings.smtp_use_tls:
            with smtplib.SMTP(settings.smtp_host, int(settings.smtp_port)) as s:
                s.starttls()
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, int(settings.smtp_port)) as s:
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
        return True, ""
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def send_sms_twilio(settings: Settings, *, to_phone: str, body: str) -> tuple[bool, str]:
    to_phone = (to_phone or "").strip()
    if not to_phone:
        return False, "수신 전화번호 없음"
    sid = settings.twilio_account_sid.strip()
    token = settings.twilio_auth_token.strip()
    from_num = settings.twilio_from_number.strip()
    if not (sid and token and from_num):
        log.info("[sms:skipped] to=%s body=%s", to_phone, body[:120])
        return True, "Twilio 미설정(로그만)"
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(
                url,
                data={"To": to_phone, "From": from_num, "Body": body[:1400]},
                auth=(sid, token),
            )
        if r.status_code >= 400:
            return False, r.text[:500]
        return True, ""
    except Exception as e:  # noqa: BLE001
        return False, str(e)
