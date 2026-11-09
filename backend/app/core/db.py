"""Async SQLAlchemy engine/session management.

* Request handlers get a session via the ``DbSession`` dependency (``app.core.deps``). The session is
  rolled back automatically if the request raises; **services commit explicitly** (``await db.commit()``).
* Background code (jobs, scripts) uses ``async with session_scope() as db:`` which commits on success and
  rolls back on error.
* Tests rebind the engine with ``set_engine(engine)``.

``Base`` (declarative base) lives in ``app.models.base`` - never define another one.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


def ssl_connect_args(url: str | None = None) -> dict[str, Any]:
    """asyncpg ``connect_args`` for ``DATABASE_SSLMODE`` (unless the URL already sets ``ssl``/``sslmode``)."""
    target = url or settings.DATABASE_URL
    query = target.partition("?")[2].lower()
    if "ssl=" in query or "sslmode=" in query:
        return {}
    return {"ssl": settings.DATABASE_SSLMODE}


def create_engine(url: str | None = None, **kwargs: Any) -> AsyncEngine:
    """Create an asyncpg engine with the configured pool settings (``kwargs`` override)."""
    options: dict[str, Any] = {
        "echo": settings.DB_ECHO,
        "pool_pre_ping": True,
        "future": True,
        "connect_args": ssl_connect_args(url),
    }
    if "poolclass" not in kwargs:
        options.update(
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_recycle=1800,
            pool_timeout=30,
        )
    options.update(kwargs)
    return create_async_engine(url or settings.DATABASE_URL, **options)


def _make_sessionmaker(bind: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=bind, class_=AsyncSession, expire_on_commit=False, autoflush=True)


engine: AsyncEngine = create_engine()
SessionLocal: async_sessionmaker[AsyncSession] = _make_sessionmaker(engine)


def set_engine(new_engine: AsyncEngine) -> None:
    """Rebind the module-level engine and ``SessionLocal`` (used by tests and scripts).

    ``SessionLocal`` is reconfigured in place, so modules that did ``from app.core.db import SessionLocal``
    keep working."""
    global engine
    engine = new_engine
    SessionLocal.configure(bind=new_engine)


def get_engine() -> AsyncEngine:
    return engine


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request; rollback on exception; services commit explicitly."""
    async with SessionLocal() as session:
        try:
            yield session
        except BaseException:
            await session.rollback()
            raise
        finally:
            if session.in_transaction():
                # Anything not committed by the service is discarded.
                await session.rollback()


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Transactional scope for jobs/scripts: commit on success, rollback on error."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except BaseException:
            await session.rollback()
            raise


async def ping_database() -> bool:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return True


async def dispose_engine() -> None:
    await engine.dispose()


def __getattr__(name: str) -> Any:
    # Convenience re-export: ``from app.core.db import Base`` (lazy to avoid import cycles with app.models).
    if name == "Base":
        from app.models.base import Base

        return Base
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
