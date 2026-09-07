"""Application configuration, loaded from environment variables (.env in dev)."""

from functools import lru_cache
from typing import Annotated

from pydantic import PostgresDsn, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Strictly-typed runtime configuration for the core-api service."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "DECODING JOBS Core API"
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: PostgresDsn

    # Comma-separated in the environment, e.g. "http://localhost:3000,http://127.0.0.1:3000"
    # NoDecode stops pydantic-settings from attempting a JSON parse first, so the
    # raw comma-separated string reaches the validator below intact.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def split_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    # Email-based interview round detection (app/api/emails.py). All optional —
    # unset means the feature stays inert (webhook logs an unmatched event,
    # extraction returns nulls) rather than erroring.
    # Free-tier key from https://console.groq.com — no paid API key needed.
    GROQ_API_KEY: str | None = None
    # Domain the SendGrid Inbound Parse route is configured on, e.g.
    # "track.example.com" — a user's forwarding address is u-{token}@this.
    # None until that DNS/SendGrid setup is done.
    INBOUND_EMAIL_DOMAIN: str | None = None
    # HTTP Basic Auth credentials for the inbound webhook — this is SendGrid's
    # own documented way to secure an Inbound Parse route (Inbound Parse has
    # no request-signing like their Event Webhook does), configured by
    # embedding https://{user}:{password}@your-domain.com/... in the parse
    # route's target URL. Required once INBOUND_EMAIL_DOMAIN is set.
    SENDGRID_INBOUND_USERNAME: str | None = None
    SENDGRID_INBOUND_PASSWORD: str | None = None

    # Shared secret the ingestion pipeline (scripts/fetch-real-jobs.mjs) sends
    # as `X-Ingestion-Key` to prove it's not a random caller. Unlike the
    # GROQ_API_KEY-style features above, these endpoints have WRITE access to
    # the live map — unset means the endpoint refuses every request (closed
    # by default), not "feature disabled." Generate one with
    # `python -c "import secrets; print(secrets.token_hex(32))"`.
    INGESTION_API_KEY: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor — environment is read once per process."""
    return Settings()
