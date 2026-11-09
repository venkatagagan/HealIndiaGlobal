"""Async loading of the DB-backed i18n snapshot (enabled languages + server string overrides).

:func:`ensure_fresh` reloads :data:`app.i18n.STATE` when it is older than ``SNAPSHOT_TTL`` (one small query
per table, at most once a minute per process); :func:`invalidate` forces a reload on the next call (admin
changes call it and then reload at once). A failing database never breaks a request: the previous snapshot
(or the built-in defaults) stays in use and the next attempt happens after ``RETRY_AFTER_ERROR`` seconds.
"""

from __future__ import annotations

import asyncio
import time

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.i18n import (
    DEFAULT_LANGUAGE,
    DEFAULT_LANGUAGES,
    SNAPSHOT_TTL,
    STATE,
    LanguageInfo,
)

logger = structlog.get_logger(__name__)

RETRY_AFTER_ERROR = 5.0
_lock: asyncio.Lock | None = None
_lock_loop: asyncio.AbstractEventLoop | None = None


def _get_lock() -> asyncio.Lock:
    global _lock, _lock_loop
    loop = asyncio.get_running_loop()
    if _lock is None or _lock_loop is not loop:
        _lock, _lock_loop = asyncio.Lock(), loop
    return _lock


def is_fresh() -> bool:
    return STATE.loaded_at is not None and (time.monotonic() - STATE.loaded_at) < SNAPSHOT_TTL


def invalidate() -> None:
    STATE.loaded_at = None


def reset() -> None:
    """Back to the built-in defaults (tests)."""
    STATE.reset()


def merge_languages(rows: list[LanguageInfo]) -> tuple[LanguageInfo, ...]:
    """DB rows override the built-in defaults per code; English is always enabled."""
    by_code = {lang.code: lang for lang in DEFAULT_LANGUAGES}
    for row in rows:
        by_code[row.code] = row
    en = by_code[DEFAULT_LANGUAGE]
    if not en.enabled:
        by_code[DEFAULT_LANGUAGE] = LanguageInfo(en.code, en.name, en.native_name, en.rtl, True, en.sort)
    return tuple(sorted(by_code.values(), key=lambda lang: (lang.sort, lang.code)))


async def load_languages(db: AsyncSession) -> tuple[LanguageInfo, ...]:
    from app.models.i18n import Language

    rows = (await db.execute(select(Language))).scalars().all()
    return merge_languages(
        [LanguageInfo(r.code, r.name, r.native_name, bool(r.rtl), bool(r.enabled), int(r.sort)) for r in rows]
    )


async def _load(db: AsyncSession) -> None:
    from app.models.i18n import TranslationOverride

    languages = await load_languages(db)
    rows = await db.execute(
        select(TranslationOverride.locale, TranslationOverride.key, TranslationOverride.text).where(
            TranslationOverride.app == "server", TranslationOverride.text.is_not(None)
        )
    )
    overrides: dict[str, dict[str, str]] = {}
    for locale, key, text in rows.all():
        if text:
            overrides.setdefault(locale, {})[key] = text
    STATE.languages = languages
    STATE.enabled = frozenset(lang.code for lang in languages if lang.enabled) | {DEFAULT_LANGUAGE}
    STATE.overrides = overrides
    STATE.loaded_at = time.monotonic()


async def refresh(db: AsyncSession | None = None) -> None:
    """Reload the snapshot now (with ``db`` when given, else a short-lived session of its own)."""
    try:
        if db is not None:
            await _load(db)
            return
        from app.core.db import SessionLocal

        async with SessionLocal() as session:
            await _load(session)
            await session.rollback()
    except Exception as exc:  # never break a request/job because of the i18n snapshot
        logger.warning("i18n.snapshot_failed", error=type(exc).__name__)
        STATE.loaded_at = time.monotonic() - SNAPSHOT_TTL + RETRY_AFTER_ERROR


async def ensure_fresh(db: AsyncSession | None = None) -> None:
    if is_fresh():
        return
    async with _get_lock():
        if is_fresh():
            return
        await refresh(db)
