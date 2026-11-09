"""Application settings (pydantic-settings), read from the environment and ``backend/.env``.

Usage::

    from app.core.config import settings, get_settings

Comma-separated environment strings (``CORS_ORIGINS=http://a,http://b``) are parsed into lists; a JSON
array string (``["http://a","http://b"]``) is accepted as well.
"""

from __future__ import annotations

import ipaddress
import json
import os
import secrets
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"

_WEAK_SECRETS = {"", "changeme", "change-me", "secret", "dev", "development", "test", "jwt-secret"}

StrList = Annotated[list[str], NoDecode]


def _split_list(value: Any) -> Any:
    """Turn ``"a, b,c"`` or ``'["a","b"]'`` into ``["a", "b", "c"]``; leave lists untouched."""
    if value is None:
        return []
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list):
                return [str(v).strip() for v in parsed if str(v).strip()]
        return [part.strip() for part in raw.split(",") if part.strip()]
    if isinstance(value, (tuple, set)):
        return list(value)
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # --- app ---------------------------------------------------------------------------------------------
    ENV: Literal["development", "test", "staging", "production"] = "development"
    APP_NAME: str = "Heal India Global"
    API_BASE_URL: str = "http://127.0.0.1:8000"
    PATIENT_WEB_URL: str = "http://localhost:5173"
    AGENT_PORTAL_URL: str = "http://localhost:5174"
    HOSPITAL_PORTAL_URL: str = "http://localhost:5175"
    ADMIN_PORTAL_URL: str = "http://localhost:5176"
    # Public website = the public login door (PLAN 3.1): /login, /register, /reset-password, /verify-email
    PUBLIC_SITE_URL: str = "http://localhost:3000"

    # --- database / redis ----------------------------------------------------------------------------------
    DATABASE_URL: str = "postgresql+asyncpg://healindia:healindia@127.0.0.1:5432/healindia"
    DB_POOL_SIZE: int = Field(default=10, ge=1, le=200)
    DB_MAX_OVERFLOW: int = Field(default=20, ge=0, le=500)
    DB_ECHO: bool = False
    REDIS_URL: str = ""

    # --- auth / security -----------------------------------------------------------------------------------
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ISSUER: str = "heal-india-global"
    JWT_AUDIENCE: str = "hig-api"
    ACCESS_TOKEN_TTL_MINUTES: int = Field(default=15, ge=1, le=1440)
    REFRESH_TOKEN_TTL_DAYS: int = Field(default=30, ge=1, le=365)
    FIELD_ENCRYPTION_KEY: str = ""
    CORS_ORIGINS: StrList = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:5175",
            "http://localhost:5176",
        ]
    )
    CORS_ORIGIN_REGEX: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    COOKIE_SECURE: bool = False
    COOKIE_DOMAIN: str | None = None
    GOOGLE_CLIENT_IDS: StrList = Field(default_factory=list)
    # Sign in with Apple: accepted identity-token audiences (iOS bundle id and/or web Services ID)
    APPLE_CLIENT_IDS: StrList = Field(default_factory=list)
    # Apple token exchange/revocation (account deletion must revoke Sign in with Apple tokens): the team id,
    # the Sign in with Apple key id and its PKCS#8 PEM private key (escaped newlines are accepted).
    APPLE_TEAM_ID: str = ""
    APPLE_KEY_ID: str = ""
    APPLE_PRIVATE_KEY: str = ""
    ADMIN_MFA_REQUIRED: bool = False
    REQUIRE_EMAIL_VERIFICATION: bool = False
    TRUSTED_HOSTS: StrList = Field(default_factory=lambda: ["*"])
    # Staff door (PLAN 3.1): optional comma-separated CIDRs allowed to use /auth/staff/* and any staff API.
    STAFF_ALLOWED_IPS: StrList = Field(default_factory=list)
    # SEC-022: origin of a separately hosted staff console (e.g. "https://ops.example.com"). When set, the
    # staff door (/auth/staff/*) only accepts browser requests whose Origin is exactly this. Production needs
    # this or STAFF_ALLOWED_IPS (the console otherwise shares the origin of pages with third-party scripts).
    STAFF_CONSOLE_ORIGIN: str | None = None
    # AWS: CloudFront always overwrites CloudFront-Viewer-Address; enable ONLY when the API is reachable
    # solely through CloudFront (otherwise a client could send the header itself).
    TRUST_CLOUDFRONT_VIEWER_ADDRESS: bool = False
    # Reverse proxies whose forwarding headers are trusted (CIDRs; production: the edge's EDGE_IPV4/32). The
    # client IP is the right-most X-Forwarded-For hop that is NOT one of these (INTEGRATION_BACKLOG #20).
    TRUSTED_PROXIES: StrList = Field(
        default_factory=lambda: [
            "127.0.0.0/8",
            "::1/128",
            "10.0.0.0/8",
            "172.16.0.0/12",
            "192.168.0.0/16",
            "fc00::/7",
        ]
    )

    # --- AI ------------------------------------------------------------------------------------------------
    ANTHROPIC_API_KEY: str = ""
    AI_MODEL: str = "claude-opus-5-5"
    AI_EFFORT: str = "medium"
    AI_ENABLED: bool = True
    AI_TIMEOUT_SECONDS: float = Field(default=90, gt=0)
    # SEC-021 (denial of wallet): AI-backed requests per user per day (UTC) and for the whole platform;
    # 0 turns a limit off. Over the global budget, screenings fall back to the rules engine and
    # document AI / voice intake answer 429.
    AI_USER_DAILY_LIMIT_SCREENING: int = Field(default=10, ge=0)
    AI_USER_DAILY_LIMIT_DOCAI: int = Field(default=30, ge=0)
    AI_USER_DAILY_LIMIT_VOICE: int = Field(default=30, ge=0)
    AI_GLOBAL_DAILY_LIMIT: int = Field(default=2000, ge=0)
    # document intelligence (module docai, PLAN §7.1)
    DOCAI_ENABLED: bool = True
    DOCAI_EFFORT: str = "medium"
    DOCAI_MAX_PAGES: int = Field(default=10, ge=1, le=50)
    # voice intake (module voice, PLAN §7.2): speech-to-text engine + limits
    STT_PROVIDER: str = "local_whisper"  # local_whisper | none
    WHISPER_MODEL: str = "small"
    WHISPER_DEVICE: str = "cpu"
    WHISPER_COMPUTE_TYPE: str = "int8"
    WHISPER_MODEL_DIR: str = "./.models/whisper"
    VOICE_MAX_SECONDS: int = Field(default=180, ge=1, le=3600)
    VOICE_RETAIN_AUDIO: bool = False

    # --- storage -------------------------------------------------------------------------------------------
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    STORAGE_LOCAL_DIR: str = "./storage"
    S3_BUCKET: str = ""
    S3_ENDPOINT_URL: str = ""
    S3_REGION: str = ""
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    MAX_UPLOAD_MB: int = Field(default=15, ge=1, le=200)

    # --- email ---------------------------------------------------------------------------------------------
    EMAIL_BACKEND: Literal["console", "smtp"] = "console"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_STARTTLS: bool = True
    EMAIL_FROM: str = "Heal India Global <no-reply@healindia.example>"

    # --- payments ------------------------------------------------------------------------------------------
    PAYMENT_GATEWAYS_ENABLED: StrList = Field(default_factory=lambda: ["mock", "bank_transfer"])
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    BASE_CURRENCY: str = "INR"
    DEFAULT_PATIENT_CURRENCY: str = "USD"

    # --- worker / ops --------------------------------------------------------------------------------------
    RUN_WORKER_IN_API: bool = True
    WORKER_POLL_INTERVAL_SECONDS: float = Field(default=2.0, gt=0)
    RATE_LIMIT_ENABLED: bool = True
    ENABLE_DOCS: bool = True
    LOG_LEVEL: str = "INFO"
    LOG_JSON: bool = False
    SENTRY_DSN: str = ""

    # ------------------------------------------------------------------------------------------------------
    @field_validator("CORS_ORIGINS", "GOOGLE_CLIENT_IDS", "APPLE_CLIENT_IDS", "TRUSTED_HOSTS", mode="before")
    @classmethod
    def _parse_list(cls, value: Any) -> Any:
        return _split_list(value)

    @field_validator("STAFF_ALLOWED_IPS", "TRUSTED_PROXIES", mode="before")
    @classmethod
    def _parse_networks(cls, value: Any) -> Any:
        parsed = _split_list(value)
        if isinstance(parsed, list):
            for item in parsed:
                try:
                    ipaddress.ip_network(str(item), strict=False)
                except ValueError as exc:
                    raise ValueError(f"invalid IP address or CIDR: {item!r}") from exc
        return parsed

    @field_validator("PAYMENT_GATEWAYS_ENABLED", mode="before")
    @classmethod
    def _parse_gateways(cls, value: Any) -> Any:
        parsed = _split_list(value)
        if isinstance(parsed, list):
            return [str(v).lower() for v in parsed]
        return parsed

    @field_validator("BASE_CURRENCY", "DEFAULT_PATIENT_CURRENCY", mode="before")
    @classmethod
    def _upper_ccy(cls, value: Any) -> Any:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("LOG_LEVEL", mode="before")
    @classmethod
    def _upper_level(cls, value: Any) -> Any:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("COOKIE_DOMAIN", mode="before")
    @classmethod
    def _empty_domain(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def _validate_environment(self) -> Settings:
        if self.ENV == "production":
            problems: list[str] = []
            if len(self.JWT_SECRET) < 32 or self.JWT_SECRET.lower() in _WEAK_SECRETS:
                problems.append("JWT_SECRET must be a random string of at least 32 characters")
            if not self.FIELD_ENCRYPTION_KEY:
                problems.append("FIELD_ENCRYPTION_KEY is required")
            if not self.COOKIE_SECURE:
                problems.append("COOKIE_SECURE must be true")
            if "mock" in self.PAYMENT_GATEWAYS_ENABLED:
                problems.append("the 'mock' payment gateway must not be enabled")
            if not self.ADMIN_MFA_REQUIRED:
                problems.append("ADMIN_MFA_REQUIRED must be true")
            if not self.STAFF_ALLOWED_IPS and not self.STAFF_CONSOLE_ORIGIN:
                problems.append("set STAFF_ALLOWED_IPS and/or STAFF_CONSOLE_ORIGIN to protect the staff door")
            # Store listings promise on-device speech-to-text and no retained voice recordings.
            if self.STT_PROVIDER != "local_whisper":
                problems.append("STT_PROVIDER must be local_whisper")
            if self.VOICE_RETAIN_AUDIO:
                problems.append("VOICE_RETAIN_AUDIO must be false")
            if problems:
                raise ValueError("Invalid production settings: " + "; ".join(problems))
        elif self.ENV == "staging" or _multi_worker():
            # Each worker would otherwise generate its own ephemeral secret and reject the others' tokens.
            if not self.JWT_SECRET or self.JWT_SECRET.lower() in _WEAK_SECRETS:
                raise ValueError(
                    "Invalid settings: JWT_SECRET must be set (staging and multi-worker runs cannot use an "
                    "ephemeral secret)"
                )
        elif not self.JWT_SECRET:
            # Single-process dev/test convenience: an ephemeral secret (tokens do not survive a restart).
            self.JWT_SECRET = secrets.token_urlsafe(48)
        return self

    # --- derived helpers -----------------------------------------------------------------------------------
    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    @property
    def is_test(self) -> bool:
        return self.ENV == "test"

    @property
    def docs_enabled(self) -> bool:
        return not (self.is_production and not self.ENABLE_DOCS)

    @property
    def cors_origin_regex(self) -> str | None:
        """The dev regex is honoured only outside production."""
        if self.is_production or not self.CORS_ORIGIN_REGEX:
            return None
        return self.CORS_ORIGIN_REGEX

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024

    @property
    def ai_available(self) -> bool:
        return self.AI_ENABLED and bool(self.ANTHROPIC_API_KEY)


def _multi_worker() -> bool:
    """True when the process manager runs several API workers (gunicorn/uvicorn ``WEB_CONCURRENCY``)."""
    raw = os.environ.get("WEB_CONCURRENCY", "").strip()
    try:
        return int(raw) > 1
    except ValueError:
        return False


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings: Settings = get_settings()
