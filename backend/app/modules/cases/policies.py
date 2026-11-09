"""Resource scoping for cases and everything hanging off a case (bookings, quotes, consultations, travel).

PLAN 9.1: patients see their own cases; agents see cases they own (``cases.agent_id``) or cases of patients
they manage/referred; hospital users see cases of hospitals they are members of; staff see everything.
Out-of-scope ids raise ``NotFound`` (never ``Forbidden``) so ids cannot be probed.

    stmt = scope_cases(select(Case), user)
    case = await get_case_for_user(db, case_id, user)               # NotFound when out of scope
    stmt = select(Booking).where(case_in_scope(Booking.case_id, user))
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ColumnElement, Select, false, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import STAFF_ROLES, has_role, is_staff
from app.core.enums import AgentStatus, HospitalMemberRole, HospitalStatus, UserRole
from app.core.errors import Forbidden, NotFound
from app.models import Agent, Case, Hospital, HospitalMember, PatientProfile, User

# Hospital member roles allowed to act on cases (send quotes, admit, ...). ``finance`` is read-only here.
HOSPITAL_WRITE_ROLES: frozenset[HospitalMemberRole] = frozenset(
    {
        HospitalMemberRole.OWNER,
        HospitalMemberRole.ADMIN,
        HospitalMemberRole.COORDINATOR,
        HospitalMemberRole.DOCTOR,
    }
)
# Staff roles that perform operational (non-finance) actions on cases.
OPS_STAFF_ROLES: tuple[UserRole, ...] = (UserRole.ADMIN, UserRole.SUPPORT, UserRole.SUPER_ADMIN)


def role_of(user: User) -> str:
    return str(getattr(user.role, "value", user.role))


def is_patient(user: User) -> bool:
    return role_of(user) == UserRole.PATIENT.value


def is_agent(user: User) -> bool:
    return role_of(user) == UserRole.AGENT.value


def is_hospital_user(user: User) -> bool:
    return role_of(user) == UserRole.HOSPITAL.value


def is_ops_staff(user: User) -> bool:
    return has_role(user, *OPS_STAFF_ROLES)


def _agent_ids_subquery(user: User) -> Select[Any]:
    return select(Agent.id).where(Agent.user_id == user.id)


def _patient_ids_for_user(user: User) -> Select[Any]:
    return select(PatientProfile.id).where(PatientProfile.user_id == user.id)


def _patient_ids_for_agent(user: User) -> Select[Any]:
    agent_ids = _agent_ids_subquery(user)
    return select(PatientProfile.id).where(
        or_(
            PatientProfile.managed_by_agent_id.in_(agent_ids),
            PatientProfile.referred_by_agent_id.in_(agent_ids),
        )
    )


def _member_hospital_ids(user: User) -> Select[Any]:
    """Hospitals the user is a member of, minus suspended ones (SEC-014: a suspended hospital's members
    lose case access; members of several hospitals keep the others)."""
    return (
        select(HospitalMember.hospital_id)
        .join(Hospital, Hospital.id == HospitalMember.hospital_id)
        .where(HospitalMember.user_id == user.id, Hospital.status != HospitalStatus.SUSPENDED)
    )


def case_condition(user: User) -> ColumnElement[bool]:
    """WHERE condition over ``Case`` columns restricting rows to the user's scope."""
    if is_staff(user):
        return true()
    if is_patient(user):
        return Case.patient_id.in_(_patient_ids_for_user(user))
    if is_agent(user):
        return or_(
            Case.agent_id.in_(_agent_ids_subquery(user)),
            Case.patient_id.in_(_patient_ids_for_agent(user)),
        )
    if is_hospital_user(user):
        return Case.hospital_id.in_(_member_hospital_ids(user))
    return false()


def scope_cases(stmt: Select[Any], user: User) -> Select[Any]:
    """Restrict a ``select(Case ...)`` statement to the cases ``user`` may see."""
    return stmt.where(case_condition(user))


def case_in_scope(case_id_col: Any, user: User) -> ColumnElement[bool]:
    """Condition for rows of other tables that reference a case through ``case_id_col``."""
    if is_staff(user):
        return true()
    return case_id_col.in_(select(Case.id).where(case_condition(user)))


def patient_condition(patient_id_col: Any, user: User) -> ColumnElement[bool]:
    """Condition for rows keyed by patient (e.g. SOS alerts without a case)."""
    if is_staff(user):
        return true()
    if is_patient(user):
        return patient_id_col.in_(_patient_ids_for_user(user))
    if is_agent(user):
        return patient_id_col.in_(_patient_ids_for_agent(user))
    if is_hospital_user(user):
        return patient_id_col.in_(
            select(Case.patient_id).where(Case.hospital_id.in_(_member_hospital_ids(user)))
        )
    return false()


async def get_case_for_user(
    db: AsyncSession, case_id: uuid.UUID, user: User, *, for_update: bool = False
) -> Case:
    """Load a case the user may see (``NotFound`` otherwise). ``for_update`` locks the row."""
    stmt = scope_cases(select(Case).where(Case.id == case_id), user)
    if for_update:
        stmt = stmt.with_for_update(of=Case)
    case = (await db.execute(stmt)).scalar_one_or_none()
    if case is None:
        raise NotFound("Case not found")
    return case


async def get_patient_profile(db: AsyncSession, user: User) -> PatientProfile | None:
    return (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()


async def get_agent(db: AsyncSession, user: User) -> Agent | None:
    return (await db.execute(select(Agent).where(Agent.user_id == user.id))).scalar_one_or_none()


async def require_active_agent(db: AsyncSession, user: User) -> Agent:
    agent = await get_agent(db, user)
    if agent is None:
        raise Forbidden("Agent profile not found", code="agent_profile_missing")
    if agent.status != AgentStatus.ACTIVE:
        raise Forbidden("Your agent account is not active yet", code="agent_not_active")
    return agent


async def agent_can_manage_patient(db: AsyncSession, agent: Agent, patient_id: uuid.UUID) -> bool:
    row = (
        await db.execute(
            select(PatientProfile.id).where(
                PatientProfile.id == patient_id,
                or_(
                    PatientProfile.managed_by_agent_id == agent.id,
                    PatientProfile.referred_by_agent_id == agent.id,
                ),
            )
        )
    ).scalar_one_or_none()
    return row is not None


async def hospital_member_role(
    db: AsyncSession, user: User, hospital_id: uuid.UUID
) -> HospitalMemberRole | None:
    if not is_hospital_user(user):
        return None
    return (
        await db.execute(
            select(HospitalMember.member_role)
            .join(Hospital, Hospital.id == HospitalMember.hospital_id)
            .where(
                HospitalMember.hospital_id == hospital_id,
                HospitalMember.user_id == user.id,
                Hospital.status != HospitalStatus.SUSPENDED,  # SEC-014: no write powers while suspended
            )
        )
    ).scalar_one_or_none()


async def can_act_for_hospital(db: AsyncSession, user: User, hospital_id: uuid.UUID) -> bool:
    """True for ops staff and for hospital members with a write role in ``hospital_id``."""
    if is_ops_staff(user):
        return True
    role = await hospital_member_role(db, user, hospital_id)
    return role is not None and HospitalMemberRole(role) in HOSPITAL_WRITE_ROLES


async def ensure_hospital_actor(db: AsyncSession, user: User, hospital_id: uuid.UUID) -> None:
    """Hospital (write member) or ops staff; others get 403 (the resource itself is already in scope)."""
    if not await can_act_for_hospital(db, user, hospital_id):
        raise Forbidden("Only the hospital team or platform staff can perform this action")


def ensure_patient_side(user: User) -> None:
    """Patient or agent (super_admin passes, as everywhere)."""
    if not (is_patient(user) or is_agent(user) or role_of(user) == UserRole.SUPER_ADMIN.value):
        raise Forbidden("Only the patient or their agent can perform this action")


def ensure_patient_side_or_staff(user: User) -> None:
    if not (is_patient(user) or is_agent(user) or has_role(user, *STAFF_ROLES)):
        raise Forbidden("Only the patient, their agent or platform staff can perform this action")


def ensure_full_account(user: User) -> None:
    """Guests must upgrade to a full account before creating a case or booking (INTEGRATION_BACKLOG #12)."""
    if getattr(user, "is_guest", False):
        raise Forbidden(
            "Create a full account (POST /auth/guest/upgrade) before continuing",
            code="guest_upgrade_required",
        )
