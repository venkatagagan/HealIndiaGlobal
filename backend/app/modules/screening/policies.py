"""Resource scoping for screenings (PLAN 9.1): patients see their own, agents the patients they manage or
referred, staff everything. Out-of-scope ids are reported as 404."""

from __future__ import annotations

import uuid

from sqlalchemy import ColumnElement, false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import is_staff
from app.core.enums import UserRole
from app.core.errors import BadRequest, Forbidden, NotFound
from app.models import Agent, Case, HospitalMember, PatientProfile, Screening, User


def _role(user: User) -> str:
    return str(getattr(user.role, "value", user.role))


async def agent_for_user(db: AsyncSession, user: User) -> Agent | None:
    return (await db.execute(select(Agent).where(Agent.user_id == user.id))).scalar_one_or_none()


def _agent_patient_clause(agent_id: uuid.UUID) -> ColumnElement[bool]:
    return or_(
        PatientProfile.managed_by_agent_id == agent_id, PatientProfile.referred_by_agent_id == agent_id
    )


async def own_patient_profile(db: AsyncSession, user: User, *, create: bool) -> PatientProfile | None:
    """The patient's own profile. A patient account without a profile (e.g. a fresh guest) gets a minimal one
    when ``create`` is set, so the questionnaire can start immediately."""
    profile = (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()
    if profile is None and create:
        first, _, last = (user.full_name or "").strip().partition(" ")
        profile = PatientProfile(
            user_id=user.id,
            first_name=first[:100],
            last_name=last[:100],
            country_of_residence=user.country_code,
        )
        db.add(profile)
        await db.flush()
    return profile


async def resolve_patient_for_create(
    db: AsyncSession, user: User, patient_id: uuid.UUID | None
) -> PatientProfile:
    """Which patient a new screening is for: the patient themself, or ``patient_id`` for agents (their own
    patients only) and staff."""
    role = _role(user)
    if role == UserRole.PATIENT.value:
        if patient_id is not None:
            own = await own_patient_profile(db, user, create=False)
            if own is None or own.id != patient_id:
                raise NotFound("Patient not found")
        profile = await own_patient_profile(db, user, create=True)
        if profile is None:  # pragma: no cover - create=True always returns a profile
            raise NotFound("Patient not found")
        return profile
    if role == UserRole.AGENT.value:
        if patient_id is None:
            raise BadRequest("patient_id is required for agents", code="patient_required")
        agent = await agent_for_user(db, user)
        if agent is None:
            raise NotFound("Patient not found")
        profile = (
            await db.execute(
                select(PatientProfile).where(PatientProfile.id == patient_id, _agent_patient_clause(agent.id))
            )
        ).scalar_one_or_none()
        if profile is None:
            raise NotFound("Patient not found")
        return profile
    if is_staff(user):
        if patient_id is None:
            raise BadRequest("patient_id is required", code="patient_required")
        profile = await db.get(PatientProfile, patient_id)
        if profile is None:
            raise NotFound("Patient not found")
        return profile
    raise Forbidden("Only patients and agents can start a screening")


async def scope_clause(db: AsyncSession, user: User) -> ColumnElement[bool] | None:
    """WHERE clause limiting ``Screening`` rows (joined with ``PatientProfile``) to what ``user`` may see.
    ``None`` means unrestricted (staff)."""
    if is_staff(user):
        return None
    role = _role(user)
    if role == UserRole.PATIENT.value:
        return PatientProfile.user_id == user.id
    if role == UserRole.AGENT.value:
        agent = await agent_for_user(db, user)
        return _agent_patient_clause(agent.id) if agent is not None else false()
    if role == UserRole.HOSPITAL.value:
        # Read-only: screenings attached to a case at one of the member's hospitals.
        linked = (
            select(Case.screening_id)
            .join(HospitalMember, HospitalMember.hospital_id == Case.hospital_id)
            .where(HospitalMember.user_id == user.id, Case.screening_id.is_not(None))
        )
        return Screening.id.in_(linked)
    return false()


async def get_screening_scoped(
    db: AsyncSession, user: User, screening_id: uuid.UUID, *, for_update: bool = False
) -> tuple[Screening, PatientProfile]:
    stmt = (
        select(Screening, PatientProfile)
        .join(PatientProfile, PatientProfile.id == Screening.patient_id)
        .where(Screening.id == screening_id)
    )
    clause = await scope_clause(db, user)
    if clause is not None:
        stmt = stmt.where(clause)
    if for_update:
        stmt = stmt.with_for_update(of=Screening)
    row = (await db.execute(stmt)).first()
    if row is None:
        raise NotFound("Screening not found")
    return row[0], row[1]


def ensure_can_modify(user: User) -> None:
    """Writes are for the patient, their agent and (via super_admin/admin/support) staff on their behalf."""
    role = _role(user)
    if role in (UserRole.PATIENT.value, UserRole.AGENT.value) or is_staff(user):
        if role == UserRole.FINANCE.value:
            raise Forbidden("Finance users cannot modify screenings")
        return
    raise Forbidden("You cannot modify screenings")
