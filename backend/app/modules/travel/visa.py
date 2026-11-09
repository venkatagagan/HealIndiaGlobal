"""Visa help for every nationality (phase 1): per-country rules, checklists, the visa guide, admin CRUD and
the hospital invitation letter (generate a draft PDF -> hospital approves -> attached to the visa request).

Rules come from ``visa_country_rules`` / ``visa_checklist_items`` (seeded from ``visa_data``). Until an
admin loads them (``POST /admin/visa/load-defaults`` or ``scripts/seed.py``) the built-in defaults answer.
A nationality without a rule gets the regular (embassy) Medical visa route.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

import structlog
from fastapi import Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Text, delete, or_, select, type_coerce
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.audit import audit_log
from app.core.enums import (
    BookingStatus,
    ChecklistKey,
    DocumentKind,
    DocumentStatus,
    HospitalMemberRole,
    VisaRoute,
    VisaStatus,
    VisaType,
)
from app.core.errors import BadRequest, Conflict, NotFound
from app.core.events import publish
from app.core.storage import get_storage, make_key
from app.models import (
    Booking,
    Case,
    Doctor,
    Document,
    PatientCompanion,
    PatientProfile,
    Procedure,
    Quote,
    Specialty,
    User,
    VisaChecklistItem,
    VisaCountryRule,
    VisaRequest,
)
from app.modules.cases.checklist import sync_checklist_key
from app.modules.cases.common import queue_case_push, today_ist, utcnow
from app.modules.hospitals.policies import PortalContext
from app.modules.travel import visa_data
from app.modules.travel.countries import country_name
from app.modules.travel.invitation_letter import LetterAttendant, LetterContext, render_invitation_letter

logger = structlog.get_logger(__name__)

ROUTE_VISA_TYPE: dict[VisaRoute, VisaType] = {
    VisaRoute.E_VISA: VisaType.E_MEDICAL,
    VisaRoute.REGULAR_VISA: VisaType.MEDICAL,
    VisaRoute.NOT_REQUIRED: VisaType.NOT_REQUIRED,
}
ROUTE_ATTENDANT_TYPE: dict[VisaRoute, VisaType | None] = {
    VisaRoute.E_VISA: VisaType.E_MEDICAL_ATTENDANT,
    VisaRoute.REGULAR_VISA: VisaType.MEDICAL,
    VisaRoute.NOT_REQUIRED: None,
}
ROUTE_ALLOWED_TYPES: dict[VisaRoute, frozenset[VisaType]] = {
    VisaRoute.E_VISA: frozenset({VisaType.E_MEDICAL, VisaType.E_MEDICAL_ATTENDANT}),
    VisaRoute.REGULAR_VISA: frozenset({VisaType.MEDICAL}),
    VisaRoute.NOT_REQUIRED: frozenset({VisaType.NOT_REQUIRED}),
}
VISA_LABELS: dict[VisaType, str] = {
    VisaType.E_MEDICAL: "e-Medical visa",
    VisaType.E_MEDICAL_ATTENDANT: "e-Medical Attendant visa",
    VisaType.MEDICAL: "Medical visa",
    VisaType.NOT_REQUIRED: "travel for treatment - no visa required",
}
LETTER_ROLES: frozenset[HospitalMemberRole] = frozenset(
    {
        HospitalMemberRole.OWNER,
        HospitalMemberRole.ADMIN,
        HospitalMemberRole.COORDINATOR,
        HospitalMemberRole.DOCTOR,
    }
)


# -------------------------------------------------------------------------------------------------- schemas
class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _iso2(value: str) -> str:
    value = value.strip().upper()
    if len(value) != 2 or not value.isalpha():
        raise ValueError("nationality must be an ISO 3166-1 alpha-2 code, e.g. NG")
    return value


class VisaChecklistItemOut(_Out):
    id: uuid.UUID | None = None
    visa_route: VisaRoute
    nationality: str | None = None
    item_key: str
    title: str
    description: str | None = None
    required: bool
    sort_order: int


class VisaGuideOut(BaseModel):
    """``GET /travel/visa-guide?nationality=XX``."""

    nationality: str
    country_name: str | None = None
    visa_route: VisaRoute
    visa_type: VisaType
    """The patient's visa (``e_medical`` | ``medical`` | ``not_required``)."""
    attendant_visa_type: VisaType | None = None
    max_attendants: int
    typical_processing_days: int | None = None
    notes: str | None = None
    official_url: str | None = None
    checklist: list[VisaChecklistItemOut] = Field(default_factory=list)
    is_default: bool = False
    """True when no rule exists for this nationality (the regular-visa fallback is shown)."""
    updated_at: datetime | None = None


class VisaCountryRuleIn(_In):
    nationality: str = Field(min_length=2, max_length=2)
    country_name: str | None = Field(default=None, max_length=100)
    visa_route: VisaRoute
    max_attendants: int = Field(default=2, ge=0, le=10)
    typical_processing_days: int | None = Field(default=None, ge=0, le=365)
    notes: str | None = Field(default=None, max_length=5000)
    official_url: str | None = Field(default=None, max_length=1024)
    source: str | None = Field(default=None, max_length=5000)

    @field_validator("nationality")
    @classmethod
    def _nat(cls, v: str) -> str:
        return _iso2(v)

    @field_validator("official_url")
    @classmethod
    def _https(cls, v: str | None) -> str | None:
        if v and not v.startswith("https://"):
            raise ValueError("official_url must start with https://")
        return v or None


class VisaCountryRuleUpdate(_In):
    country_name: str | None = Field(default=None, max_length=100)
    visa_route: VisaRoute | None = None
    max_attendants: int | None = Field(default=None, ge=0, le=10)
    typical_processing_days: int | None = Field(default=None, ge=0, le=365)
    notes: str | None = Field(default=None, max_length=5000)
    official_url: str | None = Field(default=None, max_length=1024)
    source: str | None = Field(default=None, max_length=5000)

    @field_validator("official_url")
    @classmethod
    def _https(cls, v: str | None) -> str | None:
        if v and not v.startswith("https://"):
            raise ValueError("official_url must start with https://")
        return v or None


class VisaCountryRuleOut(_Out):
    id: uuid.UUID
    nationality: str
    country_name: str | None = None
    visa_route: VisaRoute
    max_attendants: int
    typical_processing_days: int | None = None
    notes: str | None = None
    official_url: str | None = None
    source: str | None = None
    created_at: datetime
    updated_at: datetime


class VisaChecklistItemIn(_In):
    visa_route: VisaRoute
    nationality: str | None = Field(default=None, min_length=2, max_length=2)
    item_key: str = Field(min_length=1, max_length=60, pattern=r"^[a-z0-9_]+$")
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    required: bool = True
    sort_order: int = Field(default=0, ge=0, le=10_000)

    @field_validator("nationality")
    @classmethod
    def _nat(cls, v: str | None) -> str | None:
        return _iso2(v) if v else None


class VisaChecklistItemUpdate(_In):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    required: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=10_000)


class VisaAdminChecklistItemOut(VisaChecklistItemOut):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class LoadDefaultsOut(BaseModel):
    rules_added: int
    checklist_items_added: int


class InvitationAttendantIn(_In):
    full_name: str = Field(min_length=1, max_length=200)
    relationship: str | None = Field(default=None, max_length=60)
    passport_number: str | None = Field(default=None, max_length=30)


class InvitationLetterGenerate(_In):
    """All optional: defaults come from the booking/quote, the case's doctor and the patient's companions."""

    estimated_arrival_date: date | None = None
    estimated_duration_days: int | None = Field(default=None, ge=1, le=365)
    treating_doctor_id: uuid.UUID | None = None
    attendants: list[InvitationAttendantIn] | None = Field(default=None, max_length=10)
    contact_name: str | None = Field(default=None, max_length=200)
    contact_phone: str | None = Field(default=None, max_length=40)
    contact_email: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)


class InvitationLetterOut(BaseModel):
    visa_request_id: uuid.UUID
    visa_status: VisaStatus
    draft_document_id: uuid.UUID | None = None
    """The generated letter awaiting approval (download via ``GET /documents/{id}/download``)."""
    document_id: uuid.UUID | None = None
    """The approved letter attached to the visa request (the patient can download it)."""
    generated_at: datetime | None = None
    approved_at: datetime | None = None
    missing: list[str] = Field(default_factory=list)
    """Details the letter could not fill in (e.g. ``passport_number``); add them and generate again."""


# ---------------------------------------------------------------------------------------------------- rules
@dataclass(slots=True)
class ResolvedRule:
    nationality: str
    country_name: str | None
    visa_route: VisaRoute
    max_attendants: int
    typical_processing_days: int | None
    notes: str | None
    official_url: str | None
    updated_at: datetime | None
    is_default: bool


def _builtin_rule(nationality: str) -> dict[str, Any] | None:
    for row in visa_data.default_rules():
        if row["nationality"] == nationality:
            return row
    return None


async def _rules_loaded(db: AsyncSession) -> bool:
    return (await db.execute(select(VisaCountryRule.id).limit(1))).first() is not None


async def resolve_rule(db: AsyncSession, nationality: str) -> ResolvedRule:
    code = nationality.strip().upper()
    row = (
        await db.execute(select(VisaCountryRule).where(VisaCountryRule.nationality == code))
    ).scalar_one_or_none()
    if row is not None:
        return ResolvedRule(
            nationality=code,
            country_name=row.country_name or country_name(code),
            visa_route=VisaRoute(row.visa_route),
            max_attendants=row.max_attendants,
            typical_processing_days=row.typical_processing_days,
            notes=row.notes,
            official_url=row.official_url,
            updated_at=row.updated_at,
            is_default=False,
        )
    builtin = None if await _rules_loaded(db) else _builtin_rule(code)
    data = builtin or visa_data.FALLBACK_RULE
    return ResolvedRule(
        nationality=code,
        country_name=country_name(code),
        visa_route=VisaRoute(data["visa_route"]),
        max_attendants=int(data["max_attendants"]),
        typical_processing_days=data.get("typical_processing_days"),
        notes=data.get("notes"),
        official_url=data.get("official_url"),
        updated_at=None,
        is_default=builtin is None,
    )


async def checklist_for(
    db: AsyncSession, route: VisaRoute, nationality: str | None
) -> list[VisaChecklistItemOut]:
    rows = list(
        (
            await db.execute(
                select(VisaChecklistItem)
                .where(
                    VisaChecklistItem.visa_route == route,
                    or_(
                        VisaChecklistItem.nationality.is_(None), VisaChecklistItem.nationality == nationality
                    ),
                )
                .order_by(VisaChecklistItem.sort_order, VisaChecklistItem.item_key)
            )
        ).scalars()
    )
    if rows:
        return [VisaChecklistItemOut.model_validate(r) for r in rows]
    if (await db.execute(select(VisaChecklistItem.id).limit(1))).first() is not None:
        return []
    items = [
        VisaChecklistItemOut(**i)
        for i in visa_data.default_checklist()
        if i["visa_route"] == route.value and i["nationality"] in (None, nationality)
    ]
    return sorted(items, key=lambda i: (i.sort_order, i.item_key))


async def visa_guide(db: AsyncSession, nationality: str) -> VisaGuideOut:
    code = _iso2(nationality)
    rule = await resolve_rule(db, code)
    return VisaGuideOut(
        nationality=code,
        country_name=rule.country_name,
        visa_route=rule.visa_route,
        visa_type=ROUTE_VISA_TYPE[rule.visa_route],
        attendant_visa_type=ROUTE_ATTENDANT_TYPE[rule.visa_route],
        max_attendants=rule.max_attendants,
        typical_processing_days=rule.typical_processing_days,
        notes=rule.notes,
        official_url=rule.official_url,
        checklist=await checklist_for(db, rule.visa_route, code),
        is_default=rule.is_default,
        updated_at=rule.updated_at,
    )


async def visa_type_for_patient(
    db: AsyncSession, patient: PatientProfile | None, requested: VisaType | None
) -> VisaType:
    """The visa type of a new visa request: from the nationality's rule when the patient's nationality is
    known (a requested type must fit the route), else the requested type or ``e_medical``."""
    if patient is None or not patient.nationality:
        return requested or VisaType.E_MEDICAL
    rule = await resolve_rule(db, patient.nationality)
    if requested is None:
        return ROUTE_VISA_TYPE[rule.visa_route]
    if requested not in ROUTE_ALLOWED_TYPES[rule.visa_route]:
        raise BadRequest(
            f"A {requested.value} visa is not available for nationality {rule.nationality}",
            code="visa_type_not_available",
            details={
                "visa_route": rule.visa_route.value,
                "allowed": sorted(t.value for t in ROUTE_ALLOWED_TYPES[rule.visa_route]),
            },
        )
    return requested


# ----------------------------------------------------------------------------------------------- admin CRUD
async def list_rules(db: AsyncSession, route: VisaRoute | None, q: str | None) -> list[VisaCountryRule]:
    stmt = select(VisaCountryRule)
    if route is not None:
        stmt = stmt.where(VisaCountryRule.visa_route == route)
    if q:
        term = q.strip()
        stmt = stmt.where(
            or_(VisaCountryRule.nationality == term.upper(), VisaCountryRule.country_name.ilike(f"%{term}%"))
        )
    return list((await db.execute(stmt.order_by(VisaCountryRule.nationality))).scalars())


async def _rule_by_code(db: AsyncSession, nationality: str) -> VisaCountryRule:
    row = (
        await db.execute(
            select(VisaCountryRule).where(VisaCountryRule.nationality == nationality.strip().upper())
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFound("Visa rule not found")
    return row


async def create_rule(
    db: AsyncSession, user: User, body: VisaCountryRuleIn, request: Request
) -> VisaCountryRule:
    existing = (
        await db.execute(select(VisaCountryRule.id).where(VisaCountryRule.nationality == body.nationality))
    ).first()
    if existing is not None:
        raise Conflict("A rule for this nationality already exists", code="visa_rule_exists")
    data = body.model_dump()
    data["country_name"] = data["country_name"] or country_name(body.nationality)
    row = VisaCountryRule(**data)
    db.add(row)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="visa_rule.create",
        entity_type="visa_country_rule",
        entity_id=row.id,
        after=body.model_dump(mode="json"),
        request=request,
    )
    await db.commit()
    await db.refresh(row)
    return row


async def update_rule(
    db: AsyncSession, user: User, nationality: str, body: VisaCountryRuleUpdate, request: Request
) -> VisaCountryRule:
    row = await _rule_by_code(db, nationality)
    changes = body.model_dump(exclude_unset=True)
    for field in ("visa_route", "max_attendants"):
        if field in changes and changes[field] is None:
            raise BadRequest(f"{field} cannot be empty", code="invalid_value")
    before = {k: getattr(row, k) for k in changes}
    for key, value in changes.items():
        setattr(row, key, value)
    await audit_log(
        db,
        actor=user,
        action="visa_rule.update",
        entity_type="visa_country_rule",
        entity_id=row.id,
        before={k: str(v) if v is not None else None for k, v in before.items()},
        after={k: str(v) if v is not None else None for k, v in changes.items()},
        request=request,
    )
    await db.commit()
    await db.refresh(row)
    return row


async def delete_rule(db: AsyncSession, user: User, nationality: str, request: Request) -> None:
    row = await _rule_by_code(db, nationality)
    await audit_log(
        db,
        actor=user,
        action="visa_rule.delete",
        entity_type="visa_country_rule",
        entity_id=row.id,
        before={"nationality": row.nationality, "visa_route": VisaRoute(row.visa_route).value},
        request=request,
    )
    await db.delete(row)
    await db.commit()


async def list_checklist_items(
    db: AsyncSession, route: VisaRoute | None, nationality: str | None
) -> list[VisaChecklistItem]:
    stmt = select(VisaChecklistItem)
    if route is not None:
        stmt = stmt.where(VisaChecklistItem.visa_route == route)
    if nationality:
        stmt = stmt.where(VisaChecklistItem.nationality == nationality.strip().upper())
    stmt = stmt.order_by(
        VisaChecklistItem.visa_route, VisaChecklistItem.sort_order, VisaChecklistItem.item_key
    )
    return list((await db.execute(stmt)).scalars())


async def create_checklist_item(
    db: AsyncSession, user: User, body: VisaChecklistItemIn, request: Request
) -> VisaChecklistItem:
    duplicate = (
        await db.execute(
            select(VisaChecklistItem.id).where(
                VisaChecklistItem.visa_route == body.visa_route,
                VisaChecklistItem.item_key == body.item_key,
                VisaChecklistItem.nationality.is_(None)
                if body.nationality is None
                else VisaChecklistItem.nationality == body.nationality,
            )
        )
    ).first()
    if duplicate is not None:
        raise Conflict("This checklist item already exists", code="visa_checklist_item_exists")
    row = VisaChecklistItem(**body.model_dump())
    db.add(row)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="visa_checklist.create",
        entity_type="visa_checklist_item",
        entity_id=row.id,
        after=body.model_dump(mode="json"),
        request=request,
    )
    await db.commit()
    await db.refresh(row)
    return row


async def update_checklist_item(
    db: AsyncSession, user: User, item_id: uuid.UUID, body: VisaChecklistItemUpdate, request: Request
) -> VisaChecklistItem:
    row = await db.get(VisaChecklistItem, item_id)
    if row is None:
        raise NotFound("Checklist item not found")
    changes = body.model_dump(exclude_unset=True)
    for field in ("title", "required", "sort_order"):
        if field in changes and changes[field] is None:
            raise BadRequest(f"{field} cannot be empty", code="invalid_value")
    for key, value in changes.items():
        setattr(row, key, value)
    await audit_log(
        db,
        actor=user,
        action="visa_checklist.update",
        entity_type="visa_checklist_item",
        entity_id=row.id,
        after={k: str(v) if v is not None else None for k, v in changes.items()},
        request=request,
    )
    await db.commit()
    await db.refresh(row)
    return row


async def delete_checklist_item(db: AsyncSession, user: User, item_id: uuid.UUID, request: Request) -> None:
    row = await db.get(VisaChecklistItem, item_id)
    if row is None:
        raise NotFound("Checklist item not found")
    await audit_log(
        db,
        actor=user,
        action="visa_checklist.delete",
        entity_type="visa_checklist_item",
        entity_id=row.id,
        before={"item_key": row.item_key, "visa_route": VisaRoute(row.visa_route).value},
        request=request,
    )
    await db.execute(delete(VisaChecklistItem).where(VisaChecklistItem.id == row.id))
    await db.commit()


async def load_defaults(
    db: AsyncSession, user: User | None = None, request: Request | None = None
) -> LoadDefaultsOut:
    """Insert the built-in rules/checklist items that are missing (admin edits are never overwritten)."""
    rules = visa_data.default_rules()
    result = await db.execute(
        pg_insert(VisaCountryRule)
        .values(rules)
        .on_conflict_do_nothing(index_elements=["nationality"])
        .returning(VisaCountryRule.id)
    )
    rules_added = len(list(result.scalars()))
    existing = {
        (VisaRoute(r.visa_route).value, r.nationality or "", r.item_key)
        for r in (await db.execute(select(VisaChecklistItem))).scalars()
    }
    items_added = 0
    for item in visa_data.default_checklist():
        if (item["visa_route"], item["nationality"] or "", item["item_key"]) in existing:
            continue
        db.add(VisaChecklistItem(**item))
        items_added += 1
    await db.flush()
    if user is not None:
        await audit_log(
            db,
            actor=user,
            action="visa_rules.load_defaults",
            entity_type="visa_country_rule",
            entity_id="defaults",
            after={"rules_added": rules_added, "checklist_items_added": items_added},
            request=request,
        )
    await db.commit()
    return LoadDefaultsOut(rules_added=rules_added, checklist_items_added=items_added)


# ---------------------------------------------------------------------------------------- invitation letter
async def _portal_visa(db: AsyncSession, ctx: PortalContext, visa_id: uuid.UUID) -> tuple[VisaRequest, Case]:
    row = (
        await db.execute(
            select(VisaRequest, Case)
            .join(Case, Case.id == VisaRequest.case_id)
            .where(VisaRequest.id == visa_id, Case.hospital_id == ctx.hospital_id)
            .with_for_update(of=VisaRequest)
        )
    ).first()
    if row is None:
        raise NotFound("Visa request not found")
    return row[0], row[1]


def letter_out(visa: VisaRequest, missing: list[str] | None = None) -> InvitationLetterOut:
    return InvitationLetterOut(
        visa_request_id=visa.id,
        visa_status=VisaStatus(visa.status),
        draft_document_id=visa.invitation_letter_draft_document_id,
        document_id=visa.invitation_letter_document_id,
        generated_at=visa.invitation_letter_generated_at,
        approved_at=visa.invitation_letter_approved_at,
        missing=missing or [],
    )


async def _build_letter_context(
    db: AsyncSession, ctx: PortalContext, visa: VisaRequest, case: Case, body: InvitationLetterGenerate
) -> tuple[LetterContext, list[str]]:
    hospital = ctx.hospital
    patient = await db.get(PatientProfile, case.patient_id)
    if patient is None:
        raise NotFound("Patient not found")
    # Encrypted passport numbers stay ciphertext here; the PDF renderer decrypts them.
    passport_cipher = (
        await db.execute(
            select(type_coerce(PatientProfile.passport_number, Text)).where(PatientProfile.id == patient.id)
        )
    ).scalar_one_or_none()
    booking = (
        await db.execute(
            select(Booking)
            .where(Booking.case_id == case.id, Booking.status != BookingStatus.CANCELLED)
            .order_by(Booking.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    quote = (
        await db.execute(
            select(Quote).where(Quote.case_id == case.id).order_by(Quote.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    doctor_id = body.treating_doctor_id or (booking.doctor_id if booking else None) or case.doctor_id
    doctor = await db.get(Doctor, doctor_id) if doctor_id else None
    if body.treating_doctor_id is not None and (doctor is None or doctor.hospital_id != hospital.id):
        raise BadRequest("The doctor does not practise at this hospital", code="invalid_doctor")
    procedure_id = (booking.procedure_id if booking else None) or case.procedure_id
    procedure = await db.get(Procedure, procedure_id) if procedure_id else None
    specialty_id = case.specialty_id or (doctor.specialty_id if doctor else None)
    specialty = await db.get(Specialty, specialty_id) if specialty_id else None

    rule = await resolve_rule(db, patient.nationality) if patient.nationality else None
    max_attendants = rule.max_attendants if rule is not None else 2
    attendants: list[LetterAttendant] = []
    if body.attendants is not None:
        if len(body.attendants) > max_attendants:
            raise BadRequest(
                f"At most {max_attendants} attendants can be named for this nationality",
                code="too_many_attendants",
                details={"max_attendants": max_attendants},
            )
        attendants = [
            LetterAttendant(full_name=a.full_name, relationship=a.relationship, passport=a.passport_number)
            for a in body.attendants
        ]
    else:
        rows = (
            await db.execute(
                select(
                    PatientCompanion.full_name,
                    PatientCompanion.relationship,
                    type_coerce(PatientCompanion.passport_number, Text),
                )
                .where(PatientCompanion.patient_id == patient.id)
                .order_by(PatientCompanion.created_at)
                .limit(max_attendants)
            )
        ).all()
        attendants = [LetterAttendant(full_name=r[0], relationship=r[1], passport=r[2]) for r in rows]

    arrival = body.estimated_arrival_date or (booking.admission_date if booking else None)
    duration = (
        body.estimated_duration_days
        or (booking.duration_days if booking else None)
        or (quote.estimated_stay_days if quote else None)
    )
    missing = [
        name
        for name, value in (
            ("passport_number", passport_cipher),
            ("nationality", patient.nationality),
            ("estimated_arrival_date", arrival),
            ("treating_doctor", doctor),
        )
        if not value
    ]
    address_lines = [
        line
        for line in (
            hospital.address,
            ", ".join(x for x in (hospital.city, hospital.state, hospital.pincode) if x),
            country_name(hospital.country),
        )
        if line
    ]
    letter = LetterContext(
        issued_on=today_ist(),
        reference=f"{case.case_number}/VISA",
        hospital_name=hospital.name,
        hospital_legal_name=hospital.legal_name,
        hospital_address_lines=address_lines,
        hospital_phone=hospital.phone,
        hospital_email=hospital.email,
        hospital_website=hospital.website,
        hospital_registration=f"GSTIN {hospital.gstin}" if hospital.gstin else None,
        patient_name=patient.full_name,
        patient_dob=patient.date_of_birth,
        nationality=country_name(patient.nationality),
        passport_cipher=passport_cipher,
        passport_expiry=patient.passport_expiry,
        procedure=procedure.name if procedure else None,
        specialty=specialty.name if specialty else None,
        doctor_name=doctor.full_name if doctor else None,
        doctor_registration=getattr(doctor, "registration_number", None) if doctor else None,
        arrival_on=arrival,
        duration_days=duration,
        visa_label=VISA_LABELS.get(VisaType(visa.visa_type), "Medical visa"),
        contact_name=body.contact_name or "International Patient Desk",
        contact_phone=body.contact_phone or hospital.phone,
        contact_email=body.contact_email or hospital.email,
        notes=body.notes,
        attendants=attendants,
    )
    return letter, missing


async def generate_invitation_letter(
    db: AsyncSession, ctx: PortalContext, visa_id: uuid.UUID, body: InvitationLetterGenerate, request: Request
) -> InvitationLetterOut:
    ctx.require(LETTER_ROLES)
    visa, case = await _portal_visa(db, ctx, visa_id)
    if VisaStatus(visa.status) in (VisaStatus.APPROVED,):
        raise BadRequest("The visa is already approved", code="invalid_state")
    letter, missing = await _build_letter_context(db, ctx, visa, case, body)
    pdf = await run_in_threadpool(render_invitation_letter, letter)
    key = make_key("documents", "pdf")
    storage = get_storage()
    await storage.save(key, pdf, "application/pdf")
    try:
        previous = visa.invitation_letter_draft_document_id
        if previous is not None and previous != visa.invitation_letter_document_id:
            old = await db.get(Document, previous)
            if old is not None and old.deleted_at is None:
                old.deleted_at = utcnow()  # superseded draft
        # Visible to the hospital (hospital_id) and staff only until approved.
        document = Document(
            owner_user_id=ctx.user.id,
            hospital_id=ctx.hospital_id,
            kind=DocumentKind.INVITATION_LETTER,
            file_name=f"invitation-letter-{case.case_number}.pdf",
            content_type="application/pdf",
            size_bytes=len(pdf),
            storage_key=key,
            sha256=hashlib.sha256(pdf).hexdigest(),
            status=DocumentStatus.UPLOADED,
        )
        db.add(document)
        await db.flush()
        visa.invitation_letter_draft_document_id = document.id
        visa.invitation_letter_generated_at = utcnow()
        await audit_log(
            db,
            actor=ctx.user,
            action="visa.invitation_letter_generate",
            entity_type="visa_request",
            entity_id=visa.id,
            after={"document_id": str(document.id), "missing": missing},
            request=request,
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        try:
            await storage.delete(key)
        except Exception:  # pragma: no cover - best effort cleanup
            logger.warning("visa.letter_cleanup_failed", storage_key=key)
        raise
    await db.refresh(visa)
    return letter_out(visa, missing)


async def approve_invitation_letter(
    db: AsyncSession, ctx: PortalContext, visa_id: uuid.UUID, request: Request
) -> InvitationLetterOut:
    ctx.require(LETTER_ROLES)
    visa, case = await _portal_visa(db, ctx, visa_id)
    draft_id = visa.invitation_letter_draft_document_id
    document = await db.get(Document, draft_id) if draft_id else None
    if document is None or document.deleted_at is not None:
        raise BadRequest("Generate the invitation letter first", code="invitation_letter_required")
    if visa.invitation_letter_document_id == document.id:
        return letter_out(visa)
    # Share it with the patient side: the patient (and their agent) can now download it.
    document.case_id = case.id
    document.patient_id = case.patient_id
    document.status = DocumentStatus.VERIFIED
    document.verified_by = ctx.user.id
    document.verified_at = utcnow()
    visa.invitation_letter_document_id = document.id
    visa.invitation_letter_approved_at = utcnow()
    visa.invitation_letter_approved_by_user_id = ctx.user.id
    current = VisaStatus(visa.status)
    if current in (VisaStatus.NOT_STARTED, VisaStatus.DOCUMENTS_PENDING):
        visa.status = VisaStatus.INVITATION_ISSUED
    await audit_log(
        db,
        actor=ctx.user,
        action="visa.invitation_letter_approve",
        entity_type="visa_request",
        entity_id=visa.id,
        before={"status": current.value},
        after={"status": VisaStatus(visa.status).value, "document_id": str(document.id)},
        request=request,
    )
    await sync_checklist_key(db, case.id, ChecklistKey.VISA_APPROVED)
    await publish(
        db,
        "visa.invitation_issued",
        {
            "visa_request_id": str(visa.id),
            "case_id": str(case.id),
            "patient_id": str(case.patient_id),
            "document_id": str(document.id),
        },
    )
    await queue_case_push(
        db,
        case,
        "travel.updated",
        {"case_id": str(case.id), "visa_request_id": str(visa.id), "status": VisaStatus(visa.status).value},
    )
    await db.commit()
    await db.refresh(visa)
    return letter_out(visa)
