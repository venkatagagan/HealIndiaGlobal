"""structlog configuration with secret/PII redaction.

Usage::

    import structlog
    logger = structlog.get_logger(__name__)
    logger.info("booking.confirmed", booking_id=str(booking.id))

Values under sensitive keys (password, token, secret, authorization, passport, account_number, ...) are
replaced by ``"[REDACTED]"`` - recursively inside dicts/lists - before rendering.
"""

from __future__ import annotations

import logging
import sys
from collections.abc import Mapping, MutableMapping
from typing import Any

import structlog

from app.core.config import settings

REDACTED = "[REDACTED]"

_SENSITIVE_FRAGMENTS = (
    "password",
    "passwd",
    "token",
    "secret",
    "authorization",
    "cookie",
    "passport",
    "account_number",
    "api_key",
    "apikey",
    "otp",
    "mfa_code",
    "card_number",
    "cvv",
    "pan",
    "signature",
    "private_key",
    "policy_number",
)
# Keys that contain a sensitive fragment but are safe to log.
_ALLOWED_KEYS = frozenset({"token_type", "expires_in", "company", "pan_last4", "passport_last4"})

_configured = False


def _is_sensitive(key: str) -> bool:
    lowered = key.lower()
    if lowered in _ALLOWED_KEYS or lowered.endswith("_last4"):
        return False
    if lowered == "pan" or lowered.endswith("_pan") or lowered.startswith("pan_"):
        return True
    return any(fragment in lowered for fragment in _SENSITIVE_FRAGMENTS if fragment != "pan")


def redact(value: Any, _depth: int = 0) -> Any:
    """Return a copy of ``value`` with sensitive mapping keys masked."""
    if _depth > 6:
        return value
    if isinstance(value, Mapping):
        return {
            k: (REDACTED if isinstance(k, str) and _is_sensitive(k) else redact(v, _depth + 1))
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return type(value)(redact(v, _depth + 1) for v in value)
    return value


def redact_processor(
    _logger: Any, _method: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    for key in list(event_dict.keys()):
        if key in {"event", "level", "timestamp", "logger"}:
            continue
        if _is_sensitive(key):
            event_dict[key] = REDACTED
        else:
            event_dict[key] = redact(event_dict[key])
    return event_dict


def configure_logging(
    level: str | None = None, json_logs: bool | None = None, *, force: bool = False
) -> None:
    """Configure structlog + stdlib logging once (idempotent unless ``force``)."""
    global _configured
    if _configured and not force:
        return
    log_level = getattr(logging, (level or settings.LOG_LEVEL).upper(), logging.INFO)
    use_json = settings.LOG_JSON if json_logs is None else json_logs

    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        redact_processor,
    ]
    renderer: Any
    if use_json:
        renderer = structlog.processors.JSONRenderer()
        shared_processors.append(structlog.processors.format_exc_info)
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=sys.stderr.isatty())

    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            *shared_processors,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.UnicodeDecoder(),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[structlog.stdlib.ProcessorFormatter.remove_processors_meta, renderer],
    )
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)
    root = logging.getLogger()
    for existing in list(root.handlers):
        if getattr(existing, "_hig_handler", False):
            root.removeHandler(existing)
    handler._hig_handler = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(log_level)

    # Quiet noisy libraries; uvicorn access log is replaced by our access-log middleware.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO if settings.DB_ECHO else logging.WARNING)
    for noisy in ("botocore", "boto3", "urllib3", "httpx", "httpcore", "asyncio", "aiosmtplib"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    _configured = True
