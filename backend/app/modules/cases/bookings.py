"""Bookings: creation & pricing, availability reservation, payment application, admit/complete/cancel,
checklist and itinerary (PLAN 8.7, section 5 booking state machine)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, datetime, time, timedelta
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import Select, and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.deps import has_role, is_staff
from app.core.enums import (
    BookingStatus,
    CaseStatus,
    ChecklistKey,
    ItineraryKind,
    PaymentOption,
    QuoteStatus,
    SlotKind,
    UserRole,
)
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.events import publish
from app.core.money import apply_bps, apply_pct, convert
from app.core.settings_store import get_setting
from app.models import (
    AvailabilitySlot,
    Booking,
    Case,
    ChecklistItem,
    HospitalProcedure,
    ItineraryItem,
    PatientProfile,
    Procedure,
    Quote,
    Refund,
    TreatmentPackage,
    User,
)
from app.models.sequences import IST, next_number
from app.modules.cases import policies
from app.modules.cases.checklist import apply_status, ensure_checklist
from app.modules.cases.common import CancellationInitiator, like_pattern, queue_case_push, today_ist, utcnow
from app.modules.cases.emergency import ensure_emergency_acknowledged
from app.modules.cases.schemas import (
    BookingAdmit,
    BookingComplete,
    BookingCreate,
    ChecklistItemUpdate,
    ItineraryItemCreate,
    ItineraryItemUpdate,
)
from app.modules.cases.state import ensure_booking_transition, transition_case
from app.modules.privacy.guards import ensure_guardian_consent

logger = structlog.get_logger(__name__)

ACTIVE_BOOKING_STATUSES = (BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED, BookingStatus.ADMITTED)


# --------------------------------------------------------------------------------------------- lookups
def scoped_bookings(user: User) -> Select[Any]:
    return select(Booking).where(policies.case_in_scope(Booking.case_id, user))


# --------------------------------------------------------------------------------------------- list
BOOKING_SORT_FIELDS: dict[str, Any] = {
    "created_at": Booking.created_at,
    "admission_date": Booking.admission_date,
    "booking_number": Booking.booking_number,
    "total_minor": Booking.total_minor,
    "status": Booking.status,
}
"""Sortable columns of ``GET /bookings`` (``sort=field`` ascending, ``sort=-field`` descending)."""

BOOKING_SORT_PATTERN = r"^-?(" + "|".join(BOOKING_SORT_FIELDS) + r")$"


def _ist_day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=IST)


def apply_booking_filters(
    stmt: Select[Any],
    *,
    status: Sequence[BookingStatus] | None = None,
    case_id: uuid.UUID | None = None,
    hospital_id: uuid.UUID | None = None,
    patient_id: uuid.UUID | None = None,
    q: str | None = None,
    payment: Sequence[str] | None = None,
    admission_from: date | None = None,
    admission_to: date | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
    min_total: int | None = None,
    max_total: int | None = None,
) -> Select[Any]:
    """WHERE clauses shared by the booking list and its status counts. ``payment``: ``paid`` (nothing
    due), ``partial`` (something paid, balance due), ``unpaid`` (nothing paid). Dates: inclusive IST days."""
    if status:
        stmt = stmt.where(Booking.status.in_(list(status)))
    if case_id is not None:
        stmt = stmt.where(Booking.case_id == case_id)
    if hospital_id is not None:
        stmt = stmt.where(Booking.hospital_id == hospital_id)
    if patient_id is not None:
        stmt = stmt.where(Booking.patient_id == patient_id)
    if q and q.strip():
        pattern = like_pattern(q.strip()[:100])
        full_name = func.concat(PatientProfile.first_name, " ", PatientProfile.last_name)
        patient_match = select(PatientProfile.id).where(
            or_(
                PatientProfile.first_name.ilike(pattern),
                PatientProfile.last_name.ilike(pattern),
                full_name.ilike(pattern),
            )
        )
        stmt = stmt.where(or_(Booking.booking_number.ilike(pattern), Booking.patient_id.in_(patient_match)))
    if payment:
        due = Booking.total_minor - Booking.amount_paid_minor + Booking.amount_refunded_minor
        conds: list[Any] = []
        if "paid" in payment:
            conds.append(and_(Booking.amount_paid_minor > 0, due <= 0))
        if "partial" in payment:
            conds.append(and_(Booking.amount_paid_minor > 0, due > 0))
        if "unpaid" in payment:
            conds.append(Booking.amount_paid_minor == 0)
        if conds:
            stmt = stmt.where(or_(*conds))
    if admission_from is not None:
        stmt = stmt.where(Booking.admission_date >= admission_from)
    if admission_to is not None:
        stmt = stmt.where(Booking.admission_date <= admission_to)
    if created_from is not None:
        stmt = stmt.where(Booking.created_at >= _ist_day_start(created_from))
    if created_to is not None:
        stmt = stmt.where(Booking.created_at < _ist_day_start(created_to + timedelta(days=1)))
    if min_total is not None:
        stmt = stmt.where(Booking.total_minor >= min_total)
    if max_total is not None:
        stmt = stmt.where(Booking.total_minor <= max_total)
    return stmt


def list_bookings_stmt(user: User, *, sort: str | None = None, **filters: Any) -> Select[Any]:
    """Bookings visible to ``user`` filtered by :func:`apply_booking_filters` and ordered by ``sort``
    (default ``-created_at``; ties broken by id; bookings without an admission date sort last)."""
    stmt = apply_booking_filters(scoped_bookings(user), **filters)
    sort = sort or "-created_at"
    column = BOOKING_SORT_FIELDS.get(sort.lstrip("-"), Booking.created_at)
    if sort.startswith("-"):
        return stmt.order_by(column.desc().nulls_last(), Booking.id.desc())
    return stmt.order_by(column.asc().nulls_last(), Booking.id.asc())


async def booking_status_counts(db: AsyncSession, user: User, **filters: Any) -> dict[str, int]:
    """Visible bookings per status (every status present, 0 when none); a ``status`` filter is ignored."""
    filters.pop("status", None)
    inner = apply_booking_filters(
        select(Booking.id, Booking.status).where(policies.case_in_scope(Booking.case_id, user)), **filters
    ).subquery()
    rows = (await db.execute(select(inner.c.status, func.count()).group_by(inner.c.status))).all()
    counts = {s.value: 0 for s in BookingStatus}
    for value, count in rows:
        counts[BookingStatus(value).value] = int(count)
    return counts


async def get_booking_for_user(
    db: AsyncSession, booking_id: uuid.UUID, user: User, *, for_update: bool = False
) -> Booking:
    stmt = scoped_bookings(user).where(Booking.id == booking_id)
    if for_update:
        stmt = stmt.with_for_update(of=Booking)
    booking = (await db.execute(stmt)).scalar_one_or_none()
    if booking is None:
        raise NotFound("Booking not found")
    return booking


async def _lock_case(db: AsyncSession, case_id: uuid.UUID) -> Case:
    return (await db.execute(select(Case).where(Case.id == case_id).with_for_update())).scalar_one()


async def _booking_push(db: AsyncSession, case: Case, booking: Booking) -> None:
    await queue_case_push(
        db,
        case,
        "booking.updated",
        {
            "booking_id": str(booking.id),
            "case_id": str(case.id),
            "status": BookingStatus(booking.status).value,
        },
    )


# --------------------------------------------------------------------------------------------- availability
async def reserve_admission(
    db: AsyncSession, hospital_id: uuid.UUID, doctor_id: uuid.UUID | None, day: date
) -> uuid.UUID | None:
    """Reserve one admission on ``day`` (``booked += 1``) and return the slot id.

    A doctor-specific admission row wins over a hospital-wide one (``doctor_id`` NULL). Without a row for
    the day: if the hospital publishes admission availability for upcoming dates the day is unavailable,
    otherwise admissions are unrestricted (returns None)."""
    doctor_scope = (
        (AvailabilitySlot.doctor_id == doctor_id) | AvailabilitySlot.doctor_id.is_(None)
        if doctor_id is not None
        else AvailabilitySlot.doctor_id.is_(None)
    )
    rows = list(
        (
            await db.execute(
                select(AvailabilitySlot).where(
                    AvailabilitySlot.hospital_id == hospital_id,
                    AvailabilitySlot.slot_kind == SlotKind.ADMISSION,
                    AvailabilitySlot.date == day,
                    doctor_scope,
                )
            )
        ).scalars()
    )
    slot = next((r for r in rows if r.doctor_id is not None), None) or next(iter(rows), None)
    if slot is None:
        any_upcoming = (
            await db.execute(
                select(AvailabilitySlot.id)
                .where(
                    AvailabilitySlot.hospital_id == hospital_id,
                    AvailabilitySlot.slot_kind == SlotKind.ADMISSION,
                    AvailabilitySlot.date >= today_ist(),
                    doctor_scope,
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if any_upcoming is not None:
            raise BadRequest(
                "The hospital has no admission availability on this date",
                code="date_unavailable",
                details={"admission_date": day.isoformat()},
            )
        return None
    reserved = (
        await db.execute(
            update(AvailabilitySlot)
            .where(AvailabilitySlot.id == slot.id, AvailabilitySlot.booked < AvailabilitySlot.capacity)
            .values(booked=AvailabilitySlot.booked + 1)
            .returning(AvailabilitySlot.id)
            .execution_options(synchronize_session=False)
        )
    ).scalar_one_or_none()
    if reserved is None:
        raise Conflict(
            "No admission capacity is left on this date",
            code="no_capacity",
            details={"admission_date": day.isoformat()},
        )
    return slot.id


async def release_admission(db: AsyncSession, booking: Booking) -> None:
    slot_id = (booking.meta or {}).get("availability_slot_id")
    if not slot_id or (booking.meta or {}).get("availability_released"):
        return
    await db.execute(
        update(AvailabilitySlot)
        .where(AvailabilitySlot.id == uuid.UUID(str(slot_id)), AvailabilitySlot.booked > 0)
        .values(booked=AvailabilitySlot.booked - 1)
        .execution_options(synchronize_session=False)
    )
    booking.meta = {**(booking.meta or {}), "availability_released": True}


# --------------------------------------------------------------------------------------------- create
async def create_booking(
    db: AsyncSession, user: User, body: BookingCreate, request: Request | None = None
) -> Booking:
    policies.ensure_patient_side(user)
    policies.ensure_full_account(user)
    if policies.is_agent(user):
        await policies.require_active_agent(db, user)
    case = await policies.get_case_for_user(db, body.case_id, user, for_update=True)
    await ensure_emergency_acknowledged(db, case)
    await ensure_guardian_consent(db, case.patient_id)  # DPDP s.9: a minor's booking needs a guardian
    existing = (
        await db.execute(
            select(Booking.id).where(Booking.case_id == case.id, Booking.status != BookingStatus.CANCELLED)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise Conflict("This case already has an active booking", code="booking_exists")

    quote: Quote | None = None
    package: TreatmentPackage | None = None
    hp: HospitalProcedure | None = None
    if body.package_id is not None:
        if case.status not in (CaseStatus.ENQUIRY, CaseStatus.QUOTED, CaseStatus.ACCEPTED):
            raise BadRequest(
                f"A case in status {CaseStatus(case.status).value} cannot be booked", code="invalid_state"
            )
        row = (
            await db.execute(
                select(TreatmentPackage, HospitalProcedure)
                .join(HospitalProcedure, HospitalProcedure.id == TreatmentPackage.hospital_procedure_id)
                .where(TreatmentPackage.id == body.package_id)
            )
        ).one_or_none()
        if row is None:
            raise NotFound("Package not found")
        package, hp = row
        if hp.hospital_id != case.hospital_id or not package.is_active or not hp.is_active:
            raise BadRequest("This package is not offered by the case's hospital", code="invalid_package")
        if case.procedure_id is not None and hp.procedure_id != case.procedure_id:
            raise BadRequest("This package is for a different procedure", code="invalid_package")
    else:
        stmt = select(Quote).where(Quote.case_id == case.id)
        if body.quote_id is not None:
            stmt = stmt.where(Quote.id == body.quote_id)
        else:
            stmt = stmt.where(Quote.status == QuoteStatus.ACCEPTED).order_by(Quote.accepted_at.desc())
        quote = (await db.execute(stmt.limit(1))).scalar_one_or_none()
        if quote is None:
            if body.quote_id is not None:
                raise NotFound("Quote not found")
            raise BadRequest("Accept a quote or choose a package first", code="quote_required")
        if quote.status != QuoteStatus.ACCEPTED or case.status != CaseStatus.ACCEPTED:
            raise BadRequest("Only an accepted quote can be booked", code="quote_not_accepted")

    if body.admission_date <= today_ist():
        raise BadRequest("The admission date must be in the future", code="invalid_admission_date")

    # ---- pricing (minor units of the quote/package currency)
    if quote is not None:
        subtotal, currency = quote.total_minor, quote.currency
    elif package is not None:
        subtotal, currency = package.price_minor, package.currency
    else:  # pragma: no cover - one of the two branches above always resolved a price source
        raise BadRequest("Accept a quote or choose a package first", code="quote_required")
    discount = 0
    fee_bps = int(await get_setting(db, "patient_service_fee_bps") or 0)
    gst_bps = int(await get_setting(db, "gst_rate_bps") or 0)
    deposit_pct = int(await get_setting(db, "deposit_pct") or 0)
    service_fee = apply_bps(subtotal - discount, fee_bps)
    tax = apply_bps(service_fee, gst_bps)  # GST only on the platform's service fee
    total = subtotal - discount + service_fee + tax
    deposit = apply_pct(total, deposit_pct)

    procedure_id = case.procedure_id or (hp.procedure_id if hp is not None else None)
    duration: int | None = quote.estimated_stay_days if quote is not None else None
    if duration is None and procedure_id is not None:
        proc = await db.get(Procedure, procedure_id)
        if proc is not None:
            duration = proc.total_stay_days or proc.hospital_stay_days
    if duration is None and hp is not None:
        duration = hp.hospital_stay_days

    slot_id = await reserve_admission(db, case.hospital_id, case.doctor_id, body.admission_date)
    meta: dict[str, Any] = {"applied_payment_ids": [], "applied_refund_ids": []}
    if slot_id is not None:
        meta["availability_slot_id"] = str(slot_id)

    booking = Booking(
        booking_number=await next_number(db, "booking"),
        case_id=case.id,
        quote_id=quote.id if quote is not None else None,
        package_id=package.id if package is not None else None,
        patient_id=case.patient_id,
        hospital_id=case.hospital_id,
        doctor_id=case.doctor_id,
        procedure_id=procedure_id,
        status=BookingStatus.PENDING_PAYMENT,
        admission_date=body.admission_date,
        duration_days=duration,
        payment_option=body.payment_option,
        installment_months=(
            body.installment_months if body.payment_option == PaymentOption.INSTALLMENTS else None
        ),
        insurance_claim_requested=body.insurance_claim_requested,
        currency=currency,
        subtotal_minor=subtotal,
        discount_minor=discount,
        service_fee_minor=service_fee,
        tax_minor=tax,
        total_minor=total,
        deposit_minor=deposit,
        amount_paid_minor=0,
        amount_refunded_minor=0,
        meta=meta,
    )
    db.add(booking)
    if package is not None and hp is not None:
        if case.procedure_id is None:
            case.procedure_id = hp.procedure_id
        if case.status in (CaseStatus.ENQUIRY, CaseStatus.QUOTED):
            from app.modules.cases.service import withdraw_open_quotes

            await withdraw_open_quotes(db, case.id)
            await transition_case(
                db,
                case,
                CaseStatus.ACCEPTED,
                actor=user,
                note=f"Package selected: {package.name}",
                request=request,
            )
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="booking.create",
        entity_type="booking",
        entity_id=booking.id,
        after={
            "booking_number": booking.booking_number,
            "case_id": case.id,
            "total_minor": total,
            "deposit_minor": deposit,
            "currency": currency,
            "admission_date": body.admission_date,
        },
        request=request,
    )
    await publish(db, "booking.created", {"booking_id": str(booking.id)})
    await _booking_push(db, case, booking)
    await db.commit()
    return booking


# --------------------------------------------------------------------------------------------- payments
async def _booking_amount(db: AsyncSession, booking: Booking, payload: dict[str, Any]) -> int:
    """Captured amount in the booking currency (exact when the payment was made in that currency)."""
    currency = str(payload.get("currency") or "").upper()
    amount = payload.get("amount_minor")
    if currency == booking.currency and amount is not None:
        return int(amount)
    base = int(payload.get("base_amount_minor") or 0)
    if booking.currency == "INR":
        return base
    converted, _ = await convert(db, base, "INR", booking.currency)
    return converted


async def confirm_booking(db: AsyncSession, booking: Booking, *, actor: User | None = None) -> None:
    ensure_booking_transition(booking.status, BookingStatus.CONFIRMED)
    booking.status = BookingStatus.CONFIRMED
    booking.confirmed_at = utcnow()
    # The refund terms in force at confirmation govern any later cancellation (INTEGRATION_BACKLOG #7).
    booking.refund_policy = normalize_refund_policy(await get_setting(db, "refund_policy"))
    case = await _lock_case(db, booking.case_id)
    if case.status == CaseStatus.ACCEPTED:
        await transition_case(
            db, case, CaseStatus.BOOKED, actor=actor, note="Deposit received; booking confirmed"
        )
    await audit_log(
        db,
        actor=actor,
        action="booking.confirm",
        entity_type="booking",
        entity_id=booking.id,
        before={"status": BookingStatus.PENDING_PAYMENT.value},
        after={"status": BookingStatus.CONFIRMED.value, "amount_paid_minor": booking.amount_paid_minor},
    )
    await publish(db, "booking.confirmed", {"booking_id": str(booking.id)})
    await _booking_push(db, case, booking)


async def apply_captured_payment(db: AsyncSession, payload: dict[str, Any]) -> None:
    """``payment.captured`` handler body: add the payment to the booking (idempotent per payment id) and
    confirm the booking the first time ``amount_paid >= deposit``."""
    booking_id = payload.get("booking_id")
    payment_id = payload.get("payment_id")
    if not booking_id or not payment_id:
        return
    booking = (
        await db.execute(select(Booking).where(Booking.id == uuid.UUID(str(booking_id))).with_for_update())
    ).scalar_one_or_none()
    if booking is None:
        logger.warning("cases.payment_for_unknown_booking", booking_id=str(booking_id))
        return
    meta = dict(booking.meta or {})
    applied = [str(x) for x in meta.get("applied_payment_ids", [])]
    if str(payment_id) in applied:
        return
    amount = await _booking_amount(db, booking, payload)
    before_paid = booking.amount_paid_minor
    booking.amount_paid_minor = before_paid + max(amount, 0)
    booking.meta = {**meta, "applied_payment_ids": [*applied, str(payment_id)]}
    await audit_log(
        db,
        actor=None,
        action="booking.payment_applied",
        entity_type="booking",
        entity_id=booking.id,
        before={"amount_paid_minor": before_paid},
        after={"amount_paid_minor": booking.amount_paid_minor, "payment_id": str(payment_id)},
    )
    if (
        booking.status == BookingStatus.PENDING_PAYMENT
        and booking.amount_paid_minor - booking.amount_refunded_minor >= booking.deposit_minor
    ):
        await confirm_booking(db, booking)
    else:
        case = await db.get(Case, booking.case_id)
        if case is not None:
            await _booking_push(db, case, booking)


async def apply_processed_refund(db: AsyncSession, payload: dict[str, Any]) -> None:
    """``refund.processed`` handler body: add to ``amount_refunded_minor`` (idempotent per refund id)."""
    booking_id = payload.get("booking_id")
    refund_id = payload.get("refund_id")
    if not booking_id or not refund_id:
        return
    booking = (
        await db.execute(select(Booking).where(Booking.id == uuid.UUID(str(booking_id))).with_for_update())
    ).scalar_one_or_none()
    if booking is None:
        return
    meta = dict(booking.meta or {})
    applied = [str(x) for x in meta.get("applied_refund_ids", [])]
    if str(refund_id) in applied:
        return
    amount: int | None = None
    refund = await db.get(Refund, uuid.UUID(str(refund_id)))
    if refund is not None and refund.currency == booking.currency:
        amount = int(refund.amount_minor)
    if amount is None:
        base = int(payload.get("base_amount_minor") or 0)
        amount = base if booking.currency == "INR" else (await convert(db, base, "INR", booking.currency))[0]
    remaining = max(booking.amount_paid_minor - booking.amount_refunded_minor, 0)
    if amount > remaining:
        logger.warning(
            "cases.refund_exceeds_paid", booking_id=str(booking.id), amount=amount, remaining=remaining
        )
        amount = remaining
    before = booking.amount_refunded_minor
    booking.amount_refunded_minor = before + max(amount, 0)
    booking.meta = {**meta, "applied_refund_ids": [*applied, str(refund_id)]}
    await audit_log(
        db,
        actor=None,
        action="booking.refund_applied",
        entity_type="booking",
        entity_id=booking.id,
        before={"amount_refunded_minor": before},
        after={"amount_refunded_minor": booking.amount_refunded_minor, "refund_id": str(refund_id)},
    )
    case = await db.get(Case, booking.case_id)
    if case is not None:
        await _booking_push(db, case, booking)


# --------------------------------------------------------------------------------------------- cancel
def normalize_refund_policy(policy: Any) -> list[dict[str, int]]:
    """Clean copy of a ``refund_policy`` setting value (``[{days_before, refund_pct}]``, highest first)."""
    tiers: list[dict[str, int]] = []
    for t in policy if isinstance(policy, list) else []:
        if isinstance(t, dict):
            tiers.append(
                {
                    "days_before": int(t.get("days_before", 0)),
                    "refund_pct": max(0, min(100, int(t.get("refund_pct", 0)))),
                }
            )
    return sorted(tiers, key=lambda t: t["days_before"], reverse=True)


def refund_pct_for(policy: list[dict[str, Any]], days_before: int) -> int:
    """First tier (by ``days_before`` descending) whose threshold the cancellation meets."""
    tiers = sorted(
        (t for t in policy if isinstance(t, dict)), key=lambda t: int(t.get("days_before", 0)), reverse=True
    )
    for tier in tiers:
        if days_before >= int(tier.get("days_before", 0)):
            return max(0, min(100, int(tier.get("refund_pct", 0))))
    return 0


async def compute_refund(
    db: AsyncSession,
    booking: Booking,
    initiated_by: CancellationInitiator = CancellationInitiator.PATIENT,
) -> tuple[int, int]:
    """``(refundable_minor, refund_pct)`` in the booking currency for a cancellation today.

    Never-confirmed bookings and hospital/platform-initiated cancellations refund 100% of the net amount
    paid; patient cancellations apply the refund policy snapshotted at confirmation (falling back to the
    current setting for bookings confirmed before snapshots existed)."""
    net_paid = max(booking.amount_paid_minor - booking.amount_refunded_minor, 0)
    if booking.status == BookingStatus.PENDING_PAYMENT:
        return net_paid, 100  # never confirmed: anything paid so far is returned in full
    if initiated_by != CancellationInitiator.PATIENT:
        return net_paid, 100
    policy = booking.refund_policy
    if policy is None:
        policy = normalize_refund_policy(await get_setting(db, "refund_policy"))
    days = (booking.admission_date - today_ist()).days if booking.admission_date else 10**6
    pct = refund_pct_for(list(policy), days)
    return apply_pct(net_paid, pct), pct


async def cancel_booking_locked(
    db: AsyncSession,
    booking: Booking,
    case: Case,
    *,
    actor: User | None,
    reason: str,
    request: Request | None = None,
    cancel_case: bool = False,
    initiated_by: CancellationInitiator = CancellationInitiator.PATIENT,
) -> tuple[int, int]:
    """Cancel a locked booking. A confirmed booking also cancels the case; a never-confirmed one leaves
    the case ``accepted`` so another date can be booked (unless ``cancel_case``). Caller commits."""
    ensure_booking_transition(booking.status, BookingStatus.CANCELLED)
    previous = BookingStatus(booking.status)
    refundable, pct = await compute_refund(db, booking, initiated_by)
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = utcnow()
    booking.cancel_reason = reason
    await release_admission(db, booking)
    booking.meta = {
        **(booking.meta or {}),
        "cancel_refund_pct": pct,
        "cancel_refundable_minor": refundable,
        "cancel_initiated_by": initiated_by.value,
    }
    if (cancel_case or previous == BookingStatus.CONFIRMED) and case.status in (
        CaseStatus.ACCEPTED,
        CaseStatus.BOOKED,
    ):
        await transition_case(db, case, CaseStatus.CANCELLED, actor=actor, note=reason, request=request)
    await audit_log(
        db,
        actor=actor,
        action="booking.cancel",
        entity_type="booking",
        entity_id=booking.id,
        before={"status": previous.value},
        after={
            "status": BookingStatus.CANCELLED.value,
            "reason": reason,
            "refundable_minor": refundable,
            "refund_pct": pct,
            "initiated_by": initiated_by.value,
        },
        request=request,
    )
    await publish(
        db,
        "booking.cancelled",
        {
            "booking_id": str(booking.id),
            "refundable_minor": refundable,
            "currency": booking.currency,
            "refund_pct": pct,
            "reason": reason,
            "initiated_by": initiated_by.value,
            # SEC-059: a staff (admin) platform/hospital cancellation waives the patient's tiers, so its
            # refund goes through the normal maker-checker approval with the cancelling user as requester.
            "refund_requested_by": (
                str(actor.id)
                if actor is not None and is_staff(actor) and initiated_by != CancellationInitiator.PATIENT
                else None
            ),
        },
    )
    await _booking_push(db, case, booking)
    return refundable, pct


async def resolve_initiator(
    db: AsyncSession, user: User, booking: Booking, requested: CancellationInitiator | None
) -> CancellationInitiator:
    """Who is cancelling: derived from the actor; only platform staff may state it explicitly (e.g.
    ``patient`` when support cancels at the patient's request).

    SEC-059: a ``platform``/``hospital`` cancellation refunds 100%, so among staff only admin/super_admin
    may choose it (their default); other staff (support, finance) cancel on the patient's behalf, with
    the patient's refund tiers."""
    if is_staff(user):
        admin = has_role(user, UserRole.ADMIN)
        initiator = requested or (CancellationInitiator.PLATFORM if admin else CancellationInitiator.PATIENT)
        if initiator != CancellationInitiator.PATIENT and not admin:
            raise Forbidden(
                "Only an admin can cancel a booking as the platform or the hospital",
                code="platform_cancel_admin_only",
            )
        return initiator
    if policies.is_hospital_user(user):
        await policies.ensure_hospital_actor(db, user, booking.hospital_id)
        derived = CancellationInitiator.HOSPITAL
    elif policies.is_patient(user) or policies.is_agent(user):
        derived = CancellationInitiator.PATIENT
    else:
        raise Forbidden("You cannot cancel this booking")
    if requested is not None and requested != derived:
        raise Forbidden("Only platform staff can set initiated_by")
    return derived


async def cancel_booking(
    db: AsyncSession,
    user: User,
    booking_id: uuid.UUID,
    reason: str,
    request: Request | None = None,
    initiated_by: CancellationInitiator | None = None,
) -> tuple[Booking, int, int]:
    """Cancel by the patient/agent (refund tiers), the hospital team or platform staff (100% refund)."""
    booking = await get_booking_for_user(db, booking_id, user, for_update=True)
    initiator = await resolve_initiator(db, user, booking, initiated_by)
    case = await _lock_case(db, booking.case_id)
    refundable, pct = await cancel_booking_locked(
        db, booking, case, actor=user, reason=reason, request=request, initiated_by=initiator
    )
    await db.commit()
    return booking, refundable, pct


async def expire_unpaid_bookings(db: AsyncSession) -> int:
    """Cancel ``pending_payment`` bookings whose admission date has passed (periodic job)."""
    ids = list(
        (
            await db.execute(
                select(Booking.id).where(
                    Booking.status == BookingStatus.PENDING_PAYMENT, Booking.admission_date < today_ist()
                )
            )
        ).scalars()
    )
    count = 0
    for booking_id in ids:
        booking = (
            await db.execute(
                select(Booking).where(Booking.id == booking_id).with_for_update(skip_locked=True)
            )
        ).scalar_one_or_none()
        if booking is None or booking.status != BookingStatus.PENDING_PAYMENT:
            continue
        case = await _lock_case(db, booking.case_id)
        await cancel_booking_locked(
            db,
            booking,
            case,
            actor=None,
            reason="Admission date passed without the deposit being paid",
            initiated_by=CancellationInitiator.PLATFORM,
        )
        count += 1
    return count


# --------------------------------------------------------------------------------------------- admit/complete
async def admit_booking(
    db: AsyncSession, user: User, booking_id: uuid.UUID, body: BookingAdmit, request: Request | None = None
) -> Booking:
    booking = await get_booking_for_user(db, booking_id, user, for_update=True)
    await policies.ensure_hospital_actor(db, user, booking.hospital_id)
    ensure_booking_transition(booking.status, BookingStatus.ADMITTED)
    booking.status = BookingStatus.ADMITTED
    booking.admitted_at = utcnow()
    case = await _lock_case(db, booking.case_id)
    if case.status == CaseStatus.BOOKED:
        await transition_case(
            db,
            case,
            CaseStatus.IN_TREATMENT,
            actor=user,
            note=body.note or "Patient admitted",
            request=request,
        )
    await audit_log(
        db,
        actor=user,
        action="booking.admit",
        entity_type="booking",
        entity_id=booking.id,
        before={"status": BookingStatus.CONFIRMED.value},
        after={"status": BookingStatus.ADMITTED.value, "note": body.note},
        request=request,
    )
    await publish(db, "booking.admitted", {"booking_id": str(booking.id)})
    await _booking_push(db, case, booking)
    await db.commit()
    return booking


async def complete_booking(
    db: AsyncSession, user: User, booking_id: uuid.UUID, body: BookingComplete, request: Request | None = None
) -> Booking:
    booking = await get_booking_for_user(db, booking_id, user, for_update=True)
    await policies.ensure_hospital_actor(db, user, booking.hospital_id)
    ensure_booking_transition(booking.status, BookingStatus.COMPLETED)
    discharge = body.discharge_date or today_ist()
    if booking.admission_date is not None and discharge < booking.admission_date:
        raise BadRequest(
            "The discharge date cannot be before the admission date", code="invalid_discharge_date"
        )
    if discharge > today_ist():
        raise BadRequest("The discharge date cannot be in the future", code="invalid_discharge_date")
    booking.status = BookingStatus.COMPLETED
    booking.completed_at = utcnow()
    booking.discharge_date = discharge
    case = await _lock_case(db, booking.case_id)
    if case.status == CaseStatus.IN_TREATMENT:
        await transition_case(
            db,
            case,
            CaseStatus.COMPLETED,
            actor=user,
            note=body.note or "Patient discharged",
            request=request,
        )
    await audit_log(
        db,
        actor=user,
        action="booking.complete",
        entity_type="booking",
        entity_id=booking.id,
        before={"status": BookingStatus.ADMITTED.value},
        after={"status": BookingStatus.COMPLETED.value, "discharge_date": discharge, "note": body.note},
        request=request,
    )
    await publish(db, "booking.completed", {"booking_id": str(booking.id)})
    await _booking_push(db, case, booking)
    await db.commit()
    return booking


# --------------------------------------------------------------------------------------------- checklist
async def on_booking_confirmed(db: AsyncSession, booking_id: uuid.UUID) -> None:
    """Create the checklist and the admission itinerary entry (idempotent)."""
    booking = await db.get(Booking, booking_id)
    if booking is None:
        return
    case = await db.get(Case, booking.case_id)
    if case is None:
        return
    await ensure_checklist(db, case)
    if booking.admission_date is not None:
        exists = (
            await db.execute(
                select(ItineraryItem.id).where(
                    ItineraryItem.case_id == case.id, ItineraryItem.kind == ItineraryKind.ADMISSION
                )
            )
        ).scalar_one_or_none()
        if exists is None:
            db.add(
                ItineraryItem(
                    case_id=case.id,
                    kind=ItineraryKind.ADMISSION,
                    title="Hospital admission",
                    description=f"Booking {booking.booking_number}",
                    starts_at=datetime.combine(booking.admission_date, time(9, 0), tzinfo=IST),
                )
            )


async def list_checklist(db: AsyncSession, user: User, booking_id: uuid.UUID) -> list[ChecklistItem]:
    booking = await get_booking_for_user(db, booking_id, user)
    return list(
        (
            await db.execute(
                select(ChecklistItem)
                .where(ChecklistItem.case_id == booking.case_id)
                .order_by(ChecklistItem.sort_order, ChecklistItem.id)
            )
        ).scalars()
    )


async def update_checklist_item(
    db: AsyncSession,
    user: User,
    booking_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ChecklistItemUpdate,
    request: Request | None = None,
) -> ChecklistItem:
    booking = await get_booking_for_user(db, booking_id, user)
    item = (
        await db.execute(
            select(ChecklistItem)
            .where(ChecklistItem.id == item_id, ChecklistItem.case_id == booking.case_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if item is None:
        raise NotFound("Checklist item not found")
    if item.key == ChecklistKey.TREATMENT_BOOKED and not policies.is_ops_staff(user):
        raise BadRequest("This item is managed automatically", code="checklist_item_locked")
    before = str(getattr(item.status, "value", item.status))
    if apply_status(item, body.status):
        await audit_log(
            db,
            actor=user,
            action="checklist.update",
            entity_type="checklist_item",
            entity_id=item.id,
            before={"status": before},
            after={"status": body.status.value, "key": str(getattr(item.key, "value", item.key))},
            request=request,
        )
        case = await db.get(Case, booking.case_id)
        if case is not None:
            await _booking_push(db, case, booking)
    await db.commit()
    return item


# --------------------------------------------------------------------------------------------- itinerary
async def list_itinerary(db: AsyncSession, user: User, booking_id: uuid.UUID) -> list[ItineraryItem]:
    booking = await get_booking_for_user(db, booking_id, user)
    return list(
        (
            await db.execute(
                select(ItineraryItem)
                .where(ItineraryItem.case_id == booking.case_id)
                .order_by(
                    ItineraryItem.starts_at.asc().nulls_last(), ItineraryItem.created_at, ItineraryItem.id
                )
            )
        ).scalars()
    )


async def create_itinerary_item(
    db: AsyncSession,
    user: User,
    booking_id: uuid.UUID,
    body: ItineraryItemCreate,
    request: Request | None = None,
) -> ItineraryItem:
    booking = await get_booking_for_user(db, booking_id, user)
    await policies.ensure_hospital_actor(db, user, booking.hospital_id)
    item = ItineraryItem(case_id=booking.case_id, created_by_user_id=user.id, **body.model_dump())
    db.add(item)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="itinerary.create",
        entity_type="itinerary_item",
        entity_id=item.id,
        after=body.model_dump(mode="json"),
        request=request,
    )
    case = await db.get(Case, booking.case_id)
    if case is not None:
        await _booking_push(db, case, booking)
    await db.commit()
    await db.refresh(item)
    return item


async def _get_itinerary_item(
    db: AsyncSession, user: User, booking_id: uuid.UUID, item_id: uuid.UUID
) -> tuple[Booking, ItineraryItem]:
    booking = await get_booking_for_user(db, booking_id, user)
    item = (
        await db.execute(
            select(ItineraryItem).where(ItineraryItem.id == item_id, ItineraryItem.case_id == booking.case_id)
        )
    ).scalar_one_or_none()
    if item is None:
        raise NotFound("Itinerary item not found")
    await policies.ensure_hospital_actor(db, user, booking.hospital_id)
    return booking, item


async def update_itinerary_item(
    db: AsyncSession,
    user: User,
    booking_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ItineraryItemUpdate,
    request: Request | None = None,
) -> ItineraryItem:
    booking, item = await _get_itinerary_item(db, user, booking_id, item_id)
    changes = body.model_dump(exclude_unset=True)
    for field in ("kind", "title", "status"):
        if field in changes and changes[field] is None:
            raise BadRequest(f"{field} cannot be null", code="invalid_field")
    before = {k: getattr(item, k) for k in changes}
    for key, value in changes.items():
        setattr(item, key, value)
    if item.starts_at and item.ends_at and item.ends_at < item.starts_at:
        raise BadRequest("ends_at must not be before starts_at", code="invalid_times")
    await audit_log(
        db,
        actor=user,
        action="itinerary.update",
        entity_type="itinerary_item",
        entity_id=item.id,
        before=before,
        after=changes,
        request=request,
    )
    case = await db.get(Case, booking.case_id)
    if case is not None:
        await _booking_push(db, case, booking)
    await db.commit()
    await db.refresh(item)
    return item


async def delete_itinerary_item(
    db: AsyncSession, user: User, booking_id: uuid.UUID, item_id: uuid.UUID, request: Request | None = None
) -> None:
    booking, item = await _get_itinerary_item(db, user, booking_id, item_id)
    await audit_log(
        db,
        actor=user,
        action="itinerary.delete",
        entity_type="itinerary_item",
        entity_id=item.id,
        before={"title": item.title, "kind": str(getattr(item.kind, "value", item.kind))},
        request=request,
    )
    await db.delete(item)
    case = await db.get(Case, booking.case_id)
    if case is not None:
        await _booking_push(db, case, booking)
    await db.commit()
