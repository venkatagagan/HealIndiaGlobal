"""SEC-044: commission rate changes need a second approver (maker-checker).

Covered:

* hospital and agent ``commission_rate_bps`` (``PATCH /admin/hospitals/{id}``, ``PATCH /admin/agents/{id}``):
  the other fields apply at once, the rate becomes a pending request;
* commission rules (``/finance/commission-rules``): a new rule is created INACTIVE and activated by the
  approval; any later change (rate, dates, activation) is a pending request;
* the default rates ``default_commission_bps`` / ``default_agent_commission_bps``: the platform-settings
  dual control (``admin.service.DUAL_CONTROL_KEYS``, approve with ``POST /admin/settings/{key}/approve``).

Requests are approved or rejected (``/admin/commission-changes/{id}/approve|reject``) by an admin or finance
user OTHER than the requester; the requester may withdraw. An approval is refused when the request was
superseded (409 ``request_changed``) or the target changed since it was requested (409 ``target_changed``).
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any, Literal

from fastapi import Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.enums import UserRole, UserStatus
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.models import Agent, CommissionChangeRequest, CommissionRule, Hospital, User

TargetType = Literal["hospital", "agent", "commission_rule"]
APPROVER_ROLES = (UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPER_ADMIN)
RULE_FIELDS = ("rate_bps", "effective_from", "effective_to", "is_active")


class CommissionChangeOut(BaseModel):
    id: uuid.UUID
    target_type: str
    target_id: uuid.UUID
    target_name: str | None = None
    changes: dict[str, Any]
    before: dict[str, Any]
    status: str
    requested_by: uuid.UUID | None = None
    requested_by_name: str | None = None
    decided_by: uuid.UUID | None = None
    decided_by_name: str | None = None
    decided_at: datetime | None = None
    reason: str | None = None
    created_at: datetime


def _now() -> datetime:
    return datetime.now(UTC)


def _json(value: Any) -> Any:
    return value.isoformat() if isinstance(value, date) else value


def _parse_rule_value(field: str, value: Any) -> Any:
    if field in ("effective_from", "effective_to") and isinstance(value, str):
        return date.fromisoformat(value)
    return value


async def _target(db: AsyncSession, target_type: str, target_id: uuid.UUID, lock: bool = False) -> Any:
    model = {"hospital": Hospital, "agent": Agent, "commission_rule": CommissionRule}.get(target_type)
    if model is None:
        raise NotFound("Unknown target")
    obj = await db.get(model, target_id, with_for_update=lock)
    if obj is None:
        raise NotFound("Commission target not found")
    return obj


def _current(target_type: str, obj: Any, fields: list[str]) -> dict[str, Any]:
    if target_type == "commission_rule":
        return {f: _json(getattr(obj, f)) for f in fields}
    return {"commission_rate_bps": obj.commission_rate_bps}


async def _approver_ids(db: AsyncSession, exclude: uuid.UUID | None) -> list[uuid.UUID]:
    stmt = select(User.id).where(
        User.role.in_(APPROVER_ROLES), User.status == UserStatus.ACTIVE, User.deleted_at.is_(None)
    )
    if exclude is not None:
        stmt = stmt.where(User.id != exclude)
    return list((await db.execute(stmt)).scalars().all())


async def _target_name(db: AsyncSession, target_type: str, target_id: uuid.UUID) -> str | None:
    if target_type == "hospital":
        return (await db.execute(select(Hospital.name).where(Hospital.id == target_id))).scalar_one_or_none()
    if target_type == "agent":
        return (await db.execute(select(Agent.agency_name).where(Agent.id == target_id))).scalar_one_or_none()
    rule = await db.get(CommissionRule, target_id)
    return f"{rule.scope.value if hasattr(rule.scope, 'value') else rule.scope} rule" if rule else None


async def request_change(
    db: AsyncSession,
    actor: User,
    target_type: TargetType,
    target_id: uuid.UUID,
    changes: dict[str, Any],
    request: Request | None,
) -> CommissionChangeRequest | None:
    """Maker step: record ``changes`` as pending (superseding an earlier pending request for the target).
    Returns None when nothing would change. Does not commit."""
    obj = await _target(db, target_type, target_id, lock=True)
    before = _current(target_type, obj, list(changes))
    payload = {k: _json(v) for k, v in changes.items()}
    if payload == before:
        return None
    previous = (
        (
            await db.execute(
                select(CommissionChangeRequest)
                .where(
                    CommissionChangeRequest.target_type == target_type,
                    CommissionChangeRequest.target_id == target_id,
                    CommissionChangeRequest.status == "pending",
                )
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for old in previous:
        old.status = "superseded"
        old.decided_at = _now()
        old.decided_by = actor.id
    await db.flush()
    row = CommissionChangeRequest(
        target_type=target_type,
        target_id=target_id,
        changes=payload,
        before=before,
        status="pending",
        requested_by=actor.id,
    )
    db.add(row)
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="commission_change.requested",
        entity_type=target_type,
        entity_id=target_id,
        before=before,
        after={"request_id": str(row.id), **payload},
        request=request,
    )
    from app.i18n import Msg
    from app.modules.messaging.notifications import notify_many

    await notify_many(
        db,
        await _approver_ids(db, exclude=actor.id),
        "commission_change.requested",
        title_key="notifications.commission_change_requested.title",
        body_key="notifications.commission_change_requested.body",
        params={
            "name": actor.full_name or Msg("common.a_finance_user"),
            "target": await _target_name(db, target_type, target_id) or "",
        },
        data={"request_id": str(row.id), "target_type": target_type, "link": "/finance/commission-changes"},
        dedupe_key=f"commission_change.requested:{row.id}",
    )
    return row


async def _pending(db: AsyncSession, request_id: uuid.UUID) -> CommissionChangeRequest:
    row = await db.get(CommissionChangeRequest, request_id, with_for_update=True)
    if row is None:
        raise NotFound("Change request not found")
    if row.status != "pending":
        raise Conflict(
            "This change request is no longer pending; review the current one", code="request_changed"
        )
    return row


async def approve_change(
    db: AsyncSession, actor: User, request_id: uuid.UUID, request: Request | None
) -> CommissionChangeRequest:
    """Checker step: a different admin/finance user applies the reviewed request. Commits."""
    row = await _pending(db, request_id)
    if row.requested_by == actor.id:
        raise Forbidden(
            "This change must be approved by a second admin or finance user", code="second_approver_required"
        )
    obj = await _target(db, row.target_type, row.target_id, lock=True)
    if _current(row.target_type, obj, list(row.changes)) != row.before:
        raise Conflict(
            "The rate was changed since this request was made; ask for a new request", code="target_changed"
        )
    if row.target_type == "commission_rule":
        for field, value in row.changes.items():
            if field in RULE_FIELDS:
                setattr(obj, field, _parse_rule_value(field, value))
        if obj.effective_to is not None and obj.effective_to < obj.effective_from:
            raise BadRequest("effective_to must be on or after effective_from", code="invalid_value")
    else:
        obj.commission_rate_bps = row.changes.get("commission_rate_bps")
    row.status = "approved"
    row.decided_by = actor.id
    row.decided_at = _now()
    await audit_log(
        db,
        actor=actor,
        action="commission_change.approved",
        entity_type=row.target_type,
        entity_id=row.target_id,
        before=row.before,
        after={"request_id": str(row.id), "requested_by": str(row.requested_by), **row.changes},
        request=request,
    )
    await db.commit()
    if row.target_type == "hospital":
        from app.modules.catalog.service import invalidate_catalog_cache

        await invalidate_catalog_cache()
    return row


async def reject_change(
    db: AsyncSession, actor: User, request_id: uuid.UUID, reason: str | None, request: Request | None
) -> CommissionChangeRequest:
    """Reject (or, for the requester, withdraw) a pending request. Commits."""
    row = await _pending(db, request_id)
    row.status = "withdrawn" if row.requested_by == actor.id else "rejected"
    row.decided_by = actor.id
    row.decided_at = _now()
    row.reason = reason
    await audit_log(
        db,
        actor=actor,
        action=f"commission_change.{row.status}",
        entity_type=row.target_type,
        entity_id=row.target_id,
        after={"request_id": str(row.id), "reason": reason},
        request=request,
    )
    await db.commit()
    return row


async def change_outs(db: AsyncSession, rows: list[CommissionChangeRequest]) -> list[CommissionChangeOut]:
    user_ids = {u for r in rows for u in (r.requested_by, r.decided_by) if u}
    names = (
        {
            uid: name
            for uid, name in (
                await db.execute(select(User.id, User.full_name).where(User.id.in_(user_ids)))
            ).all()
        }
        if user_ids
        else {}
    )
    out = []
    for r in rows:
        out.append(
            CommissionChangeOut(
                id=r.id,
                target_type=r.target_type,
                target_id=r.target_id,
                target_name=await _target_name(db, r.target_type, r.target_id),
                changes=dict(r.changes or {}),
                before=dict(r.before or {}),
                status=r.status,
                requested_by=r.requested_by,
                requested_by_name=names.get(r.requested_by) if r.requested_by else None,
                decided_by=r.decided_by,
                decided_by_name=names.get(r.decided_by) if r.decided_by else None,
                decided_at=r.decided_at,
                reason=r.reason,
                created_at=r.created_at,
            )
        )
    return out


async def list_changes(
    db: AsyncSession,
    *,
    status: str | None = "pending",
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    limit: int = 200,
) -> list[CommissionChangeOut]:
    stmt = select(CommissionChangeRequest)
    if status:
        stmt = stmt.where(CommissionChangeRequest.status == status)
    if target_type:
        stmt = stmt.where(CommissionChangeRequest.target_type == target_type)
    if target_id:
        stmt = stmt.where(CommissionChangeRequest.target_id == target_id)
    stmt = stmt.order_by(CommissionChangeRequest.created_at.desc()).limit(limit)
    return await change_outs(db, list((await db.execute(stmt)).scalars().all()))


async def pending_for(
    db: AsyncSession, target_type: str, target_ids: list[uuid.UUID]
) -> dict[uuid.UUID, CommissionChangeOut]:
    """Pending request per target (for the hospital/agent/rule responses)."""
    if not target_ids:
        return {}
    rows = list(
        (
            await db.execute(
                select(CommissionChangeRequest).where(
                    CommissionChangeRequest.target_type == target_type,
                    CommissionChangeRequest.target_id.in_(target_ids),
                    CommissionChangeRequest.status == "pending",
                )
            )
        )
        .scalars()
        .all()
    )
    return {o.target_id: o for o in await change_outs(db, rows)}
