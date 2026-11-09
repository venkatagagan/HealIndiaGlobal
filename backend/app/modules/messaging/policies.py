"""Access rules for conversations, case parties and message attachments (PLAN 8.9, 9.1).

* Staff (admin | finance | support | super_admin) may open any conversation.
* Everyone else must be a participant. For a case conversation, any user who is a *party* of the case
  (patient user, agent user, hospital member, coordinator) is (re)added as a participant on access, so new
  hospital members or a newly assigned coordinator join automatically.
* Out-of-scope ids return 404, never 403.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import is_staff
from app.core.enums import UserRole, UserStatus
from app.models import (
    Agent,
    Case,
    ConversationParticipant,
    Document,
    HospitalMember,
    PatientProfile,
    User,
)


def role_of(user: User) -> str:
    return str(getattr(user.role, "value", user.role))


def is_active_user(user: User) -> bool:
    status = str(getattr(user.status, "value", user.status))
    return status not in (UserStatus.DELETED.value, UserStatus.SUSPENDED.value) and user.deleted_at is None


# -------------------------------------------------------------------------------------------------- lookups
async def patient_user_id(db: AsyncSession, patient_id: uuid.UUID | None) -> uuid.UUID | None:
    if patient_id is None:
        return None
    return (
        await db.execute(select(PatientProfile.user_id).where(PatientProfile.id == patient_id))
    ).scalar_one_or_none()


async def agent_user_id(db: AsyncSession, agent_id: uuid.UUID | None) -> uuid.UUID | None:
    if agent_id is None:
        return None
    return (await db.execute(select(Agent.user_id).where(Agent.id == agent_id))).scalar_one_or_none()


async def hospital_member_user_ids(
    db: AsyncSession, hospital_id: uuid.UUID | None, roles: Iterable[str] | None = None
) -> list[uuid.UUID]:
    if hospital_id is None:
        return []
    stmt = select(HospitalMember.user_id).where(HospitalMember.hospital_id == hospital_id)
    if roles is not None:
        stmt = stmt.where(HospitalMember.member_role.in_(list(roles)))
    return list((await db.execute(stmt.order_by(HospitalMember.created_at))).scalars().all())


async def user_hospital_ids(db: AsyncSession, user_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        (await db.execute(select(HospitalMember.hospital_id).where(HospitalMember.user_id == user_id)))
        .scalars()
        .all()
    )


async def agent_for_user(db: AsyncSession, user_id: uuid.UUID) -> Agent | None:
    return (await db.execute(select(Agent).where(Agent.user_id == user_id))).scalar_one_or_none()


async def patient_for_user(db: AsyncSession, user_id: uuid.UUID) -> PatientProfile | None:
    return (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user_id))
    ).scalar_one_or_none()


async def staff_user_ids(db: AsyncSession, roles: Iterable[UserRole | str]) -> list[uuid.UUID]:
    values = [str(getattr(r, "value", r)) for r in roles]
    stmt = (
        select(User.id)
        .where(
            User.role.in_(values),
            User.status == UserStatus.ACTIVE,
            User.deleted_at.is_(None),
        )
        .order_by(User.created_at)
    )
    return list((await db.execute(stmt)).scalars().all())


async def filter_active_user_ids(db: AsyncSession, user_ids: Iterable[uuid.UUID]) -> list[uuid.UUID]:
    ids = list(dict.fromkeys(user_ids))
    if not ids:
        return []
    rows = (
        await db.execute(
            select(User.id).where(
                User.id.in_(ids),
                User.status.notin_([UserStatus.DELETED, UserStatus.SUSPENDED]),
                User.deleted_at.is_(None),
            )
        )
    ).scalars()
    found = set(rows)
    return [i for i in ids if i in found]


# ---------------------------------------------------------------------------------------------------- cases
async def case_party_user_ids(db: AsyncSession, case: Case) -> list[uuid.UUID]:
    """Patient user, agent user, hospital members and coordinator of ``case`` (active users only)."""
    ids: list[uuid.UUID] = []
    pu = await patient_user_id(db, case.patient_id)
    if pu is not None:
        ids.append(pu)
    au = await agent_user_id(db, case.agent_id)
    if au is not None:
        ids.append(au)
    ids.extend(await hospital_member_user_ids(db, case.hospital_id))
    if case.coordinator_user_id is not None:
        ids.append(case.coordinator_user_id)
    return await filter_active_user_ids(db, ids)


async def is_case_party(db: AsyncSession, user: User, case: Case) -> bool:
    """True when ``user`` may see ``case`` (own patient, managing/referring/assigned agent, hospital member,
    coordinator)."""
    if case.coordinator_user_id == user.id:
        return True
    role = role_of(user)
    if role == UserRole.PATIENT.value:
        return (await patient_user_id(db, case.patient_id)) == user.id
    if role == UserRole.AGENT.value:
        agent = await agent_for_user(db, user.id)
        if agent is None:
            return False
        if case.agent_id == agent.id:
            return True
        patient = await db.get(PatientProfile, case.patient_id)
        return patient is not None and agent.id in (patient.managed_by_agent_id, patient.referred_by_agent_id)
    if role == UserRole.HOSPITAL.value:
        return case.hospital_id in await user_hospital_ids(db, user.id)
    return False


async def can_access_case(db: AsyncSession, user: User, case: Case) -> bool:
    return is_staff(user) or await is_case_party(db, user, case)


async def is_participant(db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    return (
        await db.get(ConversationParticipant, {"conversation_id": conversation_id, "user_id": user_id})
    ) is not None


# ------------------------------------------------------------------------------------------------ documents
async def can_access_document(db: AsyncSession, user: User, doc: Document) -> bool:
    """Owner, staff, the patient themself, the patient's agent, the hospital of a linked case, or a party of
    the document's case."""
    if doc.deleted_at is not None:
        return False
    if doc.owner_user_id == user.id or is_staff(user):
        return True
    role = role_of(user)
    patient: PatientProfile | None = None
    if doc.patient_id is not None:
        patient = await db.get(PatientProfile, doc.patient_id)
    if role == UserRole.PATIENT.value and patient is not None and patient.user_id == user.id:
        return True
    if role == UserRole.AGENT.value:
        agent = await agent_for_user(db, user.id)
        if agent is not None:
            if doc.agent_id == agent.id:
                return True
            if patient is not None and agent.id in (
                patient.managed_by_agent_id,
                patient.referred_by_agent_id,
            ):
                return True
    if role == UserRole.HOSPITAL.value and doc.hospital_id is not None:
        if doc.hospital_id in await user_hospital_ids(db, user.id):
            return True
    if doc.case_id is not None:
        case = await db.get(Case, doc.case_id)
        if case is not None and await is_case_party(db, user, case):
            return True
    return False
