"""Outbound email via SendGrid's Mail Send API — a separate credential from
the Inbound Parse setup used elsewhere in this app. Used by saved-search job
alerts. If SENDGRID_API_KEY isn't configured, send_email() logs and returns
False instead of raising, so a saved search still works as a quick-access
shortcut even with alerts unconfigured.
"""

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send"


async def send_email(to: str, subject: str, html_content: str) -> bool:
    settings = get_settings()
    if not settings.SENDGRID_API_KEY or not settings.SENDGRID_FROM_EMAIL:
        logger.info("SendGrid not configured — skipping email to %s: %s", to, subject)
        return False

    payload = {
        "personalizations": [{"to": [{"email": to}]}],
        "from": {"email": settings.SENDGRID_FROM_EMAIL},
        "subject": subject,
        "content": [{"type": "text/html", "value": html_content}],
    }
    headers = {"Authorization": f"Bearer {settings.SENDGRID_API_KEY}"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(SENDGRID_API_URL, json=payload, headers=headers)
            response.raise_for_status()
        return True
    except httpx.HTTPError as exc:
        logger.warning("SendGrid send failed for %s: %s", to, exc)
        return False
