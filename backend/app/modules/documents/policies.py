"""Document access policy (PLAN 8.3 / 9.1).

A user may see a (non-deleted) document when they are:
* its uploader (owner);
* staff (admin|finance|support|super_admin);
* the patient it is about (``documents.patient_id``);
* an agent: the document's ``agent_id``, the patient's managing/referring agent, or the case's agent;
* a hospital member: the document's ``hospital_id`` (explicitly shared to / uploaded by that hospital) or the
  hospital of its case. A patient's other documents (no case, or another hospital's case) are never visible to
  a hospital just because the patient has *some* case there (SEC-002); cases themselves exist only after the
  patient's ``share_with_hospitals`` consent.

The same rules are expressed once as a SQL predicate (:func:`visibility_clause`) so that the list endpoint,
single reads, downloads and existence checks can never disagree. Out-of-scope ids yield 404.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from sqlalchemy import ColumnElement, and_, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import is_staff
from app.core.enums import UserRole
from app.models import Case, Document, PatientProfile, User
from app.modules.auth.scoping import agent_id_for, hospital_ids_for, patient_profile_id_for


@dataclass(slots=True)
class Principal:
    user: User
    role: str
    staff: bool
    patient_id: uuid.UUID | None = None
    agent_id: uuid.UUID | None = None
    hospital_ids: list[uuid.UUID] = field(default_factory=list)


async def load_principal(db: AsyncSession, user: User) -> Principal:
    role = str(getattr(user.role, "value", user.role))
    principal = Principal(user=user, role=role, staff=is_staff(user))
    if role == UserRole.PATIENT:
        principal.patient_id = await patient_profile_id_for(db, user.id)
    elif role == UserRole.AGENT:
        principal.agent_id = await agent_id_for(db, user.id)
    elif role == UserRole.HOSPITAL:
        principal.hospital_ids = await hospital_ids_for(db, user.id)
    return principal


def visibility_clause(p: Principal) -> ColumnElement[bool]:
    """SQL predicate selecting the documents ``p`` may see (soft-deleted ones are always excluded)."""
    not_deleted = Document.deleted_at.is_(None)
    if p.staff:
        return not_deleted
    conditions: list[ColumnElement[bool]] = [Document.owner_user_id == p.user.id]
    if p.patient_id is not None:
        conditions.append(Document.patient_id == p.patient_id)
    if p.agent_id is not None:
        managed_patients = select(PatientProfile.id).where(
            or_(
                PatientProfile.managed_by_agent_id == p.agent_id,
                PatientProfile.referred_by_agent_id == p.agent_id,
            )
        )
        agent_cases = select(Case.id).where(Case.agent_id == p.agent_id)
        conditions.extend(
            [
                Document.agent_id == p.agent_id,
                Document.patient_id.in_(managed_patients),
                Document.case_id.in_(agent_cases),
            ]
        )
    if p.hospital_ids:
        hospital_cases = select(Case.id).where(Case.hospital_id.in_(p.hospital_ids))
        conditions.extend(
            [
                Document.hospital_id.in_(p.hospital_ids),
                Document.case_id.in_(hospital_cases),
            ]
        )
    return and_(not_deleted, or_(*conditions))


async def can_access_case(db: AsyncSession, p: Principal, case: Case) -> bool:
    if p.staff:
        return True
    if p.patient_id is not None and case.patient_id == p.patient_id:
        return True
    if p.agent_id is not None:
        if case.agent_id == p.agent_id:
            return True
        return await _agent_manages_patient(db, p.agent_id, case.patient_id)
    return bool(p.hospital_ids) and case.hospital_id in p.hospital_ids


async def _agent_manages_patient(db: AsyncSession, agent_id: uuid.UUID, patient_id: uuid.UUID) -> bool:
    found = (
        await db.execute(
            select(PatientProfile.id).where(
                PatientProfile.id == patient_id,
                or_(
                    PatientProfile.managed_by_agent_id == agent_id,
                    PatientProfile.referred_by_agent_id == agent_id,
                ),
            )
        )
    ).first()
    return found is not None


async def can_access_patient(db: AsyncSession, p: Principal, patient_id: uuid.UUID) -> bool:
    if p.staff:
        return (await db.get(PatientProfile, patient_id)) is not None
    if p.patient_id is not None:
        return patient_id == p.patient_id
    if p.agent_id is not None:
        if await _agent_manages_patient(db, p.agent_id, patient_id):
            return True
        return (
            await db.execute(
                select(exists().where(Case.patient_id == patient_id, Case.agent_id == p.agent_id))
            )
        ).scalar_one()
    # Hospitals act on a patient only through a specific case (SEC-002): no patient-level access.
    return False


async def can_verify(db: AsyncSession, p: Principal, document: Document) -> bool:
    """Staff may verify any document; hospital members only documents attached to their hospital's cases."""
    if p.staff:
        return True
    if not p.hospital_ids or document.case_id is None:
        return False
    hospital_id = (
        await db.execute(select(Case.hospital_id).where(Case.id == document.case_id))
    ).scalar_one_or_none()
    return hospital_id is not None and hospital_id in p.hospital_ids
