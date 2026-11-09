"""Document access policy (PLAN 8.3 / 9.1, least privilege).

A user may see a (non-deleted) document when they are:
* its uploader (owner);
* an admin or super_admin (everything);
* finance: payment-related documents only (invoices, receipts, payment proofs, payout bank proofs);
* support: partner onboarding (KYC) documents and the documents of cases they coordinate; anything else only
  through an audited break-glass read with a stated reason (``X-Break-Glass-Reason``, see the service);
* the patient it is about (``documents.patient_id``);
* an agent: their own organisation documents (``documents.agent_id``), and documents of patients they
  manage/referred or of their cases - but only while the patient's own latest ``share_with_agent`` consent
  is granted (CG-14);
* a hospital member: the document's ``hospital_id`` (explicitly shared to / uploaded by that hospital) or the
  hospital of its case, unless the patient's latest ``share_with_hospitals`` decision for that hospital is a
  withdrawal. A patient's other documents (no case, or another hospital's case) are never visible to a
  hospital just because the patient has *some* case there (SEC-002).

The same rules are expressed once as a SQL predicate (:func:`visibility_clause`) so that the list endpoint,
single reads, downloads and existence checks can never disagree. Out-of-scope ids yield 404.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import ColumnElement, Select, and_, exists, false, or_, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import is_staff
from app.core.enums import ConsentKind, DocumentKind, UserRole
from app.models import Case, Consent, Document, PatientProfile, User
from app.modules.auth.scoping import agent_id_for, hospital_ids_for, patient_profile_id_for

#: payment-related documents finance may read
FINANCE_DOCUMENT_KINDS: frozenset[DocumentKind] = frozenset(
    {DocumentKind.INVOICE, DocumentKind.RECEIPT, DocumentKind.PAYMENT_PROOF, DocumentKind.BANK_PROOF}
)
#: partner onboarding documents support reviews (organisational, not patient health data)
SUPPORT_DOCUMENT_KINDS: frozenset[DocumentKind] = frozenset(
    {
        DocumentKind.KYC_REGISTRATION,
        DocumentKind.KYC_ACCREDITATION,
        DocumentKind.KYC_PAN,
        DocumentKind.KYC_GST,
        DocumentKind.KYC_ID_PROOF,
    }
)


@dataclass(slots=True)
class Principal:
    user: User
    role: str
    staff: bool
    patient_id: uuid.UUID | None = None
    agent_id: uuid.UUID | None = None
    hospital_ids: list[uuid.UUID] = field(default_factory=list)

    @property
    def full_staff_access(self) -> bool:
        """Admins and super admins see every document; finance and support are scoped."""
        return self.staff and self.role in (UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value)


def agent_consented_patients() -> Select[tuple[uuid.UUID]]:
    """Patient profile ids whose own latest ``share_with_agent`` consent is granted (rows recorded by someone
    else - an agent or staff - never count, SEC-060)."""
    latest = (
        select(Consent.user_id, Consent.granted)
        .where(
            Consent.kind == ConsentKind.SHARE_WITH_AGENT,
            or_(Consent.granted_by_user_id.is_(None), Consent.granted_by_user_id == Consent.user_id),
        )
        .order_by(Consent.user_id, Consent.created_at.desc(), Consent.id.desc())
        .ext(distinct_on(Consent.user_id))
        .subquery()
    )
    return (
        select(PatientProfile.id)
        .join(latest, latest.c.user_id == PatientProfile.user_id)
        .where(latest.c.granted.is_(True))
    )


def hospital_withdrawn_patients(hospital_id: uuid.UUID) -> Select[tuple[uuid.UUID]]:
    """Patient profile ids whose latest ``share_with_hospitals`` decision that applies to ``hospital_id``
    (scoped to that hospital or one of its cases, or account-wide) is a withdrawal - the same rule case
    creation uses."""
    latest = (
        select(Consent.user_id, Consent.granted)
        .where(
            Consent.kind == ConsentKind.SHARE_WITH_HOSPITALS,
            or_(
                Consent.hospital_id == hospital_id,
                and_(Consent.hospital_id.is_(None), Consent.case_id.is_(None)),
            ),
        )
        .order_by(Consent.user_id, Consent.created_at.desc(), Consent.id.desc())
        .ext(distinct_on(Consent.user_id))
        .subquery()
    )
    return (
        select(PatientProfile.id)
        .join(latest, latest.c.user_id == PatientProfile.user_id)
        .where(latest.c.granted.is_(False))
    )


def hospital_sharing_allowed(patient_column: Any, hospital_id: uuid.UUID) -> ColumnElement[bool]:
    """``patient_column`` is NULL (not patient data) or the patient has not withdrawn sharing with the
    hospital."""
    return or_(patient_column.is_(None), patient_column.not_in(hospital_withdrawn_patients(hospital_id)))


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
    if p.full_staff_access:
        return not_deleted
    conditions: list[ColumnElement[bool]] = [Document.owner_user_id == p.user.id]
    if p.staff:
        if p.role == UserRole.FINANCE.value:
            conditions.append(Document.kind.in_(sorted(FINANCE_DOCUMENT_KINDS)))
        elif p.role == UserRole.SUPPORT.value:
            conditions.extend(
                [
                    Document.kind.in_(sorted(SUPPORT_DOCUMENT_KINDS)),
                    Document.case_id.in_(select(Case.id).where(Case.coordinator_user_id == p.user.id)),
                ]
            )
        return and_(not_deleted, or_(*conditions))
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
                and_(
                    Document.patient_id.in_(agent_consented_patients()),
                    or_(Document.patient_id.in_(managed_patients), Document.case_id.in_(agent_cases)),
                ),
            ]
        )
    for hospital_id in p.hospital_ids:
        hospital_cases = select(Case.id).where(Case.hospital_id == hospital_id)
        conditions.append(
            and_(
                or_(Document.hospital_id == hospital_id, Document.case_id.in_(hospital_cases)),
                hospital_sharing_allowed(Document.patient_id, hospital_id),
            )
        )
    return and_(not_deleted, or_(*conditions)) if conditions else false()


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
    """Staff may verify any document they can see; hospital members only documents attached to their
    hospital's cases."""
    if p.staff:
        return True
    if not p.hospital_ids or document.case_id is None:
        return False
    hospital_id = (
        await db.execute(select(Case.hospital_id).where(Case.id == document.case_id))
    ).scalar_one_or_none()
    return hospital_id is not None and hospital_id in p.hospital_ids
