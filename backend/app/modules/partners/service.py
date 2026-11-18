"""Insurance & pay-later partners: admin-managed catalog, patient lead capture (with recorded consent) and the
staff queue, plus the platform instalment rule (CG-18).

The platform does not sell insurance, is not an insurance intermediary, does not lend and makes no credit
decision. A lead is only the patient's contact details (never medical data) passed to the chosen partner after
the patient ticked the consent box; the partner quotes / checks eligibility on its own terms and site.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import cache
from app.core.audit import audit_log
from app.core.enums import ConsentKind, PartnerKind, PartnerLeadStatus, UserRole
from app.core.errors import BadRequest, Conflict, NotFound
from app.core.money import apply_pct
from app.core.pagination import Page, paginate
from app.core.settings_store import get_setting
from app.models import Booking, Case, Consent, PartnerLead, PartnerOffering, PatientProfile, User
from app.modules.admin.reports import today_ist
from app.modules.auth.service import record_consent
from app.modules.messaging import policies as messaging_policies
from app.modules.messaging.notifications import notify, notify_many
from app.modules.partners.schemas import (
    AdminLeadOut,
    InstallmentPlanOut,
    InstallmentRow,
    LeadCreate,
    LeadOut,
    LeadStatusCounts,
    LeadUpdate,
    OfferingIn,
    OfferingOut,
    OfferingPatch,
    StaffRef,
)

MAX_INSTALLMENT_MONTHS = 24
OPEN_STATUSES = (PartnerLeadStatus.NEW, PartnerLeadStatus.IN_PROGRESS, PartnerLeadStatus.SHARED_WITH_PARTNER)
STAFF_SETTABLE = (
    PartnerLeadStatus.NEW,
    PartnerLeadStatus.IN_PROGRESS,
    PartnerLeadStatus.SHARED_WITH_PARTNER,
    PartnerLeadStatus.CLOSED,
)
CATALOG_CACHE = "partners:catalog:"
CATALOG_TTL = 60
#: notification / i18n prefix per kind (server catalog sections ``insurance.*`` and ``financing.*``)
PREFIX = {PartnerKind.INSURANCE: "insurance", PartnerKind.PAY_LATER: "financing"}
CONSENT_KIND = {
    PartnerKind.INSURANCE: ConsentKind.SHARE_WITH_INSURER,
    PartnerKind.PAY_LATER: ConsentKind.SHARE_WITH_FINANCING_PARTNER,
}
STAFF_PATH = {PartnerKind.INSURANCE: "/insurance/requests", PartnerKind.PAY_LATER: "/financing/requests"}


def _kind(value: Any) -> PartnerKind:
    return PartnerKind(getattr(value, "value", value))


# ================================================================================================== catalog
def offering_out(o: PartnerOffering) -> OfferingOut:
    return OfferingOut(
        id=o.id,
        kind=o.kind,
        provider_name=o.provider_name,
        product_name=o.product_name,
        category=o.category,
        summary=o.summary or "",
        countries=list(o.countries or []),
        price_min_minor=o.price_min_minor,
        price_max_minor=o.price_max_minor,
        currency=o.currency,
        price_note=o.price_note,
        website_url=o.website_url,
        contact_email=o.contact_email,
        contact_phone=o.contact_phone,
        is_active=o.is_active,
        sort=o.sort,
        created_at=o.created_at,
        updated_at=o.updated_at,
    )


def _country_match(country: str | None) -> Any:
    if not country:
        return None
    return or_(
        func.cardinality(PartnerOffering.countries) == 0, PartnerOffering.countries.any(country.upper())
    )


async def public_catalog(db: AsyncSession, kind: PartnerKind, country: str | None) -> list[OfferingOut]:
    code = (country or "").strip().upper()[:2] or None
    key = f"{CATALOG_CACHE}{kind.value}:{code or '*'}"
    hit = await cache.get(key)
    if hit is not None:
        return [OfferingOut.model_validate(x) for x in hit]
    stmt = select(PartnerOffering).where(PartnerOffering.kind == kind, PartnerOffering.is_active.is_(True))
    if (cond := _country_match(code)) is not None:
        stmt = stmt.where(cond)
    rows = (
        (await db.execute(stmt.order_by(PartnerOffering.sort, PartnerOffering.provider_name))).scalars().all()
    )
    out = [offering_out(o) for o in rows]
    await cache.set(key, [o.model_dump(mode="json") for o in out], ttl=CATALOG_TTL)
    return out


async def admin_catalog(db: AsyncSession, kind: PartnerKind) -> list[OfferingOut]:
    rows = (
        await db.execute(
            select(PartnerOffering)
            .where(PartnerOffering.kind == kind)
            .order_by(PartnerOffering.is_active.desc(), PartnerOffering.sort, PartnerOffering.provider_name)
        )
    ).scalars()
    return [offering_out(o) for o in rows.all()]


def _snapshot(o: PartnerOffering) -> dict[str, Any]:
    return offering_out(o).model_dump(mode="json", exclude={"created_at", "updated_at"})


async def _get_offering(db: AsyncSession, kind: PartnerKind, offering_id: uuid.UUID) -> PartnerOffering:
    o = await db.get(PartnerOffering, offering_id)
    if o is None or _kind(o.kind) != kind:
        raise NotFound("Partner product not found", code="offering_not_found")
    return o


async def create_offering(
    db: AsyncSession, actor: User, kind: PartnerKind, body: OfferingIn, request: Request | None
) -> OfferingOut:
    data = body.model_dump()
    if data.get("contact_email") is not None:
        data["contact_email"] = str(data["contact_email"])
    o = PartnerOffering(kind=kind, updated_by_user_id=actor.id, **data)
    db.add(o)
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="partner_offering.create",
        entity_type="partner_offering",
        entity_id=o.id,
        after=_snapshot(o),
        request=request,
    )
    await db.commit()
    await cache.clear_prefix(CATALOG_CACHE)
    await db.refresh(o)
    return offering_out(o)


async def update_offering(
    db: AsyncSession,
    actor: User,
    kind: PartnerKind,
    offering_id: uuid.UUID,
    body: OfferingPatch,
    request: Request | None,
) -> OfferingOut:
    o = await _get_offering(db, kind, offering_id)
    before = _snapshot(o)
    data = body.model_dump(exclude_unset=True)
    for key in ("provider_name", "product_name", "summary", "countries", "is_active", "sort"):
        if key in data and data[key] is None:
            raise BadRequest(f"{key} cannot be empty", code="validation_error")
    if data.get("contact_email") is not None:
        data["contact_email"] = str(data["contact_email"])
    for key, value in data.items():
        setattr(o, key, value)
    lo, hi = o.price_min_minor, o.price_max_minor
    if lo is not None and hi is not None and lo > hi:
        raise BadRequest("price_min_minor must not exceed price_max_minor", code="validation_error")
    if (lo is not None or hi is not None) and not o.currency:
        raise BadRequest("currency is required with a price range", code="validation_error")
    o.updated_by_user_id = actor.id
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="partner_offering.update",
        entity_type="partner_offering",
        entity_id=o.id,
        before=before,
        after=_snapshot(o),
        request=request,
    )
    await db.commit()
    await cache.clear_prefix(CATALOG_CACHE)
    await db.refresh(o)
    return offering_out(o)


async def delete_offering(
    db: AsyncSession, actor: User, kind: PartnerKind, offering_id: uuid.UUID, request: Request | None
) -> None:
    o = await _get_offering(db, kind, offering_id)
    before = _snapshot(o)
    await db.delete(o)  # leads keep the copied provider/product names (offering_id -> NULL)
    await audit_log(
        db,
        actor=actor,
        action="partner_offering.delete",
        entity_type="partner_offering",
        entity_id=offering_id,
        before=before,
        request=request,
    )
    await db.commit()
    await cache.clear_prefix(CATALOG_CACHE)


# ==================================================================================================== leads
def lead_out(lead: PartnerLead, offering: PartnerOffering | None = None) -> LeadOut:
    return LeadOut(
        id=lead.id,
        kind=lead.kind,
        offering_id=lead.offering_id,
        provider_name=lead.provider_name,
        product_name=lead.product_name,
        case_id=lead.case_id,
        booking_id=lead.booking_id,
        status=lead.status,
        partner_website_url=offering.website_url if offering is not None else None,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )


async def _patient(db: AsyncSession, user: User) -> PatientProfile:
    profile = (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()
    if profile is None:
        raise NotFound("Patient profile not found", code="patient_not_found")
    return profile


async def create_lead(
    db: AsyncSession, user: User, kind: PartnerKind, body: LeadCreate, request: Request | None
) -> LeadOut:
    if not body.consent_share_contact:
        raise BadRequest(
            "Please agree that we may share your contact details with the partner", code="consent_required"
        )
    offering_id = body.product_id if kind == PartnerKind.INSURANCE else body.partner_id
    if offering_id is None:
        field = "product_id" if kind == PartnerKind.INSURANCE else "partner_id"
        raise BadRequest(f"{field} is required", code="validation_error")
    offering = await db.get(PartnerOffering, offering_id)
    if offering is None or _kind(offering.kind) != kind or not offering.is_active:
        raise NotFound("This partner is not available", code="offering_not_found")
    patient = await _patient(db, user)
    country = body.country or (
        patient.country_of_residence or patient.nationality or user.country_code or None
    )
    country = country.upper() if country else None
    if offering.countries and (country is None or country not in offering.countries):
        raise BadRequest(
            "This partner does not accept patients from your country",
            code="partner_country_not_eligible",
            details={"countries": list(offering.countries)},
        )
    case_id, booking_id = body.case_id, body.booking_id
    if booking_id is not None:
        booking = await db.get(Booking, booking_id)
        if booking is None or booking.patient_id != patient.id:
            raise NotFound("Booking not found")
        case_id = case_id or booking.case_id
    if case_id is not None:
        case_row = await db.get(Case, case_id)
        if case_row is None or case_row.patient_id != patient.id:
            raise NotFound("Case not found")
    duplicate = (
        await db.execute(
            select(PartnerLead.id).where(
                PartnerLead.patient_id == patient.id,
                PartnerLead.offering_id == offering.id,
                PartnerLead.status.in_(OPEN_STATUSES),
            )
        )
    ).first()
    if duplicate is not None:
        raise Conflict("You already have an open request with this partner", code="duplicate_request")

    consent = record_consent(
        db, user.id, CONSENT_KIND[kind], body.consent_version, request, granted=True, case_id=case_id
    )
    await db.flush()
    lead = PartnerLead(
        kind=kind,
        offering_id=offering.id,
        provider_name=offering.provider_name,
        product_name=offering.product_name,
        user_id=user.id,
        patient_id=patient.id,
        case_id=case_id,
        booking_id=booking_id,
        consent_id=consent.id,
        contact_name=body.contact_name,
        contact_email=str(body.contact_email).lower() if body.contact_email else None,
        contact_phone=body.contact_phone,
        preferred_contact=body.preferred_contact,
        country=country,
        message=body.message or None,
        status=PartnerLeadStatus.NEW,
    )
    db.add(lead)
    await db.flush()
    prefix = PREFIX[kind]
    params = {"provider": offering.provider_name, "product": offering.product_name, "name": body.contact_name}
    await notify(
        db,
        user.id,
        f"{prefix}.request_received",
        data={"lead_id": str(lead.id), "link": "/insurance"},
        title_key=f"{prefix}.notifications.request_received.title",
        body_key=f"{prefix}.notifications.request_received.body",
        params=params,
        dedupe_key=f"{prefix}.request_received:{lead.id}",
    )
    await notify_many(
        db,
        await messaging_policies.staff_user_ids(db, [UserRole.SUPPORT, UserRole.ADMIN]),
        f"{prefix}.request_new",
        data={"lead_id": str(lead.id), "link": f"{STAFF_PATH[kind]}?request={lead.id}"},
        title_key=f"{prefix}.notifications.staff_new.title",
        body_key=f"{prefix}.notifications.staff_new.body",
        params=params,
        dedupe_key=f"{prefix}.request_new:{lead.id}",
    )
    await audit_log(
        db,
        actor=user,
        action=f"{prefix}.lead_create",
        entity_type="partner_lead",
        entity_id=lead.id,
        after={"offering_id": str(offering.id), "consent_id": str(consent.id)},
        request=request,
    )
    await db.commit()
    await db.refresh(lead)
    return lead_out(lead, offering)


async def my_leads(db: AsyncSession, user: User, kind: PartnerKind) -> list[LeadOut]:
    rows = (
        await db.execute(
            select(PartnerLead, PartnerOffering)
            .outerjoin(PartnerOffering, PartnerOffering.id == PartnerLead.offering_id)
            .where(PartnerLead.user_id == user.id, PartnerLead.kind == kind)
            .order_by(PartnerLead.created_at.desc())
        )
    ).all()
    return [lead_out(lead, o) for lead, o in rows]


async def cancel_lead(
    db: AsyncSession, user: User, kind: PartnerKind, lead_id: uuid.UUID, request: Request | None
) -> LeadOut:
    lead = (
        await db.execute(select(PartnerLead).where(PartnerLead.id == lead_id).with_for_update())
    ).scalar_one_or_none()
    if lead is None or lead.user_id != user.id or _kind(lead.kind) != kind:
        raise NotFound("Request not found")
    if lead.status not in OPEN_STATUSES:
        raise BadRequest("This request is already closed", code="lead_not_open")
    lead.status = PartnerLeadStatus.CANCELLED
    # withdrawing the request also withdraws the hand-off consent (a new row, the history stays)
    record_consent(db, user.id, CONSENT_KIND[kind], "withdrawn", request, granted=False, case_id=lead.case_id)
    await audit_log(
        db,
        actor=user,
        action=f"{PREFIX[kind]}.lead_cancel",
        entity_type="partner_lead",
        entity_id=lead.id,
        request=request,
    )
    await db.commit()
    await db.refresh(lead)
    offering = await db.get(PartnerOffering, lead.offering_id) if lead.offering_id else None
    return lead_out(lead, offering)


# ---------------------------------------------------------------------------------------------- staff queue
async def _admin_outs(db: AsyncSession, leads: list[PartnerLead]) -> list[AdminLeadOut]:
    offering_ids = {x.offering_id for x in leads if x.offering_id}
    offerings = (
        {
            o.id: o
            for o in (
                await db.execute(select(PartnerOffering).where(PartnerOffering.id.in_(offering_ids)))
            ).scalars()
        }
        if offering_ids
        else {}
    )
    case_ids = {x.case_id for x in leads if x.case_id}
    numbers = (
        dict((await db.execute(select(Case.id, Case.case_number).where(Case.id.in_(case_ids)))).all())
        if case_ids
        else {}
    )
    consent_ids = {x.consent_id for x in leads if x.consent_id}
    consents = (
        dict(
            (
                await db.execute(select(Consent.id, Consent.created_at).where(Consent.id.in_(consent_ids)))
            ).all()
        )
        if consent_ids
        else {}
    )
    staff_ids = {x.handled_by_user_id for x in leads if x.handled_by_user_id}
    staff = (
        dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(staff_ids)))).all())
        if staff_ids
        else {}
    )
    out = []
    for lead in leads:
        base = lead_out(lead, offerings.get(lead.offering_id) if lead.offering_id else None)
        out.append(
            AdminLeadOut(
                **base.model_dump(),
                contact_name=lead.contact_name,
                contact_email=lead.contact_email,
                contact_phone=lead.contact_phone,
                preferred_contact=lead.preferred_contact,
                country=lead.country,
                message=lead.message,
                patient_id=lead.patient_id,
                case_number=numbers.get(lead.case_id) if lead.case_id else None,
                consent_id=lead.consent_id,
                consent_granted_at=consents.get(lead.consent_id) if lead.consent_id else None,
                staff_note=lead.staff_note,
                handled_by=(
                    StaffRef(id=lead.handled_by_user_id, full_name=staff.get(lead.handled_by_user_id) or "")
                    if lead.handled_by_user_id
                    else None
                ),
                handled_at=lead.handled_at,
                shared_at=lead.shared_at,
            )
        )
    return out


async def admin_leads(
    db: AsyncSession, kind: PartnerKind, params: Any, status: PartnerLeadStatus | None
) -> Page[AdminLeadOut]:
    stmt = select(PartnerLead).where(PartnerLead.kind == kind)
    if status is not None:
        stmt = stmt.where(PartnerLead.status == status)
    page = await paginate(db, stmt.order_by(PartnerLead.created_at.desc(), PartnerLead.id.desc()), params)
    items = await _admin_outs(db, list(page.items))
    return Page[AdminLeadOut].create(items, page.total, page.page, page.page_size)


async def admin_status_counts(db: AsyncSession, kind: PartnerKind) -> LeadStatusCounts:
    rows = (
        await db.execute(
            select(PartnerLead.status, func.count())
            .where(PartnerLead.kind == kind)
            .group_by(PartnerLead.status)
        )
    ).all()
    counts = {s.value: 0 for s in PartnerLeadStatus}
    for st, n in rows:
        counts[str(getattr(st, "value", st))] = int(n)
    return LeadStatusCounts(counts=counts, total=sum(counts.values()))


async def update_lead(
    db: AsyncSession,
    actor: User,
    kind: PartnerKind,
    lead_id: uuid.UUID,
    body: LeadUpdate,
    request: Request | None,
) -> AdminLeadOut:
    lead = (
        await db.execute(select(PartnerLead).where(PartnerLead.id == lead_id).with_for_update())
    ).scalar_one_or_none()
    if lead is None or _kind(lead.kind) != kind:
        raise NotFound("Request not found")
    before = {"status": str(getattr(lead.status, "value", lead.status)), "staff_note": lead.staff_note}
    changed_status = False
    if body.status is not None and body.status != lead.status:
        if lead.status == PartnerLeadStatus.CANCELLED:
            raise BadRequest("The patient withdrew this request", code="lead_not_open")
        if body.status not in STAFF_SETTABLE:
            raise BadRequest("Only the patient can withdraw a request", code="invalid_status")
        lead.status = body.status
        changed_status = True
        if body.status == PartnerLeadStatus.SHARED_WITH_PARTNER and lead.shared_at is None:
            lead.shared_at = datetime.now(UTC)
    if "staff_note" in body.model_fields_set:
        lead.staff_note = body.staff_note
    lead.handled_by_user_id = actor.id
    lead.handled_at = datetime.now(UTC)
    status_value = str(getattr(lead.status, "value", lead.status))
    if changed_status and lead.user_id is not None and status_value != PartnerLeadStatus.NEW.value:
        prefix = PREFIX[kind]
        await notify(
            db,
            lead.user_id,
            f"{prefix}.request_updated",
            data={"lead_id": str(lead.id), "status": status_value, "link": "/insurance"},
            title_key=f"{prefix}.notifications.request_updated.title",
            body_key=f"{prefix}.notifications.request_updated.body_{status_value}",
            params={"provider": lead.provider_name, "product": lead.product_name},
            dedupe_key=f"{prefix}.request_updated:{lead.id}:{status_value}",
        )
    await audit_log(
        db,
        actor=actor,
        action=f"{PREFIX[kind]}.lead_update",
        entity_type="partner_lead",
        entity_id=lead.id,
        before=before,
        after={"status": status_value, "staff_note": lead.staff_note},
        request=request,
    )
    await db.commit()
    await db.refresh(lead)
    return (await _admin_outs(db, [lead]))[0]


# ======================================================================================== instalments (CG-18)
def max_installment_months(start: date, admission_date: date) -> int:
    """Largest number of monthly instalments after the deposit whose last due date (``start`` + N months, the
    schedule's own rule) is still before ``admission_date``. 0 = no instalment plan (pay the deposit / in
    full)."""
    from app.modules.payments.service import add_months as schedule_add_months

    months = 0
    while months < MAX_INSTALLMENT_MONTHS and schedule_add_months(start, months + 1) < admission_date:
        months += 1
    return months


async def installment_plan(
    db: AsyncSession,
    admission_date: date,
    months: int | None,
    total_minor: int | None,
    deposit_minor: int | None,
    country: str | None,
) -> InstallmentPlanOut:
    from app.modules.payments.service import installment_plan as build_plan

    today = today_ist()
    max_m = max_installment_months(today, admission_date)
    valid = None if months is None else (1 <= months <= max_m)
    schedule: list[InstallmentRow] = []
    if months is not None and valid and total_minor is not None and total_minor > 0:
        if deposit_minor is None:
            deposit_minor = apply_pct(total_minor, int(await get_setting(db, "deposit_pct") or 0))
        schedule = [
            InstallmentRow(seq=i, due_date=due, amount_minor=amount)
            for i, (due, amount) in enumerate(build_plan(total_minor, deposit_minor, months, today), start=1)
        ]
    partners = await public_catalog(db, PartnerKind.PAY_LATER, country)
    return InstallmentPlanOut(
        admission_date=admission_date,
        today=today,
        last_due_by=admission_date - timedelta(days=1),
        max_months=max_m,
        allowed_months=list(range(1, max_m + 1)),
        months=months,
        valid=valid,
        schedule=schedule,
        partner_financing_available=bool(partners),
    )
