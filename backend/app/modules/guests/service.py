"""Guest contact verification (6-digit codes) and the one free intro consultation (phase 1).

* ``start_verification``: a 6-digit code to an email (``email.send`` job) or phone (``SMS_PROVIDER``),
  stored as a keyed HMAC bound to the row id; 10-minute expiry; max 5 attempts; max 3 codes per contact per
  10 minutes (plus per-IP/per-user route rate limits).
* ``request_intro``: one free 15-minute video call with a platform medical coordinator per verified
  contact and per device (``X-Device-Id``). Coordinators list and schedule them; scheduling without a link
  creates a Jitsi room.
* Guest upgrades keep the same user id (``POST /auth/guest/upgrade``), so screenings, scans and the intro
  call stay with the new full account.
"""

from __future__ import annotations

import hmac
import re
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any, Literal

import structlog
from fastapi import Request
from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.deps import get_client_ip, is_staff
from app.core.enums import ConsultationStatus, ContactChannel, DocumentKind, UserRole
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound, RateLimited
from app.core.events import publish
from app.core.jobs import enqueue
from app.models import Document, GuestContactVerification, IntroConsultation, Screening, User
from app.modules.cases import policies
from app.modules.cases.common import utcnow
from app.modules.cases.consultations import CONSULTATION_TRANSITIONS
from app.modules.cases.video import new_meeting_url
from app.modules.guests.quota import keyed_hash

logger = structlog.get_logger(__name__)

CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
MAX_CODES_PER_CONTACT = 3  # per 10 minutes
VERIFIED_VALID_FOR = timedelta(hours=24)
INTRO_DURATION_MIN = 15
COORDINATOR_ROLES = (UserRole.SUPPORT, UserRole.ADMIN, UserRole.SUPER_ADMIN)

#: Captured SMS when ``SMS_PROVIDER=console`` (dev/tests; bounded). Never logged.
sms_outbox: list[dict[str, str]] = []

_EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[A-Za-z]{2,}$")


# -------------------------------------------------------------------------------------------------- schemas
class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class VerifyStartIn(_In):
    channel: ContactChannel
    contact: str = Field(min_length=3, max_length=254, description="Email address or phone number (+country)")


class VerifyStartOut(BaseModel):
    verification_id: uuid.UUID
    channel: ContactChannel
    contact_masked: str
    expires_at: datetime


class VerifyConfirmIn(_In):
    verification_id: uuid.UUID
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class VerifyConfirmOut(BaseModel):
    verification_id: uuid.UUID
    verified: bool
    channel: ContactChannel
    contact_masked: str
    valid_until: datetime
    """Use ``verification_id`` in ``POST /guest/consultation`` before this time."""


class IntroRequestIn(_In):
    verification_id: uuid.UUID
    full_name: str = Field(min_length=1, max_length=200)
    preferred_from: datetime | None = None
    preferred_to: datetime | None = None
    timezone: str | None = Field(default=None, max_length=64, description="IANA name, e.g. Africa/Lagos")
    question: str | None = Field(default=None, max_length=2000)
    screening_id: uuid.UUID | None = None
    document_ids: list[uuid.UUID] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _window(self) -> IntroRequestIn:
        if self.preferred_from and self.preferred_to and self.preferred_to <= self.preferred_from:
            raise ValueError("preferred_to must be after preferred_from")
        return self


class IntroConsultationOut(BaseModel):
    id: uuid.UUID
    status: ConsultationStatus
    kind: Literal["free_intro"] = "free_intro"
    full_name: str
    contact_channel: ContactChannel
    contact_masked: str
    preferred_from: datetime | None = None
    preferred_to: datetime | None = None
    timezone: str | None = None
    screening_id: uuid.UUID | None = None
    document_ids: list[uuid.UUID] = Field(default_factory=list)
    scheduled_at: datetime | None = None
    duration_min: int
    meeting_url: str | None = None
    coordinator_name: str | None = None
    created_at: datetime


class IntroConsultationAdminOut(IntroConsultationOut):
    user_id: uuid.UUID | None = None
    patient_id: uuid.UUID | None = None
    is_guest: bool | None = None
    contact: str
    question: str | None = None
    coordinator_user_id: uuid.UUID | None = None
    coordinator_notes: str | None = None
    updated_at: datetime


class IntroConsultationUpdate(_In):
    status: ConsultationStatus | None = None
    scheduled_at: datetime | None = None
    meeting_url: AnyHttpUrl | None = None
    coordinator_user_id: uuid.UUID | None = None
    coordinator_notes: str | None = Field(default=None, max_length=5000)

    @field_validator("meeting_url")
    @classmethod
    def _https_only(cls, v: AnyHttpUrl | None) -> AnyHttpUrl | None:
        if v is not None and v.scheme != "https":
            raise ValueError("The meeting link must start with https://")
        return v


# -------------------------------------------------------------------------------------------------- helpers
def normalize_contact(channel: ContactChannel, contact: str) -> str:
    value = contact.strip()
    if channel == ContactChannel.EMAIL:
        value = value.lower()
        if not _EMAIL_RE.match(value):
            raise BadRequest("Enter a valid email address", code="invalid_contact")
        return value
    digits = re.sub(r"[\s().-]", "", value)
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if not re.fullmatch(r"\+[1-9]\d{7,14}", digits):
        raise BadRequest(
            "Enter your phone number with the country code, e.g. +234 803 123 4567", code="invalid_contact"
        )
    return digits


def contact_hash(channel: ContactChannel, normalized: str) -> str:
    return keyed_hash(f"contact:{channel.value}:{normalized}")


def mask_contact(channel: ContactChannel, value: str) -> str:
    if channel == ContactChannel.EMAIL:
        local, _, domain = value.partition("@")
        return f"{local[:1]}***@{domain}"
    return f"{value[:3]}*****{value[-2:]}"


def _code_hash(verification_id: uuid.UUID, code: str) -> str:
    return keyed_hash(f"code:{verification_id}:{code}")


def device_hash(device_id: str | None) -> str | None:
    value = (device_id or "").strip()
    if not value:
        return None
    if len(value) > 200:
        raise BadRequest("X-Device-Id is too long", code="invalid_device_id")
    return keyed_hash(f"device:{value}")


def _ensure_patient(user: User) -> None:
    if not policies.is_patient(user):
        raise Forbidden("The free consultation is for visitors and patients")


async def _send_code(channel: ContactChannel, contact: str, code: str, db: AsyncSession) -> None:
    text = f"Your {settings.APP_NAME} code is {code}. It expires in 10 minutes. Do not share it."
    if channel == ContactChannel.EMAIL:
        await enqueue(
            db,
            "email.send",
            {
                "to": contact,
                "subject": f"Your {settings.APP_NAME} verification code",
                "template": "generic_notification.html",
                "context": {
                    "title": "Your verification code",
                    "body": f"Your code is {code}.\n\nIt expires in 10 minutes. If you did not ask for it, "
                    "you can ignore this email.",
                },
            },
            max_attempts=3,
        )
        return
    if settings.SMS_PROVIDER == "console" and not settings.is_production:
        sms_outbox.append({"to": contact, "text": text})
        del sms_outbox[:-200]
        return
    raise BadRequest(
        "Phone verification is not available yet. Please use your email address.", code="sms_unavailable"
    )


# --------------------------------------------------------------------------------------------- verification
async def start_verification(
    db: AsyncSession, user: User, body: VerifyStartIn, request: Request
) -> VerifyStartOut:
    _ensure_patient(user)
    normalized = normalize_contact(body.channel, body.contact)
    hashed = contact_hash(body.channel, normalized)
    recent = (
        await db.execute(
            select(func.count()).where(
                GuestContactVerification.contact_hash == hashed,
                GuestContactVerification.created_at >= utcnow() - CODE_TTL,
            )
        )
    ).scalar_one()
    if int(recent) >= MAX_CODES_PER_CONTACT:
        raise RateLimited("Too many codes were sent. Please wait 10 minutes.", retry_after=600)
    code = f"{secrets.randbelow(1_000_000):06d}"
    row = GuestContactVerification(
        user_id=user.id,
        channel=body.channel,
        contact_hash=hashed,
        contact_value=normalized,
        code_hash="",
        expires_at=utcnow() + CODE_TTL,
        ip=get_client_ip(request),
    )
    row.code_hash = _code_hash(row.id, code)
    db.add(row)
    await db.flush()
    await _send_code(body.channel, normalized, code, db)
    await audit_log(
        db,
        actor=user,
        action="guest.verify_start",
        entity_type="guest_contact_verification",
        entity_id=row.id,
        after={"channel": body.channel.value},
        request=request,
    )
    await db.commit()
    return VerifyStartOut(
        verification_id=row.id,
        channel=body.channel,
        contact_masked=mask_contact(body.channel, normalized),
        expires_at=row.expires_at,
    )


async def confirm_verification(
    db: AsyncSession, user: User, body: VerifyConfirmIn, request: Request
) -> VerifyConfirmOut:
    _ensure_patient(user)
    row = (
        await db.execute(
            select(GuestContactVerification)
            .where(
                GuestContactVerification.id == body.verification_id,
                GuestContactVerification.user_id == user.id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFound("Verification not found")
    channel = ContactChannel(row.channel)
    if row.verified_at is not None:
        return VerifyConfirmOut(
            verification_id=row.id,
            verified=True,
            channel=channel,
            contact_masked=mask_contact(channel, row.contact_value),
            valid_until=row.verified_at + VERIFIED_VALID_FOR,
        )
    if row.attempts >= MAX_ATTEMPTS:
        raise BadRequest("Too many wrong codes. Ask for a new code.", code="too_many_attempts")
    if row.expires_at <= utcnow():
        raise BadRequest("This code has expired. Ask for a new code.", code="code_expired")
    row.attempts += 1
    if not hmac.compare_digest(row.code_hash, _code_hash(row.id, body.code)):
        left = MAX_ATTEMPTS - row.attempts
        await db.commit()
        raise BadRequest(
            "The code is not correct." + (f" {left} attempts left." if left else " Ask for a new code."),
            code="invalid_code",
            details={"attempts_left": left},
        )
    row.verified_at = utcnow()
    await audit_log(
        db,
        actor=user,
        action="guest.verify_confirm",
        entity_type="guest_contact_verification",
        entity_id=row.id,
        request=request,
    )
    await db.commit()
    return VerifyConfirmOut(
        verification_id=row.id,
        verified=True,
        channel=channel,
        contact_masked=mask_contact(channel, row.contact_value),
        valid_until=row.verified_at + VERIFIED_VALID_FOR,
    )


# --------------------------------------------------------------------------------------- intro consultation
def intro_out(item: IntroConsultation, coordinator_name: str | None = None) -> IntroConsultationOut:
    channel = ContactChannel(item.contact_channel)
    return IntroConsultationOut(
        id=item.id,
        status=ConsultationStatus(item.status),
        full_name=item.full_name,
        contact_channel=channel,
        contact_masked=mask_contact(channel, item.contact_value),
        preferred_from=item.preferred_from,
        preferred_to=item.preferred_to,
        timezone=item.timezone,
        screening_id=item.screening_id,
        document_ids=list(item.document_ids or []),
        scheduled_at=item.scheduled_at,
        duration_min=item.duration_min,
        meeting_url=item.meeting_url,
        coordinator_name=coordinator_name,
        created_at=item.created_at,
    )


async def _coordinator_names(db: AsyncSession, items: list[IntroConsultation]) -> dict[uuid.UUID, str]:
    ids = {i.coordinator_user_id for i in items if i.coordinator_user_id}
    if not ids:
        return {}
    rows = (await db.execute(select(User.id, User.full_name).where(User.id.in_(ids)))).all()
    return {r[0]: r[1] for r in rows}


async def request_intro(
    db: AsyncSession, user: User, body: IntroRequestIn, device_id: str | None, request: Request
) -> IntroConsultationOut:
    _ensure_patient(user)
    verification = (
        await db.execute(
            select(GuestContactVerification)
            .where(
                GuestContactVerification.id == body.verification_id,
                GuestContactVerification.user_id == user.id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if verification is None or verification.verified_at is None:
        raise BadRequest("Verify your email or phone first", code="contact_not_verified")
    if verification.consumed_at is not None or verification.verified_at + VERIFIED_VALID_FOR < utcnow():
        raise BadRequest("Verify your email or phone again", code="verification_expired")
    hashed_device = device_hash(device_id)
    if (
        await db.execute(
            select(IntroConsultation.id).where(IntroConsultation.contact_hash == verification.contact_hash)
        )
    ).first() is not None:
        raise Conflict(
            "The free consultation was already used with this contact", code="free_consultation_used"
        )
    if (
        hashed_device is not None
        and (
            await db.execute(
                select(IntroConsultation.id).where(IntroConsultation.device_hash == hashed_device)
            )
        ).first()
        is not None
    ):
        raise Conflict("The free consultation was already used on this device", code="free_consultation_used")
    if (
        await db.execute(
            select(IntroConsultation.id).where(
                IntroConsultation.user_id == user.id, IntroConsultation.status != ConsultationStatus.CANCELLED
            )
        )
    ).first() is not None:
        raise Conflict("You already have a free consultation", code="free_consultation_used")

    patient = await policies.get_patient_profile(db, user)
    if body.screening_id is not None:
        screening = await db.get(Screening, body.screening_id)
        if screening is None or patient is None or screening.patient_id != patient.id:
            raise NotFound("Screening not found")
    if body.document_ids:
        owned = set(
            (
                await db.execute(
                    select(Document.id).where(
                        Document.id.in_(body.document_ids),
                        Document.owner_user_id == user.id,
                        Document.deleted_at.is_(None),
                        Document.kind != DocumentKind.PASSPORT,
                    )
                )
            ).scalars()
        )
        if owned != set(body.document_ids):
            raise NotFound("Document not found")
    item = IntroConsultation(
        user_id=user.id,
        patient_id=patient.id if patient is not None else None,
        full_name=body.full_name,
        contact_channel=ContactChannel(verification.channel),
        contact_value=verification.contact_value,
        contact_hash=verification.contact_hash,
        device_hash=hashed_device,
        preferred_from=body.preferred_from,
        preferred_to=body.preferred_to,
        timezone=body.timezone,
        screening_id=body.screening_id,
        document_ids=list(dict.fromkeys(body.document_ids)),
        question=body.question or None,
        status=ConsultationStatus.REQUESTED,
        duration_min=INTRO_DURATION_MIN,
    )
    db.add(item)
    verification.consumed_at = utcnow()
    if user.is_guest and (user.full_name or "Guest") == "Guest":
        user.full_name = body.full_name[:200]
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="intro_consultation.request",
        entity_type="intro_consultation",
        entity_id=item.id,
        after={"channel": verification.channel, "screening_id": body.screening_id},
        request=request,
    )
    await publish(
        db, "intro_consultation.requested", {"intro_consultation_id": str(item.id), "user_id": str(user.id)}
    )
    await db.commit()
    await db.refresh(item)
    return intro_out(item)


async def my_intro(db: AsyncSession, user: User) -> IntroConsultationOut:
    item = (
        await db.execute(
            select(IntroConsultation)
            .where(IntroConsultation.user_id == user.id)
            .order_by(IntroConsultation.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if item is None:
        raise NotFound("No free consultation yet")
    names = await _coordinator_names(db, [item])
    return intro_out(item, names.get(item.coordinator_user_id) if item.coordinator_user_id else None)


# --------------------------------------------------------------------------------------------- coordinators
def admin_out(
    item: IntroConsultation, names: dict[uuid.UUID, str], users: dict[uuid.UUID, User]
) -> IntroConsultationAdminOut:
    base = intro_out(item, names.get(item.coordinator_user_id) if item.coordinator_user_id else None)
    owner = users.get(item.user_id) if item.user_id else None
    return IntroConsultationAdminOut(
        **base.model_dump(),
        user_id=item.user_id,
        patient_id=item.patient_id,
        is_guest=owner.is_guest if owner is not None else None,
        contact=item.contact_value,
        question=item.question,
        coordinator_user_id=item.coordinator_user_id,
        coordinator_notes=item.coordinator_notes,
        updated_at=item.updated_at,
    )


async def admin_outs(db: AsyncSession, items: list[IntroConsultation]) -> list[IntroConsultationAdminOut]:
    names = await _coordinator_names(db, items)
    user_ids = {i.user_id for i in items if i.user_id}
    users = (
        {u.id: u for u in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars()}
        if user_ids
        else {}
    )
    return [admin_out(i, names, users) for i in items]


def intro_list_stmt(status: ConsultationStatus | None, mine: bool, user: User) -> Any:
    stmt = select(IntroConsultation)
    if status is not None:
        stmt = stmt.where(IntroConsultation.status == status)
    if mine:
        stmt = stmt.where(IntroConsultation.coordinator_user_id == user.id)
    return stmt.order_by(
        IntroConsultation.scheduled_at.asc().nulls_first(),
        IntroConsultation.created_at.asc(),
        IntroConsultation.id,
    )


async def update_intro(
    db: AsyncSession, user: User, intro_id: uuid.UUID, body: IntroConsultationUpdate, request: Request
) -> IntroConsultationAdminOut:
    if not is_staff(user):  # pragma: no cover - the route already requires staff
        raise Forbidden("Only platform staff can manage intro consultations")
    item = (
        await db.execute(select(IntroConsultation).where(IntroConsultation.id == intro_id).with_for_update())
    ).scalar_one_or_none()
    if item is None:
        raise NotFound("Intro consultation not found")
    changes = body.model_dump(exclude_unset=True)
    current = ConsultationStatus(item.status)
    target: ConsultationStatus | None = changes.get("status")
    if (
        target is None
        and changes.get("scheduled_at")
        and current
        in (
            ConsultationStatus.REQUESTED,
            ConsultationStatus.SCHEDULED,
        )
    ):
        target = ConsultationStatus.SCHEDULED  # schedule or move the call
    if target is not None and target not in CONSULTATION_TRANSITIONS[current]:
        raise BadRequest(
            f"A {current.value} consultation cannot become {target.value}",
            code="invalid_transition",
            details={"from_status": current.value, "to_status": target.value},
        )
    if "coordinator_user_id" in changes and changes["coordinator_user_id"] is not None:
        coordinator = await db.get(User, changes["coordinator_user_id"])
        if coordinator is None or str(getattr(coordinator.role, "value", coordinator.role)) not in {
            r.value for r in COORDINATOR_ROLES
        }:
            raise BadRequest("Coordinator must be a support/admin user", code="invalid_coordinator")
        item.coordinator_user_id = coordinator.id
    if "scheduled_at" in changes and changes["scheduled_at"] is not None:
        if changes["scheduled_at"] <= utcnow():
            raise BadRequest("scheduled_at must be in the future", code="invalid_scheduled_at")
        if changes["scheduled_at"] != item.scheduled_at:
            item.reminder_24h_sent_at = None
            item.reminder_1h_sent_at = None
        item.scheduled_at = changes["scheduled_at"]
    if changes.get("meeting_url") is not None:
        item.meeting_url = str(changes["meeting_url"])
    if "coordinator_notes" in changes:
        item.coordinator_notes = changes["coordinator_notes"]
    scheduled_now = False
    if target is not None:
        if target == ConsultationStatus.SCHEDULED:
            if item.scheduled_at is None:
                raise BadRequest("scheduled_at is required to schedule", code="scheduled_at_required")
            if not item.meeting_url:
                item.meeting_url = new_meeting_url("hig-intro")
            if item.coordinator_user_id is None:
                item.coordinator_user_id = user.id
            scheduled_now = True
        item.status = target
    await audit_log(
        db,
        actor=user,
        action="intro_consultation.update",
        entity_type="intro_consultation",
        entity_id=item.id,
        before={"status": current.value},
        after={"status": ConsultationStatus(item.status).value, "scheduled_at": item.scheduled_at},
        request=request,
    )
    if scheduled_now:
        await publish(db, "intro_consultation.scheduled", {"intro_consultation_id": str(item.id)})
        if ContactChannel(item.contact_channel) == ContactChannel.EMAIL and item.scheduled_at is not None:
            when = item.scheduled_at.strftime("%d %b %Y, %H:%M UTC")
            await enqueue(
                db,
                "email.send",
                {
                    "to": item.contact_value,
                    "subject": "Your free call with our medical coordinator",
                    "template": "generic_notification.html",
                    "context": {
                        "title": "Your free call is booked",
                        "name": item.full_name,
                        "body": f"Your 15-minute video call is on {when}.\n\nJoin with the button below "
                        "at that time. No app or account is needed.",
                        "url": item.meeting_url,
                        "action_label": "Join the video call",
                    },
                },
                dedupe_key=f"intro-scheduled:{item.id}:{item.scheduled_at.isoformat()}",
                max_attempts=3,
            )
    await db.commit()
    await db.refresh(item)
    return (await admin_outs(db, [item]))[0]
