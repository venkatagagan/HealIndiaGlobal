"""i18n service: enabled languages, admin overrides of shipped strings, completeness per app/language.

Shipped catalogs (the source of keys, English text and shipped translations):

* web apps / website / mobile: ``app/i18n/catalogs/<app>.json`` = ``{"app", "locales": {lng: {key: text}}}``
  (exported by ``scripts/i18n/export-catalogs.mjs``; a missing file is an empty catalog);
* ``server``: ``app/i18n/<lng>.json`` (nested; flattened to dotted keys).

Overrides are ``translation_overrides`` rows; a row with ``text`` NULL is a tombstone left by a delete so the
public ``version`` (newest ``updated_at`` of the app/locale, epoch ms) keeps moving forward.
"""

from __future__ import annotations

import json
import math
import os
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

import app.i18n as i18n
from app.core import cache
from app.core.audit import audit_log
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.ids import uuid7
from app.i18n import runtime
from app.models import User
from app.models.i18n import Language, TranslationOverride
from app.modules.i18n.schemas import (
    AdminLanguageOut,
    LanguageOut,
    OverrideIn,
    OverrideOut,
    OverridesOut,
    StringCounts,
    StringItem,
    StringsPage,
)

CACHE_PREFIX = "i18n:"
CACHE_TTL = 60
MAX_TEXT = 5000


class UnknownLocale(NotFound):
    code = "unknown_locale"
    default_message = "Unknown language"


# ------------------------------------------------------------------------------------------- catalogs
@lru_cache(maxsize=32)
def _read_app_catalog(path: str, mtime_ns: int) -> dict[str, dict[str, str]]:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    locales = data.get("locales") if isinstance(data, dict) else None
    if not isinstance(locales, dict):
        return {}
    out: dict[str, dict[str, str]] = {}
    for lng, strings in locales.items():
        if isinstance(strings, dict):
            out[str(lng)] = {str(k): v for k, v in strings.items() if isinstance(v, str)}
    return out


def app_catalog(app: str) -> dict[str, dict[str, str]]:
    """``{locale: {key: text}}`` shipped strings of ``app`` (empty when the export does not exist yet)."""
    if app == "server":
        return {lng: i18n.server_catalog(lng) for lng in i18n.SUPPORTED_LANGUAGES}
    path = Path(i18n.CATALOGS_DIR) / f"{app}.json"
    try:
        mtime = os.stat(path).st_mtime_ns
    except OSError:
        return {}
    try:
        return _read_app_catalog(str(path), mtime)
    except (OSError, ValueError):
        return {}


# ------------------------------------------------------------------------------------------- helpers
def _ms(value: datetime | None) -> int:
    return int(value.timestamp() * 1000) if value is not None else 0


def _display(user: User | None) -> str | None:
    if user is None:
        return None
    return (user.full_name or "").strip() or user.email or None


_TAG_RE = re.compile(r"<!--.*?-->|<[^>]*>|<[a-zA-Z/!][^<]*$", re.DOTALL)
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f​  ]")


def clean_text(value: str) -> str:
    """Plain text only: HTML tags (and comments) removed, control characters dropped (newlines and tabs are
    kept), CRLF normalised, surrounding whitespace trimmed. Entities are left as typed (rendered as text)."""
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    previous = None
    while previous != text:  # "<<b>script>" -> "<script>" -> ""
        previous = text
        text = _TAG_RE.sub("", text)
    text = _CONTROL_RE.sub("", text)
    return text.strip()


async def _languages(db: AsyncSession) -> tuple[i18n.LanguageInfo, ...]:
    return await runtime.load_languages(db)


async def _require_locale(db: AsyncSession, locale: str) -> str:
    code = i18n.normalize_locale(locale)
    if code is None or code not in {lang.code for lang in await _languages(db)}:
        raise UnknownLocale(f"Unknown language {locale[:10]!r}")
    return code


async def _after_change() -> None:
    await cache.clear_prefix(CACHE_PREFIX)
    runtime.invalidate()
    await runtime.refresh()


# ------------------------------------------------------------------------------------------- public
async def public_languages() -> list[LanguageOut]:
    await runtime.ensure_fresh()
    return [
        LanguageOut(code=lang.code, name=lang.name, native_name=lang.native_name, rtl=lang.rtl, enabled=True)
        for lang in i18n.STATE.languages
        if lang.enabled or lang.code == i18n.DEFAULT_LANGUAGE
    ]


async def public_overrides(db: AsyncSession, locale: str, app: str) -> OverridesOut:
    await runtime.ensure_fresh()
    code = i18n.normalize_locale(locale)
    if code is None or code not in {lang.code for lang in i18n.STATE.languages}:
        raise UnknownLocale(f"Unknown language {locale[:10]!r}")
    key = f"{CACHE_PREFIX}overrides:{app}:{code}"
    cached = await cache.get(key)
    if cached is not None:
        return OverridesOut.model_validate(cached)
    rows = (
        await db.execute(
            select(TranslationOverride.key, TranslationOverride.text, TranslationOverride.updated_at).where(
                TranslationOverride.app == app, TranslationOverride.locale == code
            )
        )
    ).all()
    version = max((_ms(r.updated_at) for r in rows), default=0)
    strings = {r.key: r.text for r in sorted(rows, key=lambda r: r.key) if r.text}
    out = OverridesOut(locale=code, app=app, version=version, strings=strings)
    await cache.set(key, out.model_dump(mode="json"), ttl=CACHE_TTL)
    return out


# ------------------------------------------------------------------------------------------- admin: languages
async def _active_overrides(db: AsyncSession) -> dict[tuple[str, str], set[str]]:
    rows = await db.execute(
        select(TranslationOverride.app, TranslationOverride.locale, TranslationOverride.key).where(
            TranslationOverride.text.is_not(None), TranslationOverride.text != ""
        )
    )
    out: dict[tuple[str, str], set[str]] = {}
    for app, locale, key in rows.all():
        out.setdefault((app, locale), set()).add(key)
    return out


def _completeness(locale: str, overrides: dict[tuple[str, str], set[str]]) -> tuple[dict[str, float], float]:
    per_app: dict[str, float] = {}
    done_total = keys_total = 0
    for app in i18n.APPS:
        catalog = app_catalog(app)
        english = catalog.get(i18n.DEFAULT_LANGUAGE, {})
        if locale == i18n.DEFAULT_LANGUAGE:
            per_app[app] = 100.0
            continue
        shipped = catalog.get(locale, {})
        overridden = overrides.get((app, locale), set())
        done = sum(1 for k in english if shipped.get(k) or k in overridden)
        per_app[app] = round(100.0 * done / len(english), 1) if english else 0.0
        done_total += done
        keys_total += len(english)
    if locale == i18n.DEFAULT_LANGUAGE:
        return per_app, 100.0
    return per_app, round(100.0 * done_total / keys_total, 1) if keys_total else 0.0


async def admin_languages(db: AsyncSession) -> list[AdminLanguageOut]:
    languages = await _languages(db)
    updated = {r.code: r.updated_at for r in (await db.execute(select(Language))).scalars()}
    overrides = await _active_overrides(db)
    out: list[AdminLanguageOut] = []
    for lang in languages:
        per_app, overall = _completeness(lang.code, overrides)
        out.append(
            AdminLanguageOut(
                code=lang.code,
                name=lang.name,
                native_name=lang.native_name,
                rtl=lang.rtl,
                enabled=lang.enabled,
                sort=lang.sort,
                completeness=per_app,
                completeness_overall=overall,
                updated_at=updated.get(lang.code),
            )
        )
    return out


async def set_language_enabled(
    db: AsyncSession, actor: User, code: str, enabled: bool, request: Request | None = None
) -> AdminLanguageOut:
    languages = {lang.code: lang for lang in await _languages(db)}
    norm = i18n.normalize_locale(code)
    if norm is None or norm not in languages:
        raise UnknownLocale(f"Unknown language {code[:10]!r}")
    if norm == i18n.DEFAULT_LANGUAGE and not enabled:
        raise Conflict(
            "English is the default language and cannot be switched off", code="default_language_required"
        )
    lang = languages[norm]
    if lang.enabled != enabled or norm == i18n.DEFAULT_LANGUAGE:
        stmt = pg_insert(Language).values(
            code=lang.code,
            name=lang.name,
            native_name=lang.native_name,
            rtl=lang.rtl,
            enabled=enabled,
            sort=lang.sort,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Language.code], set_={"enabled": enabled, "updated_at": func.now()}
        )
        await db.execute(stmt)
        await audit_log(
            db,
            actor=actor,
            action="i18n.language_enabled" if enabled else "i18n.language_disabled",
            entity_type="language",
            entity_id=norm,
            before={"enabled": lang.enabled},
            after={"enabled": enabled},
            request=request,
        )
        await db.commit()
        await _after_change()
    for item in await admin_languages(db):
        if item.code == norm:
            return item
    raise UnknownLocale()  # pragma: no cover - the row was just written


# ------------------------------------------------------------------------------------------- admin: strings
async def _override_rows(
    db: AsyncSession, app: str, locale: str
) -> dict[str, tuple[TranslationOverride, Any]]:
    rows = await db.execute(
        select(TranslationOverride, User)
        .outerjoin(User, User.id == TranslationOverride.updated_by_user_id)
        .where(TranslationOverride.app == app, TranslationOverride.locale == locale)
    )
    return {o.key: (o, u) for o, u in rows.all()}


async def list_strings(
    db: AsyncSession,
    *,
    app: str,
    locale: str,
    q: str | None,
    status: str,
    page: int,
    page_size: int,
) -> StringsPage:
    code = await _require_locale(db, locale)
    catalog = app_catalog(app)
    english = catalog.get(i18n.DEFAULT_LANGUAGE, {})
    shipped_map = catalog.get(code, {})
    overrides = await _override_rows(db, app, code)
    needle = (q or "").strip().casefold()

    items: list[StringItem] = []
    for key in sorted(english):
        source = english[key]
        shipped = shipped_map.get(key) or None
        row, user = overrides.get(key, (None, None))
        override = row.text if row is not None and row.text else None
        if needle and not any(
            needle in (value or "").casefold() for value in (key, source, shipped, override)
        ):
            continue
        items.append(
            StringItem(
                key=key,
                source=source,
                shipped=shipped,
                override=override,
                effective=override or shipped or source,
                updated_at=row.updated_at if row is not None and override is not None else None,
                updated_by=_display(user) if override is not None else None,
            )
        )
    counts = StringCounts(
        total=len(items),
        missing=sum(1 for i in items if i.shipped is None and i.override is None),
        overridden=sum(1 for i in items if i.override is not None),
    )
    if status == "missing":
        items = [i for i in items if i.shipped is None and i.override is None]
    elif status == "overridden":
        items = [i for i in items if i.override is not None]
    elif status == "translated":
        items = [i for i in items if i.shipped is not None or i.override is not None]
    total = len(items)
    start = (page - 1) * page_size
    return StringsPage(
        items=items[start : start + page_size],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)) if total else 0,
        counts=counts,
    )


async def put_override(
    db: AsyncSession, actor: User, body: OverrideIn, request: Request | None = None
) -> OverrideOut:
    code = await _require_locale(db, body.locale)
    key = body.key.strip()
    if key not in app_catalog(body.app).get(i18n.DEFAULT_LANGUAGE, {}):
        raise NotFound("This key does not exist in the app's catalog", code="unknown_translation_key")
    text = clean_text(body.text)
    if not text:
        raise ValidationFailed(
            "The text is empty once HTML and control characters are removed",
            details=[{"loc": ["body", "text"], "msg": "must not be empty", "type": "value_error"}],
        )
    if len(text) > MAX_TEXT:
        raise ValidationFailed(
            f"The text can be at most {MAX_TEXT} characters",
            details=[{"loc": ["body", "text"], "msg": f"at most {MAX_TEXT} characters", "type": "too_long"}],
        )
    existing = (
        await db.execute(
            select(TranslationOverride).where(
                TranslationOverride.app == body.app,
                TranslationOverride.locale == code,
                TranslationOverride.key == key,
            )
        )
    ).scalar_one_or_none()
    before = existing.text if existing is not None else None
    stmt = (
        pg_insert(TranslationOverride)
        .values(id=uuid7(), app=body.app, locale=code, key=key, text=text, updated_by_user_id=actor.id)
        .on_conflict_do_update(
            constraint="uq_translation_overrides_locale_app_key",
            set_={"text": text, "updated_by_user_id": actor.id, "updated_at": func.now()},
        )
        .returning(TranslationOverride.updated_at)
    )
    updated_at = (await db.execute(stmt)).scalar_one()
    await audit_log(
        db,
        actor=actor,
        action="i18n.override_set",
        entity_type="translation_override",
        entity_id=f"{body.app}:{code}:{key}"[:100],
        before={"text": before},
        after={"text": text},
        request=request,
    )
    await db.commit()
    await _after_change()
    return OverrideOut(
        app=body.app, locale=code, key=key, text=text, updated_at=updated_at, updated_by=_display(actor)
    )


async def delete_override(
    db: AsyncSession, actor: User, *, app: str, locale: str, key: str, request: Request | None = None
) -> None:
    """Remove an override (idempotent). The row becomes a tombstone so the public version still advances."""
    code = await _require_locale(db, locale)
    row = (
        await db.execute(
            select(TranslationOverride)
            .where(
                TranslationOverride.app == app,
                TranslationOverride.locale == code,
                TranslationOverride.key == key,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None or row.text is None:
        await db.rollback()
        return
    before = row.text
    row.text = None
    row.updated_by_user_id = actor.id
    row.updated_at = func.now()
    await audit_log(
        db,
        actor=actor,
        action="i18n.override_delete",
        entity_type="translation_override",
        entity_id=f"{app}:{code}:{key}"[:100],
        before={"text": before},
        after={"text": None},
        request=request,
    )
    await db.commit()
    await _after_change()
