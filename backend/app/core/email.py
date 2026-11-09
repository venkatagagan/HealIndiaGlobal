"""Outgoing email (console or SMTP) + Jinja2 templates in ``app/templates/email``.

Do not call ``send_email`` inline from request handlers or event handlers - enqueue a job instead (PLAN 6.1).
The built-in task ``"email.send"`` (registered here) takes ``{"to", "subject", "html", "text"?}``, or
``{"to", "subject", "template", "context"}`` to render on the worker::

    from app.core.jobs import enqueue
    await enqueue(db, "email.send", {"to": user.email, "subject": "Verify your email",
                                     "template": "verify_email.html", "context": {"name": ..., "url": ...}})
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


def _base_context() -> dict[str, Any]:
    return {
        "app_name": settings.APP_NAME,
        "tagline": "Your Gateway to Indian Medical Excellence",
        "patient_web_url": settings.PATIENT_WEB_URL,
        "support_email": _address_only(settings.EMAIL_FROM),
    }


def _address_only(value: str) -> str:
    if "<" in value and ">" in value:
        return value[value.index("<") + 1 : value.index(">")]
    return value


def render_template(template_name: str, /, **ctx: Any) -> str:
    """Render ``app/templates/email/<name>`` with autoescaping."""
    template = _env.get_template(template_name)
    return template.render({**_base_context(), **ctx})


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

    import aiosmtplib

    message = EmailMessage()
    message["From"] = settings.EMAIL_FROM
    message["To"] = ", ".join(recipients)
    message["Subject"] = subject
    message["Date"] = formatdate(localtime=False)
    message["Message-ID"] = make_msgid(domain=_address_only(settings.EMAIL_FROM).partition("@")[2] or None)
    message.set_content(plain)
    message.add_alternative(html, subtype="html")

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


def _register_task() -> None:
    from app.core.jobs import task

    @task("email.send")
    async def send_email_task(db: Any, payload: dict[str, Any]) -> None:
        to = payload["to"]
        subject = str(payload["subject"])
        if payload.get("template"):
            html = render_template(str(payload["template"]), **dict(payload.get("context") or {}))
        else:
            html = str(payload.get("html") or "")
        await send_email(to, subject, html, payload.get("text"))


_register_task()
