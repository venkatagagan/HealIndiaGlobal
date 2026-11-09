"""Fixed-window rate limiting (Redis INCR+EXPIRE when configured, in-memory otherwise).

Usage as a route dependency::

    from app.core.rate_limit import rate_limit

    @router.post("/auth/login", dependencies=[Depends(rate_limit("auth.login", limit=10, window_seconds=60))])
    async def login(...): ...

    # per authenticated user instead of per IP:
    @router.post("/screenings/{id}/submit",
                 dependencies=[Depends(rate_limit("screening.submit", 10, 3600, key="user"))])

Or imperatively (e.g. count only failures)::

    await hit("auth.login_fail", identifier=email.lower(), limit=5, window_seconds=900)

Disabled entirely when ``RATE_LIMIT_ENABLED`` is false (tests). Exceeding raises ``RateLimited`` (429) with a
``Retry-After`` header.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from typing import Literal

import structlog
from fastapi import Request

from app.core.config import settings
from app.core.errors import RateLimited
from app.core.redis import get_redis

logger = structlog.get_logger(__name__)

KEY_PREFIX = "hig:rl:"
_memory: dict[str, tuple[int, float]] = {}  # key -> (count, window_expires_at monotonic)


async def _incr(key: str, window_seconds: int) -> tuple[int, int]:
    """Increment the counter for ``key``; return ``(count, seconds_until_reset)``."""
    client = get_redis()
    if client is not None:
        try:
            full_key = KEY_PREFIX + key
            async with client.pipeline(transaction=True) as pipe:
                pipe.incr(full_key)
                pipe.ttl(full_key)
                count, ttl = await pipe.execute()
            if int(ttl) < 0:
                await client.expire(full_key, window_seconds)
                ttl = window_seconds
            return int(count), max(1, int(ttl))
        except Exception as exc:  # fall back to memory if Redis is down
            logger.warning("rate_limit_redis_failed", error=str(exc))
    now = time.monotonic()
    count, expires_at = _memory.get(key, (0, 0.0))
    if expires_at <= now:
        count, expires_at = 0, now + window_seconds
    count += 1
    _memory[key] = (count, expires_at)
    if len(_memory) > 50_000:
        _purge_expired(now)
    return count, max(1, int(expires_at - now + 0.999))


def _purge_expired(now: float) -> None:
    for k in [k for k, (_, exp) in _memory.items() if exp <= now]:
        _memory.pop(k, None)


async def hit(
    scope: str,
    identifier: str,
    limit: int,
    window_seconds: int,
    *,
    message: str | None = None,
    force: bool = False,
) -> int:
    """Count one hit for ``scope``/``identifier``; raise ``RateLimited`` when ``limit`` is exceeded.

    Returns the current count. No-op (returns 0) when rate limiting is disabled unless ``force``."""
    if not settings.RATE_LIMIT_ENABLED and not force:
        return 0
    window_index = int(time.time() // window_seconds)
    key = f"{scope}:{identifier}:{window_index}"
    count, retry_after = await _incr(key, window_seconds)
    if count > limit:
        raise RateLimited(message, retry_after=retry_after, details={"scope": scope, "limit": limit})
    return count


def rate_limit(
    scope: str,
    limit: int,
    window_seconds: int,
    key: Literal["ip", "user"] = "ip",
) -> Callable[[Request], Awaitable[None]]:
    """Dependency factory. ``key="user"`` uses the authenticated user id (falls back to the client IP)."""

    async def _dependency(request: Request) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        from app.core.deps import get_client_ip  # local import: deps imports models

        identifier: str | None = None
        if key == "user":
            user = getattr(request.state, "user", None)
            if user is not None:
                identifier = f"u:{user.id}"
            else:
                payload = _token_subject(request)
                identifier = f"u:{payload}" if payload else None
        if identifier is None:
            identifier = f"ip:{get_client_ip(request) or 'unknown'}"
        await hit(scope, identifier, limit, window_seconds)

    _dependency.__name__ = f"rate_limit_{scope.replace('.', '_')}"
    return _dependency


def _token_subject(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    from app.core.errors import AppError
    from app.core.security import decode_access_token

    try:
        return str(decode_access_token(auth[7:].strip())["sub"])
    except AppError:
        return None


async def reset_rate_limits() -> None:
    """Clear all counters (tests)."""
    _memory.clear()
    client = get_redis()
    if client is not None:
        try:
            keys = [k async for k in client.scan_iter(match=f"{KEY_PREFIX}*", count=500)]
            if keys:
                await client.delete(*keys)
        except Exception as exc:
            logger.warning("rate_limit_reset_failed", error=str(exc))
