"""Small async key/value cache with TTL (Redis when configured, in-process dict otherwise).

Values are JSON-serialised (orjson), so cache plain dicts/lists/str/numbers::

    from app.core import cache
    data = await cache.get("catalog:specialties")
    if data is None:
        data = [...]
        await cache.set("catalog:specialties", data, ttl=300)
    await cache.clear_prefix("catalog:")
"""

from __future__ import annotations

import time
from typing import Any

import orjson
import structlog

from app.core.redis import get_redis

logger = structlog.get_logger(__name__)

KEY_PREFIX = "hig:cache:"
_memory: dict[str, tuple[float | None, bytes]] = {}


def _dumps(value: Any) -> bytes:
    return orjson.dumps(value, default=str)


async def get(key: str, default: Any = None) -> Any:
    client = get_redis()
    if client is not None:
        try:
            raw = await client.get(KEY_PREFIX + key)
        except Exception as exc:  # Redis outage must not break requests
            logger.warning("cache_get_failed", key=key, error=str(exc))
            raw = None
        return orjson.loads(raw) if raw is not None else default
    entry = _memory.get(key)
    if entry is None:
        return default
    expires_at, raw_bytes = entry
    if expires_at is not None and expires_at <= time.monotonic():
        _memory.pop(key, None)
        return default
    return orjson.loads(raw_bytes)


async def set(key: str, value: Any, ttl: float | None = 300) -> None:  # noqa: A001 - module-level API
    raw = _dumps(value)
    client = get_redis()
    if client is not None:
        try:
            if ttl:
                await client.set(KEY_PREFIX + key, raw, px=int(ttl * 1000))
            else:
                await client.set(KEY_PREFIX + key, raw)
        except Exception as exc:
            logger.warning("cache_set_failed", key=key, error=str(exc))
        return
    _memory[key] = ((time.monotonic() + ttl) if ttl else None, raw)


async def delete(key: str) -> None:
    client = get_redis()
    if client is not None:
        try:
            await client.delete(KEY_PREFIX + key)
        except Exception as exc:
            logger.warning("cache_delete_failed", key=key, error=str(exc))
        return
    _memory.pop(key, None)


async def clear_prefix(prefix: str = "") -> int:
    """Delete every key starting with ``prefix`` (all cache keys when empty). Returns the number removed."""
    client = get_redis()
    if client is not None:
        removed = 0
        try:
            batch: list[str] = []
            async for k in client.scan_iter(match=f"{KEY_PREFIX}{prefix}*", count=500):
                batch.append(k)
                if len(batch) >= 500:
                    removed += int(await client.delete(*batch))
                    batch.clear()
            if batch:
                removed += int(await client.delete(*batch))
        except Exception as exc:
            logger.warning("cache_clear_failed", prefix=prefix, error=str(exc))
        return removed
    keys = [k for k in _memory if k.startswith(prefix)]
    for k in keys:
        _memory.pop(k, None)
    return len(keys)


def clear_memory() -> None:
    """Reset the in-process cache (tests)."""
    _memory.clear()
