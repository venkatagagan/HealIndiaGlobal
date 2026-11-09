"""Daily AI budgets (SEC-021, "denial of wallet").

Every AI-backed request (screening submit/rerun, document analysis, voice intake) counts against

* a per-user daily quota per feature (``AI_USER_DAILY_LIMIT_<FEATURE>``), and
* one platform-wide daily budget (``AI_GLOBAL_DAILY_LIMIT``).

Counters use the rate-limit store (Redis when configured, in-process otherwise) with a 24 h fixed window, and
are enforced even when ``RATE_LIMIT_ENABLED`` is false. A limit of 0 is "unlimited".

Usage as a route dependency::

    @router.post("/documents/analyses", dependencies=[Depends(ai_daily_quota("docai"))])

or in a job, before calling the model (screenings fall back to the rules engine)::

    if not await take_global_budget():
        ...  # use the rules engine
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Literal

import structlog

from app.core.config import settings
from app.core.deps import CurrentUser
from app.core.errors import RateLimited
from app.core.rate_limit import count

logger = structlog.get_logger(__name__)

DAY_SECONDS = 24 * 60 * 60
Feature = Literal["screening", "docai", "voice"]


def user_daily_limit(feature: Feature) -> int:
    return int(getattr(settings, f"AI_USER_DAILY_LIMIT_{feature.upper()}", 0) or 0)


async def take_user_quota(feature: Feature, user_id: object) -> None:
    """Count one AI request for ``user_id``; 429 ``ai_daily_limit`` once the user's daily quota is used."""
    limit = user_daily_limit(feature)
    if limit <= 0:
        return
    used, retry_after = await count(f"ai.{feature}", str(user_id), DAY_SECONDS)
    if used > limit:
        logger.warning("ai_quota.user_limit", feature=feature, user_id=str(user_id), limit=limit)
        raise RateLimited(
            "You have reached today's limit for this AI feature. Please try again tomorrow.",
            code="ai_daily_limit",
            retry_after=retry_after,
            details={"feature": feature, "limit": limit},
        )


async def take_global_budget() -> bool:
    """Count one AI call against the platform's daily budget. False once it is used up (callers fall back
    to non-AI behaviour or refuse); the first refusal of the day is logged at error level (alert)."""
    limit = int(settings.AI_GLOBAL_DAILY_LIMIT or 0)
    if limit <= 0:
        return True
    used, _ = await count("ai.global", "all", DAY_SECONDS)
    if used > limit:
        if used == limit + 1:
            logger.error("ai_quota.global_budget_exhausted", limit=limit)
        return False
    return True


async def require_global_budget() -> None:
    if not await take_global_budget():
        raise RateLimited(
            "The AI assistant is very busy right now. Please try again later.",
            code="ai_unavailable",
            retry_after=3600,
        )


def ai_daily_quota(feature: Feature, *, global_budget: bool = True) -> Callable[..., Awaitable[None]]:
    """Route dependency: per-user daily quota for ``feature`` (and the global budget unless the endpoint
    falls back to non-AI behaviour itself, as screenings do)."""

    async def _dependency(user: CurrentUser) -> None:
        await take_user_quota(feature, user.id)
        if global_budget:
            await require_global_budget()

    _dependency.__name__ = f"ai_daily_quota_{feature}"
    return _dependency
