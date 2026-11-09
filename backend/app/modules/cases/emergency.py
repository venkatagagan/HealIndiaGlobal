"""Emergency gating (INTEGRATION_BACKLOG #13).

A case created from a screening whose urgency is ``emergency`` cannot proceed to booking (quote acceptance or
booking creation) until the patient - or the agent acting for them - acknowledges the emergency guidance
(seek local emergency care first; medical travel is not a substitute). The acknowledgement is recorded on the
case (``emergency_acknowledged_at`` / ``emergency_acknowledged_by_user_id``) and in the audit log.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.enums import CaseStatus, Urgency
from app.core.errors import BadRequest, Conflict
from app.models import Case, Screening, User
from app.modules.cases import policies
from app.modules.cases.common import queue_case_push, utcnow
from app.modules.cases.state import CLOSED_CASE_STATUSES


async def screening_urgencies(
    db: AsyncSession, screening_ids: Iterable[uuid.UUID | None]
) -> dict[uuid.UUID, Urgency | None]:
    ids = {sid for sid in screening_ids if sid is not None}
    if not ids:
        return {}
    rows = await db.execute(select(Screening.id, Screening.urgency).where(Screening.id.in_(ids)))
    return {sid: (Urgency(u) if u is not None else None) for sid, u in rows.all()}


async def case_urgency(db: AsyncSession, case: Case) -> Urgency | None:
    if case.screening_id is None:
        return None
    return (await screening_urgencies(db, [case.screening_id])).get(case.screening_id)


def ack_required(case: Case, urgency: Urgency | None) -> bool:
    return urgency == Urgency.EMERGENCY and case.emergency_acknowledged_at is None


async def ensure_emergency_acknowledged(db: AsyncSession, case: Case) -> None:
    """Raise 409 ``emergency_ack_required`` while an emergency case is not acknowledged."""
    if ack_required(case, await case_urgency(db, case)):
        raise Conflict(
            "This case was screened as a possible emergency. Please read and acknowledge the emergency "
            "guidance before continuing to booking.",
            code="emergency_ack_required",
            details={"case_id": str(case.id), "ack_path": f"/api/v1/cases/{case.id}/emergency-ack"},
        )


async def acknowledge_emergency(
    db: AsyncSession, user: User, case_id: uuid.UUID, request: Request | None = None
) -> Case:
    """Patient (or their agent) acknowledges the emergency guidance. Idempotent; commits."""
    policies.ensure_patient_side(user)
    case = await policies.get_case_for_user(db, case_id, user, for_update=True)
    if case.status in CLOSED_CASE_STATUSES:
        raise BadRequest("This case is closed", code="invalid_state")
    if await case_urgency(db, case) != Urgency.EMERGENCY:
        raise BadRequest("This case does not require an emergency acknowledgement", code="not_emergency")
    if case.emergency_acknowledged_at is not None:
        return case
    case.emergency_acknowledged_at = utcnow()
    case.emergency_acknowledged_by_user_id = user.id
    await audit_log(
        db,
        actor=user,
        action="case.emergency_ack",
        entity_type="case",
        entity_id=case.id,
        before={"emergency_acknowledged_at": None},
        after={"emergency_acknowledged_at": case.emergency_acknowledged_at.isoformat()},
        request=request,
    )
    await queue_case_push(
        db,
        case,
        "case.updated",
        {"case_id": str(case.id), "status": CaseStatus(case.status).value, "emergency_ack": True},
    )
    await db.commit()
    return case
