"""Post-commit realtime delivery.

Event handlers run inside the publisher's transaction, so they must not push websocket events before the
data is committed (a rollback would leave clients with phantom notifications). ``queue_realtime`` stores the
event on the session; an ``after_commit`` listener schedules delivery through ``app.core.realtime`` once the
outermost transaction commits, and ``after_rollback`` discards it.

    from app.modules.messaging.outbox import queue_realtime
    queue_realtime(db, [user_id], "booking.updated", {"booking_id": str(b.id)})
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

import structlog
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core import realtime

logger = structlog.get_logger(__name__)

_INFO_KEY = "hig_messaging_realtime_pending"
_background: set[asyncio.Task[None]] = set()

PendingItem = tuple[list[str], str, dict[str, Any]]


def _session_info(db: AsyncSession | Session) -> dict[Any, Any]:
    sync = db.sync_session if isinstance(db, AsyncSession) else db
    return sync.info


def queue_realtime(
    db: AsyncSession,
    user_ids: list[uuid.UUID] | list[str] | list[uuid.UUID | str],
    event_type: str,
    data: Any,
) -> None:
    """Deliver ``{"type": event_type, "data": data}`` to ``user_ids`` after the session commits."""
    ids = list(dict.fromkeys(str(u) for u in user_ids if u))
    if not ids:
        return
    pending: list[PendingItem] = _session_info(db).setdefault(_INFO_KEY, [])
    pending.append((ids, event_type, data))


async def _deliver(items: list[PendingItem]) -> None:
    for user_ids, event_type, data in items:
        await realtime.send_to_users(list(user_ids), event_type, data)


async def flush_now(db: AsyncSession) -> None:
    """Deliver anything queued on ``db`` immediately (for callers that already committed)."""
    items: list[PendingItem] = _session_info(db).pop(_INFO_KEY, [])
    if items:
        await _deliver(items)


@event.listens_for(Session, "after_commit")
def _after_commit(session: Session) -> None:
    items: list[PendingItem] | None = session.info.pop(_INFO_KEY, None)
    if not items:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.warning("messaging.realtime_no_loop", events=len(items))
        return
    task = loop.create_task(_deliver(items), name="messaging-realtime")
    _background.add(task)
    task.add_done_callback(_background.discard)


@event.listens_for(Session, "after_rollback")
def _after_rollback(session: Session) -> None:
    session.info.pop(_INFO_KEY, None)


async def drain_background() -> None:
    """Await scheduled deliveries (tests)."""
    while _background:
        await asyncio.gather(*list(_background), return_exceptions=True)
