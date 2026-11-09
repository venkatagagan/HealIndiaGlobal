"""Access rules for document analyses (PLAN 7.1, mirrors documents PLAN 8.3 / 9.1).

* patient: analyses of their own patient profile;
* agent: analyses of patients they manage/referred, of their cases, or that they requested;
* hospital member: only CONFIRMED analyses attached to a case of their hospital (clinical view);
* staff: everything.

Writes (request, retry, edit, confirm, reject) are for the patient, their agent and staff (not finance, not
hospitals). Out-of-scope ids are reported as 404.
"""

from __future__ import annotations

from sqlalchemy import ColumnElement, and_, false, or_, select, true

from app.core.enums import UserRole
from app.core.errors import Forbidden
from app.models import Case, PatientProfile
from app.models.docai import AnalysisReviewStatus, DocumentAnalysis
from app.modules.documents.policies import Principal

__all__ = ["audience", "ensure_can_modify", "is_clinical", "scope_clause"]


def is_clinical(p: Principal) -> bool:
    """Hospital members get the clinical (confirmed-only) view."""
    return not p.staff and p.role == UserRole.HOSPITAL.value


def audience(p: Principal) -> str:
    return "clinical" if is_clinical(p) else "owner"


def scope_clause(p: Principal) -> ColumnElement[bool]:
    if p.staff:
        return true()
    conditions: list[ColumnElement[bool]] = []
    if p.patient_id is not None:
        conditions.append(DocumentAnalysis.patient_id == p.patient_id)
    if p.agent_id is not None:
        managed = select(PatientProfile.id).where(
            or_(
                PatientProfile.managed_by_agent_id == p.agent_id,
                PatientProfile.referred_by_agent_id == p.agent_id,
            )
        )
        conditions.extend(
            [
                DocumentAnalysis.patient_id.in_(managed),
                DocumentAnalysis.case_id.in_(select(Case.id).where(Case.agent_id == p.agent_id)),
                DocumentAnalysis.requested_by_user_id == p.user.id,
            ]
        )
    if p.hospital_ids:
        conditions.append(
            and_(
                DocumentAnalysis.case_id.in_(select(Case.id).where(Case.hospital_id.in_(p.hospital_ids))),
                DocumentAnalysis.review_status == AnalysisReviewStatus.CONFIRMED,
            )
        )
    return or_(*conditions) if conditions else false()


def ensure_can_modify(p: Principal) -> None:
    if p.role == UserRole.FINANCE.value:
        raise Forbidden("Finance users cannot modify document analyses")
    if p.staff or p.role in (UserRole.PATIENT.value, UserRole.AGENT.value):
        return
    raise Forbidden("Only the patient, their agent or staff can do this")
