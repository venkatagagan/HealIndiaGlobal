"""Async Alembic environment using settings.DATABASE_URL and the models' metadata."""

from __future__ import annotations

import asyncio
from logging.config import fileConfig
from typing import Any

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy.types import TypeDecorator

import app.models  # noqa: F401  - registers every model on Base.metadata
from alembic import context
from app.core.config import settings
from app.models.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Allow `-x dburl=...` overrides (e.g. a throw-away database); default to the app setting.
_x_args = context.get_x_argument(as_dictionary=True)
config.set_main_option("sqlalchemy.url", (_x_args.get("dburl") or settings.DATABASE_URL).replace("%", "%%"))

target_metadata = Base.metadata


def _include_object(obj: object, name: str | None, type_: str, reflected: bool, compare_to: object) -> bool:
    # Ignore objects that exist only in the database and are managed outside the models (e.g. extensions'
    # tables), never dropping them in autogenerate.
    return not (type_ == "table" and reflected and compare_to is None)


def _render_item(type_: str, obj: Any, autogen_context: Any) -> str | bool:
    # App-specific TypeDecorators (EncryptedString, StrId, ...) are rendered as their underlying SQL type so
    # migration files never import application code.
    if type_ == "type" and isinstance(obj, TypeDecorator) and type(obj).__module__.startswith("app."):
        return f"sa.{obj.impl_instance!r}"
    return False


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=_include_object,
        render_item=_render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        include_object=_include_object,
        render_item=_render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    from app.core.db import ssl_connect_args

    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=ssl_connect_args(config.get_main_option("sqlalchemy.url")),
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
