"""Outgoing email (console, SMTP or the Amazon SES API) + Jinja2 templates in ``app/templates/email``.

``EMAIL_BACKEND=ses`` sends the same MIME message with SES ``SendEmail`` (raw content) using the AWS
credential chain (instance/task role): no SMTP password to store or rotate. ``SES_REGION`` picks the endpoint.

Do not call ``send_email`` inline from request handlers or event handlers - enqueue a job instead (PLAN 6.1).
The built-in task ``"email.send"`` (registered here) takes ``{"to", "subject", "html", "text"?}``, or
``{"to", "subject", "template", "context"}`` to render on the worker::

    from app.core.jobs import enqueue
    await enqueue(db, "email.send", {"to": user.email, "subject": "Verify your email",
                                     "template": "verify_email.html", "context": {"name": ..., "url": ...}})

Templates are translated: pass ``"locale"`` (the recipient's language, ``app.i18n.recipient_locale(user)``) in
the payload and build the subject with ``app.i18n.t`` in that language. Template text comes from the server
catalog (``t('email.verify.heading')``); ``base.html`` sets ``<html lang dir>`` (``dir="rtl"`` for Arabic).
"""

from __future__ import annotations

from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path
from typing import Any

import structlog
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.core.config import settings

logger = structlog.get_logger(__name__)

TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "templates"

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR / "email")),
    autoescape=select_autoescape(enabled_extensions=("html", "htm", "xml", "txt"), default=True),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)

# Captured messages when EMAIL_BACKEND=console (tests inspect this; bounded).
outbox: list[dict[str, Any]] = []
_OUTBOX_MAX = 200


def _base_context(locale: str) -> dict[str, Any]:
    from app.i18n import t, text_direction

    def translate(key: str, /, **params: Any) -> str:
        return t(key, locale, **{"app_name": settings.APP_NAME, **params})

    return {
        "app_name": settings.APP_NAME,
        "tagline": translate("email.common.tagline"),
        "patient_web_url": settings.PATIENT_WEB_URL,
        "support_email": _address_only(settings.EMAIL_FROM),
        "lang": locale,
        "dir": text_direction(locale),
        "t": translate,
    }


def _address_only(value: str) -> str:
    if "<" in value and ">" in value:
        return value[value.index("<") + 1 : value.index(">")]
    return value


def render_template(template_name: str, /, *, locale: str | None = None, **ctx: Any) -> str:
    """Render ``app/templates/email/<name>`` with autoescaping in ``locale`` (default English): templates
    get ``t(key, **params)`` bound to that locale plus ``lang``/``dir`` for the ``<html>`` element."""
    from app.i18n import DEFAULT_LANGUAGE, normalize_locale

    template = _env.get_template(template_name)
    return template.render({**_base_context(normalize_locale(locale) or DEFAULT_LANGUAGE), **ctx})


def html_to_text(html: str) -> str:
    import re
    from html import unescape

    text = re.sub(r"(?is)<(script|style).*?</\1>", "", html)
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</h[1-6]>", "\n", text)
    text = re.sub(r"(?is)<a\s[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>", r"\2 (\1)", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line).strip()


def _mask_email(address: str) -> str:
    local, _, domain = address.partition("@")
    return f"{local[:1]}***@{domain}" if domain else "***"


async def send_email(to: str | list[str], subject: str, html: str, text: str | None = None) -> None:
    recipients = [to] if isinstance(to, str) else list(to)
    recipients = [r.strip() for r in recipients if r and r.strip()]
    if not recipients:
        return
    plain = text or html_to_text(html)

    if settings.EMAIL_BACKEND == "console":
        if settings.is_production:
            logger.info("email.console", subject=subject, to=[_mask_email(r) for r in recipients])
        else:
            logger.info("email.console", subject=subject, to=recipients, text=plain[:2000])
        outbox.append({"to": recipients, "subject": subject, "html": html, "text": plain})
        del outbox[:-_OUTBOX_MAX]
        return

    message = EmailMessage()
    message["From"] = settings.EMAIL_FROM
    message["To"] = ", ".join(recipients)
    message["Subject"] = subject
    message["Date"] = formatdate(localtime=False)
    message["Message-ID"] = make_msgid(domain=_address_only(settings.EMAIL_FROM).partition("@")[2] or None)
    message.set_content(plain)
    message.add_alternative(html, subtype="html")

    if settings.EMAIL_BACKEND == "ses":
        await _send_ses(message, recipients)
        logger.info("email.sent", backend="ses", subject=subject, to=[_mask_email(r) for r in recipients])
        return

    import aiosmtplib

    use_tls = settings.SMTP_PORT == 465
    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER or None,
        password=settings.SMTP_PASSWORD or None,
        start_tls=settings.SMTP_STARTTLS and not use_tls,
        use_tls=use_tls,
        timeout=30,
    )
    logger.info("email.sent", subject=subject, to=[_mask_email(r) for r in recipients])


_ses_client: Any = None
_ses_client_region: str | None = None


def _get_ses_client() -> Any:
    global _ses_client, _ses_client_region
    if _ses_client is None or _ses_client_region != settings.SES_REGION:
        import boto3
        from botocore.config import Config

        _ses_client = boto3.client(
            "sesv2",
            region_name=settings.SES_REGION or None,
            config=Config(
                retries={"max_attempts": 3, "mode": "standard"}, connect_timeout=5, read_timeout=30
            ),
        )
        _ses_client_region = settings.SES_REGION
    return _ses_client


def reset_ses_client() -> None:
    """Forget the cached SES client (tests, configuration changes)."""
    global _ses_client, _ses_client_region
    _ses_client = None
    _ses_client_region = None


async def _send_ses(message: EmailMessage, recipients: list[str]) -> None:
    """Hand the MIME message to Amazon SES (SESv2 SendEmail, raw content). Errors propagate, so the
    ``email.send`` job is retried with backoff like an SMTP failure."""
    from starlette.concurrency import run_in_threadpool

    request: dict[str, Any] = {
        "FromEmailAddress": settings.EMAIL_FROM,
        "Destination": {"ToAddresses": recipients},
        "Content": {"Raw": {"Data": message.as_bytes()}},
    }
    if settings.SES_CONFIGURATION_SET:
        request["ConfigurationSetName"] = settings.SES_CONFIGURATION_SET
    client = _get_ses_client()
    await run_in_threadpool(lambda: client.send_email(**request))


def _register_task() -> None:
    from app.core.jobs import task

    @task("email.send")
    async def send_email_task(db: Any, payload: dict[str, Any]) -> None:
        to = payload["to"]
        subject = str(payload["subject"])
        if payload.get("template"):
            html = render_template(
                str(payload["template"]),
                locale=payload.get("locale"),
                **dict(payload.get("context") or {}),
            )
        else:
            html = str(payload.get("html") or "")
        await send_email(to, subject, html, payload.get("text"))


_register_task()
