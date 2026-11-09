"""Hospital-portal business logic (PLAN 8.5). Routers stay thin; every write commits here, writes an audit
log entry and invalidates the public catalog cache.

Cross-module helper: ``recompute_ratings(db, hospital_ids=None)`` refreshes ``rating_avg``/``rating_count``
of hospitals and doctors from *published* reviews (be-admin should call it after moderating reviews; an hourly
job ``hospitals.refresh_ratings`` also keeps them in sync). It does not commit.
"""

from __future__ import annotations

import secrets
import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from fastapi import Request
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.crypto import encrypt_str, mask
from app.core.enums import (
    DocumentKind,
    DocumentStatus,
    HospitalMemberRole,
    HospitalStatus,
    KycStatus,
    ReviewStatus,
    UserRole,
    UserStatus,
    VerificationPurpose,
)
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.jobs import enqueue
from app.core.money import BASE_CURRENCY, CurrencyError, normalize_currency
from app.core.security import new_opaque_token
from app.models import (
    AvailabilitySlot,
    Booking,
    Case,
    Consultation,
    Doctor,
    Document,
    Hospital,
    HospitalMember,
    HospitalProcedure,
    HospitalSpecialty,
    Procedure,
    Review,
    ScreeningMatch,
    Specialty,
    TreatmentPackage,
    User,
    VerificationToken,
)
from app.modules.catalog import service as catalog
from app.modules.catalog.schemas import AvailabilityDay, HospitalProcedureOut, PackageOut, ReviewOut
from app.modules.catalog.utils import normalize_tags, slugify
from app.modules.hospitals.policies import CATALOG_ROLES, MEMBER_ADMIN_ROLES, PROFILE_ROLES, PortalContext
from app.modules.hospitals.schemas import (
    AvailabilitySlotIn,
    DoctorAdminOut,
    DoctorIn,
    DoctorUpdateIn,
    HospitalProcedureIn,
    HospitalProcedureUpdateIn,
    HospitalProfileIn,
    HospitalProfileOut,
    HospitalSpecialtiesIn,
    MemberInviteIn,
    MemberOut,
    MemberUpdateIn,
    PackageIn,
    PackageUpdateIn,
)

INVITE_TTL_HOURS = 72
MAX_AVAILABILITY_AHEAD_DAYS = 730
# Hospital pricing (procedures/packages) is kept in the platform base currency so that prices, settlements
# and the public "starting from" figures are comparable.
HOSPITAL_PRICING_CURRENCY = BASE_CURRENCY
SUBMIT_REQUIRED_FIELDS = ("name", "legal_name", "city", "state", "address", "phone", "email")


def _utcnow() -> datetime:
    return datetime.now(UTC)


async def _commit_and_invalidate(db: AsyncSession) -> None:
    await db.commit()
    await catalog.invalidate_catalog_cache()


# ----------------------------------------------------------------------------- profile
async def specialty_ids_of(db: AsyncSession, hospital_id: uuid.UUID) -> list[uuid.UUID]:
    rows = await db.execute(
        select(HospitalSpecialty.specialty_id)
        .join(Specialty, Specialty.id == HospitalSpecialty.specialty_id)
        .where(HospitalSpecialty.hospital_id == hospital_id)
        .order_by(Specialty.sort_order, Specialty.name)
    )
    return list(rows.scalars())


async def profile_out(
    db: AsyncSession, hospital: Hospital, member_role: HospitalMemberRole | str | None = None
) -> HospitalProfileOut:
    """Full hospital record for its members (and staff). PAN is only ever returned masked."""
    card = (await catalog.build_hospital_cards(db, [hospital]))[0]
    pan = hospital.pan
    return HospitalProfileOut(
        **card.model_dump(),
        legal_name=hospital.legal_name,
        description=hospital.description,
        country=hospital.country,
        address=hospital.address,
        pincode=hospital.pincode,
        lat=hospital.lat,
        lng=hospital.lng,
        phone=hospital.phone,
        email=hospital.email,
        website=hospital.website,
        established_year=hospital.established_year,
        bed_count=hospital.bed_count,
        airport_distance_km=float(hospital.airport_distance_km)
        if hospital.airport_distance_km is not None
        else None,
        status=str(hospital.status),
        kyc_status=str(hospital.kyc_status),
        gstin=hospital.gstin,
        pan_last4=pan[-4:] if pan and len(pan) > 4 else None,
        pan_masked=mask(pan) or None,
        commission_rate_bps=hospital.commission_rate_bps,
        settlement_cycle_days=hospital.settlement_cycle_days,
        is_featured=hospital.is_featured,
        approved_at=hospital.approved_at,
        rejection_reason=hospital.rejection_reason,
        specialty_ids=await specialty_ids_of(db, hospital.id),
        member_role=str(member_role) if member_role is not None else None,
        created_at=hospital.created_at,
        updated_at=hospital.updated_at,
        pending_changes=sorted(((hospital.pending_profile or {}).get("fields") or {}).keys()),
    )


async def get_profile(db: AsyncSession, ctx: PortalContext) -> HospitalProfileOut:
    return await profile_out(db, ctx.hospital, ctx.member_role)


#: SEC-020: fields an ACTIVE hospital cannot change on its own (legal identity, contact identity, claims).
REVIEWED_PROFILE_FIELDS = frozenset(
    {"name", "legal_name", "gstin", "pan", "email", "website", "accreditations"}
)


async def update_profile(
    db: AsyncSession, ctx: PortalContext, body: HospitalProfileIn, request: Request | None = None
) -> HospitalProfileOut:
    ctx.require(PROFILE_ROLES)
    hospital = ctx.hospital
    data = body.model_dump(exclude_unset=True)
    for required in ("name", "city"):
        if required in data and data[required] is None:
            raise BadRequest(f"'{required}' cannot be empty", code="invalid_profile")
    changed: dict[str, Any] = {}
    held: dict[str, Any] = {}
    reviewed = hospital.status == HospitalStatus.ACTIVE
    for key, value in data.items():
        if key == "airport_distance_km" and value is not None:
            value = Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        current = getattr(hospital, key)
        if current != value:
            if reviewed and key in REVIEWED_PROFILE_FIELDS:
                # SEC-020: an approved hospital's identity and accreditation claims change only after review
                held[key] = encrypt_str(value) if key == "pan" and value else value
                continue
            changed[key] = "***" if key == "pan" else value
            setattr(hospital, key, value)
    if held:
        pending = dict((hospital.pending_profile or {}).get("fields") or {})
        pending.update(held)
        hospital.pending_profile = {
            "fields": pending,
            "requested_by": str(ctx.user.id),
            "requested_at": datetime.now(UTC).isoformat(),
        }
        await audit_log(
            db,
            actor=ctx.user,
            action="hospital.profile_change_requested",
            entity_type="hospital",
            entity_id=hospital.id,
            after={
                "fields": sorted(held),
                "values": {k: v for k, v in held.items() if k != "pan"},
            },
            request=request,
        )
    if changed or held:
        if changed:
            await audit_log(
                db,
                actor=ctx.user,
                action="hospital.profile_update",
                entity_type="hospital",
                entity_id=hospital.id,
                after={
                    "changed": sorted(changed),
                    "values": {k: v for k, v in changed.items() if k != "pan"},
                },
                request=request,
            )
        await _commit_and_invalidate(db)
        await db.refresh(hospital)
    return await profile_out(db, hospital, ctx.member_role)


async def submit_for_review(
    db: AsyncSession, ctx: PortalContext, request: Request | None = None
) -> HospitalProfileOut:
    ctx.require(PROFILE_ROLES)
    hospital = ctx.hospital
    if hospital.status == HospitalStatus.PENDING_REVIEW:
        raise Conflict("This hospital is already awaiting review", code="already_submitted")
    if hospital.status not in (HospitalStatus.DRAFT, HospitalStatus.REJECTED):
        raise Conflict("Only draft or rejected hospitals can be submitted for review", code="invalid_status")
    missing = [f for f in SUBMIT_REQUIRED_FIELDS if not (getattr(hospital, f) or "").strip()]
    has_kyc = (
        await db.execute(
            select(Document.id)
            .where(
                Document.hospital_id == hospital.id,
                Document.kind == DocumentKind.KYC_REGISTRATION,
                Document.deleted_at.is_(None),
                Document.status != DocumentStatus.REJECTED,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if has_kyc is None:
        missing.append("kyc_registration_document")
    if missing:
        raise BadRequest(
            "Complete your hospital profile and upload a registration certificate before submitting",
            code="profile_incomplete",
            details={"missing": missing},
        )
    before = {"status": str(hospital.status), "kyc_status": str(hospital.kyc_status)}
    hospital.status = HospitalStatus.PENDING_REVIEW
    hospital.kyc_status = KycStatus.PENDING
    hospital.rejection_reason = None
    await audit_log(
        db,
        actor=ctx.user,
        action="hospital.submit_for_review",
        entity_type="hospital",
        entity_id=hospital.id,
        before=before,
        after={"status": hospital.status.value, "kyc_status": hospital.kyc_status.value},
        request=request,
    )
    await _commit_and_invalidate(db)
    await db.refresh(hospital)
    return await profile_out(db, hospital, ctx.member_role)


async def set_specialties(
    db: AsyncSession, ctx: PortalContext, body: HospitalSpecialtiesIn, request: Request | None = None
) -> HospitalProfileOut:
    ctx.require(CATALOG_ROLES)
    wanted = list(dict.fromkeys(body.specialty_ids))
    if wanted:
        found = set(
            (
                await db.execute(
                    select(Specialty.id).where(Specialty.id.in_(wanted), Specialty.is_active.is_(True))
                )
            ).scalars()
        )
        unknown = [str(s) for s in wanted if s not in found]
        if unknown:
            raise BadRequest(
                "Unknown specialty", code="invalid_specialty", details={"specialty_ids": unknown}
            )
    before = await specialty_ids_of(db, ctx.hospital_id)
    stale = delete(HospitalSpecialty).where(HospitalSpecialty.hospital_id == ctx.hospital_id)
    if wanted:
        stale = stale.where(HospitalSpecialty.specialty_id.not_in(wanted))
    await db.execute(stale)
    if wanted:
        await db.execute(
            pg_insert(HospitalSpecialty)
            .values([{"hospital_id": ctx.hospital_id, "specialty_id": s} for s in wanted])
            .on_conflict_do_nothing()
        )
    await audit_log(
        db,
        actor=ctx.user,
        action="hospital.specialties_update",
        entity_type="hospital",
        entity_id=ctx.hospital_id,
        before={"specialty_ids": [str(s) for s in before]},
        after={"specialty_ids": [str(s) for s in wanted]},
        request=request,
    )
    await _commit_and_invalidate(db)
    return await profile_out(db, ctx.hospital, ctx.member_role)


# ----------------------------------------------------------------------------- members
def _member_out(member: HospitalMember, user: User) -> MemberOut:
    return MemberOut(
        id=member.id,
        hospital_id=member.hospital_id,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        member_role=str(member.member_role),
        status=str(user.status),
        created_at=member.created_at,
    )


async def list_members(db: AsyncSession, ctx: PortalContext) -> list[MemberOut]:
    rows = await db.execute(
        select(HospitalMember, User)
        .join(User, User.id == HospitalMember.user_id)
        .where(HospitalMember.hospital_id == ctx.hospital_id)
        .order_by(HospitalMember.created_at, HospitalMember.id)
    )
    return [_member_out(m, u) for m, u in rows.all()]


async def _get_member(
    db: AsyncSession, ctx: PortalContext, member_id: uuid.UUID
) -> tuple[HospitalMember, User]:
    row = (
        await db.execute(
            select(HospitalMember, User)
            .join(User, User.id == HospitalMember.user_id)
            .where(HospitalMember.id == member_id, HospitalMember.hospital_id == ctx.hospital_id)
        )
    ).first()
    if row is None:
        raise NotFound("Member not found")
    return row[0], row[1]


async def get_member(db: AsyncSession, ctx: PortalContext, member_id: uuid.UUID) -> MemberOut:
    member, user = await _get_member(db, ctx, member_id)
    return _member_out(member, user)


def _check_owner_rules(ctx: PortalContext, *roles: HospitalMemberRole) -> None:
    """Only owners may grant, change or remove the owner role."""
    if HospitalMemberRole.OWNER in roles and ctx.member_role != HospitalMemberRole.OWNER:
        raise Forbidden("Only an owner can manage owners", code="owner_required")


async def _owner_count(db: AsyncSession, hospital_id: uuid.UUID) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(HospitalMember)
                .where(
                    HospitalMember.hospital_id == hospital_id,
                    HospitalMember.member_role == HospitalMemberRole.OWNER,
                )
            )
        ).scalar_one()
    )


async def invite_member(
    db: AsyncSession, ctx: PortalContext, body: MemberInviteIn, request: Request | None = None
) -> MemberOut:
    ctx.require(MEMBER_ADMIN_ROLES)
    _check_owner_rules(ctx, body.member_role)
    email = str(body.email).strip().lower()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    portal_url = settings.HOSPITAL_PORTAL_URL.rstrip("/")
    inviter = ctx.user.full_name or "A colleague"
    hospital_name = ctx.hospital.name
    role_label = body.member_role.value.replace("_", " ")
    if user is not None:
        if str(user.role) != UserRole.HOSPITAL.value:
            raise Conflict(
                "This email belongs to an account that cannot join a hospital", code="email_in_use"
            )
        if user.status in (UserStatus.DELETED, UserStatus.SUSPENDED) or user.deleted_at is not None:
            raise Conflict("This account is not available", code="account_unavailable")
        exists = (
            await db.execute(
                select(HospitalMember.id).where(
                    HospitalMember.hospital_id == ctx.hospital_id, HospitalMember.user_id == user.id
                )
            )
        ).scalar_one_or_none()
        if exists is not None:
            raise Conflict("This user is already a member of the hospital", code="already_member")
        email_payload: dict[str, Any] = {
            "to": email,
            "subject": f"You have been added to {hospital_name}",
            "template": "generic_notification.html",
            "context": {
                "title": f"You now have access to {hospital_name}",
                "body": f"{inviter} added you to {hospital_name} as {role_label}. Sign in to the hospital "
                "portal to get started.",
                "name": user.full_name,
                "url": f"{portal_url}/login",
                "action_label": "Open hospital portal",
            },
        }
        created_user = False
    else:
        user = User(
            email=email,
            full_name=body.full_name,
            role=UserRole.HOSPITAL,
            status=UserStatus.ACTIVE,
            password_hash=None,
        )
        db.add(user)
        # Insert the user first: these models have no ORM relationship, so flush order is not inferred.
        await db.flush()
        raw, token_hash = new_opaque_token()
        db.add(
            VerificationToken(
                user_id=user.id,
                purpose=VerificationPurpose.INVITE,
                token_hash=token_hash,
                expires_at=_utcnow() + timedelta(hours=INVITE_TTL_HOURS),
            )
        )
        email_payload = {
            "to": email,
            "subject": f"Invitation to join {hospital_name} on Heal India Global",
            "template": "invite.html",
            "context": {
                "name": body.full_name,
                "url": f"{settings.PUBLIC_SITE_URL.rstrip('/')}/accept-invite#token={raw}",  # fragment: #22
                "inviter_name": inviter,
                "organization_name": hospital_name,
                "role": role_label,
                "expires_hours": INVITE_TTL_HOURS,
            },
        }
        created_user = True
    member = HospitalMember(hospital_id=ctx.hospital_id, user_id=user.id, member_role=body.member_role)
    db.add(member)
    await db.flush()
    await enqueue(db, "email.send", email_payload)
    await audit_log(
        db,
        actor=ctx.user,
        action="hospital.member_invite",
        entity_type="hospital_member",
        entity_id=member.id,
        after={
            "hospital_id": str(ctx.hospital_id),
            "user_id": str(user.id),
            "member_role": body.member_role.value,
            "new_user": created_user,
        },
        request=request,
    )
    await db.commit()
    await db.refresh(member)
    await db.refresh(user)
    return _member_out(member, user)


async def update_member(
    db: AsyncSession,
    ctx: PortalContext,
    member_id: uuid.UUID,
    body: MemberUpdateIn,
    request: Request | None = None,
) -> MemberOut:
    ctx.require(MEMBER_ADMIN_ROLES)
    member, user = await _get_member(db, ctx, member_id)
    old = HospitalMemberRole(member.member_role)
    new = body.member_role
    if old == new:
        return _member_out(member, user)
    _check_owner_rules(ctx, old, new)
    if old == HospitalMemberRole.OWNER and await _owner_count(db, ctx.hospital_id) <= 1:
        raise Conflict("A hospital must keep at least one owner", code="last_owner")
    member.member_role = new
    await audit_log(
        db,
        actor=ctx.user,
        action="hospital.member_role_change",
        entity_type="hospital_member",
        entity_id=member.id,
        before={"member_role": old.value},
        after={"member_role": new.value},
        request=request,
    )
    await db.commit()
    await db.refresh(member)
    return _member_out(member, user)


async def remove_member(
    db: AsyncSession, ctx: PortalContext, member_id: uuid.UUID, request: Request | None = None
) -> None:
    ctx.require(MEMBER_ADMIN_ROLES)
    member, user = await _get_member(db, ctx, member_id)
    role = HospitalMemberRole(member.member_role)
    _check_owner_rules(ctx, role)
    if role == HospitalMemberRole.OWNER and await _owner_count(db, ctx.hospital_id) <= 1:
        raise Conflict("A hospital must keep at least one owner", code="last_owner")
    await audit_log(
        db,
        actor=ctx.user,
        action="hospital.member_remove",
        entity_type="hospital_member",
        entity_id=member.id,
        before={"user_id": str(user.id), "member_role": role.value},
        request=request,
    )
    await db.delete(member)
    await db.commit()


# ----------------------------------------------------------------------------- doctors
async def _unique_slug(db: AsyncSession, model: Any, base: str) -> str:
    base = slugify(base, max_length=170)
    candidate = base
    for _ in range(10):
        taken = (await db.execute(select(model.id).where(model.slug == candidate))).scalar_one_or_none()
        if taken is None:
            return candidate
        candidate = f"{base}-{secrets.token_hex(3)}"
    raise Conflict("Could not allocate a unique slug", code="slug_conflict")


async def doctor_admin_outs(
    db: AsyncSession, hospital: Hospital, doctors: Sequence[Doctor]
) -> list[DoctorAdminOut]:
    """Portal view of doctors (incl. inactive ones, all packages), batch-loaded."""
    if not doctors:
        return []
    cards = {
        c.id: c for c in await catalog.build_doctor_cards(db, doctors, hospitals={hospital.id: hospital})
    }
    hps = list(
        (
            await db.execute(
                select(HospitalProcedure)
                .join(Procedure, Procedure.id == HospitalProcedure.procedure_id)
                .where(HospitalProcedure.hospital_id == hospital.id)
                .order_by(Procedure.name, HospitalProcedure.id)
            )
        ).scalars()
    )
    hp_outs = {o.id: o for o in await catalog.build_hospital_procedures(db, hps, active_packages_only=False)}
    proc_specialty = (
        dict(
            (
                await db.execute(
                    select(Procedure.id, Procedure.specialty_id).where(
                        Procedure.id.in_({hp.procedure_id for hp in hps})
                    )
                )
            ).all()
        )
        if hps
        else {}
    )
    next_dates = dict(
        (
            await db.execute(
                select(AvailabilitySlot.doctor_id, func.min(AvailabilitySlot.date))
                .where(
                    AvailabilitySlot.doctor_id.in_([d.id for d in doctors]),
                    AvailabilitySlot.date >= catalog.today_ist(),
                    AvailabilitySlot.capacity > AvailabilitySlot.booked,
                )
                .group_by(AvailabilitySlot.doctor_id)
            )
        ).all()
    )
    out: list[DoctorAdminOut] = []
    for d in doctors:
        card = cards.get(d.id)
        if card is None:
            continue
        lead = [hp for hp in hps if d.id in (hp.doctor_ids or [])]
        chosen = lead or [hp for hp in hps if proc_specialty.get(hp.procedure_id) == d.specialty_id]
        out.append(
            DoctorAdminOut(
                **card.model_dump(),
                bio=d.bio,
                sub_specialties=list(d.sub_specialties or []),
                procedures=[hp_outs[hp.id] for hp in chosen if hp.id in hp_outs],
                next_available_date=next_dates.get(d.id),
                **catalog.registration_fields(d),
                registration_verified_at=d.registration_verified_at,
                is_active=d.is_active,
                user_id=d.user_id,
                created_at=d.created_at,
                updated_at=d.updated_at,
            )
        )
    return out


async def list_doctors(db: AsyncSession, ctx: PortalContext) -> list[DoctorAdminOut]:
    doctors = list(
        (
            await db.execute(
                select(Doctor)
                .where(Doctor.hospital_id == ctx.hospital_id)
                .order_by(Doctor.is_active.desc(), Doctor.full_name, Doctor.id)
            )
        ).scalars()
    )
    return await doctor_admin_outs(db, ctx.hospital, doctors)


async def get_doctor(db: AsyncSession, ctx: PortalContext, doctor_id: uuid.UUID) -> Doctor:
    doctor = (
        await db.execute(select(Doctor).where(Doctor.id == doctor_id, Doctor.hospital_id == ctx.hospital_id))
    ).scalar_one_or_none()
    if doctor is None:
        raise NotFound("Doctor not found")
    return doctor


async def doctor_out(db: AsyncSession, ctx: PortalContext, doctor: Doctor) -> DoctorAdminOut:
    return (await doctor_admin_outs(db, ctx.hospital, [doctor]))[0]


def _check_registration(number: str | None, council: str | None) -> None:
    """A medical registration needs both the number and the issuing council (or neither, for legacy rows)."""
    if bool(number) != bool(council):
        raise BadRequest(
            "Provide both the registration number and the registration council",
            code="invalid_registration",
            details={"missing": "registration_council" if number else "registration_number"},
        )


async def _check_specialty(db: AsyncSession, specialty_id: uuid.UUID) -> None:
    found = (
        await db.execute(
            select(Specialty.id).where(Specialty.id == specialty_id, Specialty.is_active.is_(True))
        )
    ).scalar_one_or_none()
    if found is None:
        raise BadRequest(
            "Unknown specialty", code="invalid_specialty", details={"specialty_id": str(specialty_id)}
        )


def _currency(value: str | None, default: str) -> str:
    try:
        return normalize_currency(value or default)
    except CurrencyError as exc:
        raise BadRequest("Invalid currency", code="invalid_currency") from exc


async def _ensure_hospital_specialty(
    db: AsyncSession, hospital_id: uuid.UUID, specialty_id: uuid.UUID
) -> None:
    await db.execute(
        pg_insert(HospitalSpecialty)
        .values(hospital_id=hospital_id, specialty_id=specialty_id)
        .on_conflict_do_nothing()
    )


async def create_doctor(
    db: AsyncSession, ctx: PortalContext, body: DoctorIn, request: Request | None = None
) -> DoctorAdminOut:
    ctx.require(CATALOG_ROLES)
    await _check_specialty(db, body.specialty_id)
    data = body.model_dump(exclude_unset=True)
    for key in ("sub_specialties", "qualifications", "languages"):
        data[key] = data.get(key) or []
    data["currency"] = _currency(data.get("currency"), BASE_CURRENCY)
    if data.get("success_rate_pct") is not None:
        data["success_rate_pct"] = Decimal(str(data["success_rate_pct"])).quantize(Decimal("0.01"))
    for flag in ("teleconsult_available", "is_active"):
        if data.get(flag) is None:
            data.pop(flag, None)
    _check_registration(data.get("registration_number"), data.get("registration_council"))
    doctor = Doctor(
        hospital_id=ctx.hospital_id,
        slug=await _unique_slug(db, Doctor, body.full_name),
        **data,
    )
    db.add(doctor)
    await db.flush()
    await _ensure_hospital_specialty(db, ctx.hospital_id, body.specialty_id)
    await audit_log(
        db,
        actor=ctx.user,
        action="hospital.doctor_create",
        entity_type="doctor",
        entity_id=doctor.id,
        after={"full_name": doctor.full_name, "specialty_id": str(doctor.specialty_id)},
        request=request,
    )
    await _commit_and_invalidate(db)
    await db.refresh(doctor)
    return await doctor_out(db, ctx, doctor)


async def update_doctor(
    db: AsyncSession,
    ctx: PortalContext,
    doctor_id: uuid.UUID,
    body: DoctorUpdateIn,
    request: Request | None = None,
) -> DoctorAdminOut:
    ctx.require(CATALOG_ROLES)
    doctor = await get_doctor(db, ctx, doctor_id)
    data = body.model_dump(exclude_unset=True)
    for key in ("full_name", "specialty_id", "currency", "teleconsult_available", "is_active"):
        if key in data and data[key] is None:
            raise BadRequest(f"'{key}' cannot be null", code="invalid_doctor")
    if "specialty_id" in data and data["specialty_id"] != doctor.specialty_id:
        await _check_specialty(db, data["specialty_id"])
        await _ensure_hospital_specialty(db, ctx.hospital_id, data["specialty_id"])
    if "currency" in data:
        data["currency"] = _currency(data["currency"], BASE_CURRENCY)
    for key in ("sub_specialties", "qualifications", "languages"):
        if key in data and data[key] is None:
            data[key] = []
    if data.get("success_rate_pct") is not None:
        data["success_rate_pct"] = Decimal(str(data["success_rate_pct"])).quantize(Decimal("0.01"))
    _check_registration(
        data.get("registration_number", doctor.registration_number),
        data.get("registration_council", doctor.registration_council),
    )
    changed = []
    for key, value in data.items():
        if getattr(doctor, key) != value:
            setattr(doctor, key, value)
            changed.append(key)
    if {"registration_number", "registration_council"} & set(changed) and doctor.registration_verified_at:
        # an admin verified the old registration; the new one must be checked again
        doctor.registration_verified_at = None
        doctor.registration_verified_by_user_id = None
        changed.append("registration_verified_at")
    if changed:
        await audit_log(
            db,
            actor=ctx.user,
            action="hospital.doctor_update",
            entity_type="doctor",
            entity_id=doctor.id,
            after={"changed": sorted(changed)},
            request=request,
        )
        await _commit_and_invalidate(db)
        await db.refresh(doctor)
    return await doctor_out(db, ctx, doctor)


async def _doctor_referenced(db: AsyncSession, doctor_id: uuid.UUID) -> bool:
    checks = [
        select(Case.id).where(Case.doctor_id == doctor_id),
        select(Booking.id).where(Booking.doctor_id == doctor_id),
        select(Consultation.id).where(Consultation.doctor_id == doctor_id),
        select(ScreeningMatch.id).where(ScreeningMatch.doctor_id == doctor_id),
        select(Review.id).where(Review.doctor_id == doctor_id),
        select(AvailabilitySlot.id).where(
            AvailabilitySlot.doctor_id == doctor_id, AvailabilitySlot.booked > 0
        ),
    ]
    for stmt in checks:
        if (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None:
            return True
    return False


async def delete_doctor(
    db: AsyncSession, ctx: PortalContext, doctor_id: uuid.UUID, request: Request | None = None
) -> str:
    """Hard-delete an unreferenced doctor; otherwise deactivate (history keeps pointing at it).
    Returns ``"deleted"`` or ``"deactivated"``."""
    ctx.require(CATALOG_ROLES)
    doctor = await get_doctor(db, ctx, doctor_id)
    outcome = "deactivated" if await _doctor_referenced(db, doctor.id) else "deleted"
    # Remove the doctor from lead-doctor lists either way.
    await db.execute(
        update(HospitalProcedure)
        .where(
            HospitalProcedure.hospital_id == ctx.hospital_id,
            HospitalProcedure.doctor_ids.contains([doctor.id]),
        )
        .values(doctor_ids=func.array_remove(HospitalProcedure.doctor_ids, doctor.id))
        .execution_options(synchronize_session=False)
    )
    await audit_log(
        db,
        actor=ctx.user,
        action=f"hospital.doctor_{'delete' if outcome == 'deleted' else 'deactivate'}",
        entity_type="doctor",
        entity_id=doctor.id,
        before={"full_name": doctor.full_name, "is_active": doctor.is_active},
        request=request,
    )
    if outcome == "deleted":
        await db.delete(doctor)
    else:
        doctor.is_active = False
    await _commit_and_invalidate(db)
    return outcome


# ----------------------------------------------------------------------------- availability
async def get_availability(
    db: AsyncSession,
    ctx: PortalContext,
    doctor_id: uuid.UUID | None,
    date_from: date | None,
    date_to: date | None,
) -> list[AvailabilityDay]:
    if doctor_id is not None:
        await get_doctor(db, ctx, doctor_id)
        return await catalog.get_availability(
            db, hospital_id=ctx.hospital_id, doctor_id=doctor_id, date_from=date_from, date_to=date_to
        )
    return await _hospital_level_availability(db, ctx.hospital_id, date_from, date_to)


async def _hospital_level_availability(
    db: AsyncSession, hospital_id: uuid.UUID, date_from: date | None, date_to: date | None
) -> list[AvailabilityDay]:
    start, end = catalog.availability_range(date_from, date_to)
    rows = (
        await db.execute(
            select(AvailabilitySlot)
            .where(
                AvailabilitySlot.hospital_id == hospital_id,
                AvailabilitySlot.doctor_id.is_(None),
                AvailabilitySlot.date >= start,
                AvailabilitySlot.date <= end,
            )
            .order_by(AvailabilitySlot.date, AvailabilitySlot.slot_kind)
        )
    ).scalars()
    return [_slot_day(s) for s in rows]


def _slot_day(s: AvailabilitySlot) -> AvailabilityDay:
    return AvailabilityDay(
        date=s.date,
        slot_kind=str(s.slot_kind),
        capacity=s.capacity,
        booked=s.booked,
        available=max(s.capacity - s.booked, 0),
    )


async def set_availability(
    db: AsyncSession,
    ctx: PortalContext,
    doctor_id: uuid.UUID | None,
    slots: Sequence[AvailabilitySlotIn],
    request: Request | None = None,
) -> list[AvailabilityDay]:
    """Upsert capacity per (date, slot_kind). Capacity can never go below what is already booked."""
    ctx.require(CATALOG_ROLES)
    if doctor_id is not None:
        await get_doctor(db, ctx, doctor_id)
    if not slots:
        return []
    today = catalog.today_ist()
    seen: set[tuple[date, str]] = set()
    for s in slots:
        key = (s.date, s.slot_kind.value)
        if key in seen:
            raise BadRequest(
                "Each (date, slot_kind) may appear only once",
                code="duplicate_slot",
                details={"date": s.date.isoformat(), "slot_kind": s.slot_kind.value},
            )
        seen.add(key)
        if s.date < today or s.date > today + timedelta(days=MAX_AVAILABILITY_AHEAD_DAYS):
            raise BadRequest(
                "Availability can only be set from today up to two years ahead",
                code="invalid_date",
                details={"date": s.date.isoformat()},
            )
    doctor_cond = (
        AvailabilitySlot.doctor_id == doctor_id if doctor_id else AvailabilitySlot.doctor_id.is_(None)
    )
    existing = {
        (row.date, str(row.slot_kind)): row
        for row in (
            await db.execute(
                select(AvailabilitySlot)
                .where(
                    AvailabilitySlot.hospital_id == ctx.hospital_id,
                    doctor_cond,
                    AvailabilitySlot.date.in_({s.date for s in slots}),
                )
                .with_for_update()
            )
        ).scalars()
    }
    conflicts = [
        {
            "date": s.date.isoformat(),
            "slot_kind": s.slot_kind.value,
            "booked": existing[k].booked,
            "capacity": s.capacity,
        }
        for s in slots
        if (k := (s.date, s.slot_kind.value)) in existing and existing[k].booked > s.capacity
    ]
    if conflicts:
        raise BadRequest(
            "Capacity cannot be lower than the number of slots already booked",
            code="capacity_below_booked",
            details={"slots": conflicts},
        )
    for s in slots:
        row = existing.get((s.date, s.slot_kind.value))
        if row is not None:
            row.capacity = s.capacity
        else:
            db.add(
                AvailabilitySlot(
                    hospital_id=ctx.hospital_id,
                    doctor_id=doctor_id,
                    date=s.date,
                    slot_kind=s.slot_kind,
                    capacity=s.capacity,
                    booked=0,
                )
            )
    await audit_log(
        db,
        actor=ctx.user,
        action="hospital.availability_update",
        entity_type="doctor" if doctor_id else "hospital",
        entity_id=doctor_id or ctx.hospital_id,
        after={"slots": [s.model_dump(mode="json") for s in slots][:100]},
        request=request,
    )
    await _commit_and_invalidate(db)
    start, end = min(s.date for s in slots), max(s.date for s in slots)
    if doctor_id is not None:
        return await catalog.get_availability(
            db, hospital_id=ctx.hospital_id, doctor_id=doctor_id, date_from=start, date_to=end
        )
    return await _hospital_level_availability(db, ctx.hospital_id, start, end)


# ----------------------------------------------------------------------------- procedures
async def _get_hp(db: AsyncSession, ctx: PortalContext, hp_id: uuid.UUID) -> HospitalProcedure:
    hp = (
        await db.execute(
            select(HospitalProcedure).where(
                HospitalProcedure.id == hp_id, HospitalProcedure.hospital_id == ctx.hospital_id
            )
        )
    ).scalar_one_or_none()
    if hp is None:
        raise NotFound("Procedure not found")
    return hp


async def hp_out(db: AsyncSession, hp: HospitalProcedure) -> HospitalProcedureOut:
    return (await catalog.build_hospital_procedures(db, [hp], active_packages_only=False))[0]


async def list_procedures(db: AsyncSession, ctx: PortalContext) -> list[HospitalProcedureOut]:
    hps = list(
        (
            await db.execute(
                select(HospitalProcedure)
                .join(Procedure, Procedure.id == HospitalProcedure.procedure_id)
                .where(HospitalProcedure.hospital_id == ctx.hospital_id)
                .order_by(HospitalProcedure.is_active.desc(), Procedure.name, HospitalProcedure.id)
            )
        ).scalars()
    )
    return await catalog.build_hospital_procedures(db, hps, active_packages_only=False)


async def get_procedure(db: AsyncSession, ctx: PortalContext, hp_id: uuid.UUID) -> HospitalProcedureOut:
    return await hp_out(db, await _get_hp(db, ctx, hp_id))


async def _check_doctor_ids(
    db: AsyncSession, ctx: PortalContext, doctor_ids: list[uuid.UUID]
) -> list[uuid.UUID]:
    ids = list(dict.fromkeys(doctor_ids))
    if not ids:
        return []
    found = set(
        (
            await db.execute(
                select(Doctor.id).where(Doctor.id.in_(ids), Doctor.hospital_id == ctx.hospital_id)
            )
        ).scalars()
    )
    unknown = [str(d) for d in ids if d not in found]
    if unknown:
        raise BadRequest(
            "Unknown doctor for this hospital", code="invalid_doctor", details={"doctor_ids": unknown}
        )
    return ids


async def _check_procedure(db: AsyncSession, procedure_id: uuid.UUID) -> Procedure:
    proc = (
        await db.execute(select(Procedure).where(Procedure.id == procedure_id, Procedure.is_active.is_(True)))
    ).scalar_one_or_none()
    if proc is None:
        raise BadRequest(
            "Unknown procedure", code="invalid_procedure", details={"procedure_id": str(procedure_id)}
        )
    return proc


def _pricing_currency(value: str | None) -> str:
    code = _currency(value, HOSPITAL_PRICING_CURRENCY)
    if code != HOSPITAL_PRICING_CURRENCY:
        raise BadRequest(
            f"Hospital prices must be in {HOSPITAL_PRICING_CURRENCY}",
            code="invalid_currency",
            details={"currency": code, "allowed": [HOSPITAL_PRICING_CURRENCY]},
        )
    return code


async def _hp_exists(
    db: AsyncSession, hospital_id: uuid.UUID, procedure_id: uuid.UUID, exclude: uuid.UUID | None
) -> bool:
    stmt = select(HospitalProcedure.id).where(
        HospitalProcedure.hospital_id == hospital_id, HospitalProcedure.procedure_id == procedure_id
    )
    if exclude is not None:
        stmt = stmt.where(HospitalProcedure.id != exclude)
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def create_procedure(
    db: AsyncSession, ctx: PortalContext, body: HospitalProcedureIn, request: Request | None = None
) -> HospitalProcedureOut:
    ctx.require(CATALOG_ROLES)
    proc = await _check_procedure(db, body.procedure_id)
    if await _hp_exists(db, ctx.hospital_id, proc.id, None):
        raise Conflict("This procedure is already listed for the hospital", code="procedure_exists")
    hp = HospitalProcedure(
        hospital_id=ctx.hospital_id,
        procedure_id=proc.id,
        doctor_ids=await _check_doctor_ids(db, ctx, body.doctor_ids or []),
        price_min_minor=body.price_min_minor,
        price_max_minor=body.price_max_minor,
        currency=_pricing_currency(body.currency),
        hospital_stay_days=body.hospital_stay_days
        if body.hospital_stay_days is not None
        else proc.hospital_stay_days,
        success_rate_pct=Decimal(str(body.success_rate_pct)).quantize(Decimal("0.01"))
        if body.success_rate_pct is not None
        else None,
        inclusions=normalize_tags(body.inclusions, lower=False),
        exclusions=normalize_tags(body.exclusions, lower=False),
        is_active=True if body.is_active is None else body.is_active,
    )
    db.add(hp)
    await db.flush()
    await _ensure_hospital_specialty(db, ctx.hospital_id, proc.specialty_id)
    await audit_log(
        db,
        actor=ctx.user,
        action="hospital.procedure_create",
        entity_type="hospital_procedure",
        entity_id=hp.id,
        after={
            "procedure_id": str(proc.id),
            "price_min_minor": hp.price_min_minor,
            "price_max_minor": hp.price_max_minor,
        },
        request=request,
    )
    await _commit_and_invalidate(db)
    await db.refresh(hp)
    return await hp_out(db, hp)


async def update_procedure(
    db: AsyncSession,
    ctx: PortalContext,
    hp_id: uuid.UUID,
    body: HospitalProcedureUpdateIn,
    request: Request | None = None,
) -> HospitalProcedureOut:
    ctx.require(CATALOG_ROLES)
    hp = await _get_hp(db, ctx, hp_id)
    data = body.model_dump(exclude_unset=True)
    for key in ("procedure_id", "price_min_minor", "price_max_minor", "currency", "is_active"):
        if key in data and data[key] is None:
            raise BadRequest(f"'{key}' cannot be null", code="invalid_procedure")
    if "procedure_id" in data and data["procedure_id"] != hp.procedure_id:
        proc = await _check_procedure(db, data["procedure_id"])
        if await _hp_exists(db, ctx.hospital_id, proc.id, hp.id):
            raise Conflict("This procedure is already listed for the hospital", code="procedure_exists")
        await _ensure_hospital_specialty(db, ctx.hospital_id, proc.specialty_id)
    if "doctor_ids" in data:
        data["doctor_ids"] = await _check_doctor_ids(db, ctx, data["doctor_ids"] or [])
    if "currency" in data:
        data["currency"] = _pricing_currency(data["currency"])
    for key in ("inclusions", "exclusions"):
        if key in data:
            data[key] = normalize_tags(data[key], lower=False)
    if data.get("success_rate_pct") is not None:
        data["success_rate_pct"] = Decimal(str(data["success_rate_pct"])).quantize(Decimal("0.01"))
    new_min = data.get("price_min_minor", hp.price_min_minor)
    new_max = data.get("price_max_minor", hp.price_max_minor)
    if new_min is not None and new_max is not None and new_min > new_max:
        raise BadRequest("price_min_minor must not exceed price_max_minor", code="invalid_price_range")
    before = {
        "price_min_minor": hp.price_min_minor,
        "price_max_minor": hp.price_max_minor,
        "is_active": hp.is_active,
    }
    changed = []
    for key, value in data.items():
        if getattr(hp, key) != value:
            setattr(hp, key, value)
            changed.append(key)
    if changed:
        await audit_log(
            db,
            actor=ctx.user,
            action="hospital.procedure_update",
            entity_type="hospital_procedure",
            entity_id=hp.id,
            before=before,
            after={
                "changed": sorted(changed),
                "price_min_minor": hp.price_min_minor,
                "price_max_minor": hp.price_max_minor,
                "is_active": hp.is_active,
            },
            request=request,
        )
        await _commit_and_invalidate(db)
        await db.refresh(hp)
    return await hp_out(db, hp)


async def _packages_referenced(db: AsyncSession, package_ids: Sequence[uuid.UUID]) -> bool:
    if not package_ids:
        return False
    for stmt in (
        select(Booking.id).where(Booking.package_id.in_(package_ids)),
        select(ScreeningMatch.id).where(ScreeningMatch.package_id.in_(package_ids)),
    ):
        if (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None:
            return True
    return False


async def delete_procedure(
    db: AsyncSession, ctx: PortalContext, hp_id: uuid.UUID, request: Request | None = None
) -> str:
    """Hard-delete when none of its packages is referenced by bookings/matches; otherwise deactivate."""
    ctx.require(CATALOG_ROLES)
    hp = await _get_hp(db, ctx, hp_id)
    package_ids = list(
        (
            await db.execute(
                select(TreatmentPackage.id).where(TreatmentPackage.hospital_procedure_id == hp.id)
            )
        ).scalars()
    )
    referenced = await _packages_referenced(db, package_ids)
    await audit_log(
        db,
        actor=ctx.user,
        action="hospital.procedure_deactivate" if referenced else "hospital.procedure_delete",
        entity_type="hospital_procedure",
        entity_id=hp.id,
        before={"procedure_id": str(hp.procedure_id), "is_active": hp.is_active},
        request=request,
    )
    if referenced:
        hp.is_active = False
        await db.execute(
            update(TreatmentPackage)
            .where(TreatmentPackage.hospital_procedure_id == hp.id)
            .values(is_active=False)
            .execution_options(synchronize_session=False)
        )
    else:
        await db.delete(hp)
    await _commit_and_invalidate(db)
    return "deactivated" if referenced else "deleted"


# ----------------------------------------------------------------------------- packages
async def _get_package(db: AsyncSession, hp: HospitalProcedure, package_id: uuid.UUID) -> TreatmentPackage:
    pkg = (
        await db.execute(
            select(TreatmentPackage).where(
                TreatmentPackage.id == package_id, TreatmentPackage.hospital_procedure_id == hp.id
            )
        )
    ).scalar_one_or_none()
    if pkg is None:
        raise NotFound("Package not found")
    return pkg


async def list_packages(db: AsyncSession, ctx: PortalContext, hp_id: uuid.UUID) -> list[PackageOut]:
    hp = await _get_hp(db, ctx, hp_id)
    rows = (
        await db.execute(
            select(TreatmentPackage)
            .where(TreatmentPackage.hospital_procedure_id == hp.id)
            .order_by(TreatmentPackage.price_minor, TreatmentPackage.name, TreatmentPackage.id)
        )
    ).scalars()
    return [catalog.package_out(p) for p in rows]


def _check_original_price(price: int, original: int | None) -> None:
    if original is not None and original < price:
        raise BadRequest(
            "original_price_minor must be at least price_minor",
            code="invalid_price",
            details={"price_minor": price},
        )


async def create_package(
    db: AsyncSession, ctx: PortalContext, hp_id: uuid.UUID, body: PackageIn, request: Request | None = None
) -> PackageOut:
    ctx.require(CATALOG_ROLES)
    hp = await _get_hp(db, ctx, hp_id)
    _check_original_price(body.price_minor, body.original_price_minor)
    pkg = TreatmentPackage(
        hospital_procedure_id=hp.id,
        name=body.name,
        tier=body.tier,
        price_minor=body.price_minor,
        original_price_minor=body.original_price_minor,
        currency=_pricing_currency(body.currency),
        description=body.description,
        includes=body.includes.as_dict() if body.includes else {},
        is_active=True if body.is_active is None else body.is_active,
    )
    db.add(pkg)
    await db.flush()
    await audit_log(
        db,
        actor=ctx.user,
        action="hospital.package_create",
        entity_type="treatment_package",
        entity_id=pkg.id,
        after={"hospital_procedure_id": str(hp.id), "tier": body.tier.value, "price_minor": body.price_minor},
        request=request,
    )
    await _commit_and_invalidate(db)
    await db.refresh(pkg)
    return catalog.package_out(pkg)


async def update_package(
    db: AsyncSession,
    ctx: PortalContext,
    hp_id: uuid.UUID,
    package_id: uuid.UUID,
    body: PackageUpdateIn,
    request: Request | None = None,
) -> PackageOut:
    ctx.require(CATALOG_ROLES)
    hp = await _get_hp(db, ctx, hp_id)
    pkg = await _get_package(db, hp, package_id)
    data = body.model_dump(exclude_unset=True)
    for key in ("name", "tier", "price_minor", "currency", "is_active"):
        if key in data and data[key] is None:
            raise BadRequest(f"'{key}' cannot be null", code="invalid_package")
    if "currency" in data:
        data["currency"] = _pricing_currency(data["currency"])
    if "includes" in data:
        data["includes"] = body.includes.as_dict() if body.includes else {}
    _check_original_price(
        data.get("price_minor", pkg.price_minor), data.get("original_price_minor", pkg.original_price_minor)
    )
    before = {"price_minor": pkg.price_minor, "is_active": pkg.is_active}
    changed = []
    for key, value in data.items():
        if getattr(pkg, key) != value:
            setattr(pkg, key, value)
            changed.append(key)
    if changed:
        await audit_log(
            db,
            actor=ctx.user,
            action="hospital.package_update",
            entity_type="treatment_package",
            entity_id=pkg.id,
            before=before,
            after={"changed": sorted(changed), "price_minor": pkg.price_minor, "is_active": pkg.is_active},
            request=request,
        )
        await _commit_and_invalidate(db)
        await db.refresh(pkg)
    return catalog.package_out(pkg)


async def delete_package(
    db: AsyncSession,
    ctx: PortalContext,
    hp_id: uuid.UUID,
    package_id: uuid.UUID,
    request: Request | None = None,
) -> str:
    ctx.require(CATALOG_ROLES)
    hp = await _get_hp(db, ctx, hp_id)
    pkg = await _get_package(db, hp, package_id)
    referenced = await _packages_referenced(db, [pkg.id])
    await audit_log(
        db,
        actor=ctx.user,
        action="hospital.package_deactivate" if referenced else "hospital.package_delete",
        entity_type="treatment_package",
        entity_id=pkg.id,
        before={"name": pkg.name, "price_minor": pkg.price_minor, "is_active": pkg.is_active},
        request=request,
    )
    if referenced:
        pkg.is_active = False
    else:
        await db.delete(pkg)
    await _commit_and_invalidate(db)
    return "deactivated" if referenced else "deleted"


# ----------------------------------------------------------------------------- reviews & ratings
async def list_reviews(
    db: AsyncSession, ctx: PortalContext, status: ReviewStatus | None = None
) -> list[ReviewOut]:
    stmt = select(Review).where(Review.hospital_id == ctx.hospital_id)
    if status is not None:
        stmt = stmt.where(Review.status == status)
    rows = list((await db.execute(stmt.order_by(Review.created_at.desc(), Review.id).limit(500))).scalars())
    return await catalog.review_outs(db, rows)


def _avg(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


async def recompute_ratings(db: AsyncSession, hospital_ids: Sequence[uuid.UUID] | None = None) -> int:
    """Refresh rating_avg/rating_count of hospitals (and their doctors) that have reviews, from *published*
    reviews only. Hospitals/doctors without any review keep their curated values. Does not commit.
    Returns the number of hospitals updated."""
    scope = select(Review.hospital_id).distinct()
    if hospital_ids is not None:
        if not hospital_ids:
            return 0
        scope = scope.where(Review.hospital_id.in_(list(hospital_ids)))
    targets = list((await db.execute(scope)).scalars())
    if not targets:
        return 0
    published = Review.status == ReviewStatus.PUBLISHED
    h_stats: dict[uuid.UUID, tuple[Any, int]] = {
        hid: (avg, int(cnt))
        for hid, avg, cnt in (
            await db.execute(
                select(Review.hospital_id, func.avg(Review.rating), func.count(Review.id))
                .where(Review.hospital_id.in_(targets), published)
                .group_by(Review.hospital_id)
            )
        ).all()
    }
    for hid in targets:
        avg, cnt = h_stats.get(hid, (None, 0))
        await db.execute(
            update(Hospital)
            .where(Hospital.id == hid)
            .values(rating_avg=_avg(avg), rating_count=cnt)
            .execution_options(synchronize_session=False)
        )
    doctor_targets: list[uuid.UUID] = [
        did
        for did in (
            await db.execute(
                select(Review.doctor_id)
                .where(Review.hospital_id.in_(targets), Review.doctor_id.is_not(None))
                .distinct()
            )
        ).scalars()
        if did is not None
    ]
    if doctor_targets:
        d_stats: dict[uuid.UUID, tuple[Any, int]] = defaultdict(lambda: (None, 0))
        for did, avg, cnt in (
            await db.execute(
                select(Review.doctor_id, func.avg(Review.rating), func.count(Review.id))
                .where(Review.doctor_id.in_(doctor_targets), published)
                .group_by(Review.doctor_id)
            )
        ).all():
            d_stats[did] = (avg, int(cnt))
        for did in doctor_targets:
            avg, cnt = d_stats[did]
            await db.execute(
                update(Doctor)
                .where(Doctor.id == did)
                .values(rating_avg=_avg(avg), rating_count=cnt)
                .execution_options(synchronize_session=False)
            )
    return len(targets)


__all__ = [
    "create_doctor",
    "create_package",
    "create_procedure",
    "delete_doctor",
    "delete_package",
    "delete_procedure",
    "doctor_admin_outs",
    "get_availability",
    "get_doctor",
    "get_member",
    "get_procedure",
    "get_profile",
    "invite_member",
    "list_doctors",
    "list_members",
    "list_packages",
    "list_procedures",
    "list_reviews",
    "profile_out",
    "recompute_ratings",
    "remove_member",
    "set_availability",
    "set_specialties",
    "submit_for_review",
    "update_doctor",
    "update_member",
    "update_package",
    "update_procedure",
    "update_profile",
]
