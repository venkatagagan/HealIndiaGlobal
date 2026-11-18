"""WhatsApp channel (Meta WhatsApp Cloud API) - a notification channel parallel to push.

* **Opt-in**: a user verifies a phone number (E.164) with a 6-digit code sent as the ``hig_verification_code``
  authentication template, which records consent ``whatsapp_updates``. Opt-out: reply STOP (webhook) or
  switch it off in settings (consent row with ``granted=False``). Only ``active`` opt-ins get messages.
* **Messages**: business-initiated messages MUST use templates pre-approved by Meta. The registry
  (``whatsapp_templates/templates.json``) maps notification kinds (+ recipient role) to a template, its
  parameters and the body text per language (en/ar/fr/bn/ru, mapped to Meta language codes). Template text is
  generic and non-clinical: never diagnoses, procedures or document content.
* ``notifications.notify`` calls :func:`maybe_enqueue` for every notification; when WhatsApp is configured,
  the kind has a template and the user opted in, the job ``messaging.send_whatsapp`` is enqueued (deduplicated
  per notification). The job logs the attempt in ``whatsapp_messages`` (template, language, status - never the
  text or its parameters) and enforces a per-user daily limit.
* **Webhook** ``POST /api/v1/webhooks/whatsapp`` (X-Hub-Signature-256 = HMAC-SHA256 of the raw body with the
  app secret) updates delivery statuses and handles STOP replies; ``GET`` answers Meta's verification
  challenge with ``WHATSAPP_VERIFY_TOKEN``.

Configuration: ``WHATSAPP_PROVIDER=meta``, ``WHATSAPP_PHONE_NUMBER_ID``, ``WHATSAPP_ACCESS_TOKEN``,
``WHATSAPP_APP_SECRET``, ``WHATSAPP_VERIFY_TOKEN``. With ``WHATSAPP_PROVIDER=none`` (default) nothing is sent
and the opt-in endpoints answer ``whatsapp_unavailable``.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx
import structlog
from fastapi import Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.crypto import CryptoError, decrypt_str, encrypt_str, keyed_fingerprint
from app.core.enums import ConsentKind, ContactChannel, WhatsAppMessageStatus, WhatsAppOptInStatus
from app.core.errors import BadRequest, Forbidden, NotFound, RateLimited
from app.core.jobs import PermanentJobError, enqueue, task
from app.core.rate_limit import hit
from app.i18n import recipient_locale
from app.models import Notification, User, WhatsAppMessage, WhatsAppOptIn
from app.modules.messaging.policies import is_active_user, role_of

logger = structlog.get_logger(__name__)

SEND_TASK = "messaging.send_whatsapp"
CODE_TASK = "messaging.send_whatsapp_code"
VERIFICATION_KIND = "whatsapp.verification"
CONSENT_VERSION = "2026-11"
GRAPH_URL = "https://graph.facebook.com/{version}/{phone_number_id}/messages"

CODE_TTL = timedelta(minutes=10)
MAX_CODE_ATTEMPTS = 5
MAX_CODES_PER_WINDOW = 3  # per CODE_TTL
TEMPLATES_FILE = Path(__file__).resolve().parent / "whatsapp_templates" / "templates.json"

#: Replies that opt a user out (compared after trimming, case-folding and dropping punctuation).
STOP_WORDS: frozenset[str] = frozenset(
    {
        "stop",
        "stop all",
        "stopall",
        "unsubscribe",
        "cancel",
        "end",
        "quit",
        "arret",
        "arrêt",
        "arreter",
        "arrêter",
        "desabonner",
        "désabonner",
        "توقف",
        "إيقاف",
        "ايقاف",
        "الغاء",
        "إلغاء",
        "বন্ধ",
        "বন্ধ করুন",
        "стоп",
        "отписаться",
        "отписка",
    }
)

_STATUS_RANK: dict[WhatsAppMessageStatus, int] = {
    WhatsAppMessageStatus.QUEUED: 0,
    WhatsAppMessageStatus.SENT: 1,
    WhatsAppMessageStatus.DELIVERED: 2,
    WhatsAppMessageStatus.READ: 3,
}


# =========================================================================================== configuration
def whatsapp_configured() -> bool:
    """True when business-initiated messages can be sent."""
    return bool(
        settings.WHATSAPP_PROVIDER == "meta"
        and settings.WHATSAPP_PHONE_NUMBER_ID
        and settings.WHATSAPP_ACCESS_TOKEN
    )


def webhook_configured() -> bool:
    return bool(settings.WHATSAPP_PROVIDER == "meta" and settings.WHATSAPP_APP_SECRET)


# ======================================================================================= template registry
@dataclass(frozen=True, slots=True)
class WhatsAppTemplate:
    name: str
    category: str
    kinds: tuple[str, ...]
    roles: tuple[str, ...]
    params: tuple[str, ...]
    body: Mapping[str, str]
    examples: tuple[str, ...] = ()
    when: Mapping[str, str] = field(default_factory=dict)
    otp_button: bool = False

    def matches(self, kind: str, role: str, data: Mapping[str, Any]) -> bool:
        if kind not in self.kinds or (self.roles and role not in self.roles):
            return False
        return all(str(data.get(k)) == str(v) for k, v in self.when.items())


@dataclass(frozen=True, slots=True)
class TemplateRegistry:
    languages: Mapping[str, str]
    name_fallback: Mapping[str, str]
    templates: tuple[WhatsAppTemplate, ...]

    @property
    def kinds(self) -> frozenset[str]:
        return frozenset(k for t in self.templates for k in t.kinds)

    def by_name(self, name: str) -> WhatsAppTemplate | None:
        return next((t for t in self.templates if t.name == name), None)

    def for_notification(self, kind: str, role: str, data: Mapping[str, Any]) -> WhatsAppTemplate | None:
        return next((t for t in self.templates if t.matches(kind, role, data)), None)

    def language_code(self, locale: str) -> str:
        return self.languages.get(locale) or self.languages.get("en", "en")


@lru_cache(maxsize=1)
def registry() -> TemplateRegistry:
    raw = json.loads(TEMPLATES_FILE.read_text(encoding="utf-8"))
    templates = tuple(
        WhatsAppTemplate(
            name=str(t["name"]),
            category=str(t["category"]),
            kinds=tuple(t.get("kinds") or ()),
            roles=tuple(t.get("roles") or ()),
            params=tuple(t.get("params") or ()),
            body=dict(t["body"]),
            examples=tuple(t.get("examples") or ()),
            when=dict(t.get("when") or {}),
            otp_button=bool(t.get("otp_button")),
        )
        for t in raw["templates"]
    )
    return TemplateRegistry(
        languages=dict(raw["languages"]),
        name_fallback=dict(raw.get("name_fallback") or {}),
        templates=templates,
    )


def render_preview(template: WhatsAppTemplate, locale: str, values: list[str]) -> str:
    """The text the recipient sees (tests/docs only - the rendered text is never stored)."""
    text = template.body.get(locale) or template.body["en"]
    for i, value in enumerate(values, start=1):
        text = text.replace("{{" + str(i) + "}}", value)
    return text


_WS_RE = re.compile(r"[\t\r\n]+")
_SPACES_RE = re.compile(r" {4,}")


def clean_param(value: Any, limit: int = 200) -> str:
    """Meta rejects parameters with newlines, tabs or more than 4 consecutive spaces."""
    text = _SPACES_RE.sub("   ", _WS_RE.sub(" ", str(value if value is not None else ""))).strip()
    return text[:limit]


# =========================================================================================== provider
class WhatsAppSendError(Exception):
    def __init__(self, code: str, title: str, *, permanent: bool) -> None:
        super().__init__(f"{code}: {title}")
        self.code = code
        self.title = title
        self.permanent = permanent


#: Tests replace the transport (``httpx.MockTransport``) - external APIs are never called from tests.
_transport: httpx.AsyncBaseTransport | None = None


def set_http_transport(transport: httpx.AsyncBaseTransport | None) -> None:
    global _transport
    _transport = transport


def build_template_payload(
    to_e164: str, template: WhatsAppTemplate, language_code: str, values: list[str]
) -> dict[str, Any]:
    components: list[dict[str, Any]] = []
    if values:
        components.append({"type": "body", "parameters": [{"type": "text", "text": v} for v in values]})
    if template.otp_button and values:
        # Authentication templates: the copy-code button carries the code as its URL parameter.
        components.append(
            {
                "type": "button",
                "sub_type": "url",
                "index": "0",
                "parameters": [{"type": "text", "text": values[0]}],
            }
        )
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_e164.lstrip("+"),
        "type": "template",
        "template": {"name": template.name, "language": {"code": language_code}, "components": components},
    }


async def send_template(
    to_e164: str, template: WhatsAppTemplate, language_code: str, values: list[str]
) -> str:
    """POST one template message to the Cloud API; returns Meta's message id (``wamid...``)."""
    url = GRAPH_URL.format(
        version=settings.WHATSAPP_GRAPH_API_VERSION, phone_number_id=settings.WHATSAPP_PHONE_NUMBER_ID
    )
    payload = build_template_payload(to_e164, template, language_code, values)
    async with httpx.AsyncClient(timeout=15, transport=_transport) as client:
        try:
            resp = await client.post(
                url, json=payload, headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"}
            )
        except httpx.HTTPError as exc:
            raise WhatsAppSendError("network", type(exc).__name__, permanent=False) from exc
    if resp.status_code < 300:
        try:
            return str(resp.json()["messages"][0]["id"])
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise WhatsAppSendError("bad_response", "no message id", permanent=True) from exc
    try:
        error = resp.json().get("error") or {}
    except ValueError:
        error = {}
    code = str(error.get("code") or resp.status_code)
    title = str(error.get("error_user_title") or error.get("type") or f"HTTP {resp.status_code}")[:255]
    # 429 / 130429 (throughput) / 131056 (pair rate) / 5xx: retry. Everything else (bad template, bad
    # parameters, auth 190, undeliverable 131026) will not get better by retrying.
    transient = resp.status_code == 429 or resp.status_code >= 500 or code in ("130429", "131056", "131000")
    raise WhatsAppSendError(code, title, permanent=not transient)


# =========================================================================================== opt-in
class WhatsAppStatusOut(BaseModel):
    available: bool
    status: str  # none | pending | active | opted_out
    phone_masked: str | None = None
    verified_at: datetime | None = None
    opted_in_at: datetime | None = None
    opted_out_at: datetime | None = None
    code_expires_at: datetime | None = None


class WhatsAppVerifyIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    phone: str = Field(min_length=8, max_length=32)


class WhatsAppConfirmIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


def normalize_phone(raw: str) -> str:
    from app.modules.guests.service import normalize_contact

    return normalize_contact(ContactChannel.PHONE, raw)


def phone_hash(e164: str) -> str:
    return keyed_fingerprint(e164, "whatsapp-phone") or ""


def mask_phone(e164: str) -> str:
    return f"{e164[:4]}*****{e164[-3:]}"


def _code_hash(row_id: uuid.UUID, code: str) -> str:
    return keyed_fingerprint(f"{row_id}:{code}", "whatsapp-code") or ""


async def _optin(db: AsyncSession, user_id: uuid.UUID, *, lock: bool = False) -> WhatsAppOptIn | None:
    stmt = select(WhatsAppOptIn).where(WhatsAppOptIn.user_id == user_id)
    if lock:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


def status_out(row: WhatsAppOptIn | None) -> WhatsAppStatusOut:
    if row is None:
        return WhatsAppStatusOut(available=whatsapp_configured(), status="none")
    status = WhatsAppOptInStatus(row.status)
    return WhatsAppStatusOut(
        available=whatsapp_configured(),
        status=status.value,
        phone_masked=row.phone_masked,
        verified_at=row.verified_at,
        opted_in_at=row.opted_in_at if status == WhatsAppOptInStatus.ACTIVE else None,
        opted_out_at=row.opted_out_at,
        code_expires_at=row.code_expires_at if status == WhatsAppOptInStatus.PENDING else None,
    )


async def get_status(db: AsyncSession, user: User) -> WhatsAppStatusOut:
    return status_out(await _optin(db, user.id))


def _ensure_available(user: User) -> None:
    if not whatsapp_configured():
        raise BadRequest("WhatsApp updates are not available yet", code="whatsapp_unavailable")
    if user.is_guest:
        raise Forbidden("Create a full account to receive WhatsApp updates", code="guest_upgrade_required")


async def start_verification(
    db: AsyncSession, user: User, body: WhatsAppVerifyIn, request: Request | None
) -> WhatsAppStatusOut:
    """Send a 6-digit code to ``body.phone`` on WhatsApp (status ``pending`` until confirmed). Changing the
    number stops messages to the old number at once."""
    _ensure_available(user)
    phone = normalize_phone(body.phone)
    await hit("whatsapp.verify_day", str(user.id), 10, 86400, message="Too many codes today", force=True)
    now = datetime.now(UTC)
    row = await _optin(db, user.id, lock=True)
    if row is None:
        row = WhatsAppOptIn(
            user_id=user.id, phone_e164=phone, phone_hash=phone_hash(phone), phone_masked=mask_phone(phone)
        )
        db.add(row)
        await db.flush()
    else:
        recent = row.last_code_sent_at is not None and row.last_code_sent_at > now - CODE_TTL
        if recent and row.codes_sent >= MAX_CODES_PER_WINDOW:
            raise RateLimited("Too many codes were sent. Please wait 10 minutes.", retry_after=600)
        if not recent:
            row.codes_sent = 0
    previous = WhatsAppOptInStatus(row.status) if row.status else WhatsAppOptInStatus.PENDING
    code = f"{secrets.randbelow(1_000_000):06d}"
    row.phone_e164 = phone
    row.phone_hash = phone_hash(phone)
    row.phone_masked = mask_phone(phone)
    row.status = WhatsAppOptInStatus.PENDING
    row.code_hash = _code_hash(row.id, code)
    row.code_expires_at = now + CODE_TTL
    row.code_attempts = 0
    row.codes_sent = (row.codes_sent or 0) + 1
    row.last_code_sent_at = now
    await enqueue(
        db,
        CODE_TASK,
        {"optin_id": str(row.id), "code": encrypt_str(code), "locale": recipient_locale(user)},
        max_attempts=3,
    )
    await audit_log(
        db,
        actor=user,
        action="whatsapp.verify_start",
        entity_type="whatsapp_optin",
        entity_id=row.id,
        before={"status": previous.value},
        after={"phone": row.phone_masked},
        request=request,
    )
    await db.commit()
    return status_out(row)


async def confirm_verification(
    db: AsyncSession, user: User, body: WhatsAppConfirmIn, request: Request | None
) -> WhatsAppStatusOut:
    from app.modules.auth.service import record_consent

    _ensure_available(user)
    row = await _optin(db, user.id, lock=True)
    if row is None or WhatsAppOptInStatus(row.status) != WhatsAppOptInStatus.PENDING or not row.code_hash:
        raise NotFound("No WhatsApp verification is pending", code="whatsapp_no_pending_code")
    if row.code_attempts >= MAX_CODE_ATTEMPTS:
        raise BadRequest("Too many wrong codes. Ask for a new code.", code="too_many_attempts")
    if row.code_expires_at is None or row.code_expires_at <= datetime.now(UTC):
        raise BadRequest("This code has expired. Ask for a new code.", code="code_expired")
    row.code_attempts += 1
    if not hmac.compare_digest(row.code_hash, _code_hash(row.id, body.code)):
        left = MAX_CODE_ATTEMPTS - row.code_attempts
        await db.commit()
        raise BadRequest(
            "The code is not correct." + (f" {left} attempts left." if left else " Ask for a new code."),
            code="invalid_code",
            details={"attempts_left": left},
        )
    now = datetime.now(UTC)
    row.status = WhatsAppOptInStatus.ACTIVE
    row.code_hash = None
    row.code_expires_at = None
    row.verified_at = now
    row.opted_in_at = now
    row.opted_out_at = None
    row.opt_out_source = None
    record_consent(db, user.id, ConsentKind.WHATSAPP_UPDATES, CONSENT_VERSION, request, granted=True)
    await audit_log(
        db,
        actor=user,
        action="whatsapp.opt_in",
        entity_type="whatsapp_optin",
        entity_id=row.id,
        after={"phone": row.phone_masked},
        request=request,
    )
    await db.commit()
    return status_out(row)


async def _opt_out_row(
    db: AsyncSession, row: WhatsAppOptIn, source: str, actor: User | None, request: Request | None
) -> None:
    from app.modules.auth.service import record_consent

    before = WhatsAppOptInStatus(row.status).value
    row.status = WhatsAppOptInStatus.OPTED_OUT
    row.opted_out_at = datetime.now(UTC)
    row.opt_out_source = source
    row.code_hash = None
    row.code_expires_at = None
    record_consent(db, row.user_id, ConsentKind.WHATSAPP_UPDATES, CONSENT_VERSION, request, granted=False)
    await audit_log(
        db,
        actor=actor,
        action="whatsapp.opt_out",
        entity_type="whatsapp_optin",
        entity_id=row.id,
        before={"status": before},
        after={"status": "opted_out", "source": source},
        request=request,
    )


async def opt_out(db: AsyncSession, user: User, request: Request | None) -> WhatsAppStatusOut:
    row = await _optin(db, user.id, lock=True)
    if row is None:
        return status_out(None)
    if WhatsAppOptInStatus(row.status) != WhatsAppOptInStatus.OPTED_OUT:
        await _opt_out_row(db, row, "settings", user, request)
        await db.commit()
    return status_out(row)


async def is_opted_in(db: AsyncSession, user_id: uuid.UUID) -> bool:
    found = (
        await db.execute(
            select(WhatsAppOptIn.id)
            .where(WhatsAppOptIn.user_id == user_id, WhatsAppOptIn.status == WhatsAppOptInStatus.ACTIVE)
            .limit(1)
        )
    ).scalar_one_or_none()
    return found is not None


# =========================================================================================== notify hook
async def maybe_enqueue(
    db: AsyncSession, user: User, notification: Notification, params: Mapping[str, Any] | None
) -> bool:
    """Called by ``notify`` for every new notification: enqueue the WhatsApp job when configured, the kind
    has a template for the user's role and the user opted in."""
    if not whatsapp_configured() or user.is_guest:
        return False
    reg = registry()
    if notification.kind not in reg.kinds:
        return False
    if reg.for_notification(notification.kind, role_of(user), notification.data or {}) is None:
        return False
    if not await is_opted_in(db, user.id):
        return False
    await enqueue(
        db,
        SEND_TASK,
        {
            "notification_id": str(notification.id),
            "params": {str(k): clean_param(v) for k, v in (params or {}).items() if v not in (None, "")},
        },
        dedupe_key=f"notif-wa:{notification.id}",
    )
    return True


# =========================================================================================== jobs
def _first_name(user: User) -> str:
    return (user.full_name or "").strip().split(" ")[0][:60]


def resolve_values(
    template: WhatsAppTemplate,
    user: User,
    locale: str,
    params: Mapping[str, Any],
    data: Mapping[str, Any],
) -> list[str] | None:
    """Template parameter values in order; ``None`` when a required value is missing."""
    values: list[str] = []
    for name in template.params:
        if name == "first_name":
            value = _first_name(user) or registry().name_fallback.get(locale) or "there"
        elif name == "join_link":
            link = data.get("meeting_url")
            value = link if isinstance(link, str) and link.startswith("https://") else ""
            if not value:
                portal = settings.PATIENT_WEB_URL.rstrip("/")
                path = data.get("link")
                value = f"{portal}{path}" if isinstance(path, str) and path.startswith("/") else portal
        else:
            value = params.get(name) or data.get(name) or ""
        cleaned = clean_param(value)
        if not cleaned:
            return None
        values.append(cleaned)
    return values


async def _sent_today(db: AsyncSession, user_id: uuid.UUID) -> int:
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(WhatsAppMessage)
                .where(
                    WhatsAppMessage.user_id == user_id,
                    WhatsAppMessage.created_at >= start,
                    WhatsAppMessage.status != WhatsAppMessageStatus.SKIPPED,
                    WhatsAppMessage.kind != VERIFICATION_KIND,
                )
            )
        ).scalar_one()
    )


async def _deliver(
    db: AsyncSession, log: WhatsAppMessage, to: str, template: WhatsAppTemplate, values: list[str]
) -> None:
    """Send and record the outcome on ``log`` (commits). Transient errors propagate for a job retry."""
    try:
        message_id = await send_template(to, template, log.language_code, values)
    except WhatsAppSendError as exc:
        if not exc.permanent:
            log.error_code = exc.code[:40]
            log.error_title = exc.title[:255]
            await db.commit()
            raise RuntimeError(f"WhatsApp send failed ({exc.code})") from exc
        log.status = WhatsAppMessageStatus.FAILED
        log.error_code = exc.code[:40]
        log.error_title = exc.title[:255]
        log.failed_at = datetime.now(UTC)
        await db.commit()
        logger.warning("messaging.whatsapp_failed", template=template.name, code=exc.code)
        return
    log.provider_message_id = message_id
    log.status = WhatsAppMessageStatus.SENT
    log.sent_at = datetime.now(UTC)
    log.error_code = None
    log.error_title = None
    await db.commit()


@task(SEND_TASK, timeout_seconds=120)
async def send_notification_whatsapp(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Send the template for one notification (idempotent per notification via ``whatsapp_messages``)."""
    if not whatsapp_configured():
        return
    try:
        notification_id = uuid.UUID(str(payload["notification_id"]))
    except (KeyError, ValueError) as exc:
        raise PermanentJobError("invalid notification_id") from exc
    notification = await db.get(Notification, notification_id)
    if notification is None:
        return
    user = await db.get(User, notification.user_id)
    if user is None or not is_active_user(user):
        return
    row = await _optin(db, user.id)
    if row is None or WhatsAppOptInStatus(row.status) != WhatsAppOptInStatus.ACTIVE:
        return
    data = notification.data or {}
    template = registry().for_notification(notification.kind, role_of(user), data)
    if template is None:
        return
    log = (
        await db.execute(select(WhatsAppMessage).where(WhatsAppMessage.notification_id == notification.id))
    ).scalar_one_or_none()
    if log is not None and WhatsAppMessageStatus(log.status) != WhatsAppMessageStatus.QUEUED:
        return  # already sent / failed / skipped
    locale = recipient_locale(user)
    if log is None:
        log = WhatsAppMessage(
            user_id=user.id,
            notification_id=notification.id,
            kind=notification.kind,
            template_name=template.name,
            language_code=registry().language_code(locale),
            phone_masked=row.phone_masked,
            provider=settings.WHATSAPP_PROVIDER,
            status=WhatsAppMessageStatus.QUEUED,
        )
        db.add(log)
        await db.flush()
        if await _sent_today(db, user.id) > settings.WHATSAPP_USER_DAILY_LIMIT:
            log.status = WhatsAppMessageStatus.SKIPPED
            log.error_code = "daily_limit"
            await db.commit()
            return
    values = resolve_values(template, user, locale, payload.get("params") or {}, data)
    if values is None:
        log.status = WhatsAppMessageStatus.SKIPPED
        log.error_code = "missing_param"
        await db.commit()
        return
    await db.commit()
    await _deliver(db, log, row.phone_e164, template, values)


@task(CODE_TASK, timeout_seconds=60)
async def send_verification_code(db: AsyncSession, payload: dict[str, Any]) -> None:
    if not whatsapp_configured():
        return
    try:
        optin_id = uuid.UUID(str(payload["optin_id"]))
        code = decrypt_str(str(payload["code"]))
    except (KeyError, ValueError, CryptoError) as exc:
        raise PermanentJobError("invalid payload") from exc
    row = await db.get(WhatsAppOptIn, optin_id)
    if row is None or WhatsAppOptInStatus(row.status) != WhatsAppOptInStatus.PENDING:
        return
    if row.code_hash != _code_hash(row.id, code):
        return  # a newer code replaced this one
    template = registry().by_name("hig_verification_code")
    if template is None:  # pragma: no cover - shipped in templates.json
        raise PermanentJobError("verification template missing")
    log = WhatsAppMessage(
        user_id=row.user_id,
        kind=VERIFICATION_KIND,
        template_name=template.name,
        language_code=registry().language_code(str(payload.get("locale") or "en")),
        phone_masked=row.phone_masked,
        provider=settings.WHATSAPP_PROVIDER,
        status=WhatsAppMessageStatus.QUEUED,
    )
    db.add(log)
    await db.commit()
    await _deliver(db, log, row.phone_e164, template, [code])


# =========================================================================================== webhook
def verify_signature(raw: bytes, header: str | None) -> bool:
    if not settings.WHATSAPP_APP_SECRET or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(settings.WHATSAPP_APP_SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.split("=", 1)[1].strip().lower())


def verify_challenge(mode: str | None, token: str | None) -> bool:
    expected = settings.WHATSAPP_VERIFY_TOKEN
    return bool(
        settings.WHATSAPP_PROVIDER == "meta"
        and expected
        and mode == "subscribe"
        and token is not None
        and hmac.compare_digest(expected, token)
    )


_PUNCT_RE = re.compile(r"[\s.!,;:\"'()\-]+")


def is_stop_reply(text: str | None) -> bool:
    if not text:
        return False
    normalized = _PUNCT_RE.sub(" ", text).strip().casefold()
    return normalized in STOP_WORDS or normalized.replace(" ", "") in STOP_WORDS


def _ts(value: Any) -> datetime:
    try:
        return datetime.fromtimestamp(int(value), UTC)
    except (TypeError, ValueError, OverflowError):
        return datetime.now(UTC)


async def _apply_status(db: AsyncSession, item: Mapping[str, Any]) -> bool:
    message_id = str(item.get("id") or "")
    status_raw = str(item.get("status") or "")
    if not message_id or status_raw not in ("sent", "delivered", "read", "failed"):
        return False
    log = (
        await db.execute(
            select(WhatsAppMessage).where(WhatsAppMessage.provider_message_id == message_id).with_for_update()
        )
    ).scalar_one_or_none()
    if log is None:
        return False
    new = WhatsAppMessageStatus(status_raw)
    at = _ts(item.get("timestamp"))
    current = WhatsAppMessageStatus(log.status)
    if new == WhatsAppMessageStatus.FAILED:
        errors = item.get("errors") or []
        first = errors[0] if errors and isinstance(errors[0], dict) else {}
        log.status = new
        log.failed_at = at
        log.error_code = str(first.get("code") or "")[:40] or None
        log.error_title = str(first.get("title") or "")[:255] or None
        return True
    if current == WhatsAppMessageStatus.FAILED or _STATUS_RANK.get(new, 0) <= _STATUS_RANK.get(current, 0):
        if new == WhatsAppMessageStatus.READ and log.read_at is None:
            log.read_at = at
        return False  # never move backwards (webhooks arrive out of order)
    log.status = new
    if new == WhatsAppMessageStatus.SENT:
        log.sent_at = log.sent_at or at
    elif new == WhatsAppMessageStatus.DELIVERED:
        log.delivered_at = at
    elif new == WhatsAppMessageStatus.READ:
        log.read_at = at
        log.delivered_at = log.delivered_at or at
    return True


async def _apply_inbound(db: AsyncSession, item: Mapping[str, Any]) -> bool:
    kind = item.get("type")
    text: str | None = None
    if kind == "text":
        text = (item.get("text") or {}).get("body")
    elif kind == "button":
        text = (item.get("button") or {}).get("text")
    elif kind == "interactive":
        reply = (item.get("interactive") or {}).get("button_reply") or {}
        text = reply.get("title")
    if not is_stop_reply(text):
        return False  # inbound messages are not stored (no health data in our logs)
    sender = str(item.get("from") or "").strip()
    if not sender:
        return False
    e164 = sender if sender.startswith("+") else f"+{sender}"
    rows = (
        (
            await db.execute(
                select(WhatsAppOptIn)
                .where(
                    WhatsAppOptIn.phone_hash == phone_hash(e164),
                    WhatsAppOptIn.status != WhatsAppOptInStatus.OPTED_OUT,
                )
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        await _opt_out_row(db, row, "stop_reply", None, None)
    return bool(rows)


async def handle_webhook(db: AsyncSession, body: Mapping[str, Any]) -> dict[str, int]:
    """Apply a verified webhook delivery (statuses + STOP replies). Idempotent."""
    counts = {"statuses": 0, "opt_outs": 0}
    if body.get("object") != "whatsapp_business_account":
        return counts
    for entry in body.get("entry") or []:
        for change in (entry or {}).get("changes") or []:
            value = (change or {}).get("value") or {}
            for item in value.get("statuses") or []:
                if isinstance(item, dict) and await _apply_status(db, item):
                    counts["statuses"] += 1
            for item in value.get("messages") or []:
                if isinstance(item, dict) and await _apply_inbound(db, item):
                    counts["opt_outs"] += 1
    await db.commit()
    return counts


# =========================================================================================== admin
class WhatsAppProviderStatusOut(BaseModel):
    provider: str
    configured: bool
    webhook_configured: bool
    verify_token_set: bool
    phone_number_id_set: bool
    graph_api_version: str
    daily_limit_per_user: int
    templates: list[dict[str, Any]]
    opted_in_users: int
    pending_users: int
    opted_out_users: int
    sent_last_24h: int
    failed_last_24h: int


class WhatsAppMessageOut(BaseModel):
    """Admin log row: template + delivery status only (never the message text or parameters)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None
    kind: str
    template_name: str
    language_code: str
    phone_masked: str | None
    status: WhatsAppMessageStatus
    error_code: str | None
    error_title: str | None
    created_at: datetime
    sent_at: datetime | None
    delivered_at: datetime | None
    read_at: datetime | None
    failed_at: datetime | None


async def provider_status(db: AsyncSession) -> WhatsAppProviderStatusOut:
    counts = dict(
        (await db.execute(select(WhatsAppOptIn.status, func.count()).group_by(WhatsAppOptIn.status))).all()
    )
    since = datetime.now(UTC) - timedelta(hours=24)
    by_status = dict(
        (
            await db.execute(
                select(WhatsAppMessage.status, func.count())
                .where(WhatsAppMessage.created_at >= since)
                .group_by(WhatsAppMessage.status)
            )
        ).all()
    )
    # StrEnum members hash like their values, so lookups work for enum or plain string keys.
    delivered = (WhatsAppMessageStatus.SENT, WhatsAppMessageStatus.DELIVERED, WhatsAppMessageStatus.READ)
    sent = sum(int(by_status.get(s, 0)) for s in delivered)
    reg = registry()
    return WhatsAppProviderStatusOut(
        provider=settings.WHATSAPP_PROVIDER,
        configured=whatsapp_configured(),
        webhook_configured=webhook_configured(),
        verify_token_set=bool(settings.WHATSAPP_VERIFY_TOKEN),
        phone_number_id_set=bool(settings.WHATSAPP_PHONE_NUMBER_ID),
        graph_api_version=settings.WHATSAPP_GRAPH_API_VERSION,
        daily_limit_per_user=settings.WHATSAPP_USER_DAILY_LIMIT,
        templates=[
            {"name": t.name, "category": t.category, "kinds": list(t.kinds), "languages": sorted(t.body)}
            for t in reg.templates
        ],
        opted_in_users=int(counts.get(WhatsAppOptInStatus.ACTIVE, 0)),
        pending_users=int(counts.get(WhatsAppOptInStatus.PENDING, 0)),
        opted_out_users=int(counts.get(WhatsAppOptInStatus.OPTED_OUT, 0)),
        sent_last_24h=sent,
        failed_last_24h=int(by_status.get(WhatsAppMessageStatus.FAILED, 0)),
    )
