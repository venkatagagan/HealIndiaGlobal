"""Guest AI quota (phase 1): a guest may start ``GUEST_AI_DAILY_LIMIT`` AI screenings / report scans per
day, counted per guest account and per client IP (rolling 24 hours).

Used as a route dependency on the AI endpoints; it adds a ``guest_ai_usage`` row to the request's session,
so the row is committed only when the AI request itself succeeds (a rejected request does not use quota).
Full accounts are not limited here (their usual rate limits apply).
"""

from __future__ import annotations

import hashlib
import hmac
import uuid
from collections.abc import Awaitable, Callable
from datetime import timedelta

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, get_client_ip
from app.core.errors import RateLimited
from app.models import GuestAiUsage, Screening, User
from app.modules.cases.common import utcnow

WINDOW = timedelta(hours=24)


def _secret() -> bytes:
    raw = settings.FIELD_ENCRYPTION_KEY or settings.JWT_SECRET
    return f"hig-guest:{raw}".encode()


def keyed_hash(value: str) -> str:
    """Keyed HMAC-SHA256 hex digest (IP addresses, contacts, device ids are never stored in clear)."""
    return hmac.new(_secret(), value.encode("utf-8"), hashlib.sha256).hexdigest()


def ip_hash(request: Request) -> str | None:
    ip = get_client_ip(request)
    return keyed_hash(f"ip:{ip}") if ip else None


async def guest_ai_used(db: AsyncSession, user: User, request: Request) -> tuple[int, int]:
    """``(used_by_this_guest, used_from_this_ip)`` in the last 24 hours."""
    since = utcnow() - WINDOW
    by_user = (
        await db.execute(
            select(func.count()).where(GuestAiUsage.user_id == user.id, GuestAiUsage.created_at >= since)
        )
    ).scalar_one()
    by_ip = 0
    hashed = ip_hash(request)
    if hashed:
        by_ip = (
            await db.execute(
                select(func.count()).where(GuestAiUsage.ip_hash == hashed, GuestAiUsage.created_at >= since)
            )
        ).scalar_one()
    return int(by_user), int(by_ip)


async def consume_guest_ai(
    db: AsyncSession, user: User, request: Request, kind: str, reference_id: str | None = None
) -> None:
    """Raise 429 when the guest (or their IP) used today's AI quota; otherwise record one use (not
    committed: the caller's service commits it with the AI request)."""
    if not user.is_guest:
        return
    # Serialise concurrent requests of the same guest.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    used_user, used_ip = await guest_ai_used(db, user, request)
    limit = settings.GUEST_AI_DAILY_LIMIT
    if used_user >= limit or used_ip >= limit:
        raise RateLimited(
            f"You have used today's {limit} free AI checks. Create a free account to continue, or try again "
            "tomorrow.",
            retry_after=3600,
            details={"scope": "guest_ai_daily", "limit": limit, "guest_upgrade_available": True},
        )
    db.add(GuestAiUsage(user_id=user.id, ip_hash=ip_hash(request), kind=kind, reference_id=reference_id))


def guest_screening_quota() -> Callable[..., Awaitable[None]]:
    """Dependency for ``/screenings/{screening_id}/submit|rerun``: counts only screenings that use AI."""

    async def _dep(screening_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser) -> None:
        if not user.is_guest:
            return
        screening = await db.get(Screening, screening_id)
        if screening is None or not bool((screening.preferences or {}).get("use_ai", True)):
            return  # 404 comes from the service; rules-only screenings do not use AI
        await consume_guest_ai(db, user, request, "screening", str(screening_id))

    return _dep


async def guest_docai_quota(request: Request, db: DbSession, user: CurrentUser) -> None:
    """Dependency for ``POST /documents/analyses``."""
    await consume_guest_ai(db, user, request, "docai")
