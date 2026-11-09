"""Declarative base, naming convention, shared mixins and column helpers for every model."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import sqlalchemy as sa
from sqlalchemy import BigInteger, Date, DateTime, MetaData, Numeric, String, Text, event, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from app.core.ids import uuid7

__all__ = [
    "Base",
    "CreatedAtMixin",
    "NAMING_CONVENTION",
    "StrId",
    "TimestampMixin",
    "UUIDPkMixin",
    "currency_col",
    "fk",
    "json_list_col",
    "json_obj_col",
    "money_col",
    "text_array_col",
    "uuid_array_col",
]

NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {
        datetime: DateTime(timezone=True),
        date: Date(),
        uuid.UUID: UUID(as_uuid=True),
        dict: JSONB,
        dict[str, Any]: JSONB,
        Decimal: Numeric(),
        str: String(),
    }
    # Fetch server-generated values (created_at / updated_at) with RETURNING on INSERT *and* UPDATE, so they
    # are loaded after flush and never trigger an implicit (async-unsafe) refresh.
    __mapper_args__ = {"eager_defaults": True}

    def __repr__(self) -> str:
        ident = getattr(self, "id", None)
        if ident is None:
            ident = getattr(self, "key", None)
        return f"<{type(self).__name__} {ident}>"


class UUIDPkMixin:
    """``id UUID PRIMARY KEY`` defaulting to a UUIDv7.

    The id is assigned at construction time (see the ``init`` listener below), so ``obj.id`` is usable before
    the first flush (e.g. to derive ledger account codes or build FKs of sibling rows).
    """

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid7, sort_order=-100
    )


class CreatedAtMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True, sort_order=100
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), sort_order=100
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        sort_order=101,
    )


@event.listens_for(UUIDPkMixin, "init", propagate=True)
def _assign_uuid7_on_init(target: Any, args: Any, kwargs: dict[str, Any]) -> None:
    if kwargs.get("id") is None:
        kwargs["id"] = uuid7()


class StrId(TypeDecorator[str]):
    """VARCHAR that accepts ``uuid.UUID`` or ``str`` (used for polymorphic entity references)."""

    impl = String(100)
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> str | None:
        return None if value is None else str(value)

    @property
    def python_type(self) -> type[str]:
        return str


# --------------------------------------------------------------------------------------------- column helpers
def fk(
    target: str,
    *,
    ondelete: str,
    nullable: bool = False,
    index: bool = True,
    use_alter: bool = False,
    **kw: Any,
) -> Any:
    """FK column ``<table>.id`` with an index (PLAN: index every FK)."""
    return mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey(target, ondelete=ondelete, use_alter=use_alter),
        nullable=nullable,
        index=index,
        **kw,
    )


def money_col(*, nullable: bool = False, default: int | None = 0) -> Any:
    """Integer minor units (BIGINT)."""
    if nullable:
        return mapped_column(BigInteger, nullable=True)
    return mapped_column(
        BigInteger, nullable=False, default=default, server_default=sa.text(str(default or 0))
    )


def currency_col(default: str | None = "INR", *, nullable: bool = False) -> Any:
    if default is None:
        return mapped_column(String(3), nullable=nullable)
    return mapped_column(String(3), nullable=nullable, default=default, server_default=default)


def text_array_col(*, nullable: bool = False) -> Any:
    return mapped_column(ARRAY(Text), nullable=nullable, default=list, server_default=sa.text("'{}'::text[]"))


def uuid_array_col(*, nullable: bool = False) -> Any:
    return mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=nullable, default=list, server_default=sa.text("'{}'::uuid[]")
    )


def json_obj_col(*, nullable: bool = False) -> Any:
    if nullable:
        return mapped_column(JSONB, nullable=True)
    return mapped_column(JSONB, nullable=False, default=dict, server_default=sa.text("'{}'::jsonb"))


def json_list_col(*, nullable: bool = False) -> Any:
    if nullable:
        return mapped_column(JSONB, nullable=True)
    return mapped_column(JSONB, nullable=False, default=list, server_default=sa.text("'[]'::jsonb"))
