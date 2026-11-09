"""Privacy business logic: data-rights requests and grievances (DPDP s.13, GDPR Art. 12), nominees
(DPDP s.14), guardian consent for minors (DPDP s.9), the breach register, legal holds and PHI access log."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.deps import PageQuery, is_staff
from app.core.enums import ConsentKind, UserRole, UserStatus
from app.core.errors import BadRequest, Forbidden, NotFound
from app.core.jobs import enqueue
from app.models import Case, PatientProfile, User
from app.models.privacy import (
    BreachIncident,
    BreachStatus,
    DataNominee,
    DataRightsRequest,
    DataRightsRequestKind,
    DataRightsRequestStatus,
    GuardianConsent,
)
from app.modules.privacy.guards import active_guardian_consent, age_on, is_minor
from app.modules.privacy.schemas import (
    AdminDataRightsRequestOut,
    BreachIn,
    BreachOut,
    BreachUpdate,
    ContactPerson,
    DataRightsRequestIn,
    DataRightsRequestOut,
    DataRightsRequestUpdate,
    GuardianConsentIn,
    GuardianConsentOut,
    GuardianStatusOut,
    LegalHoldIn,
    LegalHoldOut,
    NomineeIn,
    PrivacyContactOut,
)

logger = structlog.get_logger(__name__)

GUARDIAN_CONSENT_VERSION = "2026-11"
BREACH_NOTIFICATION_HOURS = 72
OPEN_REQUEST_STATUSES = (
    DataRightsRequestStatus.RECEIVED,
    DataRightsRequestStatus.IN_PROGRESS,
    DataRightsRequestStatus.AWAITING_REQUESTER,
)
CLOSED_REQUEST_STATUSES = (DataRightsRequestStatus.COMPLETED, DataRightsRequestStatus.REJECTED)
_KIND_LABELS = {
    DataRightsRequestKind.ACCESS: "access to your data",
    DataRightsRequestKind.CORRECTION: "correction of your data",
    DataRightsRequestKind.ERASURE: "erasure of your data",
    DataRightsRequestKind.NOMINATION: "a nomination",
    DataRightsRequestKind.WITHDRAW_CONSENT: "withdrawal of consent",
    DataRightsRequestKind.COMPLAINT: "a complaint",
    DataRightsRequestKind.OTHER: "a privacy question",
}


def utcnow() -> datetime:
    return datetime.now(UTC)


def _role(user: User) -> str:
    return str(getattr(user.role, "value", user.role))


def _reference(prefix: str) -> str:
    return f"{prefix}-{utcnow():%y%m%d}-{secrets.token_hex(3).upper()}"


async def _privacy_staff_ids(db: AsyncSession) -> list[uuid.UUID]:
    rows = await db.execute(
        select(User.id).where(
            User.role.in_([UserRole.SUPPORT, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
            User.status == UserStatus.ACTIVE,
            User.deleted_at.is_(None),
        )
    )
    return list(rows.scalars().all())


# --- privacy contact ----------------------------------------------------------------------------------------
def _or_none(value: str) -> str | None:
    return value.strip() or None


def privacy_contact() -> PrivacyContactOut:
    return PrivacyContactOut(
        grievance_officer=ContactPerson(
            name=_or_none(settings.GRIEVANCE_OFFICER_NAME),
            email=_or_none(settings.GRIEVANCE_OFFICER_EMAIL),
            phone=_or_none(settings.GRIEVANCE_OFFICER_PHONE),
        ),
        data_protection_officer=ContactPerson(
            name=_or_none(settings.DPO_NAME),
            email=_or_none(settings.DPO_EMAIL),
            phone=_or_none(settings.DPO_PHONE),
        ),
        postal_address=_or_none(settings.PRIVACY_POSTAL_ADDRESS),
        response_days=settings.DATA_RIGHTS_SLA_DAYS,
        request_kinds=list(DataRightsRequestKind),
    )


# --- data-rights requests -----------------------------------------------------------------------------------
def request_out(row: DataRightsRequest, *, admin: bool = False) -> DataRightsRequestOut:
    model = AdminDataRightsRequestOut if admin else DataRightsRequestOut
    out = model.model_validate(row)
    out.overdue = row.status in OPEN_REQUEST_STATUSES and row.due_at < utcnow()
    return out


async def create_request(
    db: AsyncSession, user: User | None, body: DataRightsRequestIn, request: Request | None
) -> DataRightsRequest:
    """Record a data-rights request or grievance; acknowledge it to the requester and alert privacy staff.
    Anyone may file one (also without an account, e.g. a nominee); signed-in users file for themselves."""
    if user is not None and is_staff(user):
        raise Forbidden("Staff record requests received by email or phone in the admin portal")
    name = body.requester_name or (user.full_name if user is not None else None)
    email = body.requester_email or (user.email if user is not None else None)
    if user is None and not (name and email):
        raise BadRequest("Give your name and email address so that we can reply", code="contact_required")
    now = utcnow()
    row = DataRightsRequest(
        reference=_reference("DRR"),
        user_id=user.id if user is not None else None,
        kind=body.kind,
        status=DataRightsRequestStatus.RECEIVED,
        channel=body.channel,
        requester_name=(name or "Unknown")[:200],
        requester_email=email,
        requester_phone=body.requester_phone or (user.phone if user is not None else None),
        on_behalf_of=body.on_behalf_of,
        details=body.details,
        due_at=now + timedelta(days=settings.DATA_RIGHTS_SLA_DAYS),
        acknowledged_at=now,
    )
    db.add(row)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        actor_role=None if user is not None else "anonymous",
        action="privacy.request_created",
        entity_type="data_rights_request",
        entity_id=row.id,
        after={"reference": row.reference, "kind": body.kind.value, "channel": body.channel},
        request=request,
    )
    from app.modules.messaging.notifications import notify_many  # lazy: messaging imports many modules

    await notify_many(
        db,
        await _privacy_staff_ids(db),
        "privacy.request_received",
        "New data-rights request",
        f"{row.reference}: {_KIND_LABELS[body.kind]}. Reply by {row.due_at:%d %b %Y}.",
        {"request_id": str(row.id), "reference": row.reference, "kind": body.kind.value},
        dedupe_key=str(row.id),
        email=False,
    )
    if email:
        await enqueue(
            db,
            "email.send",
            {
                "to": email,
                "subject": f"We received your request {row.reference}",
                "template": "generic_notification.html",
                "context": {
                    "title": "We received your request",
                    "body": (
                        f"Thank you. We received your request about {_KIND_LABELS[body.kind]} "
                        f"(reference {row.reference}). We will reply by {row.due_at:%d %B %Y}. If you are "
                        "not happy with our answer, you can complain to the Data Protection Board of India."
                    ),
                    "name": name or "there",
                    "url": settings.PUBLIC_SITE_URL.rstrip("/") + "/privacy",
                    "action_label": "Privacy policy",
                },
            },
        )
    await db.commit()
    await db.refresh(row)
    return row


async def list_my_requests(db: AsyncSession, user: User) -> list[DataRightsRequest]:
    return list(
        (
            await db.execute(
                select(DataRightsRequest)
                .where(DataRightsRequest.user_id == user.id)
                .order_by(DataRightsRequest.created_at.desc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )


async def get_my_request(db: AsyncSession, user: User, request_id: uuid.UUID) -> DataRightsRequest:
    row = await db.get(DataRightsRequest, request_id)
    if row is None or row.user_id != user.id:
        raise NotFound("Request not found")
    return row


async def admin_list_requests(
    db: AsyncSession,
    params: PageQuery,
    *,
    status: DataRightsRequestStatus | None,
    kind: DataRightsRequestKind | None,
    open_only: bool,
    overdue_only: bool,
) -> tuple[list[DataRightsRequest], int]:
    from sqlalchemy import func

    stmt = select(DataRightsRequest)
    if status is not None:
        stmt = stmt.where(DataRightsRequest.status == status)
    if kind is not None:
        stmt = stmt.where(DataRightsRequest.kind == kind)
    if open_only or overdue_only:
        stmt = stmt.where(DataRightsRequest.status.in_(OPEN_REQUEST_STATUSES))
    if overdue_only:
        stmt = stmt.where(DataRightsRequest.due_at < utcnow())
    total = int((await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one())
    rows = (
        await db.execute(
            stmt.order_by(DataRightsRequest.due_at, DataRightsRequest.created_at)
            .offset(params.offset)
            .limit(params.limit)
        )
    ).scalars()
    return list(rows), total


async def admin_update_request(
    db: AsyncSession, actor: User, request_id: uuid.UUID, body: DataRightsRequestUpdate, request: Request
) -> DataRightsRequest:
    row = await db.get(DataRightsRequest, request_id, with_for_update=True)
    if row is None:
        raise NotFound("Request not found")
    changes = body.model_dump(exclude_unset=True)
    if "assigned_to_user_id" in changes and changes["assigned_to_user_id"] is not None:
        assignee = await db.get(User, changes["assigned_to_user_id"])
        if assignee is None or not is_staff(assignee):
            raise BadRequest("Assign the request to a staff member", code="invalid_assignee")
    before = {k: getattr(row, k) for k in changes}
    for key, value in changes.items():
        setattr(row, key, value)
    status_changed = "status" in changes and before.get("status") != row.status
    if status_changed:
        row.closed_at = utcnow() if row.status in CLOSED_REQUEST_STATUSES else None
    await audit_log(
        db,
        actor=actor,
        action="privacy.request_updated",
        entity_type="data_rights_request",
        entity_id=row.id,
        before={k: v for k, v in before.items() if k != "internal_notes"},
        after={k: v for k, v in changes.items() if k != "internal_notes"},
        request=request,
    )
    if status_changed:
        await _tell_requester(db, row)
    await db.commit()
    await db.refresh(row)
    return row


async def _tell_requester(db: AsyncSession, row: DataRightsRequest) -> None:
    status_text = {
        DataRightsRequestStatus.IN_PROGRESS: "We are working on your request.",
        DataRightsRequestStatus.AWAITING_REQUESTER: "We need more information from you to continue.",
        DataRightsRequestStatus.COMPLETED: "Your request is complete.",
        DataRightsRequestStatus.REJECTED: "We could not carry out your request.",
        DataRightsRequestStatus.RECEIVED: "Your request is open again.",
    }[DataRightsRequestStatus(row.status)]
    body = status_text + (f" Our answer: {row.resolution}" if row.resolution else "")
    if row.user_id is not None:
        from app.modules.messaging.notifications import notify

        await notify(
            db,
            row.user_id,
            "privacy.request_updated",
            f"Update on your request {row.reference}",
            body,
            {"request_id": str(row.id), "status": str(row.status)},
            dedupe_key=f"{row.id}:{row.status}",
            email=False,
        )
    if row.requester_email:
        await enqueue(
            db,
            "email.send",
            {
                "to": row.requester_email,
                "subject": f"Update on your request {row.reference}",
                "template": "generic_notification.html",
                "context": {
                    "title": f"Update on your request {row.reference}",
                    "body": body,
                    "name": row.requester_name or "there",
                    "url": settings.PUBLIC_SITE_URL.rstrip("/") + "/privacy",
                    "action_label": "Privacy policy",
                },
            },
        )


# --- nominee ------------------------------------------------------------------------------------------------
def _ensure_data_principal(user: User) -> None:
    if is_staff(user):
        raise Forbidden("Staff accounts cannot nominate")
    if user.is_guest:
        raise Forbidden(
            "Create a full account to nominate someone",
            code="guest_upgrade_required",
            details={"is_guest": True},
        )


async def get_nominee(db: AsyncSession, user: User) -> DataNominee | None:
    return (await db.execute(select(DataNominee).where(DataNominee.user_id == user.id))).scalar_one_or_none()


async def set_nominee(db: AsyncSession, user: User, body: NomineeIn, request: Request) -> DataNominee:
    _ensure_data_principal(user)
    row = await get_nominee(db, user)
    created = row is None
    if row is None:
        row = DataNominee(user_id=user.id, full_name=body.full_name, relationship=body.relationship)
        db.add(row)
    row.full_name = body.full_name
    row.relationship = body.relationship
    row.email = body.email
    row.phone = body.phone
    await audit_log(
        db,
        actor=user,
        action="privacy.nominee_set" if created else "privacy.nominee_updated",
        entity_type="user",
        entity_id=user.id,
        after={"relationship": body.relationship},
        request=request,
    )
    await db.commit()
    await db.refresh(row)
    return row


async def remove_nominee(db: AsyncSession, user: User, request: Request) -> None:
    row = await get_nominee(db, user)
    if row is None:
        return
    await db.delete(row)
    await audit_log(
        db,
        actor=user,
        action="privacy.nominee_removed",
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    await db.commit()


# --- guardian consent ---------------------------------------------------------------------------------------
async def _patient_for_guardian(db: AsyncSession, user: User, patient_id: uuid.UUID | None) -> PatientProfile:
    """Patient: own profile. Agent: a managed/referred patient. Staff: any patient. Else 404."""
    from app.modules.screening.policies import resolve_patient_for_create

    role = _role(user)
    if role == UserRole.HOSPITAL.value:
        raise NotFound("Patient not found")
    if role == UserRole.FINANCE.value:
        raise Forbidden("Finance users cannot record guardian consent")
    return await resolve_patient_for_create(db, user, patient_id)


async def guardian_status(db: AsyncSession, user: User, patient_id: uuid.UUID | None) -> GuardianStatusOut:
    profile = await _patient_for_guardian(db, user, patient_id)
    minor = is_minor(profile)
    active = await active_guardian_consent(db, profile.id)
    pending = (
        await db.execute(
            select(GuardianConsent)
            .where(
                GuardianConsent.patient_id == profile.id,
                GuardianConsent.revoked_at.is_(None),
                GuardianConsent.verified_at.is_(None),
            )
            .order_by(GuardianConsent.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return GuardianStatusOut(
        patient_id=profile.id,
        is_minor=minor,
        date_of_birth_known=profile.date_of_birth is not None,
        satisfied=(not minor) or active is not None,
        consent=GuardianConsentOut.model_validate(active) if active is not None else None,
        pending=GuardianConsentOut.model_validate(pending) if pending is not None else None,
    )


async def record_guardian_consent(
    db: AsyncSession, user: User, body: GuardianConsentIn, request: Request
) -> GuardianConsent:
    """Record a parent's/guardian's consent for a minor. Staff-recorded consents (after checking the
    guardian's identity offline) are verified at once; consents entered in the patient's or agent's account
    wait for staff verification (DPDP Rule 10: the guardian must be an identifiable adult)."""
    from app.modules.auth.service import record_consent  # lazy: privacy is imported by auth lazily too

    profile = await _patient_for_guardian(db, user, body.patient_id)
    if (
        body.guardian_date_of_birth >= date.today()
        or age_on(body.guardian_date_of_birth) < settings.AGE_OF_MAJORITY
    ):
        raise BadRequest("The parent or guardian must be an adult", code="guardian_not_adult")
    staff = is_staff(user)
    now = utcnow()
    consent = record_consent(
        db,
        profile.user_id,
        ConsentKind.GUARDIAN_CONSENT,
        GUARDIAN_CONSENT_VERSION,
        request,
        granted=True,
        granted_by_user_id=user.id,
    )
    await db.flush()
    row = GuardianConsent(
        patient_id=profile.id,
        guardian_name=body.guardian_name,
        relationship=body.relationship,
        guardian_email=body.guardian_email,
        guardian_phone=body.guardian_phone,
        guardian_date_of_birth=body.guardian_date_of_birth,
        verification_method=body.verification_method,
        verification_reference=body.verification_reference,
        consent_id=consent.id,
        recorded_by_user_id=user.id,
        verified_by_user_id=user.id if staff else None,
        verified_at=now if staff else None,
    )
    db.add(row)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="privacy.guardian_consent_recorded",
        entity_type="patient_profile",
        entity_id=profile.id,
        after={
            "guardian_consent_id": row.id,
            "relationship": body.relationship,
            "verification_method": body.verification_method,
            "verified": staff,
        },
        request=request,
    )
    if not staff:
        from app.modules.messaging.notifications import notify_many

        await notify_many(
            db,
            await _privacy_staff_ids(db),
            "privacy.guardian_consent_pending",
            "Guardian consent to verify",
            "A parent or guardian gave consent for a patient under 18. Check their identity and verify it.",
            {"guardian_consent_id": str(row.id), "patient_id": str(profile.id)},
            dedupe_key=str(row.id),
            email=False,
        )
    await db.commit()
    await db.refresh(row)
    return row


async def verify_guardian_consent(
    db: AsyncSession, actor: User, consent_id: uuid.UUID, request: Request
) -> GuardianConsent:
    row = await db.get(GuardianConsent, consent_id, with_for_update=True)
    if row is None or row.revoked_at is not None:
        raise NotFound("Guardian consent not found")
    if row.verified_at is None:
        row.verified_at = utcnow()
        row.verified_by_user_id = actor.id
        await audit_log(
            db,
            actor=actor,
            action="privacy.guardian_consent_verified",
            entity_type="patient_profile",
            entity_id=row.patient_id,
            after={"guardian_consent_id": row.id},
            request=request,
        )
        await db.commit()
        await db.refresh(row)
    return row


async def list_pending_guardian_consents(db: AsyncSession) -> list[GuardianConsent]:
    return list(
        (
            await db.execute(
                select(GuardianConsent)
                .where(GuardianConsent.verified_at.is_(None), GuardianConsent.revoked_at.is_(None))
                .order_by(GuardianConsent.created_at)
                .limit(200)
            )
        )
        .scalars()
        .all()
    )


async def revoke_guardian_consent(
    db: AsyncSession, user: User, patient_id: uuid.UUID | None, request: Request
) -> int:
    """Withdraw guardian consent (DPDP s.6(4)): processing that needs it stops until a new one is verified."""
    from app.modules.auth.service import record_consent

    profile = await _patient_for_guardian(db, user, patient_id)
    rows = (
        (
            await db.execute(
                select(GuardianConsent).where(
                    GuardianConsent.patient_id == profile.id, GuardianConsent.revoked_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    now = utcnow()
    for row in rows:
        row.revoked_at = now
    if rows:
        record_consent(
            db,
            profile.user_id,
            ConsentKind.GUARDIAN_CONSENT,
            GUARDIAN_CONSENT_VERSION,
            request,
            granted=False,
            granted_by_user_id=user.id,
        )
        await audit_log(
            db,
            actor=user,
            action="privacy.guardian_consent_revoked",
            entity_type="patient_profile",
            entity_id=profile.id,
            after={"revoked": len(rows)},
            request=request,
        )
    await db.commit()
    return len(rows)


# --- legal holds --------------------------------------------------------------------------------------------
async def set_user_hold(
    db: AsyncSession, actor: User, user_id: uuid.UUID, body: LegalHoldIn, request: Request
) -> LegalHoldOut:
    target = await db.get(User, user_id, with_for_update=True)
    if target is None:
        raise NotFound("User not found")
    before = {"legal_hold": target.legal_hold, "reason": target.legal_hold_reason}
    target.legal_hold = body.legal_hold
    target.legal_hold_reason = body.reason if body.legal_hold else None
    target.legal_hold_set_at = utcnow()
    target.legal_hold_set_by = actor.id
    await audit_log(
        db,
        actor=actor,
        action="privacy.legal_hold_set" if body.legal_hold else "privacy.legal_hold_released",
        entity_type="user",
        entity_id=target.id,
        before=before,
        after={"legal_hold": body.legal_hold, "reason": body.reason},
        request=request,
    )
    await db.commit()
    return _hold_out_user(target)


async def set_case_hold(
    db: AsyncSession, actor: User, case_id: uuid.UUID, body: LegalHoldIn, request: Request
) -> LegalHoldOut:
    case = await db.get(Case, case_id, with_for_update=True)
    if case is None:
        raise NotFound("Case not found")
    before = {"legal_hold": case.legal_hold, "reason": case.legal_hold_reason}
    case.legal_hold = body.legal_hold
    case.legal_hold_reason = body.reason if body.legal_hold else None
    case.legal_hold_set_at = utcnow()
    case.legal_hold_set_by = actor.id
    await audit_log(
        db,
        actor=actor,
        action="privacy.legal_hold_set" if body.legal_hold else "privacy.legal_hold_released",
        entity_type="case",
        entity_id=case.id,
        before=before,
        after={"legal_hold": body.legal_hold, "reason": body.reason},
        request=request,
    )
    await db.commit()
    return _hold_out_case(case)


def _hold_out_user(u: User) -> LegalHoldOut:
    return LegalHoldOut(
        entity_type="user",
        entity_id=u.id,
        label=u.email or u.full_name or str(u.id),
        legal_hold=u.legal_hold,
        reason=u.legal_hold_reason,
        set_at=u.legal_hold_set_at,
        set_by=u.legal_hold_set_by,
    )


def _hold_out_case(c: Case) -> LegalHoldOut:
    return LegalHoldOut(
        entity_type="case",
        entity_id=c.id,
        label=c.case_number,
        legal_hold=c.legal_hold,
        reason=c.legal_hold_reason,
        set_at=c.legal_hold_set_at,
        set_by=c.legal_hold_set_by,
    )


async def list_holds(db: AsyncSession) -> list[LegalHoldOut]:
    users = (await db.execute(select(User).where(User.legal_hold.is_(True)).limit(500))).scalars().all()
    cases = (await db.execute(select(Case).where(Case.legal_hold.is_(True)).limit(500))).scalars().all()
    return [_hold_out_user(u) for u in users] + [_hold_out_case(c) for c in cases]


# --- breach register ----------------------------------------------------------------------------------------
def breach_out(row: BreachIncident) -> BreachOut:
    out = BreachOut.model_validate(row)
    notified = row.dpb_notified_at is not None and row.supervisory_authority_notified_at is not None
    out.notification_overdue = (
        not notified and row.status != BreachStatus.CLOSED and (row.notification_deadline_at < utcnow())
    )
    return out


async def record_breach(db: AsyncSession, actor: User, body: BreachIn, request: Request) -> BreachIncident:
    detected = body.detected_at or utcnow()
    row = BreachIncident(
        reference=_reference("BR"),
        title=body.title,
        description=body.description,
        severity=body.severity,
        status=BreachStatus.OPEN,
        occurred_at=body.occurred_at,
        detected_at=detected,
        notification_deadline_at=detected + timedelta(hours=BREACH_NOTIFICATION_HOURS),
        data_categories=body.data_categories,
        affected_subjects_estimate=body.affected_subjects_estimate,
        likely_consequences=body.likely_consequences,
        measures_taken=body.measures_taken,
        notes=body.notes,
        reported_by_user_id=actor.id,
    )
    db.add(row)
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="privacy.breach_recorded",
        entity_type="breach_incident",
        entity_id=row.id,
        after={"reference": row.reference, "severity": body.severity.value},
        request=request,
    )
    from app.modules.messaging.notifications import notify_many

    admins = (
        (
            await db.execute(
                select(User.id).where(
                    User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
                    User.status == UserStatus.ACTIVE,
                    User.id != actor.id,
                )
            )
        )
        .scalars()
        .all()
    )
    await notify_many(
        db,
        list(admins),
        "privacy.breach_recorded",
        f"Personal data breach {row.reference}",
        f"{body.severity.value.title()} severity. Notifications are due by "
        f"{row.notification_deadline_at:%d %b %Y %H:%M} UTC.",
        {"breach_id": str(row.id)},
        dedupe_key=str(row.id),
        email=True,
    )
    await db.commit()
    await db.refresh(row)
    return row


async def update_breach(
    db: AsyncSession, actor: User, breach_id: uuid.UUID, body: BreachUpdate, request: Request
) -> BreachIncident:
    row = await db.get(BreachIncident, breach_id, with_for_update=True)
    if row is None:
        raise NotFound("Breach not found")
    changes = body.model_dump(exclude_unset=True)
    before = {k: getattr(row, k) for k in changes}
    for key, value in changes.items():
        setattr(row, key, value)
    if changes.get("status") == BreachStatus.CONTAINED and row.contained_at is None:
        row.contained_at = utcnow()
    if "status" in changes:
        row.closed_at = utcnow() if row.status == BreachStatus.CLOSED else None
    await audit_log(
        db,
        actor=actor,
        action="privacy.breach_updated",
        entity_type="breach_incident",
        entity_id=row.id,
        before=before,
        after=changes,
        request=request,
    )
    await db.commit()
    await db.refresh(row)
    return row


async def list_breaches(db: AsyncSession, status: BreachStatus | None) -> list[BreachIncident]:
    stmt = select(BreachIncident)
    if status is not None:
        stmt = stmt.where(BreachIncident.status == status)
    return list(
        (await db.execute(stmt.order_by(BreachIncident.detected_at.desc()).limit(500))).scalars().all()
    )


# --- access log ---------------------------------------------------------------------------------------------
async def my_access_log(db: AsyncSession, user: User) -> list[dict[str, Any]]:
    from app.modules.privacy.export import access_log_entries

    profile_id = (
        await db.execute(select(PatientProfile.id).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()
    if profile_id is None:
        return []
    return await access_log_entries(db, profile_id, limit=500)


async def patient_access_log(db: AsyncSession, patient_id: uuid.UUID) -> list[dict[str, Any]]:
    from app.modules.privacy.export import access_log_entries

    if await db.get(PatientProfile, patient_id) is None:
        raise NotFound("Patient not found")
    return await access_log_entries(db, patient_id, limit=1000)
