"""Admin console services (PLAN 8.13): users & staff, hospital/agent approvals, settings, audit logs.

Catalog CRUD lives in ``catalog_admin.py``; dashboard, reports and CSV exports in ``reports.py``.
Every state change writes an audit log and commits here (routers stay thin).
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, date, datetime, time, timedelta, timezone
from typing import Any, cast

from fastapi import Request
from sqlalchemy import Select, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.crypto import mask
from app.core.deps import STAFF_ROLES, PageQuery, get_client_ip, get_user_agent, has_role
from app.core.enums import (
    AgentStatus,
    DocumentKind,
    HospitalStatus,
    KycStatus,
    UserRole,
    UserStatus,
)
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.events import publish
from app.core.pagination import Page, paginate
from app.core.security import hash_password, validate_password_strength
from app.core.settings_store import DEFAULTS, FINANCE_KEYS, SUPER_ADMIN_KEYS, set_setting
from app.core.site_settings import merged_value
from app.models import (
    Agent,
    AuditLog,
    Booking,
    Case,
    Doctor,
    Document,
    Hospital,
    HospitalMember,
    HospitalSpecialty,
    PatientProfile,
    PayoutAccount,
    PlatformSetting,
    RefreshToken,
    Specialty,
    User,
)
from app.modules.admin import listing
from app.modules.admin.schemas import (
    AdminAgentOut,
    AdminAgentUpdateIn,
    AdminDoctorOut,
    AdminHospitalDetail,
    AdminHospitalUpdateIn,
    AdminUserDetail,
    AdminUserOut,
    AdminUserUpdateIn,
    AgentSummary,
    AuditLogOut,
    HospitalMemberOut,
    HospitalMembershipSummary,
    HospitalProfileOut,
    PatientProfileSummary,
    PayoutAccountOut,
    PlatformSettingOut,
    StaffCreateIn,
    StaffMemberOut,
)
from app.modules.auth.schemas import UserHospitalRef
from app.modules.catalog.councils import council_name, is_valid_council
from app.modules.catalog.service import build_hospital_cards, invalidate_catalog_cache
from app.modules.documents.schemas import DocumentOut

STAFF_ROLE_VALUES = frozenset(r.value for r in STAFF_ROLES)
# SEC-013: roles only a super_admin may hand out (money and staff administration).
_PRIVILEGED_GRANTS = frozenset({UserRole.FINANCE.value, UserRole.ADMIN.value})
KYC_DOCUMENT_KINDS = (
    DocumentKind.KYC_REGISTRATION,
    DocumentKind.KYC_ACCREDITATION,
    DocumentKind.KYC_PAN,
    DocumentKind.KYC_GST,
    DocumentKind.KYC_ID_PROOF,
    DocumentKind.BANK_PROOF,
)


# ------------------------------------------------------------------------------------------------ helpers
def ev(value: Any) -> str:
    """Enum (or plain string) -> its string value."""
    return str(getattr(value, "value", value))


def like_pattern(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _as_list(value: Any) -> list[Any] | None:
    """Single enum value or a sequence of them -> list (``None``/empty -> ``None``)."""
    if value is None:
        return None
    if isinstance(value, str):
        return [value]
    return list(value) or None


def clean_term(q: str | None) -> str | None:
    term = " ".join((q or "").split())[:100]
    return term or None


def utcnow() -> datetime:
    return datetime.now(UTC)


IST = timezone(timedelta(hours=5, minutes=30), "IST")


def day_bounds(date_from: date | None, date_to: date | None) -> tuple[datetime | None, datetime | None]:
    """Inclusive IST date range -> ``[start, end)`` aware datetimes."""
    start = datetime.combine(date_from, time.min, tzinfo=IST) if date_from else None
    end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=IST) if date_to else None
    if start and end and start >= end:
        raise BadRequest("'from' must be on or before 'to'", code="invalid_date_range")
    return start, end


async def _lock(db: AsyncSession, model: type[Any], obj_id: uuid.UUID, label: str) -> Any:
    obj = (await db.execute(select(model).where(model.id == obj_id).with_for_update())).scalar_one_or_none()
    if obj is None:
        raise NotFound(f"{label} not found")
    return obj


async def _names_for(db: AsyncSession, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    ids = {u for u in user_ids if u is not None}
    if not ids:
        return {}
    rows = await db.execute(select(User.id, User.full_name, User.email).where(User.id.in_(ids)))
    return {r[0]: (r[1] or r[2] or "") for r in rows.all()}


async def documents_out(db: AsyncSession, docs: Sequence[Document]) -> list[DocumentOut]:
    names = await _names_for(db, {d.owner_user_id for d in docs})
    return [
        DocumentOut(
            id=d.id,
            kind=d.kind,
            file_name=d.file_name,
            content_type=d.content_type,
            size_bytes=d.size_bytes,
            status=d.status,
            case_id=d.case_id,
            patient_id=d.patient_id,
            hospital_id=d.hospital_id,
            agent_id=d.agent_id,
            owner_user_id=d.owner_user_id,
            uploaded_by_name=names.get(d.owner_user_id),
            verified_at=d.verified_at,
            created_at=d.created_at,
        )
        for d in docs
    ]


# ----------------------------------------------------------------------------------------------------- users
async def _admin_user_outs(db: AsyncSession, users: Sequence[User]) -> list[AdminUserOut]:
    """Batch-build ``AdminUserOut`` (3 extra queries at most, no N+1)."""
    if not users:
        return []
    ids = [u.id for u in users]
    profiles = dict(
        (
            await db.execute(
                select(PatientProfile.user_id, PatientProfile.id).where(PatientProfile.user_id.in_(ids))
            )
        ).all()
    )
    agents = dict((await db.execute(select(Agent.user_id, Agent.id).where(Agent.user_id.in_(ids)))).all())
    memberships: dict[uuid.UUID, list[UserHospitalRef]] = defaultdict(list)
    rows = await db.execute(
        select(HospitalMember.user_id, Hospital.id, Hospital.name, Hospital.slug, HospitalMember.member_role)
        .join(Hospital, Hospital.id == HospitalMember.hospital_id)
        .where(HospitalMember.user_id.in_(ids))
        .order_by(HospitalMember.created_at, Hospital.id)
    )
    for user_id, hid, name, slug, member_role in rows.all():
        memberships[user_id].append(UserHospitalRef(id=hid, name=name, slug=slug, member_role=member_role))
    return [
        AdminUserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            status=u.status,
            phone=u.phone,
            country_code=u.country_code,
            preferred_language=u.preferred_language,
            avatar_url=u.avatar_url,
            is_guest=u.is_guest,
            email_verified=u.email_verified_at is not None,
            mfa_enabled=u.mfa_enabled,
            created_at=u.created_at,
            patient_profile_id=profiles.get(u.id),
            agent_id=agents.get(u.id),
            hospitals=memberships.get(u.id, []),
            last_login_at=u.last_login_at,
            locked_until=u.locked_until,
            failed_login_count=u.failed_login_count,
            deleted_at=u.deleted_at,
            updated_at=u.updated_at,
        )
        for u in users
    ]


async def list_users(
    db: AsyncSession,
    params: PageQuery,
    *,
    role: UserRole | Sequence[UserRole] | None = None,
    status: UserStatus | Sequence[UserStatus] | None = None,
    q: str | None = None,
    sort: str | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
    **filters: Any,
) -> Page[AdminUserOut]:
    """Users filtered by :func:`listing.apply_user_filters` (``role``/``status`` single or repeated)."""
    start, end = day_bounds(created_from, created_to)
    stmt = listing.apply_user_filters(
        select(User),
        role=_as_list(role),
        status=_as_list(status),
        q=q,
        created_from=start,
        created_to=end,
        **filters,
    )
    stmt = listing.order_users(stmt, sort)

    async def transform(rows: list[User]) -> list[AdminUserOut]:
        return await _admin_user_outs(db, rows)

    return await paginate(db, stmt, cast(Any, params), transform)


async def get_user_detail(db: AsyncSession, user_id: uuid.UUID) -> AdminUserDetail:
    user = await db.get(User, user_id)
    if user is None:
        raise NotFound("User not found")
    base = (await _admin_user_outs(db, [user]))[0]
    detail = AdminUserDetail(**base.model_dump())

    profile = (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()
    if profile is not None:
        cases_count = int(
            (await db.execute(select(func.count(Case.id)).where(Case.patient_id == profile.id))).scalar_one()
        )
        bookings_count = int(
            (
                await db.execute(select(func.count(Booking.id)).where(Booking.patient_id == profile.id))
            ).scalar_one()
        )
        detail.patient_profile = PatientProfileSummary(
            id=profile.id,
            first_name=profile.first_name,
            last_name=profile.last_name,
            date_of_birth=profile.date_of_birth,
            gender=ev(profile.gender) if profile.gender else None,
            nationality=profile.nationality,
            country_of_residence=profile.country_of_residence,
            phone=profile.phone,
            whatsapp=profile.whatsapp,
            passport_last4=profile.passport_last4,
            preferred_language=profile.preferred_language,
            preferred_currency=profile.preferred_currency,
            referred_by_agent_id=profile.referred_by_agent_id,
            managed_by_agent_id=profile.managed_by_agent_id,
            cases_count=cases_count,
            bookings_count=bookings_count,
            created_at=profile.created_at,
        )
    agent = (await db.execute(select(Agent).where(Agent.user_id == user.id))).scalar_one_or_none()
    if agent is not None:
        detail.agent = AgentSummary.model_validate(agent)
    rows = await db.execute(
        select(Hospital.id, Hospital.name, Hospital.slug, Hospital.status, HospitalMember.member_role)
        .join(HospitalMember, HospitalMember.hospital_id == Hospital.id)
        .where(HospitalMember.user_id == user.id)
        .order_by(HospitalMember.created_at, Hospital.id)
    )
    detail.hospital_memberships = [
        HospitalMembershipSummary(hospital_id=r[0], name=r[1], slug=r[2], status=r[3], member_role=r[4])
        for r in rows.all()
    ]
    detail.active_sessions = int(
        (
            await db.execute(
                select(func.count(RefreshToken.id)).where(
                    RefreshToken.user_id == user.id,
                    RefreshToken.revoked_at.is_(None),
                    RefreshToken.expires_at > func.now(),
                )
            )
        ).scalar_one()
    )
    return detail


async def _other_active_super_admins(db: AsyncSession, exclude_id: uuid.UUID) -> int:
    # Lock the super_admin rows so two concurrent demotions cannot both pass the check.
    rows = await db.execute(
        select(User.id)
        .where(
            User.role == UserRole.SUPER_ADMIN,
            User.status == UserStatus.ACTIVE,
            User.deleted_at.is_(None),
            User.id != exclude_id,
        )
        .with_for_update()
    )
    return len(rows.all())


async def _revoke_sessions(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=func.now())
        .execution_options(synchronize_session=False)
    )
    return int(getattr(result, "rowcount", 0) or 0)


async def update_user(
    db: AsyncSession, actor: User, user_id: uuid.UUID, body: AdminUserUpdateIn, request: Request | None
) -> AdminUserDetail:
    target: User = await _lock(db, User, user_id, "User")
    before = {"role": ev(target.role), "status": ev(target.status)}
    new_role = ev(body.role) if body.role is not None else before["role"]
    new_status = ev(body.status) if body.status is not None else before["status"]
    role_changes = new_role != before["role"]
    status_changes = new_status != before["status"]
    if not role_changes and not status_changes:
        return await get_user_detail(db, user_id)

    actor_is_super = ev(actor.role) == UserRole.SUPER_ADMIN.value
    if UserRole.SUPER_ADMIN.value in (before["role"], new_role) and not actor_is_super:
        raise Forbidden("Only a super_admin can change super_admin accounts", code="super_admin_required")
    if role_changes and not (before["role"] in STAFF_ROLE_VALUES and new_role in STAFF_ROLE_VALUES):
        raise BadRequest(
            "Roles can only be changed between staff roles (admin, finance, support, super_admin)",
            code="invalid_role_change",
        )
    if role_changes and new_role in _PRIVILEGED_GRANTS and not actor_is_super:
        # SEC-013: an ops admin must not be able to create a finance user or a peer admin.
        raise Forbidden("Only a super_admin can grant the finance or admin role", code="super_admin_required")

    removes_super_admin = before["role"] == UserRole.SUPER_ADMIN.value and (
        new_role != UserRole.SUPER_ADMIN.value or new_status != UserStatus.ACTIVE.value
    )
    if removes_super_admin and await _other_active_super_admins(db, target.id) == 0:
        raise Conflict(
            "The last active super_admin cannot be demoted or deactivated", code="last_super_admin"
        )
    if target.id == actor.id:
        if role_changes:
            raise BadRequest("You cannot change your own role", code="self_role_change")
        raise BadRequest("You cannot change your own account status", code="self_status_change")

    if role_changes:
        target.role = UserRole(new_role)
    if status_changes:
        target.status = UserStatus(new_status)
        if new_status == UserStatus.DELETED.value:
            target.deleted_at = utcnow()
        elif target.deleted_at is not None:
            target.deleted_at = None
        if new_status == UserStatus.ACTIVE.value:
            target.locked_until = None
            target.failed_login_count = 0
    revoked = 0
    if role_changes or new_status in (UserStatus.SUSPENDED.value, UserStatus.DELETED.value):
        # Access tokens carry the role claim and refresh tokens would mint new ones: force a fresh sign-in.
        revoked = await _revoke_sessions(db, target.id)
    after = {"role": new_role, "status": new_status}
    action = "user.role_change" if role_changes else "user.status_change"
    if role_changes and status_changes:
        action = "user.role_status_change"
    await audit_log(
        db,
        actor=actor,
        action=action,
        entity_type="user",
        entity_id=target.id,
        before=before,
        after={**after, "sessions_revoked": revoked},
        request=request,
    )
    await db.commit()
    return await get_user_detail(db, user_id)


async def create_staff(
    db: AsyncSession, actor: User, body: StaffCreateIn, request: Request | None
) -> AdminUserOut:
    role = ev(body.role)
    if role not in STAFF_ROLE_VALUES:
        raise BadRequest("Only staff roles can be created here", code="invalid_role")
    if role == UserRole.SUPER_ADMIN.value and ev(actor.role) != UserRole.SUPER_ADMIN.value:
        raise Forbidden("Only a super_admin can create super_admin accounts", code="super_admin_required")
    if role in _PRIVILEGED_GRANTS and ev(actor.role) != UserRole.SUPER_ADMIN.value:
        raise Forbidden(
            "Only a super_admin can create finance or admin accounts", code="super_admin_required"
        )
    validate_password_strength(body.password)
    email = str(body.email).strip().lower()
    if (await db.execute(select(User.id).where(User.email == email))).first() is not None:
        raise Conflict("A user with this email already exists", code="email_taken")
    user = User(
        email=email,
        full_name=" ".join(body.full_name.split()),
        phone=body.phone or None,
        role=UserRole(role),
        status=UserStatus.ACTIVE,
        password_hash=hash_password(body.password),
        email_verified_at=utcnow(),
        is_guest=False,
    )
    db.add(user)
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="user.staff_create",
        entity_type="user",
        entity_id=user.id,
        after={"email": email, "role": role, "full_name": user.full_name},
        request=request,
    )
    await db.commit()
    await db.refresh(user)
    return (await _admin_user_outs(db, [user]))[0]


async def list_staff(db: AsyncSession, role: UserRole | None = None) -> list[StaffMemberOut]:
    roles = [role] if role is not None else list(STAFF_ROLES)
    if role is not None and ev(role) not in STAFF_ROLE_VALUES:
        return []
    rows = await db.execute(
        select(User)
        .where(User.role.in_(roles), User.status == UserStatus.ACTIVE, User.deleted_at.is_(None))
        .order_by(func.lower(User.full_name), User.id)
        .limit(500)
    )
    return [
        StaffMemberOut(id=u.id, full_name=u.full_name, email=u.email, role=u.role, phone=u.phone)
        for u in rows.scalars().all()
    ]


# ------------------------------------------------------------------------------------------------- hospitals
def _float(value: Any) -> float | None:
    return None if value is None else float(value)


async def _hospital_profiles(db: AsyncSession, hospitals: Sequence[Hospital]) -> list[HospitalProfileOut]:
    if not hospitals:
        return []
    cards = await build_hospital_cards(db, hospitals)
    spec_ids: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    rows = await db.execute(
        select(HospitalSpecialty.hospital_id, HospitalSpecialty.specialty_id).where(
            HospitalSpecialty.hospital_id.in_([h.id for h in hospitals])
        )
    )
    for hid, sid in rows.all():
        spec_ids[hid].append(sid)
    out: list[HospitalProfileOut] = []
    for h, card in zip(hospitals, cards, strict=True):
        pan = h.pan
        out.append(
            HospitalProfileOut(
                **card.model_dump(),
                legal_name=h.legal_name,
                description=h.description,
                country=h.country,
                address=h.address,
                pincode=h.pincode,
                lat=h.lat,
                lng=h.lng,
                phone=h.phone,
                email=h.email,
                website=h.website,
                established_year=h.established_year,
                bed_count=h.bed_count,
                airport_distance_km=_float(h.airport_distance_km),
                status=h.status,
                kyc_status=h.kyc_status,
                gstin=h.gstin,
                pan_last4=pan[-4:] if pan else None,
                commission_rate_bps=h.commission_rate_bps,
                settlement_cycle_days=h.settlement_cycle_days,
                is_featured=h.is_featured,
                approved_at=h.approved_at,
                approved_by=h.approved_by,
                rejection_reason=h.rejection_reason,
                specialty_ids=sorted(spec_ids.get(h.id, []), key=str),
                created_at=h.created_at,
                updated_at=h.updated_at,
            )
        )
    return out


async def list_hospitals(
    db: AsyncSession,
    params: PageQuery,
    *,
    status: HospitalStatus | Sequence[HospitalStatus] | None = None,
    q: str | None = None,
    sort: str | None = None,
    **filters: Any,
) -> Page[HospitalProfileOut]:
    """Hospitals filtered by :func:`listing.apply_hospital_filters`; without ``sort`` the approval queue
    (pending review) comes first, then the rest newest first."""
    stmt = listing.apply_hospital_filters(select(Hospital), status=_as_list(status), q=q, **filters)
    stmt = listing.order_hospitals(stmt, sort)

    async def transform(rows: list[Hospital]) -> list[HospitalProfileOut]:
        return await _hospital_profiles(db, rows)

    return await paginate(db, stmt, cast(Any, params), transform)


def _payout_out(a: PayoutAccount) -> PayoutAccountOut:
    return PayoutAccountOut(
        id=a.id,
        owner_type=ev(a.owner_type),
        owner_id=a.owner_id,
        account_holder_name=a.account_holder_name,
        account_number_masked=mask("*" * 8 + a.account_number_last4) if a.account_number_last4 else "",
        ifsc=a.ifsc,
        bank_name=a.bank_name,
        swift=a.swift,
        razorpay_linked_account_id=a.razorpay_linked_account_id,
        is_verified=a.is_verified,
        is_primary=a.is_primary,
        status=ev(a.status),
    )


async def get_hospital_detail(db: AsyncSession, hospital_id: uuid.UUID) -> AdminHospitalDetail:
    hospital = await db.get(Hospital, hospital_id)
    if hospital is None:
        raise NotFound("Hospital not found")
    profile = (await _hospital_profiles(db, [hospital]))[0]
    docs = (
        (
            await db.execute(
                select(Document)
                .where(
                    Document.hospital_id == hospital.id,
                    Document.deleted_at.is_(None),
                    Document.kind.in_(KYC_DOCUMENT_KINDS),
                )
                .order_by(Document.created_at.desc(), Document.id)
            )
        )
        .scalars()
        .all()
    )
    members = await db.execute(
        select(HospitalMember, User)
        .join(User, User.id == HospitalMember.user_id)
        .where(HospitalMember.hospital_id == hospital.id)
        .order_by(HospitalMember.created_at, HospitalMember.id)
    )
    accounts = (
        (
            await db.execute(
                select(PayoutAccount)
                .where(PayoutAccount.owner_type == "hospital", PayoutAccount.owner_id == hospital.id)
                .order_by(PayoutAccount.is_primary.desc(), PayoutAccount.created_at)
            )
        )
        .scalars()
        .all()
    )
    doctor_rows = (
        await db.execute(
            select(Doctor, Specialty.name)
            .outerjoin(Specialty, Specialty.id == Doctor.specialty_id)
            .where(Doctor.hospital_id == hospital.id)
            .order_by(Doctor.is_active.desc(), Doctor.full_name, Doctor.id)
        )
    ).all()
    doctors = [_admin_doctor_out(d, spec_name) for d, spec_name in doctor_rows]
    missing = sum(
        1
        for d in doctors
        if d.is_active and not (d.registration_number and is_valid_council(d.registration_council))
    )
    warnings = (
        [f"{missing} active doctor(s) have no medical registration number/council on file"] if missing else []
    )
    cases_count = (
        await db.execute(select(func.count(Case.id)).where(Case.hospital_id == hospital.id))
    ).scalar_one()
    return AdminHospitalDetail(
        **profile.model_dump(),
        kyc_documents=await documents_out(db, docs),
        members=[
            HospitalMemberOut(
                id=m.id,
                hospital_id=m.hospital_id,
                user_id=u.id,
                email=u.email,
                full_name=u.full_name,
                member_role=m.member_role,
                status=u.status,
                created_at=m.created_at,
            )
            for m, u in members.all()
        ],
        payout_accounts=[_payout_out(a) for a in accounts],
        doctors_count=len(doctors),
        cases_count=int(cases_count),
        doctors=doctors,
        doctors_missing_registration=missing,
        warnings=warnings,
    )


def _admin_doctor_out(d: Doctor, specialty_name: str | None) -> AdminDoctorOut:
    return AdminDoctorOut(
        id=d.id,
        slug=d.slug,
        full_name=d.full_name,
        specialty_name=specialty_name,
        qualifications=list(d.qualifications or []),
        experience_years=d.experience_years,
        is_active=d.is_active,
        registration_number=d.registration_number,
        registration_council=d.registration_council,
        registration_council_name=council_name(d.registration_council),
        registration_verified=d.registration_verified_at is not None,
        registration_verified_at=d.registration_verified_at,
        registration_verified_by_user_id=d.registration_verified_by_user_id,
    )


def _registration_snapshot(d: Doctor) -> dict[str, Any]:
    verified_at, verified_by = d.registration_verified_at, d.registration_verified_by_user_id
    return {
        "registration_number": d.registration_number,
        "registration_council": d.registration_council,
        "registration_verified_at": verified_at.isoformat() if verified_at else None,
        "registration_verified_by_user_id": str(verified_by) if verified_by else None,
    }


async def set_doctor_registration_verified(
    db: AsyncSession, actor: User, doctor_id: uuid.UUID, *, verified: bool, request: Request | None
) -> AdminDoctorOut:
    """An admin confirms (or withdraws) that the doctor's number is on the NMC / state council register."""
    doctor: Doctor = await _lock(db, Doctor, doctor_id, "Doctor")
    if verified and not (doctor.registration_number and is_valid_council(doctor.registration_council)):
        raise BadRequest(
            "The doctor has no registration number and council to verify",
            code="registration_missing",
        )
    before = _registration_snapshot(doctor)
    if verified:
        doctor.registration_verified_at = utcnow()
        doctor.registration_verified_by_user_id = actor.id
    else:
        doctor.registration_verified_at = None
        doctor.registration_verified_by_user_id = None
    await audit_log(
        db,
        actor=actor,
        action="doctor.registration_verify" if verified else "doctor.registration_unverify",
        entity_type="doctor",
        entity_id=doctor.id,
        before=before,
        after=_registration_snapshot(doctor),
        request=request,
    )
    await db.commit()
    await invalidate_catalog_cache()
    await db.refresh(doctor)
    specialty_name = (
        await db.execute(select(Specialty.name).where(Specialty.id == doctor.specialty_id))
    ).scalar_one_or_none()
    return _admin_doctor_out(doctor, specialty_name)


def _hospital_snapshot(h: Hospital) -> dict[str, Any]:
    return {
        "status": ev(h.status),
        "kyc_status": ev(h.kyc_status),
        "commission_rate_bps": h.commission_rate_bps,
        "settlement_cycle_days": h.settlement_cycle_days,
        "is_featured": h.is_featured,
        "rejection_reason": h.rejection_reason,
    }


async def _finish_hospital_change(
    db: AsyncSession,
    actor: User,
    hospital: Hospital,
    action: str,
    before: dict[str, Any],
    request: Request | None,
    event: tuple[str, dict[str, Any]] | None = None,
) -> AdminHospitalDetail:
    hospital_id = hospital.id
    await audit_log(
        db,
        actor=actor,
        action=action,
        entity_type="hospital",
        entity_id=hospital_id,
        before=before,
        after=_hospital_snapshot(hospital),
        request=request,
    )
    if event is not None:
        await publish(db, event[0], event[1])
    await db.commit()
    await invalidate_catalog_cache()
    return await get_hospital_detail(db, hospital_id)


async def approve_hospital(
    db: AsyncSession, actor: User, hospital_id: uuid.UUID, request: Request | None
) -> AdminHospitalDetail:
    hospital: Hospital = await _lock(db, Hospital, hospital_id, "Hospital")
    if hospital.status != HospitalStatus.PENDING_REVIEW:
        raise Conflict(
            "Only hospitals pending review can be approved",
            code="invalid_status",
            details={"status": ev(hospital.status)},
        )
    before = _hospital_snapshot(hospital)
    hospital.status = HospitalStatus.ACTIVE
    hospital.kyc_status = KycStatus.APPROVED
    hospital.approved_by = actor.id
    hospital.approved_at = utcnow()
    hospital.rejection_reason = None
    return await _finish_hospital_change(
        db,
        actor,
        hospital,
        "hospital.approve",
        before,
        request,
        ("hospital.approved", {"hospital_id": str(hospital.id)}),
    )


async def reject_hospital(
    db: AsyncSession, actor: User, hospital_id: uuid.UUID, reason: str, request: Request | None
) -> AdminHospitalDetail:
    hospital: Hospital = await _lock(db, Hospital, hospital_id, "Hospital")
    if hospital.status != HospitalStatus.PENDING_REVIEW:
        raise Conflict(
            "Only hospitals pending review can be rejected",
            code="invalid_status",
            details={"status": ev(hospital.status)},
        )
    before = _hospital_snapshot(hospital)
    hospital.status = HospitalStatus.REJECTED
    hospital.kyc_status = KycStatus.REJECTED
    hospital.rejection_reason = reason
    return await _finish_hospital_change(
        db,
        actor,
        hospital,
        "hospital.reject",
        before,
        request,
        ("hospital.rejected", {"hospital_id": str(hospital.id), "reason": reason}),
    )


async def suspend_hospital(
    db: AsyncSession, actor: User, hospital_id: uuid.UUID, reason: str | None, request: Request | None
) -> AdminHospitalDetail:
    hospital: Hospital = await _lock(db, Hospital, hospital_id, "Hospital")
    if hospital.status not in (HospitalStatus.ACTIVE, HospitalStatus.PENDING_REVIEW):
        raise Conflict(
            "Only active or pending hospitals can be suspended",
            code="invalid_status",
            details={"status": ev(hospital.status)},
        )
    before = _hospital_snapshot(hospital)
    hospital.status = HospitalStatus.SUSPENDED
    hospital.is_featured = False
    if reason:
        hospital.rejection_reason = reason
    return await _finish_hospital_change(db, actor, hospital, "hospital.suspend", before, request)


async def reinstate_hospital(
    db: AsyncSession, actor: User, hospital_id: uuid.UUID, request: Request | None
) -> AdminHospitalDetail:
    hospital: Hospital = await _lock(db, Hospital, hospital_id, "Hospital")
    if hospital.status != HospitalStatus.SUSPENDED:
        raise Conflict(
            "Only suspended hospitals can be reinstated",
            code="invalid_status",
            details={"status": ev(hospital.status)},
        )
    before = _hospital_snapshot(hospital)
    # A hospital that was suspended before its first approval goes back to the review queue.
    was_approved = hospital.approved_at is not None and hospital.kyc_status == KycStatus.APPROVED
    hospital.status = HospitalStatus.ACTIVE if was_approved else HospitalStatus.PENDING_REVIEW
    hospital.rejection_reason = None
    return await _finish_hospital_change(db, actor, hospital, "hospital.reinstate", before, request)


async def update_hospital(
    db: AsyncSession,
    actor: User,
    hospital_id: uuid.UUID,
    body: AdminHospitalUpdateIn,
    request: Request | None,
) -> AdminHospitalDetail:
    hospital: Hospital = await _lock(db, Hospital, hospital_id, "Hospital")
    before = _hospital_snapshot(hospital)
    for field in body.model_fields_set:
        setattr(hospital, field, getattr(body, field))
    return await _finish_hospital_change(db, actor, hospital, "hospital.update", before, request)


# ---------------------------------------------------------------------------------------------------- agents
async def _agent_outs(
    db: AsyncSession, agents: Sequence[Agent], with_docs: bool = False
) -> list[AdminAgentOut]:
    if not agents:
        return []
    ids = [a.id for a in agents]
    users = {
        u.id: u
        for u in (await db.execute(select(User).where(User.id.in_([a.user_id for a in agents])))).scalars()
    }
    counts = dict(
        (
            await db.execute(
                select(PatientProfile.managed_by_agent_id, func.count(PatientProfile.id))
                .where(PatientProfile.managed_by_agent_id.in_(ids))
                .group_by(PatientProfile.managed_by_agent_id)
            )
        ).all()
    )
    docs_by_agent: dict[uuid.UUID, list[Document]] = defaultdict(list)
    if with_docs:
        docs = (
            await db.execute(
                select(Document)
                .where(
                    Document.agent_id.in_(ids),
                    Document.deleted_at.is_(None),
                    Document.kind.in_(KYC_DOCUMENT_KINDS),
                )
                .order_by(Document.created_at.desc(), Document.id)
            )
        ).scalars()
        for d in docs:
            if d.agent_id is not None:
                docs_by_agent[d.agent_id].append(d)
    out: list[AdminAgentOut] = []
    for a in agents:
        u = users.get(a.user_id)
        out.append(
            AdminAgentOut(
                id=a.id,
                user_id=a.user_id,
                agency_name=a.agency_name,
                agent_code=a.agent_code,
                country=a.country,
                city=a.city,
                phone=a.phone,
                website=a.website,
                status=a.status,
                kyc_status=a.kyc_status,
                tier=a.tier,
                commission_rate_bps=a.commission_rate_bps,
                approved_at=a.approved_at,
                approved_by=a.approved_by,
                rejection_reason=a.rejection_reason,
                created_at=a.created_at,
                full_name=u.full_name if u else None,
                email=u.email if u else None,
                user_status=u.status if u else None,
                patients_count=int(counts.get(a.id, 0)),
                kyc_documents=await documents_out(db, docs_by_agent.get(a.id, [])) if with_docs else None,
            )
        )
    return out


async def list_agents(
    db: AsyncSession,
    params: PageQuery,
    *,
    status: AgentStatus | Sequence[AgentStatus] | None = None,
    q: str | None = None,
    sort: str | None = None,
    **filters: Any,
) -> Page[AdminAgentOut]:
    """Agents filtered by :func:`listing.apply_agent_filters`; without ``sort`` pending first."""
    stmt: Select[Any] = select(Agent).join(User, User.id == Agent.user_id)
    stmt = listing.apply_agent_filters(stmt, status=_as_list(status), q=q, **filters)
    stmt = listing.order_agents(stmt, sort)

    async def transform(rows: list[Agent]) -> list[AdminAgentOut]:
        return await _agent_outs(db, rows)

    return await paginate(db, stmt, cast(Any, params), transform)


async def get_agent(db: AsyncSession, agent_id: uuid.UUID) -> AdminAgentOut:
    agent = await db.get(Agent, agent_id)
    if agent is None:
        raise NotFound("Agent not found")
    return (await _agent_outs(db, [agent], with_docs=True))[0]


def _agent_snapshot(a: Agent) -> dict[str, Any]:
    return {
        "status": ev(a.status),
        "kyc_status": ev(a.kyc_status),
        "tier": ev(a.tier),
        "commission_rate_bps": a.commission_rate_bps,
        "rejection_reason": a.rejection_reason,
    }


async def _finish_agent_change(
    db: AsyncSession,
    actor: User,
    agent: Agent,
    action: str,
    before: dict[str, Any],
    request: Request | None,
    event: tuple[str, dict[str, Any]] | None = None,
) -> AdminAgentOut:
    agent_id = agent.id
    await audit_log(
        db,
        actor=actor,
        action=action,
        entity_type="agent",
        entity_id=agent_id,
        before=before,
        after=_agent_snapshot(agent),
        request=request,
    )
    if event is not None:
        await publish(db, event[0], event[1])
    await db.commit()
    return await get_agent(db, agent_id)


def _require_agent_status(agent: Agent, allowed: tuple[AgentStatus, ...], verb: str) -> None:
    if agent.status not in allowed:
        names = " or ".join(s.value for s in allowed)
        raise Conflict(
            f"Only {names} agents can be {verb}", code="invalid_status", details={"status": ev(agent.status)}
        )


async def approve_agent(
    db: AsyncSession, actor: User, agent_id: uuid.UUID, request: Request | None
) -> AdminAgentOut:
    agent: Agent = await _lock(db, Agent, agent_id, "Agent")
    _require_agent_status(agent, (AgentStatus.PENDING,), "approved")
    before = _agent_snapshot(agent)
    agent.status = AgentStatus.ACTIVE
    agent.kyc_status = KycStatus.APPROVED
    agent.approved_by = actor.id
    agent.approved_at = utcnow()
    agent.rejection_reason = None
    return await _finish_agent_change(
        db, actor, agent, "agent.approve", before, request, ("agent.approved", {"agent_id": str(agent.id)})
    )


async def reject_agent(
    db: AsyncSession, actor: User, agent_id: uuid.UUID, reason: str, request: Request | None
) -> AdminAgentOut:
    agent: Agent = await _lock(db, Agent, agent_id, "Agent")
    _require_agent_status(agent, (AgentStatus.PENDING,), "rejected")
    before = _agent_snapshot(agent)
    agent.status = AgentStatus.REJECTED
    agent.kyc_status = KycStatus.REJECTED
    agent.rejection_reason = reason
    return await _finish_agent_change(
        db,
        actor,
        agent,
        "agent.reject",
        before,
        request,
        ("agent.rejected", {"agent_id": str(agent.id), "reason": reason}),
    )


async def suspend_agent(
    db: AsyncSession, actor: User, agent_id: uuid.UUID, reason: str | None, request: Request | None
) -> AdminAgentOut:
    agent: Agent = await _lock(db, Agent, agent_id, "Agent")
    _require_agent_status(agent, (AgentStatus.ACTIVE, AgentStatus.PENDING), "suspended")
    before = _agent_snapshot(agent)
    agent.status = AgentStatus.SUSPENDED
    if reason:
        agent.rejection_reason = reason
    return await _finish_agent_change(db, actor, agent, "agent.suspend", before, request)


async def reinstate_agent(
    db: AsyncSession, actor: User, agent_id: uuid.UUID, request: Request | None
) -> AdminAgentOut:
    agent: Agent = await _lock(db, Agent, agent_id, "Agent")
    _require_agent_status(agent, (AgentStatus.SUSPENDED,), "reinstated")
    before = _agent_snapshot(agent)
    was_approved = agent.approved_at is not None and agent.kyc_status == KycStatus.APPROVED
    agent.status = AgentStatus.ACTIVE if was_approved else AgentStatus.PENDING
    agent.rejection_reason = None
    return await _finish_agent_change(db, actor, agent, "agent.reinstate", before, request)


async def update_agent(
    db: AsyncSession, actor: User, agent_id: uuid.UUID, body: AdminAgentUpdateIn, request: Request | None
) -> AdminAgentOut:
    agent: Agent = await _lock(db, Agent, agent_id, "Agent")
    before = _agent_snapshot(agent)
    for field in body.model_fields_set:
        setattr(agent, field, getattr(body, field))
    return await _finish_agent_change(db, actor, agent, "agent.update", before, request)


# -------------------------------------------------------------------------------------------------- settings
def is_finance_key(key: str) -> bool:
    return key in FINANCE_KEYS


def setting_group(key: str) -> str:
    """``finance`` (finance|super_admin), ``website`` (super_admin) or ``general`` (admin|super_admin)."""
    if key in FINANCE_KEYS:
        return "finance"
    if key in SUPER_ADMIN_KEYS:
        return "website"
    return "general"


async def list_settings(db: AsyncSession) -> list[PlatformSettingOut]:
    rows = {r.key: r for r in (await db.execute(select(PlatformSetting))).scalars().all()}
    names = await _names_for(db, {r.updated_by for r in rows.values() if r.updated_by})
    keys = list(DEFAULTS) + sorted(k for k in rows if k not in DEFAULTS)
    out: list[PlatformSettingOut] = []
    for key in keys:
        row = rows.get(key)
        out.append(
            PlatformSettingOut(
                key=key,
                value=(
                    merged_value(key, row.value)
                    if row is not None and key in SUPER_ADMIN_KEYS
                    else row.value
                    if row is not None
                    else DEFAULTS.get(key)
                ),
                updated_at=row.updated_at if row is not None else None,
                updated_by=row.updated_by if row is not None else None,
                updated_by_name=names.get(row.updated_by) if row is not None and row.updated_by else None,
                is_default=row is None,
                is_finance=is_finance_key(key),
                group=setting_group(key),
                super_admin_only=key in SUPER_ADMIN_KEYS,
            )
        )
    return out


async def update_setting(
    db: AsyncSession, actor: User, key: str, value: Any, request: Request | None
) -> PlatformSettingOut:
    if key not in DEFAULTS:
        raise NotFound("Unknown setting")
    if key in SUPER_ADMIN_KEYS:
        if ev(actor.role) != UserRole.SUPER_ADMIN.value:
            raise Forbidden(
                "Only a super admin can change website & contact settings", code="super_admin_required"
            )
    elif is_finance_key(key):
        if not has_role(actor, UserRole.FINANCE):
            raise Forbidden("Only finance can change financial settings", code="finance_required")
    elif not has_role(actor, UserRole.ADMIN):
        raise Forbidden("Only admins can change this setting", code="admin_required")
    if value is None:
        raise BadRequest(f"Setting '{key}' cannot be null", code="invalid_setting")
    await set_setting(db, key, value, actor=actor)
    if request is not None:
        # set_setting adds its own audit row (without request metadata): attach the console IP/UA to it.
        for obj in db.new:
            if isinstance(obj, AuditLog) and obj.entity_type == "platform_setting" and obj.entity_id == key:
                obj.ip = get_client_ip(request)
                obj.user_agent = get_user_agent(request)
    if key in SUPER_ADMIN_KEYS:
        # The public website reads these through GET /site-config (fetch tag "site"): refresh it on commit.
        from app.modules.catalog.revalidate import request_site_revalidation

        request_site_revalidation(db)
    await db.commit()
    return next(s for s in await list_settings(db) if s.key == key)


# ---------------------------------------------------------------------------------------------------- audit
async def list_audit_logs(
    db: AsyncSession,
    params: PageQuery,
    *,
    actor_user_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    action: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    actor_role: Sequence[str] | None = None,
) -> Page[AuditLogOut]:
    start, end = day_bounds(date_from, date_to)
    stmt = select(AuditLog, User.full_name).outerjoin(User, User.id == AuditLog.actor_user_id)
    stmt = listing.apply_audit_search(stmt, q=q, actor_role=actor_role)
    if actor_user_id is not None:
        stmt = stmt.where(AuditLog.actor_user_id == actor_user_id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type.strip())
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id.strip())
    if action:
        term = action.strip()
        if term.endswith("*"):
            prefix = term[:-1].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            stmt = stmt.where(AuditLog.action.like(f"{prefix}%", escape="\\"))
        else:
            stmt = stmt.where(AuditLog.action == term)
    if start is not None:
        stmt = stmt.where(AuditLog.created_at >= start)
    if end is not None:
        stmt = stmt.where(AuditLog.created_at < end)
    stmt = stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())

    def transform(rows: list[Any]) -> list[AuditLogOut]:
        return [
            AuditLogOut(
                id=log.id,
                actor_user_id=log.actor_user_id,
                actor_name=name,
                actor_role=log.actor_role,
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                ip=log.ip,
                user_agent=log.user_agent,
                before=log.before,
                after=log.after,
                created_at=log.created_at,
            )
            for log, name in rows
        ]

    return await paginate(db, cast(Any, stmt), cast(Any, params), transform, scalars=False)
