"""Languages and admin translation overrides (multi-language support).

* ``languages``: one row per supported language. English is the default and can never be disabled; the others
  are switched on/off by admins. Seeded by migration 0009f (only English enabled). Application code also
  falls back to ``app.i18n.DEFAULT_LANGUAGES`` for codes without a row.
* ``translation_overrides``: an admin's replacement text for one key of one app's shipped catalog in one
  language. A row whose ``text`` is NULL is a tombstone (the override was removed); it is kept so the public
  ``version`` of the overrides of that app/locale still moves forward after a deletion.
"""

from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin, fk

__all__ = ["OVERRIDE_APPS", "Language", "TranslationOverride"]

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
