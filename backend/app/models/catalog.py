"""Catalog: specialties, procedures, cost benchmarks, content, FX rates, platform settings (PLAN 4.4)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Integer, Numeric, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    Base,
    TimestampMixin,
    UUIDPkMixin,
    currency_col,
    fk,
    money_col,
    text_array_col,
)

__all__ = ["CostBenchmark", "CulturalTip", "FxRate", "PlatformSetting", "Procedure", "Specialty"]


class Specialty(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "specialties"
    __table_args__ = (
        sa.CheckConstraint(
            "savings_min_pct IS NULL OR (savings_min_pct >= 0 AND savings_min_pct <= 100)",
            name="savings_min_pct_range",
        ),
        sa.CheckConstraint(
            "savings_max_pct IS NULL OR (savings_max_pct >= 0 AND savings_max_pct <= 100)",
            name="savings_max_pct_range",
        ),
    )

    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(String(64))
    savings_min_pct: Mapped[int | None] = mapped_column(Integer)
    savings_max_pct: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.true(), index=True
    )


class Procedure(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "procedures"
    __table_args__ = (
        sa.Index(
            "ix_procedures_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}
        ),
        sa.Index("ix_procedures_keywords", "keywords", postgresql_using="gin"),
        sa.Index("ix_procedures_body_areas", "body_areas", postgresql_using="gin"),
        sa.CheckConstraint(
            "(india_price_min_minor IS NULL OR india_price_min_minor >= 0) AND "
            "(india_price_max_minor IS NULL OR india_price_max_minor >= 0)",
            name="india_price_nonneg",
        ),
    )

    specialty_id: Mapped[uuid.UUID] = fk("specialties.id", ondelete="RESTRICT")
    slug: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    keywords: Mapped[list[str]] = text_array_col()
    body_areas: Mapped[list[str]] = text_array_col()
    hospital_stay_days: Mapped[int | None] = mapped_column(Integer)
    recovery_days: Mapped[int | None] = mapped_column(Integer)
    total_stay_days: Mapped[int | None] = mapped_column(Integer)
    india_price_min_minor: Mapped[int | None] = money_col(nullable=True)
    india_price_max_minor: Mapped[int | None] = money_col(nullable=True)
    currency: Mapped[str] = currency_col("INR")
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.true(), index=True
    )


class CostBenchmark(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "cost_benchmarks"
    __table_args__ = (
        sa.UniqueConstraint("procedure_id", "country_code"),
        sa.CheckConstraint("cost_min_minor >= 0 AND cost_max_minor >= 0", name="cost_nonneg"),
    )

    procedure_id: Mapped[uuid.UUID] = fk("procedures.id", ondelete="CASCADE")
    country_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    currency: Mapped[str] = currency_col(None)
    cost_min_minor: Mapped[int] = money_col()
    cost_max_minor: Mapped[int] = money_col()
    wait_time_text: Mapped[str | None] = mapped_column(String(100))
    source: Mapped[str | None] = mapped_column(String(255))
    # Where the figures come from (shown next to the home price so patients can check it).
    source_url: Mapped[str | None] = mapped_column(String(1024))
    price_year: Mapped[int | None] = mapped_column(SmallInteger)
    # "high" | "medium" | "low" (how well the source matches a self-pay price for this procedure)
    confidence: Mapped[str | None] = mapped_column(String(20))
    wait_source: Mapped[str | None] = mapped_column(String(255))


class CulturalTip(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "cultural_tips"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(1024))
    category: Mapped[str | None] = mapped_column(String(60), index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=sa.true())


class FxRate(UUIDPkMixin, TimestampMixin, Base):
    """``rate`` = INR per 1 unit of ``quote_currency``."""

    __tablename__ = "fx_rates"
    __table_args__ = (
        sa.UniqueConstraint("base_currency", "quote_currency"),
        sa.CheckConstraint("rate > 0", name="rate_positive"),
    )

    base_currency: Mapped[str] = currency_col("INR")
    quote_currency: Mapped[str] = mapped_column(String(3), nullable=False, index=True)
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    source: Mapped[str | None] = mapped_column(String(60))
    as_of: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # SEC-008: a change larger than the allowed step waits here for a second finance approver.
    pending_rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    pending_requested_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    pending_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PlatformSetting(Base):
    """Key/value platform settings (no surrogate id). Defaults live in ``app.core.settings_store``."""

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB, nullable=False)
    updated_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
