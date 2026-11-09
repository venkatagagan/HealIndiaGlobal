"""Shared optional Redis client. Everything that uses Redis must work when ``REDIS_URL`` is empty."""

from __future__ import annotations

import redis.asyncio as aioredis

from app.core.config import settings

_client: aioredis.Redis | None = None


def redis_enabled() -> bool:
    return bool(settings.REDIS_URL)


def get_redis() -> aioredis.Redis | None:
    """Return a process-wide ``redis.asyncio.Redis`` (decode_responses=True) or ``None`` if not configured."""
    global _client
    if not settings.REDIS_URL:
        return None
    if _client is None:
        _client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=5,
            health_check_interval=30,
        )
    return _client


async def ping_redis() -> bool:
    client = get_redis()
    if client is None:
        return True
    return bool(await client.ping())


async def close_redis() -> None:
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        finally:
            _client = None
