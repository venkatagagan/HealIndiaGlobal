"""Patients business logic (PLAN 8.2): profile (encrypted passport/policy numbers), companions, saved items
and the pre-arrival dashboard.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.currency import default_currency_for_country
from app.core.enums import BookingStatus, CaseStatus, ItineraryStatus, SavedEntityType
from app.core.errors import BadRequest, NotFound
from app.core.ids import uuid7
from app.core.settings_store import get_setting
from app.models import (
    Booking,
    Case,
    ChecklistItem,
    Doctor,
    Hospital,
    ItineraryItem,
    Notification,
    PatientCompanion,
    PatientProfile,
    Procedure,
    SavedItem,
    Screening,
    Specialty,
    TreatmentPackage,
    User,
)
from app.modules.patients.cards import doctor_cards, hospital_cards, procedure_cards
from app.modules.patients.schemas import (
    BookingHospitalRef,
    BookingOut,
    ChecklistItemOut,
    CompanionIn,
    CompanionOut,
    CompanionUpdate,
    CoordinatorRef,
    IdFullName,
    IdName,
    IdSlugName,
    ItineraryItemOut,
    PackageOut,
    PatientDashboardOut,
    PatientProfileIn,
    PatientProfileOut,
    SavedItemOut,
    ScreeningLite,
)

IST = timezone(timedelta(hours=5, minutes=30), name="IST")
MAX_COMPANIONS = 10
MAX_SAVED_ITEMS = 500
INACTIVE_CASE_STATUSES = (CaseStatus.COMPLETED, CaseStatus.CANCELLED, CaseStatus.DECLINED)


def ist_today() -> date:
    """Treatment happens in India, so day-based countdowns use Indian Standard Time."""
    return datetime.now(IST).date()


# --- profile ---------------------------------------------------------------------------------------------
async def get_or_create_profile(db: AsyncSession, user: User) -> PatientProfile:
    profile = (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()
    if profile is not None:
        return profile
    first, _, last = (user.full_name or "").strip().partition(" ")
    await db.execute(
        pg_insert(PatientProfile)
        .values(
            id=uuid7(),
            user_id=user.id,
            first_name=first[:100],
            last_name=last.strip()[:100],
            phone=user.phone,
            nationality=user.country_code,
            country_of_residence=user.country_code,
            preferred_language=user.preferred_language,
            preferred_currency=await default_currency_for_country(db, user.country_code),
        )
        .on_conflict_do_nothing(index_elements=[PatientProfile.user_id])
    )
    await db.commit()
    return (await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))).scalar_one()


def profile_out(profile: PatientProfile, user: User) -> PatientProfileOut:
    policy = profile.insurance_policy_number
    return PatientProfileOut(
        id=profile.id,
        user_id=profile.user_id,
        email=user.email,
        full_name=profile.full_name or user.full_name,
        first_name=profile.first_name,
        last_name=profile.last_name,
        date_of_birth=profile.date_of_birth,
        gender=profile.gender,
        nationality=profile.nationality,
        country_of_residence=profile.country_of_residence,
        passport_last4=profile.passport_last4,
        passport_expiry=profile.passport_expiry,
        phone=profile.phone,
        whatsapp=profile.whatsapp,
        address=profile.address,
        emergency_contact=profile.emergency_contact,
        preferred_language=profile.preferred_language,
        blood_group=profile.blood_group,
        allergies=profile.allergies,
        medical_history=profile.medical_history,
        insurance_provider=profile.insurance_provider,
        insurance_policy_last4=policy[-4:] if policy else None,
        referred_by_agent_id=profile.referred_by_agent_id,
        managed_by_agent_id=profile.managed_by_agent_id,
        preferred_currency=profile.preferred_currency,
        currency_set_by_user=profile.currency_set_by_user,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


async def sync_home_country(
    db: AsyncSession, user: User, profile: PatientProfile | None, country: str | None
) -> None:
    """Keep ``User.country_code`` and ``PatientProfile.country_of_residence`` equal after either changed.

    Until the patient picks a currency themselves (``currency_set_by_user``), ``preferred_currency`` follows
    the country (its currency when supported, else USD). Clearing the country changes nothing. No commit."""
    if not country:
        return
    user.country_code = country
    if profile is None:
        return
    profile.country_of_residence = country
    if not profile.currency_set_by_user:
        profile.preferred_currency = await default_currency_for_country(db, country)


async def update_profile(
    db: AsyncSession, user: User, body: PatientProfileIn, request: Request
) -> PatientProfile:
    profile = await get_or_create_profile(db, user)
    changes: dict[str, Any] = body.model_dump(exclude_unset=True)

    if "preferred_currency" in changes:
        ccy = changes.pop("preferred_currency")
        if ccy is not None:
            supported = await get_setting(db, "supported_currencies")
            if isinstance(supported, list) and supported and ccy not in supported:
                raise BadRequest(
                    f"Currency {ccy} is not supported",
                    code="unsupported_currency",
                    details={"supported": supported},
                )
            profile.preferred_currency = ccy
            profile.currency_set_by_user = True
    new_country = changes.pop("country_of_residence", None)
    if "passport_number" in changes:
        number = changes.pop("passport_number")
        profile.passport_number = number
        profile.passport_last4 = number[-4:] if number else None
    if "insurance_policy_number" in changes:
        profile.insurance_policy_number = changes.pop("insurance_policy_number")
    for name_field in ("first_name", "last_name"):
        if name_field in changes and changes[name_field] is None:
            changes[name_field] = ""
    for key in ("address", "emergency_contact"):
        if key in changes and isinstance(changes[key], dict):
            changes[key] = {k: v for k, v in changes[key].items() if v is not None}
    for key, value in changes.items():
        setattr(profile, key, value)
    if new_country:
        if new_country != profile.country_of_residence:
            await sync_home_country(db, user, profile, new_country)
        else:
            user.country_code = new_country
    elif "country_of_residence" in body.model_fields_set:
        profile.country_of_residence = None

    if profile.full_name and ("first_name" in changes or "last_name" in changes):
        user.full_name = profile.full_name[:200]
    touched = sorted(body.model_dump(exclude_unset=True).keys())
    if touched:
        await audit_log(
            db,
            actor=user,
            action="patient.profile_update",
            entity_type="patient_profile",
            entity_id=profile.id,
            after={"fields": touched},
            request=request,
        )
    await db.commit()
    await db.refresh(profile)
    return profile


# --- companions ------------------------------------------------------------------------------------------
async def list_companions(db: AsyncSession, profile: PatientProfile) -> list[PatientCompanion]:
    rows = await db.execute(
        select(PatientCompanion)
        .where(PatientCompanion.patient_id == profile.id)
        .order_by(PatientCompanion.created_at, PatientCompanion.id)
    )
    return list(rows.scalars().all())


async def get_companion(
    db: AsyncSession, profile: PatientProfile, companion_id: uuid.UUID
) -> PatientCompanion:
    companion = (
        await db.execute(
            select(PatientCompanion).where(
                PatientCompanion.id == companion_id, PatientCompanion.patient_id == profile.id
            )
        )
    ).scalar_one_or_none()
    if companion is None:
        raise NotFound("Companion not found")
    return companion


async def create_companion(db: AsyncSession, profile: PatientProfile, body: CompanionIn) -> PatientCompanion:
    count = (
        await db.execute(
            select(func.count())
            .select_from(PatientCompanion)
            .where(PatientCompanion.patient_id == profile.id)
        )
    ).scalar_one()
    if count >= MAX_COMPANIONS:
        raise BadRequest(f"You can add up to {MAX_COMPANIONS} companions", code="too_many_companions")
    companion = PatientCompanion(
        patient_id=profile.id,
        full_name=body.full_name,
        relationship=body.relationship,
        nationality=body.nationality,
        date_of_birth=body.date_of_birth,
        passport_number=body.passport_number,
        passport_last4=body.passport_number[-4:] if body.passport_number else None,
    )
    db.add(companion)
    await db.commit()
    await db.refresh(companion)
    return companion


async def update_companion(
    db: AsyncSession, profile: PatientProfile, companion_id: uuid.UUID, body: CompanionUpdate
) -> PatientCompanion:
    companion = await get_companion(db, profile, companion_id)
    changes = body.model_dump(exclude_unset=True)
    if "passport_number" in changes:
        number = changes.pop("passport_number")
        companion.passport_number = number
        companion.passport_last4 = number[-4:] if number else None
    for required in ("full_name", "relationship"):
        if required in changes and changes[required] is None:
            raise BadRequest(f"{required} cannot be empty", code="invalid_companion")
    for key, value in changes.items():
        setattr(companion, key, value)
    await db.commit()
    await db.refresh(companion)
    return companion


async def delete_companion(db: AsyncSession, profile: PatientProfile, companion_id: uuid.UUID) -> None:
    companion = await get_companion(db, profile, companion_id)
    await db.delete(companion)
    await db.commit()


def companion_out(companion: PatientCompanion) -> CompanionOut:
    return CompanionOut.model_validate(companion)


# --- saved items -----------------------------------------------------------------------------------------
async def _cards_for(db: AsyncSession, items: list[SavedItem]) -> list[SavedItemOut]:
    by_type: dict[str, list[uuid.UUID]] = {t.value: [] for t in SavedEntityType}
    for item in items:
        by_type[str(getattr(item.entity_type, "value", item.entity_type))].append(item.entity_id)
    hospitals = await hospital_cards(db, by_type[SavedEntityType.HOSPITAL.value])
    doctors = await doctor_cards(db, by_type[SavedEntityType.DOCTOR.value])
    procedures = await procedure_cards(db, by_type[SavedEntityType.PROCEDURE.value])
    out: list[SavedItemOut] = []
    for item in items:
        kind = str(getattr(item.entity_type, "value", item.entity_type))
        out.append(
            SavedItemOut(
                id=item.id,
                entity_type=item.entity_type,
                entity_id=item.entity_id,
                created_at=item.created_at,
                hospital=hospitals.get(item.entity_id) if kind == SavedEntityType.HOSPITAL else None,
                doctor=doctors.get(item.entity_id) if kind == SavedEntityType.DOCTOR else None,
                procedure=procedures.get(item.entity_id) if kind == SavedEntityType.PROCEDURE else None,
            )
        )
    return out


async def list_saved(
    db: AsyncSession, user: User, entity_type: SavedEntityType | None = None
) -> list[SavedItemOut]:
    stmt = select(SavedItem).where(SavedItem.user_id == user.id)
    if entity_type is not None:
        stmt = stmt.where(SavedItem.entity_type == entity_type)
    stmt = stmt.order_by(SavedItem.created_at.desc(), SavedItem.id.desc()).limit(MAX_SAVED_ITEMS)
    items = list((await db.execute(stmt)).scalars().all())
    return await _cards_for(db, items)


async def _assert_saveable(db: AsyncSession, entity_type: SavedEntityType, entity_id: uuid.UUID) -> None:
    if entity_type == SavedEntityType.HOSPITAL:
        found = entity_id in await hospital_cards(db, [entity_id])
        label = "Hospital"
    elif entity_type == SavedEntityType.DOCTOR:
        found = entity_id in await doctor_cards(db, [entity_id])
        label = "Doctor"
    else:
        found = entity_id in await procedure_cards(db, [entity_id])
        label = "Procedure"
    if not found:
        raise NotFound(f"{label} not found")


async def save_item(
    db: AsyncSession, user: User, entity_type: SavedEntityType, entity_id: uuid.UUID
) -> SavedItemOut:
    await _assert_saveable(db, entity_type, entity_id)
    count = (
        await db.execute(select(func.count()).select_from(SavedItem).where(SavedItem.user_id == user.id))
    ).scalar_one()
    if count >= MAX_SAVED_ITEMS:
        raise BadRequest("You have saved too many items", code="too_many_saved_items")
    await db.execute(
        pg_insert(SavedItem)
        .values(id=uuid7(), user_id=user.id, entity_type=entity_type, entity_id=entity_id)
        .on_conflict_do_nothing(index_elements=["user_id", "entity_type", "entity_id"])
    )
    await db.commit()
    item = (
        await db.execute(
            select(SavedItem).where(
                SavedItem.user_id == user.id,
                SavedItem.entity_type == entity_type,
                SavedItem.entity_id == entity_id,
            )
        )
    ).scalar_one()
    return (await _cards_for(db, [item]))[0]


async def unsave_item(
    db: AsyncSession, user: User, entity_type: SavedEntityType, entity_id: uuid.UUID
) -> None:
    item = (
        await db.execute(
            select(SavedItem).where(
                SavedItem.user_id == user.id,
                SavedItem.entity_type == entity_type,
                SavedItem.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()
    if item is not None:
        await db.delete(item)
        await db.commit()


async def unsave_by_id(db: AsyncSession, user: User, saved_id: uuid.UUID) -> None:
    item = (
        await db.execute(select(SavedItem).where(SavedItem.id == saved_id, SavedItem.user_id == user.id))
    ).scalar_one_or_none()
    if item is None:
        raise NotFound("Saved item not found")
    await db.delete(item)
    await db.commit()


# --- dashboard -------------------------------------------------------------------------------------------
async def booking_out(db: AsyncSession, booking: Booking, profile: PatientProfile) -> BookingOut:
    hospital = await db.get(Hospital, booking.hospital_id)
    doctor = await db.get(Doctor, booking.doctor_id) if booking.doctor_id else None
    procedure = await db.get(Procedure, booking.procedure_id) if booking.procedure_id else None
    package = await db.get(TreatmentPackage, booking.package_id) if booking.package_id else None
    return BookingOut(
        id=booking.id,
        booking_number=booking.booking_number,
        case_id=booking.case_id,
        status=booking.status,
        patient=IdFullName(id=profile.id, full_name=profile.full_name),
        hospital=BookingHospitalRef(
            id=booking.hospital_id,
            name=hospital.name if hospital else "",
            city=hospital.city if hospital else None,
        ),
        doctor=IdFullName(id=doctor.id, full_name=doctor.full_name) if doctor else None,
        procedure=IdName(id=procedure.id, name=procedure.name) if procedure else None,
        package=(
            PackageOut(
                id=package.id,
                name=package.name,
                tier=package.tier,
                price_minor=package.price_minor,
                original_price_minor=package.original_price_minor,
                currency=package.currency,
                description=package.description,
                includes=dict(package.includes or {}),
            )
            if package
            else None
        ),
        quote_id=booking.quote_id,
        admission_date=booking.admission_date,
        discharge_date=booking.discharge_date,
        duration_days=booking.duration_days,
        payment_option=booking.payment_option,
        installment_months=booking.installment_months,
        insurance_claim_requested=booking.insurance_claim_requested,
        currency=booking.currency,
        subtotal_minor=booking.subtotal_minor,
        discount_minor=booking.discount_minor,
        service_fee_minor=booking.service_fee_minor,
        tax_minor=booking.tax_minor,
        total_minor=booking.total_minor,
        deposit_minor=booking.deposit_minor,
        amount_paid_minor=booking.amount_paid_minor,
        amount_refunded_minor=booking.amount_refunded_minor,
        balance_due_minor=booking.balance_due_minor,
        created_at=booking.created_at,
        confirmed_at=booking.confirmed_at,
        admitted_at=booking.admitted_at,
        completed_at=booking.completed_at,
        cancelled_at=booking.cancelled_at,
    )


async def _coordinator(db: AsyncSession, user_id: uuid.UUID | None) -> CoordinatorRef | None:
    if user_id is None:
        return None
    coordinator = await db.get(User, user_id)
    if coordinator is None:
        return None
    return CoordinatorRef(id=coordinator.id, full_name=coordinator.full_name, phone=coordinator.phone)


async def dashboard(db: AsyncSession, user: User) -> PatientDashboardOut:
    profile = await get_or_create_profile(db, user)
    today = ist_today()

    next_booking = (
        await db.execute(
            select(Booking)
            .where(
                Booking.patient_id == profile.id,
                Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.ADMITTED]),
                Booking.admission_date.is_not(None),
                Booking.admission_date >= today,
            )
            .order_by(Booking.admission_date, Booking.created_at, Booking.id)
            .limit(1)
        )
    ).scalar_one_or_none()

    active_cases = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Case)
                .where(Case.patient_id == profile.id, Case.status.not_in(INACTIVE_CASE_STATUSES))
            )
        ).scalar_one()
    )

    checklist: list[ChecklistItemOut] = []
    coordinator_id: uuid.UUID | None = None
    booking_payload: BookingOut | None = None
    days_until: int | None = None
    if next_booking is not None:
        booking_payload = await booking_out(db, next_booking, profile)
        if next_booking.admission_date is not None:
            days_until = max((next_booking.admission_date - today).days, 0)
        items = await db.execute(
            select(ChecklistItem)
            .where(ChecklistItem.case_id == next_booking.case_id)
            .order_by(ChecklistItem.sort_order, ChecklistItem.created_at, ChecklistItem.id)
        )
        checklist = [ChecklistItemOut.model_validate(i) for i in items.scalars().all()]
        coordinator_id = (
            await db.execute(select(Case.coordinator_user_id).where(Case.id == next_booking.case_id))
        ).scalar_one_or_none()
    if coordinator_id is None:
        coordinator_id = (
            await db.execute(
                select(Case.coordinator_user_id)
                .where(
                    Case.patient_id == profile.id,
                    Case.coordinator_user_id.is_not(None),
                    Case.status.not_in(INACTIVE_CASE_STATUSES),
                )
                .order_by(Case.updated_at.desc(), Case.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    day_start = datetime.combine(today, time.min, tzinfo=IST).astimezone(UTC)
    day_end = day_start + timedelta(days=1)
    schedule_rows = await db.execute(
        select(ItineraryItem)
        .join(Case, Case.id == ItineraryItem.case_id)
        .where(
            Case.patient_id == profile.id,
            ItineraryItem.starts_at >= day_start,
            ItineraryItem.starts_at < day_end,
            ItineraryItem.status != ItineraryStatus.CANCELLED,
        )
        .order_by(ItineraryItem.starts_at, ItineraryItem.id)
        .limit(50)
    )
    today_schedule = [ItineraryItemOut.model_validate(i) for i in schedule_rows.scalars().all()]

    unread = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Notification)
                .where(Notification.user_id == user.id, Notification.read_at.is_(None))
            )
        ).scalar_one()
    )

    screening_rows = await db.execute(
        select(Screening, Specialty)
        .outerjoin(Specialty, Specialty.id == Screening.specialty_id)
        .where(Screening.patient_id == profile.id)
        .order_by(Screening.created_at.desc(), Screening.id.desc())
        .limit(5)
    )
    recent: list[ScreeningLite] = []
    for screening, specialty in screening_rows.all():
        summary = None
        if isinstance(screening.ai_result, dict):
            raw_summary = screening.ai_result.get("summary")
            summary = str(raw_summary)[:500] if raw_summary else None
        recent.append(
            ScreeningLite(
                id=screening.id,
                status=screening.status,
                specialty=(
                    IdSlugName(id=specialty.id, slug=specialty.slug, name=specialty.name)
                    if specialty
                    else None
                ),
                urgency=screening.urgency,
                summary=summary,
                created_at=screening.created_at,
                submitted_at=screening.submitted_at,
                completed_at=screening.completed_at,
            )
        )

    return PatientDashboardOut(
        next_booking=booking_payload,
        days_until_treatment=days_until,
        checklist=checklist,
        today_schedule=today_schedule,
        active_cases=active_cases,
        unread_notifications=unread,
        coordinator=await _coordinator(db, coordinator_id),
        recent_screenings=recent,
    )
