"""Languages and admin translation overrides (multi-language support).

* ``languages``: one row per supported language. English is the default and can never be disabled; the others
  are switched on/off by admins. Seeded by migration 0009f (only English enabled). Application code also
  falls back to ``app.i18n.DEFAULT_LANGUAGES`` for codes without a row.
* ``translation_overrides``: an admin's replacement text for one key of one app's shipped catalog in one
  language. A row whose ``text`` is NULL is a tombstone (the override was removed); it is kept so the public
  ``version`` of the overrides of that app/locale still moves forward after a deletion.
* ``content_translations``: an admin's translation of one patient-facing field of one piece of server-supplied
  content (a specialty's name, a doctor's bio, a visa checklist item's title ...) into one language.
  Catalog rows are keyed by their UUID (as text); visa content by a natural key (``visa_rule``: the
  nationality code; ``visa_checklist``: ``<route>:<nationality or *>:<item_key>``) so translations
  also apply to the built-in defaults. They win over the shipped translations
  (``app/i18n/content/<lng>.json``); English is the source and the fallback (see ``app.i18n.content``).
"""

from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin, fk

__all__ = ["CONTENT_ENTITY_FIELDS", "OVERRIDE_APPS", "ContentTranslation", "Language", "TranslationOverride"]

#: Allowed ``translation_overrides.app`` values (keep in sync with ``app.i18n.APPS``).
OVERRIDE_APPS: tuple[str, ...] = ("website", "patient_web", "admin", "agent", "hospital", "mobile", "server")


class Language(Base):
    __tablename__ = "languages"

    code: Mapped[str] = mapped_column(String(10), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    native_name: Mapped[str] = mapped_column(String(80), nullable=False)
    rtl: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=sa.false())
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=sa.false())
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class TranslationOverride(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "translation_overrides"
    __table_args__ = (
        sa.UniqueConstraint("locale", "app", "key", name="uq_translation_overrides_locale_app_key"),
        sa.CheckConstraint("app IN (" + ", ".join(f"'{a}'" for a in OVERRIDE_APPS) + ")", name="app_valid"),
        sa.CheckConstraint("text IS NULL OR char_length(text) <= 5000", name="text_length"),
        sa.Index("ix_translation_overrides_app_locale", "app", "locale"),
    )

    locale: Mapped[str] = mapped_column(String(10), nullable=False)
    app: Mapped[str] = mapped_column(String(20), nullable=False)
    key: Mapped[str] = mapped_column(String(300), nullable=False)
    #: NULL = removed (tombstone)
    text: Mapped[str | None] = mapped_column(Text)
    updated_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)


#: Translatable fields per ``content_translations.entity_type`` (keep in sync with migration 0010e).
CONTENT_ENTITY_FIELDS: dict[str, tuple[str, ...]] = {
    "specialty": ("name", "description"),
    "procedure": ("name", "description"),
    "hospital": ("name", "description"),
    "doctor": ("full_name", "bio"),
    "cultural_tip": ("title", "body"),
    "cost_benchmark": ("wait_time_text", "source", "wait_source"),
    "visa_rule": ("notes",),
    "visa_checklist": ("title", "description"),
}


class ContentTranslation(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "content_translations"
    __table_args__ = (
        sa.UniqueConstraint(
            "entity_type", "entity_id", "field", "locale", name="uq_content_translations_entity_field_locale"
        ),
        sa.CheckConstraint(
            "entity_type IN (" + ", ".join(f"'{e}'" for e in CONTENT_ENTITY_FIELDS) + ")",
            name="entity_type_valid",
        ),
        sa.CheckConstraint("char_length(text) <= 10000", name="text_length"),
        sa.CheckConstraint("locale <> 'en'", name="not_english"),
        sa.Index("ix_content_translations_locale_entity", "locale", "entity_id"),
    )

    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(120), nullable=False)
    field: Mapped[str] = mapped_column(String(60), nullable=False)
    locale: Mapped[str] = mapped_column(String(10), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
