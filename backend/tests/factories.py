"""Async test-data factories.

Every helper builds a *valid* row with sensible random defaults, commits, refreshes and returns the ORM
object. Any column can be overridden with keyword arguments (``await create_hospital(db, city="Mumbai")``).
Unique columns (emails, slugs, codes, numbers) get random suffixes so factories never collide.
"""

from __future__ import annotations

import secrets
import string
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    AgentStatus,
    AgentTier,
    BookingStatus,
    CaseStatus,
    Gender,
    HospitalMemberRole,
    HospitalStatus,
    KycStatus,
    OrderStatus,
    PackageTier,
    PaymentGateway,
    PaymentOption,
    PaymentPurpose,
    QuoteStatus,
    UserRole,
    UserStatus,
)
from app.models import (
    Agent,
    Base,
    Booking,
    Case,
    Doctor,
    FxRate,
    Hospital,
    HospitalMember,
    HospitalProcedure,
    PatientProfile,
    PaymentOrder,
    Procedure,
    Quote,
    Specialty,
    TreatmentPackage,
    User,
)
from app.models.sequences import next_number

__all__ = [
    "DEFAULT_PASSWORD",
    "create_agent",
    "create_booking",
    "create_case",
    "create_doctor",
    "create_fx_rates",
    "create_hospital",
    "create_hospital_procedure",
    "create_package",
    "create_patient",
    "create_payment_order",
    "create_procedure",
    "create_quote",
    "create_specialty",
    "create_user",
    "rand_suffix",
]

DEFAULT_PASSWORD = "Passw0rd!2026"

_FIRST_NAMES = ("Amara", "Omar", "Fatima", "John", "Grace", "Chinedu", "Aisha", "David", "Leila", "Samuel")
_LAST_NAMES = ("Okafor", "Haddad", "Smith", "Mensah", "Rahman", "Kariuki", "Al-Sayed", "Brown", "Nwosu")
_CITIES = ("New Delhi", "Mumbai", "Chennai", "Bengaluru", "Hyderabad", "Gurugram", "Kolkata")


def rand_suffix(n: int = 8) -> str:
    """Random lowercase hex suffix for unique columns."""
    return secrets.token_hex((n + 1) // 2)[:n]


def _pick[T](items: tuple[T, ...]) -> T:
    return items[secrets.randbelow(len(items))]


def _agent_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "AGT" + "".join(secrets.choice(alphabet) for _ in range(5))


async def _save[M: Base](db: AsyncSession, obj: M) -> M:
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


# --------------------------------------------------------------------------------------------- identity
async def create_user(
    db: AsyncSession,
    *,
    role: UserRole | str = "patient",
    email: str | None = None,
    password: str | None = DEFAULT_PASSWORD,
    full_name: str | None = None,
    **fields: Any,
) -> User:
    """User with an Argon2 password hash (``password=None`` -> no password, e.g. Google-only users)."""
    from app.core.security import hash_password  # lazy: keeps factories importable without settings quirks

    role = UserRole(role)
    suffix = rand_suffix()
    values: dict[str, Any] = {
        "email": email if email is not None else f"{role.value}-{suffix}@example.test",
        "full_name": full_name or f"{_pick(_FIRST_NAMES)} {_pick(_LAST_NAMES)}",
        "role": role,
        "status": UserStatus.ACTIVE,
        "password_hash": hash_password(password) if password else None,
        "country_code": "IN" if role in (UserRole.HOSPITAL,) else "US",
        "preferred_language": "en",
        "is_guest": False,
        "email_verified_at": datetime.now(UTC),
    }
    values.update(fields)
    return await _save(db, User(**values))


async def create_patient(db: AsyncSession, user: User | None = None, **fields: Any) -> PatientProfile:
    """Patient profile (creates a ``role=patient`` user when ``user`` is omitted)."""
    if user is None:
        user = await create_user(db, role=UserRole.PATIENT)
    first, _, last = (user.full_name or "Test Patient").partition(" ")
    values: dict[str, Any] = {
        "user_id": user.id,
        "first_name": first or "Test",
        "last_name": last or "Patient",
        "date_of_birth": date(1980, 5, 17),
        "gender": Gender.FEMALE,
        "nationality": "US",
        "country_of_residence": "US",
        "phone": "+1-202-555-0" + str(100 + secrets.randbelow(899)),
        "preferred_language": "en",
        "preferred_currency": "USD",
    }
    values.update(fields)
    return await _save(db, PatientProfile(**values))


async def create_agent(
    db: AsyncSession, user: User | None = None, status: AgentStatus | str = "active", **fields: Any
) -> Agent:
    """Agent (creates a ``role=agent`` user when ``user`` is omitted). Active agents are KYC-approved."""
    if user is None:
        user = await create_user(db, role=UserRole.AGENT)
    status = AgentStatus(status)
    values: dict[str, Any] = {
        "user_id": user.id,
        "agency_name": f"Care Travel {rand_suffix(4).upper()}",
        "agent_code": _agent_code(),
        "country": "NG",
        "city": "Lagos",
        "phone": "+234-800-000-0000",
        "status": status,
        "kyc_status": KycStatus.APPROVED if status == AgentStatus.ACTIVE else KycStatus.PENDING,
        "tier": AgentTier.BRONZE,
    }
    if status == AgentStatus.ACTIVE:
        values["approved_at"] = datetime.now(UTC)
    values.update(fields)
    return await _save(db, Agent(**values))


# --------------------------------------------------------------------------------------------- catalog
async def create_specialty(db: AsyncSession, **fields: Any) -> Specialty:
    suffix = rand_suffix()
    values: dict[str, Any] = {
        "slug": f"specialty-{suffix}",
        "name": f"Orthopedics {suffix}",
        "description": "Bones, joints and spine.",
        "icon": "bone",
        "savings_min_pct": 60,
        "savings_max_pct": 80,
        "sort_order": 0,
        "is_active": True,
    }
    values.update(fields)
    return await _save(db, Specialty(**values))


async def create_procedure(db: AsyncSession, specialty: Specialty | None = None, **fields: Any) -> Procedure:
    if specialty is None and "specialty_id" not in fields:
        specialty = await create_specialty(db)
    suffix = rand_suffix()
    values: dict[str, Any] = {
        "slug": f"procedure-{suffix}",
        "name": f"Total Knee Replacement {suffix}",
        "description": "Replacement of the knee joint with a prosthetic implant.",
        "keywords": ["knee", "arthroplasty", "joint replacement"],
        "body_areas": ["knee"],
        "hospital_stay_days": 5,
        "recovery_days": 21,
        "total_stay_days": 21,
        "india_price_min_minor": 3_50_000_00,
        "india_price_max_minor": 5_00_000_00,
        "currency": "INR",
        "is_active": True,
    }
    if specialty is not None:
        values["specialty_id"] = specialty.id
    values.update(fields)
    return await _save(db, Procedure(**values))


async def create_fx_rates(db: AsyncSession) -> list[FxRate]:
    """Upsert ``fx_rates`` (INR per unit) for every currency in ``app.core.money.DEFAULT_FX_RATES``."""
    try:
        from app.core.money import DEFAULT_FX_RATES

        rates: dict[str, Decimal] = dict(DEFAULT_FX_RATES)
    except ImportError:  # pragma: no cover - fallback if money module changes
        rates = {"USD": Decimal("88"), "EUR": Decimal("95"), "GBP": Decimal("110"), "AED": Decimal("24")}
    rows = [
        {"base_currency": "INR", "quote_currency": ccy, "rate": Decimal(rate), "source": "test"}
        for ccy, rate in rates.items()
        if ccy != "INR"
    ]
    stmt = pg_insert(FxRate).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[FxRate.base_currency, FxRate.quote_currency],
        set_={"rate": stmt.excluded.rate, "source": stmt.excluded.source, "as_of": datetime.now(UTC)},
    )
    await db.execute(stmt)
    await db.commit()
    result = await db.execute(
        select(FxRate).where(FxRate.base_currency == "INR").order_by(FxRate.quote_currency)
    )
    return list(result.scalars().all())


# --------------------------------------------------------------------------------------------- hospitals
async def create_hospital(
    db: AsyncSession, owner: User | None = None, status: HospitalStatus | str = "active", **fields: Any
) -> Hospital:
    """Hospital; when ``owner`` (a User) is given, also adds them as ``member_role=owner``."""
    status = HospitalStatus(status)
    suffix = rand_suffix()
    values: dict[str, Any] = {
        "slug": f"hospital-{suffix}",
        "name": f"Apex Multispeciality Hospital {suffix}",
        "legal_name": f"Apex Healthcare Pvt Ltd {suffix}",
        "description": "Tertiary-care hospital with an international patient desk.",
        "city": _pick(_CITIES),
        "state": "Delhi",
        "country": "IN",
        "address": "1 Hospital Road",
        "pincode": "110001",
        "lat": 28.6139,
        "lng": 77.2090,
        "phone": "+91-11-4000-0000",
        "email": f"intl-{suffix}@hospital.example.test",
        "accreditations": ["jci", "nabh"],
        "established_year": 1998,
        "bed_count": 450,
        "languages": ["en", "hi", "ar"],
        "international_desk": True,
        "airport_distance_km": Decimal("18.5"),
        "rating_avg": Decimal("4.6"),
        "rating_count": 120,
        "status": status,
        "kyc_status": KycStatus.APPROVED if status == HospitalStatus.ACTIVE else KycStatus.NOT_SUBMITTED,
        "gstin": "07AABCA1234A1Z5",
    }
    if status == HospitalStatus.ACTIVE:
        values["approved_at"] = datetime.now(UTC)
    values.update(fields)
    hospital = Hospital(**values)
    db.add(hospital)
    if owner is not None:
        db.add(
            HospitalMember(hospital_id=hospital.id, user_id=owner.id, member_role=HospitalMemberRole.OWNER)
        )
    await db.commit()
    await db.refresh(hospital)
    return hospital


async def create_doctor(db: AsyncSession, hospital: Hospital, specialty: Specialty, **fields: Any) -> Doctor:
    suffix = rand_suffix()
    values: dict[str, Any] = {
        "hospital_id": hospital.id,
        "specialty_id": specialty.id,
        "full_name": f"Dr. {_pick(('Anil', 'Priya', 'Rajesh', 'Meera', 'Vikram'))} Sharma {suffix}",
        "slug": f"doctor-{suffix}",
        "gender": Gender.MALE,
        "sub_specialties": ["joint replacement"],
        "qualifications": ["MBBS", "MS (Ortho)"],
        "experience_years": 18,
        "languages": ["en", "hi"],
        "bio": "Senior consultant.",
        "success_rate_pct": Decimal("97.50"),
        "rating_avg": Decimal("4.8"),
        "rating_count": 85,
        "consultation_fee_minor": 2_000_00,
        "currency": "INR",
        "teleconsult_available": True,
        "is_active": True,
    }
    values.update(fields)
    return await _save(db, Doctor(**values))


async def create_hospital_procedure(
    db: AsyncSession, hospital: Hospital, procedure: Procedure, **fields: Any
) -> HospitalProcedure:
    values: dict[str, Any] = {
        "hospital_id": hospital.id,
        "procedure_id": procedure.id,
        "doctor_ids": [],
        "price_min_minor": 3_80_000_00,
        "price_max_minor": 4_80_000_00,
        "currency": "INR",
        "hospital_stay_days": 5,
        "success_rate_pct": Decimal("96.00"),
        "inclusions": ["surgery", "implant", "5 nights ward"],
        "exclusions": ["flights"],
        "is_active": True,
    }
    values.update(fields)
    return await _save(db, HospitalProcedure(**values))


_TIER_PRICES = {
    PackageTier.MEDICAL_ONLY: 4_00_000_00,
    PackageTier.MEDICAL_STAY: 4_60_000_00,
    PackageTier.ALL_INCLUSIVE: 5_20_000_00,
}


async def create_package(
    db: AsyncSession,
    hospital_procedure: HospitalProcedure,
    tier: PackageTier | str = "medical_only",
    **fields: Any,
) -> TreatmentPackage:
    tier = PackageTier(tier)
    price = _TIER_PRICES[tier]
    values: dict[str, Any] = {
        "hospital_procedure_id": hospital_procedure.id,
        "name": tier.value.replace("_", " ").title(),
        "tier": tier,
        "price_minor": price,
        "original_price_minor": price + 40_000_00,
        "currency": "INR",
        "description": f"{tier.value} package",
        "includes": {
            "accommodation_nights": 0 if tier == PackageTier.MEDICAL_ONLY else 14,
            "airport_pickup": tier != PackageTier.MEDICAL_ONLY,
            "translator": tier == PackageTier.ALL_INCLUSIVE,
            "meals": tier == PackageTier.ALL_INCLUSIVE,
            "local_transport": tier == PackageTier.ALL_INCLUSIVE,
            "followup_teleconsults": 2,
        },
        "is_active": True,
    }
    values.update(fields)
    return await _save(db, TreatmentPackage(**values))


# --------------------------------------------------------------------------------------------- cases & money
async def create_case(db: AsyncSession, patient: PatientProfile, hospital: Hospital, **fields: Any) -> Case:
    values: dict[str, Any] = {
        "case_number": await next_number(db, "case"),
        "patient_id": patient.id,
        "hospital_id": hospital.id,
        "status": CaseStatus.ENQUIRY,
        "patient_notes": "Knee pain for two years; looking for replacement.",
        "created_by_user_id": patient.user_id,
    }
    values.update(fields)
    return await _save(db, Case(**values))


async def create_quote(db: AsyncSession, case: Case, **fields: Any) -> Quote:
    line_items = fields.pop(
        "line_items",
        [
            {"category": "surgery", "description": "Total knee replacement", "amount_minor": 2_50_000_00},
            {"category": "hospital_stay", "description": "5 nights", "amount_minor": 75_000_00},
            {"category": "implants", "description": "Implant", "amount_minor": 75_000_00},
        ],
    )
    values: dict[str, Any] = {
        "case_id": case.id,
        "hospital_id": case.hospital_id,
        "status": QuoteStatus.SENT,
        "treatment_plan": "Pre-op tests, surgery, physiotherapy.",
        "line_items": line_items,
        "total_minor": sum(int(li.get("amount_minor", 0)) for li in line_items),
        "currency": "INR",
        "estimated_stay_days": 14,
        "valid_until": date.today() + timedelta(days=30),
    }
    values.update(fields)
    return await _save(db, Quote(**values))


async def create_booking(db: AsyncSession, case: Case, **fields: Any) -> Booking:
    """``pending_payment`` booking for the case; ``total_minor`` defaults to 4,00,000 INR, deposit 20%."""
    total = int(fields.pop("total_minor", 4_00_000_00))
    admission = fields.pop("admission_date", date.today() + timedelta(days=30))
    values: dict[str, Any] = {
        "booking_number": await next_number(db, "booking"),
        "case_id": case.id,
        "patient_id": case.patient_id,
        "hospital_id": case.hospital_id,
        "doctor_id": case.doctor_id,
        "procedure_id": case.procedure_id,
        "status": BookingStatus.PENDING_PAYMENT,
        "admission_date": admission,
        "discharge_date": admission + timedelta(days=5),
        "duration_days": 14,
        "payment_option": PaymentOption.DEPOSIT,
        "currency": "INR",
        "subtotal_minor": total,
        "total_minor": total,
        "deposit_minor": total * 20 // 100,
    }
    values.update(fields)
    return await _save(db, Booking(**values))


async def create_payment_order(db: AsyncSession, booking: Booking, **fields: Any) -> PaymentOrder:
    """``created`` mock-gateway order for the booking deposit, priced in the booking currency (FX 1)."""
    payer_user_id = fields.pop("payer_user_id", None)
    if payer_user_id is None:
        payer_user_id = (
            await db.execute(select(PatientProfile.user_id).where(PatientProfile.id == booking.patient_id))
        ).scalar_one()
    amount = int(fields.pop("amount_minor", booking.deposit_minor or booking.total_minor))
    values: dict[str, Any] = {
        "order_number": await next_number(db, "order"),
        "purpose": PaymentPurpose.BOOKING_DEPOSIT,
        "status": OrderStatus.CREATED,
        "gateway": PaymentGateway.MOCK,
        "payer_user_id": payer_user_id,
        "patient_id": booking.patient_id,
        "case_id": booking.case_id,
        "booking_id": booking.id,
        "amount_minor": amount,
        "currency": booking.currency,
        "base_amount_minor": amount,
        "base_currency": "INR",
        "fx_rate": Decimal("1"),
        "expires_at": datetime.now(UTC) + timedelta(hours=1),
    }
    values.update(fields)
    return await _save(db, PaymentOrder(**values))
