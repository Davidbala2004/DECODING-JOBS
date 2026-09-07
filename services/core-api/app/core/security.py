"""Shared-secret guard for internal write endpoints (the ingestion pipeline's
/companies/seed and /jobs/seed) — these aren't public-facing like the SendGrid
webhook, just server-to-server, so a simple header secret is enough.
"""

import secrets

from fastapi import Header, HTTPException, status

from app.core.config import get_settings


def require_ingestion_key(x_ingestion_key: str | None = Header(default=None)) -> None:
    """Raises 401/403 unless the caller sent the correct `X-Ingestion-Key` header.

    Closed by default: if INGESTION_API_KEY isn't configured, every request is
    refused rather than the endpoint silently staying open.
    """
    settings = get_settings()
    if not settings.INGESTION_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ingestion endpoint not configured — set INGESTION_API_KEY.",
        )
    if not x_ingestion_key or not secrets.compare_digest(x_ingestion_key, settings.INGESTION_API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing X-Ingestion-Key.")
