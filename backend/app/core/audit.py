"""Audit trail helper (append-only ``audit_logs``). Adds the row to the session; the caller commits.

from app.core.audit import audit_log
await audit_log(db, actor=user, action="booking.cancel", entity_type="booking", entity_id=booking.id,
                before={"status": "confirmed"}, after={"status": "cancelled"}, request=request)
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from fastapi.encoders import jsonable_encoder

from app.core.logging import redact

if TYPE_CHECKING:
    from fastapi import Request
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.models.identity import AuditLog, User


def _jsonable(value: Any) -> Any:
    if value is None:
        return None
    return redact(jsonable_encoder(value))


async def audit_log(
    db: AsyncSession,
    *,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | str | None,
    before: Any = None,
    after: Any = None,
    request: Request | None = None,
    actor_role: str | None = None,
) -> AuditLog:
    """Add an ``AuditLog`` row (no commit). ``actor=None`` means the system (jobs/webhooks)."""
    from app.core.deps import get_client_ip, get_user_agent
    from app.models.identity import AuditLog

    role = actor_role
    if role is None and actor is not None:
        role = str(getattr(actor.role, "value", actor.role))
    entry = AuditLog(
        actor_user_id=actor.id if actor is not None else None,
        actor_role=(role or "system")[:40],
        action=action[:100],
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        ip=get_client_ip(request) if request is not None else None,
        user_agent=get_user_agent(request) if request is not None else None,
        before=_jsonable(before),
        after=_jsonable(after),
    )
    db.add(entry)
    return entry


# --- PHI read audit (HIPAA-style access log, "who viewed my records") -------------------------------------
PHI_ACTIONS = ("phi.view", "phi.download", "phi.list", "phi.break_glass")


async def audit_phi_access(
    db: AsyncSession,
    *,
    actor: User | None,
    patient_ids: Any,
    resource_type: str,
    resource_id: uuid.UUID | str | None = None,
    action: str = "phi.view",
    reason: str | None = None,
    request: Request | None = None,
    commit: bool = True,
) -> int:
    """Record that ``actor`` read health data of the patients ``patient_ids`` (profile ids; one id or an
    iterable). Reads by the patient themself are not recorded. ``resource_type`` is e.g. ``document``,
    ``screening``, ``document_analysis``, ``patient_profile``, ``voice_transcription``.

    One ``audit_logs`` row per patient (action ``phi.*``, ``after.patient_id``) - indexed for the patient's
    access log. Commits by default because read endpoints do not otherwise commit. Returns the rows added."""
    from sqlalchemy import select

    from app.models.patients import PatientProfile

    if actor is None:
        return 0
    if isinstance(patient_ids, (uuid.UUID, str)):
        ids = [patient_ids]
    else:
        ids = [p for p in (patient_ids or []) if p is not None]
    unique = list(dict.fromkeys(str(p) for p in ids if p is not None))
    if not unique:
        return 0
    if str(getattr(actor.role, "value", actor.role)) == "patient":
        own = (
            await db.execute(select(PatientProfile.id).where(PatientProfile.user_id == actor.id))
        ).scalar_one_or_none()
        unique = [p for p in unique if own is None or p != str(own)]
        if not unique:
            return 0
    for patient_id in unique:
        await audit_log(
            db,
            actor=actor,
            action=action,
            entity_type=resource_type,
            entity_id=resource_id if resource_id is not None else patient_id,
            after={"patient_id": patient_id, "reason": reason} if reason else {"patient_id": patient_id},
            request=request,
        )
    if commit:
        await db.commit()
    return len(unique)
