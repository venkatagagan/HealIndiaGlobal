"""Application settings (pydantic-settings), read from the environment and ``backend/.env``.

Usage::

    from app.core.config import settings, get_settings

Comma-separated environment strings (``CORS_ORIGINS=http://a,http://b``) are parsed into lists; a JSON
array string (``["http://a","http://b"]``) is accepted as well.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import os
import secrets
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import parse_qs, urlsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"

logger = logging.getLogger(__name__)

# libpq sslmode strength; production needs at least "require" (unless the database is on the same host).
_SSLMODE_STRENGTH = {"disable": 0, "allow": 1, "prefer": 2, "require": 3, "verify-ca": 4, "verify-full": 5}

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
    # libpq-style sslmode passed to asyncpg: disable | allow | prefer | require | verify-ca | verify-full.
    # Production must use ``require`` (or ``verify-full`` with the provider's CA bundle).
    DATABASE_SSLMODE: Literal["disable", "allow", "prefer", "require", "verify-ca", "verify-full"] = "prefer"
    REDIS_URL: str = ""

    # --- auth / security -----------------------------------------------------------------------------------
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ISSUER: str = "heal-india-global"
    JWT_AUDIENCE: str = "hig-api"
    ACCESS_TOKEN_TTL_MINUTES: int = Field(default=15, ge=1, le=1440)
    REFRESH_TOKEN_TTL_DAYS: int = Field(default=30, ge=1, le=365)
    # Staff (admin/finance/support/super_admin) sessions: shorter refresh lifetime and an idle timeout - a
    # staff refresh token is refused when the session made no API call for this many minutes.
    STAFF_REFRESH_TOKEN_TTL_HOURS: int = Field(default=12, ge=1, le=24 * 30)
    STAFF_IDLE_TIMEOUT_MINUTES: int = Field(default=30, ge=1, le=24 * 60)
    # Field encryption (AES-256-GCM). FIELD_ENCRYPTION_KEY encrypts new values under FIELD_ENCRYPTION_KEY_ID;
    # FIELD_ENCRYPTION_OLD_KEYS (comma-separated ``<key id>:<base64 key>``) only decrypt, until the
    # ``privacy.reencrypt_fields`` job has rewritten every value under the current key.
    FIELD_ENCRYPTION_KEY: str = ""
    FIELD_ENCRYPTION_KEY_ID: str = Field(default="k1", pattern=r"^[A-Za-z0-9_-]{1,16}$")
    FIELD_ENCRYPTION_OLD_KEYS: StrList = Field(default_factory=list)
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
    # Push notifications (CG-15) through Firebase Cloud Messaging HTTP v1. Push is off unless the project id
    # and a service account (path to the JSON key file, or the JSON itself) are set. The service account
    # needs the "Firebase Cloud Messaging API Admin" role.
    FCM_PROJECT_ID: str = ""
    FCM_SERVICE_ACCOUNT_FILE: str = ""
    FCM_SERVICE_ACCOUNT_JSON: str = ""
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
    # Production refuses STORAGE_BACKEND=local unless this acknowledges a single-host deployment whose storage
    # volume is backed up (infra/docker-compose.yml). Every multi-instance deployment must use S3.
    STORAGE_LOCAL_IN_PRODUCTION: bool = False
    S3_BUCKET: str = ""
    S3_ENDPOINT_URL: str = ""
    S3_REGION: str = ""
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    # Server-side encryption sent with every PutObject: "AES256" (SSE-S3, works with MinIO), "aws:kms"
    # (SSE-KMS with S3_SSE_KMS_KEY_ID, or the account's aws/s3 key when empty) or "bucket_default" (no header:
    # the bucket's default encryption applies). On AWS leave S3_ACCESS_KEY_ID empty: boto3 uses the role.
    S3_SSE: Literal["AES256", "aws:kms", "bucket_default"] = "AES256"
    S3_SSE_KMS_KEY_ID: str = ""
    MAX_UPLOAD_MB: int = Field(default=15, ge=1, le=200)

    # --- email ---------------------------------------------------------------------------------------------
    # console: log + in-memory outbox (dev/tests); smtp: SMTP_* below; ses: Amazon SES API (SendEmail with
    # raw MIME) through the instance/task role - no static credentials (SES_REGION, SES_CONFIGURATION_SET).
    EMAIL_BACKEND: Literal["console", "smtp", "ses"] = "console"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_STARTTLS: bool = True
    EMAIL_FROM: str = "Heal India Global <no-reply@healindiaglobal.ai>"
    SES_REGION: str = ""
    SES_CONFIGURATION_SET: str = ""

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

    # --- quotes / aftercare / video / guests (phase 1) ----------------------------------------------------
    # A hospital must answer a new case with a quote within QUOTE_SLA_HOURS; a reminder goes out after
    # QUOTE_REMINDER_HOURS without a quote. A multi-hospital quote request may name up to QUOTE_MAX_HOSPITALS.
    QUOTE_SLA_HOURS: int = Field(default=48, ge=1, le=24 * 30)
    QUOTE_REMINDER_HOURS: int = Field(default=24, ge=1, le=24 * 30)
    QUOTE_MAX_HOSPITALS: int = Field(default=3, ge=1, le=10)
    # Follow-up video consultations stay possible this many days after discharge; follow-up requests are
    # created automatically at these days after discharge (comma separated) and check-ins at these days.
    AFTERCARE_WINDOW_DAYS: int = Field(default=365, ge=1, le=3650)
    AFTERCARE_FOLLOWUP_DAYS: StrList = Field(default_factory=lambda: ["7", "30", "90"])
    AFTERCARE_CHECKIN_DAYS: StrList = Field(default_factory=lambda: ["1", "3", "7", "14", "30"])
    # Video calls: "jitsi" generates https://<JITSI_BASE_URL>/<unguessable room>; zoom/daily come later.
    VIDEO_PROVIDER: Literal["jitsi"] = "jitsi"
    JITSI_BASE_URL: str = "https://meet.jit.si"
    # Guests may run this many AI screenings/report scans per day (per guest account and per IP address).
    GUEST_AI_DAILY_LIMIT: int = Field(default=3, ge=0, le=100)
    # One-time codes for guest contact verification. "console" keeps SMS codes in an in-memory outbox (dev
    # and tests only); "none" means phone codes cannot be sent (guests verify by email instead); "sns" sends
    # them with Amazon SNS (Publish to a phone number) through the instance/task role (app/core/sms.py).
    SMS_PROVIDER: Literal["console", "none", "sns"] = "console"
    SNS_REGION: str = ""
    # Optional SNS SMS attributes: sender ID (alphanumeric, only where the destination country supports it),
    # an origination number (E.164, e.g. a US toll-free number: required for US destinations) and the type.
    SNS_SMS_SENDER_ID: str = Field(default="", pattern=r"^([A-Za-z0-9]{1,11})?$")
    SNS_SMS_ORIGINATION_NUMBER: str = Field(default="", pattern=r"^(\+[1-9]\d{6,14})?$")
    SNS_SMS_TYPE: Literal["Transactional", "Promotional"] = "Transactional"
    # SMS pumping guard: E.164 country calling codes (without "+", e.g. "1,44,91,234") that may receive codes.
    # Empty = every country. Numbers elsewhere get "use your email address instead".
    SMS_ALLOWED_COUNTRY_CODES: StrList = Field(default_factory=list)

    # --- worker / ops --------------------------------------------------------------------------------------
    RUN_WORKER_IN_API: bool = True
    WORKER_POLL_INTERVAL_SECONDS: float = Field(default=2.0, gt=0)
    RATE_LIMIT_ENABLED: bool = True
    ENABLE_DOCS: bool = True
    LOG_LEVEL: str = "INFO"
    LOG_JSON: bool = False
    SENTRY_DSN: str = ""

    # --- privacy / data rights (DPDP Act 2023 + Rules 2025, GDPR) ------------------------------------------
    # Grievance Officer (DPDP s.8(10) / Rule 14) and Data Protection Officer contacts, published on
    # GET /site-config/privacy-contact and in the privacy policy. Empty values are shown as "not published".
    GRIEVANCE_OFFICER_NAME: str = ""
    GRIEVANCE_OFFICER_EMAIL: str = ""
    GRIEVANCE_OFFICER_PHONE: str = ""
    DPO_NAME: str = ""
    DPO_EMAIL: str = ""
    DPO_PHONE: str = ""
    PRIVACY_POSTAL_ADDRESS: str = ""
    # Days to answer a data-rights request or grievance (GDPR: one month; DPDP Rules: at most 90 days).
    DATA_RIGHTS_SLA_DAYS: int = Field(default=30, ge=1, le=90)
    # Retention and purge jobs (``app/modules/privacy/tasks.py``). 0 disables a purge.
    GUEST_RETENTION_DAYS: int = Field(default=90, ge=0)
    TRAVEL_ID_RETENTION_DAYS_AFTER_TRIP: int = Field(default=90, ge=0)
    SOFT_DELETED_FILE_RETENTION_DAYS: int = Field(default=30, ge=0)
    INACTIVE_ACCOUNT_RETENTION_DAYS: int = Field(default=3 * 365, ge=0)
    INACTIVE_ACCOUNT_NOTICE_DAYS: int = Field(default=30, ge=1)
    NOTIFICATION_RETENTION_DAYS: int = Field(default=180, ge=0)
    # Data export (GET /auth/me/export): requests per user per day and the largest export with files.
    DATA_EXPORT_DAILY_LIMIT: int = Field(default=3, ge=1, le=50)
    DATA_EXPORT_MAX_FILES_MB: int = Field(default=200, ge=1, le=2000)
    # Age of majority for guardian consent (DPDP s.9: a "child" is under 18).
    AGE_OF_MAJORITY: int = Field(default=18, ge=1, le=25)

    # ------------------------------------------------------------------------------------------------------
    @field_validator(
        "CORS_ORIGINS",
        "GOOGLE_CLIENT_IDS",
        "APPLE_CLIENT_IDS",
        "TRUSTED_HOSTS",
        "FIELD_ENCRYPTION_OLD_KEYS",
        "SMS_ALLOWED_COUNTRY_CODES",
        mode="before",
    )
    @classmethod
    def _parse_list(cls, value: Any) -> Any:
        return _split_list(value)

    @field_validator("AFTERCARE_FOLLOWUP_DAYS", "AFTERCARE_CHECKIN_DAYS", mode="before")
    @classmethod
    def _parse_days(cls, value: Any) -> Any:
        parsed = _split_list(value)
        if isinstance(parsed, list):
            for item in parsed:
                if not str(item).strip().isdigit() or not 0 < int(str(item)) <= 3650:
                    raise ValueError(f"invalid day number: {item!r}")
            return [str(int(str(v))) for v in parsed]
        return parsed

    @field_validator("JITSI_BASE_URL", mode="after")
    @classmethod
    def _https_video(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value.startswith("https://"):
            raise ValueError("JITSI_BASE_URL must start with https://")
        return value

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
            if self.EMAIL_BACKEND == "console":
                problems.append("EMAIL_BACKEND must be smtp or ses (console only logs e-mails)")
            if self.STORAGE_BACKEND == "local" and not self.STORAGE_LOCAL_IN_PRODUCTION:
                problems.append(
                    "STORAGE_BACKEND must be s3 (or set STORAGE_LOCAL_IN_PRODUCTION=true for a single-host "
                    "deployment with a backed-up storage volume)"
                )
            bad_origins = [
                o for o in self.CORS_ORIGINS if o.strip() in ("*", "null") or not o.startswith("https://")
            ]
            if bad_origins:
                problems.append(f"CORS_ORIGINS must list https:// origins only (no '*'): {bad_origins}")
            if not self.REDIS_URL and (not self.RUN_WORKER_IN_API or _multi_worker()):
                problems.append(
                    "REDIS_URL is required when the API runs several processes or a separate worker "
                    "(realtime fan-out, shared rate limits)"
                )
            sslmode = self.effective_database_sslmode
            if _SSLMODE_STRENGTH.get(sslmode, 0) < _SSLMODE_STRENGTH["require"] and not _same_host_database(
                self.DATABASE_URL
            ):
                problems.append(f"DATABASE_SSLMODE must be require, verify-ca or verify-full (is {sslmode})")
            # Store listings promise on-device speech-to-text and no retained voice recordings.
            if self.STT_PROVIDER != "local_whisper":
                problems.append("STT_PROVIDER must be local_whisper")
            if self.VOICE_RETAIN_AUDIO:
                problems.append("VOICE_RETAIN_AUDIO must be false")
            if problems:
                raise ValueError("Invalid production settings: " + "; ".join(problems))
            if self.AI_ENABLED and not self.ANTHROPIC_API_KEY:
                logger.warning(
                    "AI_ENABLED is true but ANTHROPIC_API_KEY is empty: screenings fall back to the rules "
                    "engine and document AI is unavailable"
                )
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
    def aftercare_followup_days(self) -> list[int]:
        return sorted({int(d) for d in self.AFTERCARE_FOLLOWUP_DAYS})

    @property
    def aftercare_checkin_days(self) -> list[int]:
        return sorted({int(d) for d in self.AFTERCARE_CHECKIN_DAYS})

    @property
    def ai_available(self) -> bool:
        return self.AI_ENABLED and bool(self.ANTHROPIC_API_KEY)

    @property
    def effective_database_sslmode(self) -> str:
        """The sslmode asyncpg will use: ``ssl``/``sslmode`` in DATABASE_URL win over DATABASE_SSLMODE
        (``app.core.db.ssl_connect_args``)."""
        query = parse_qs(urlsplit(self.DATABASE_URL).query)
        for key in ("sslmode", "ssl"):
            if query.get(key):
                value = query[key][-1].strip().lower()
                aliases = {"true": "require", "1": "require", "false": "disable", "0": "disable"}
                return aliases.get(value, value)
        return self.DATABASE_SSLMODE


def _same_host_database(url: str) -> bool:
    """True for a database on the same host or private container network: loopback, or a single-label host
    name such as the compose service ``postgres`` (traffic never leaves the machine). TLS is not required
    there; any routable host (RDS, Cloud SQL, an IP address) needs sslmode=require or stronger."""
    try:
        host = (urlsplit(url).hostname or "").lower()
    except ValueError:
        return False
    if host in ("localhost", "127.0.0.1", "::1"):
        return True
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return bool(host) and "." not in host
    return False


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
