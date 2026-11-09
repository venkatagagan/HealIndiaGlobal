"""Access rules for document analyses (PLAN 7.1, mirrors documents PLAN 8.3 / 9.1).

* patient: analyses of their own patient profile;
* agent: analyses they requested, and analyses of patients they manage/referred or of their cases while the
  patient's own ``share_with_agent`` consent is granted;
* hospital member: only CONFIRMED analyses attached to a case of their hospital (clinical view), unless the
  patient withdrew sharing with that hospital;
* staff: admins everything; support the cases they coordinate; finance nothing.

Writes (request, retry, edit, confirm, reject) are for the patient, their agent and staff (not finance, not
hospitals). Out-of-scope ids are reported as 404.
"""

from __future__ import annotations

from sqlalchemy import ColumnElement, and_, false, or_, select, true

from app.core.enums import UserRole
from app.core.errors import Forbidden
from app.models import Case, PatientProfile
from app.models.docai import AnalysisReviewStatus, DocumentAnalysis
from app.modules.documents.policies import Principal, agent_consented_patients, hospital_sharing_allowed

__all__ = ["audience", "ensure_can_modify", "is_clinical", "scope_clause"]


def is_clinical(p: Principal) -> bool:
    """Hospital members get the clinical (confirmed-only) view."""
    return not p.staff and p.role == UserRole.HOSPITAL.value


def audience(p: Principal) -> str:
    return "clinical" if is_clinical(p) else "owner"


def scope_clause(p: Principal) -> ColumnElement[bool]:
    if p.full_staff_access:
        return true()
    if p.staff:
        # least privilege: finance never reads analyses; support only for the cases they coordinate
        if p.role == UserRole.SUPPORT.value:
            return DocumentAnalysis.case_id.in_(select(Case.id).where(Case.coordinator_user_id == p.user.id))
        return false()
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
                DocumentAnalysis.requested_by_user_id == p.user.id,
                and_(
                    DocumentAnalysis.patient_id.in_(agent_consented_patients()),
                    or_(
                        DocumentAnalysis.patient_id.in_(managed),
                        DocumentAnalysis.case_id.in_(select(Case.id).where(Case.agent_id == p.agent_id)),
                    ),
                ),
            ]
        )
    for hospital_id in p.hospital_ids:
        conditions.append(
            and_(
                DocumentAnalysis.case_id.in_(select(Case.id).where(Case.hospital_id == hospital_id)),
                DocumentAnalysis.review_status == AnalysisReviewStatus.CONFIRMED,
                hospital_sharing_allowed(DocumentAnalysis.patient_id, hospital_id),
            )
        )
    return or_(*conditions) if conditions else false()


def ensure_can_modify(p: Principal) -> None:
    if p.role == UserRole.FINANCE.value:
        raise Forbidden("Finance users cannot modify document analyses")
    if p.staff or p.role in (UserRole.PATIENT.value, UserRole.AGENT.value):
        return
    raise Forbidden("Only the patient, their agent or staff can do this")
