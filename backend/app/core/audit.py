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
