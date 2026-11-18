"""Localized server-supplied content (catalog, visa guide, tips, cost benchmarks) - the DB side of
:mod:`app.i18n.content`.

* :func:`localize_payload` translates a JSON payload built in English (e.g. a cached catalog response): every
  object with an ``id`` (or ``benchmark_id``) gets its translatable fields replaced by the admin
  translation of that entity, else the shipped translation of the English text, else stays English.
  Lists of specialty names (hospital cards) are translated too. One query per payload,
  only for non-English requests.
* :func:`translate_values` does the same for one entity whose English values are at hand (visa guide).
* Admin: :func:`entity_translations` / :func:`put_entity_translations` back the per-entity
  "Translations" tab of the admin portal (``GET/PUT /admin/content-translations/{entity_type}/{entity_id}``).

Entity ids: catalog rows (specialty, procedure, hospital, doctor, cultural_tip, cost_benchmark) by UUID; visa
content by natural key (``visa_rule``: nationality ``"NG"``; ``visa_checklist``: ``"e_visa:*:passport"``,
see :func:`checklist_entity_id`), so translations also cover the built-in defaults.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Iterable
from datetime import datetime
from typing import Any

from fastapi import Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import String as SAString
from sqlalchemy import cast, delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

import app.i18n as i18n
from app.core.audit import audit_log
from app.core.errors import NotFound, ValidationFailed
from app.core.ids import uuid7
from app.i18n.content import localize_text, localize_wait_text, shipped_translation
from app.models import (
    CostBenchmark,
    CulturalTip,
    Doctor,
    Hospital,
    Procedure,
    Specialty,
    User,
    VisaChecklistItem,
)
from app.models.i18n import CONTENT_ENTITY_FIELDS, ContentTranslation

__all__ = [
    "CONTENT_ENTITY_FIELDS",
    "ContentTranslationsOut",
    "ContentTranslationsPut",
    "checklist_entity_id",
    "entity_translations",
    "localize_payload",
    "put_entity_translations",
    "search_condition",
    "translate_many",
    "translate_values",
    "translated_entity_ids",
]

MAX_TEXT = 10_000
_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
#: keys whose value identifies the entity of an object in a payload
_ID_KEYS = ("id", "benchmark_id")
#: translatable keys of payload objects (field names of ``CONTENT_ENTITY_FIELDS`` + derived names)
_FIELDS = frozenset(
    {
        "name",
        "description",
        "full_name",
        "bio",
        "title",
        "body",
        "notes",
        "wait_time_text",
        "source",
        "wait_source",
    }
)
#: derived copies of an entity's name (shipped translation only)
_DERIVED_NAME_FIELDS = frozenset({"treatment_name", "procedure_name", "specialty_name"})
#: keys holding lists of specialty names (hospital cards)
_NAME_LIST_KEYS = frozenset({"specialties"})
_CHUNK = 500


def checklist_entity_id(visa_route: str, nationality: str | None, item_key: str) -> str:
    return f"{visa_route}:{(nationality or '*').upper()}:{item_key}"


def _locale(locale: str | None) -> str:
    return i18n.normalize_locale(locale) or i18n.DEFAULT_LANGUAGE


async def _rows(
    db: AsyncSession, locale: str, entity_ids: Iterable[str], entity_type: str | None = None
) -> dict[tuple[str, str], str]:
    ids = sorted({e for e in entity_ids if e})
    out: dict[tuple[str, str], str] = {}
    for start in range(0, len(ids), _CHUNK):
        stmt = select(ContentTranslation.entity_id, ContentTranslation.field, ContentTranslation.text).where(
            ContentTranslation.locale == locale, ContentTranslation.entity_id.in_(ids[start : start + _CHUNK])
        )
        if entity_type is not None:
            stmt = stmt.where(ContentTranslation.entity_type == entity_type)
        for entity_id, field, text in (await db.execute(stmt)).all():
            out[(entity_id, field)] = text
    return out


# --------------------------------------------------------------------------------------- public reads
async def localize_payload(db: AsyncSession, data: Any, locale: str | None) -> Any:
    """Translated copy of ``data`` (JSON-like) for ``locale``; ``data`` itself is never modified."""
    code = _locale(locale)
    if code == i18n.DEFAULT_LANGUAGE or data is None:
        return data
    ids: set[str] = set()
    wants_names = False

    def collect(value: Any) -> None:
        nonlocal wants_names
        if isinstance(value, dict):
            for key in _ID_KEYS:
                item = value.get(key)
                if isinstance(item, str) and _UUID_RE.match(item):
                    ids.add(item.lower())
            for key, child in value.items():
                if (
                    key in _NAME_LIST_KEYS
                    and isinstance(child, list)
                    and any(isinstance(c, str) for c in child)
                ):
                    wants_names = True
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)

    collect(data)
    rows = await _rows(db, code, ids)
    names = await _specialty_name_map(db, code) if wants_names else {}

    def text_for(entity_ids: list[str], field: str, english: str) -> str:
        for entity_id in entity_ids:
            admin = rows.get((entity_id, field))
            if admin:
                return admin
        return localize_text(english, code, field=field) or english

    def apply(value: Any) -> Any:
        if isinstance(value, list):
            return [apply(child) for child in value]
        if not isinstance(value, dict):
            return value
        entity_ids = [
            str(value[k]).lower()
            for k in _ID_KEYS
            if isinstance(value.get(k), str) and _UUID_RE.match(value[k])
        ]
        user_text = "rating" in value  # reviews: patient-written title/body are never touched
        out: dict[str, Any] = {}
        for key, child in value.items():
            if isinstance(child, str) and child:
                if key in _FIELDS and not (user_text and key in ("title", "body")):
                    out[key] = text_for(entity_ids, key, child)
                    continue
                if key in _DERIVED_NAME_FIELDS:
                    out[key] = shipped_translation(child, code) or child
                    continue
            if key in _NAME_LIST_KEYS and isinstance(child, list):
                out[key] = [
                    (names.get(c) or shipped_translation(c, code) or c) if isinstance(c, str) else apply(c)
                    for c in child
                ]
                continue
            out[key] = apply(child)
        return out

    return apply(data)


async def _specialty_name_map(db: AsyncSession, locale: str) -> dict[str, str]:
    """English specialty name -> admin translation (for payloads that only carry names)."""
    stmt = (
        select(Specialty.name, ContentTranslation.text)
        .join(ContentTranslation, ContentTranslation.entity_id == cast(Specialty.id, SAString))
        .where(
            ContentTranslation.entity_type == "specialty",
            ContentTranslation.field == "name",
            ContentTranslation.locale == locale,
        )
    )
    return {name: text for name, text in (await db.execute(stmt)).all()}


async def translate_values(
    db: AsyncSession, locale: str | None, entity_type: str, entity_id: str, values: dict[str, str | None]
) -> dict[str, str | None]:
    """``values`` (English, per field) translated for one entity: admin row -> shipped -> English."""
    code = _locale(locale)
    if code == i18n.DEFAULT_LANGUAGE:
        return dict(values)
    rows = await _rows(db, code, [entity_id], entity_type)
    return {
        field: (rows.get((entity_id, field)) or localize_text(text, code, field=field)) if text else text
        for field, text in values.items()
    }


async def translate_many(
    db: AsyncSession, locale: str | None, entity_type: str, items: dict[str, dict[str, str | None]]
) -> dict[str, dict[str, str | None]]:
    """:func:`translate_values` for several entities in one query (``{entity_id: {field: english}}``)."""
    code = _locale(locale)
    if code == i18n.DEFAULT_LANGUAGE:
        return {k: dict(v) for k, v in items.items()}
    rows = await _rows(db, code, items.keys(), entity_type)
    return {
        entity_id: {
            field: (rows.get((entity_id, field)) or localize_text(text, code, field=field)) if text else text
            for field, text in values.items()
        }
        for entity_id, values in items.items()
    }


def translated_entity_ids(entity_type: str, field: str, term: str) -> Any:
    """Subquery of ``entity_id`` (text) whose admin translation of ``field`` contains ``term`` (any language),
    for catalog search."""
    from app.modules.catalog.utils import like_pattern

    return select(ContentTranslation.entity_id).where(
        ContentTranslation.entity_type == entity_type,
        ContentTranslation.field == field,
        ContentTranslation.text.ilike(like_pattern(term), escape="\\"),
    )


# --------------------------------------------------------------------------------------------- admin
class ContentFieldTranslation(BaseModel):
    text: str | None = None
    """The admin translation (``None``: none saved)."""
    shipped: str | None = None
    """The translation shipped with the platform for the current English text (``None``: none)."""
    effective: str | None = None
    """What patients see in this language (admin -> shipped -> English)."""
    updated_at: datetime | None = None


class ContentFieldOut(BaseModel):
    field: str
    source: str | None = None
    """The English text (the source)."""
    translations: dict[str, ContentFieldTranslation] = Field(default_factory=dict)


class ContentTranslationsOut(BaseModel):
    entity_type: str
    entity_id: str
    locales: list[str]
    fields: list[ContentFieldOut]


class ContentTranslationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    locale: str = Field(min_length=2, max_length=10)
    field: str = Field(min_length=1, max_length=60)
    text: str | None = Field(default=None, max_length=MAX_TEXT)
    """Empty or ``null`` removes the admin translation (the shipped one / English is used again)."""


class ContentTranslationsPut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    translations: list[ContentTranslationIn] = Field(min_length=1, max_length=100)


def _require_entity_type(entity_type: str) -> tuple[str, ...]:
    fields = CONTENT_ENTITY_FIELDS.get(entity_type)
    if fields is None:
        raise NotFound("Unknown content type", code="unknown_content_type")
    return fields


async def _source_values(db: AsyncSession, entity_type: str, entity_id: str) -> dict[str, str | None]:
    """English values of an entity's translatable fields; ``NotFound`` when the entity does not exist."""
    fields = _require_entity_type(entity_type)
    if entity_type in ("visa_rule", "visa_checklist"):
        return await _visa_source(db, entity_type, entity_id)
    try:
        pk = uuid.UUID(entity_id)
    except ValueError:
        raise NotFound("Content not found") from None
    model: Any = {
        "specialty": Specialty,
        "procedure": Procedure,
        "hospital": Hospital,
        "doctor": Doctor,
        "cultural_tip": CulturalTip,
        "cost_benchmark": CostBenchmark,
    }[entity_type]
    row = await db.get(model, pk)
    if row is None and entity_type == "cultural_tip":
        from app.modules.catalog.content import DEFAULT_CULTURAL_TIPS

        for tip in DEFAULT_CULTURAL_TIPS:
            if tip["id"] == str(pk):
                return {f: tip.get(f) for f in fields}
    if row is None:
        raise NotFound("Content not found")
    return {f: getattr(row, f, None) for f in fields}


async def _visa_source(db: AsyncSession, entity_type: str, entity_id: str) -> dict[str, str | None]:
    from app.core.enums import VisaRoute
    from app.modules.travel import visa, visa_data

    if entity_type == "visa_rule":
        code = entity_id.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", code):
            raise NotFound("Content not found")
        rule = await visa.resolve_rule(db, code)
        return {"notes": rule.notes}
    route, _, rest = entity_id.partition(":")
    nationality, _, item_key = rest.partition(":")
    if route not in {r.value for r in VisaRoute} or not item_key:
        raise NotFound("Content not found")
    nat = None if nationality in ("*", "") else nationality.upper()
    stmt = select(VisaChecklistItem).where(
        VisaChecklistItem.visa_route == VisaRoute(route), VisaChecklistItem.item_key == item_key
    )
    stmt = stmt.where(
        VisaChecklistItem.nationality.is_(None) if nat is None else VisaChecklistItem.nationality == nat
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is not None:
        return {"title": row.title, "description": row.description}
    for item in visa_data.default_checklist():
        if item["visa_route"] == route and item["item_key"] == item_key and item["nationality"] == nat:
            return {"title": item["title"], "description": item["description"]}
    raise NotFound("Content not found")


def _shipped(field: str, english: str | None, locale: str) -> str | None:
    if not english:
        return None
    if field == "wait_time_text":
        waited = localize_wait_text(english, locale)
        if waited is not None:
            return waited
    return shipped_translation(english, locale)


async def entity_translations(db: AsyncSession, entity_type: str, entity_id: str) -> ContentTranslationsOut:
    source = await _source_values(db, entity_type, entity_id)
    entity_id = _normal_id(entity_type, entity_id)
    locales = [c for c in i18n.SUPPORTED_LANGUAGES if c != i18n.DEFAULT_LANGUAGE]
    stmt = select(ContentTranslation).where(
        ContentTranslation.entity_type == entity_type, ContentTranslation.entity_id == entity_id
    )
    saved = {(r.field, r.locale): r for r in (await db.execute(stmt)).scalars()}
    fields: list[ContentFieldOut] = []
    for field, english in source.items():
        per: dict[str, ContentFieldTranslation] = {}
        for code in locales:
            row = saved.get((field, code))
            shipped = _shipped(field, english, code)
            per[code] = ContentFieldTranslation(
                text=row.text if row is not None else None,
                shipped=shipped,
                effective=(row.text if row is not None else None) or shipped or english,
                updated_at=row.updated_at if row is not None else None,
            )
        fields.append(ContentFieldOut(field=field, source=english, translations=per))
    return ContentTranslationsOut(
        entity_type=entity_type, entity_id=entity_id, locales=locales, fields=fields
    )


def _normal_id(entity_type: str, entity_id: str) -> str:
    if entity_type == "visa_rule":
        return entity_id.strip().upper()
    if entity_type == "visa_checklist":
        route, _, rest = entity_id.partition(":")
        nationality, _, item_key = rest.partition(":")
        return checklist_entity_id(route, None if nationality in ("*", "") else nationality, item_key)
    return entity_id.strip().lower()


async def put_entity_translations(
    db: AsyncSession,
    actor: User,
    entity_type: str,
    entity_id: str,
    body: ContentTranslationsPut,
    request: Request | None = None,
) -> ContentTranslationsOut:
    from app.modules.i18n.service import clean_text

    allowed = _require_entity_type(entity_type)
    await _source_values(db, entity_type, entity_id)  # 404 for unknown entities
    entity_id = _normal_id(entity_type, entity_id)
    locales = set(i18n.SUPPORTED_LANGUAGES) - {i18n.DEFAULT_LANGUAGE}
    changes: dict[str, Any] = {}
    for index, item in enumerate(body.translations):
        code = i18n.normalize_locale(item.locale)
        if code not in locales:
            raise ValidationFailed(
                "Unknown or non-translatable language",
                details=[
                    {
                        "loc": ["body", "translations", index, "locale"],
                        "msg": "unknown",
                        "type": "value_error",
                    }
                ],
            )
        if item.field not in allowed:
            raise ValidationFailed(
                f"{entity_type} has no translatable field {item.field!r}",
                details=[
                    {"loc": ["body", "translations", index, "field"], "msg": "unknown", "type": "value_error"}
                ],
            )
        text = clean_text(item.text or "")
        key = f"{code}.{item.field}"
        if not text:
            await db.execute(
                delete(ContentTranslation).where(
                    ContentTranslation.entity_type == entity_type,
                    ContentTranslation.entity_id == entity_id,
                    ContentTranslation.field == item.field,
                    ContentTranslation.locale == code,
                )
            )
            changes[key] = None
            continue
        stmt = (
            pg_insert(ContentTranslation)
            .values(
                id=uuid7(),
                entity_type=entity_type,
                entity_id=entity_id,
                field=item.field,
                locale=code,
                text=text,
                updated_by_user_id=actor.id,
            )
            .on_conflict_do_update(
                constraint="uq_content_translations_entity_field_locale",
                set_={"text": text, "updated_by_user_id": actor.id, "updated_at": func.now()},
            )
        )
        await db.execute(stmt)
        changes[key] = text
    await audit_log(
        db,
        actor=actor,
        action="i18n.content_translation_set",
        entity_type=entity_type,
        entity_id=entity_id[:100],
        after=changes,
        request=request,
    )
    await db.commit()
    from app.modules.catalog.service import invalidate_catalog_cache

    await invalidate_catalog_cache()
    return await entity_translations(db, entity_type, entity_id)


def search_condition(
    entity_type: str, id_column: Any, name_column: Any, term: str, field: str = "name"
) -> Any:
    """SQL condition: the row's admin translation of ``field`` or the shipped translation of its English
    ``name_column`` contains ``term`` (any language)."""
    from app.i18n.content import glossary_sources_matching

    conditions = [cast(id_column, SAString).in_(translated_entity_ids(entity_type, field, term))]
    sources = glossary_sources_matching(term)
    if sources:
        conditions.append(name_column.in_(sources))
    return or_(*conditions)
