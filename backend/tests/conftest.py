"""Shared pytest fixtures (PLAN section 3).

* A uniquely named PostgreSQL database ``hig_test_<pid>_<6 hex>`` is created per pytest session with the
  ``DATABASE_URL`` role, extensions + ``Base.metadata.create_all`` are applied, and it is dropped at the end.
* Every test gets a fresh NullPool engine bound via ``set_engine``; after each test all tables are TRUNCATEd
  (RESTART IDENTITY CASCADE), standalone sequences restarted and in-memory caches/rate limits reset.

Fixtures: ``engine``, ``db`` (AsyncSession), ``client`` (httpx.AsyncClient on the ASGI app),
``make_user(role=..., **fields)``, ``auth_headers(user)``, ``run_jobs()``, ``email_outbox``, ``storage_dir``.
"""

from __future__ import annotations

import os
import secrets
import shutil
import tempfile
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from pathlib import Path
from typing import Any

# --- test environment (must happen before any ``app`` import) ---------------------------------------------
_STORAGE_DIR = Path(tempfile.mkdtemp(prefix="hig_test_storage_"))
os.environ["ENV"] = "test"
os.environ["RUN_WORKER_IN_API"] = "false"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["EMAIL_BACKEND"] = "console"
os.environ["AI_ENABLED"] = "false"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STORAGE_LOCAL_DIR"] = str(_STORAGE_DIR)
os.environ["REDIS_URL"] = ""
os.environ["LOG_LEVEL"] = os.environ.get("TEST_LOG_LEVEL", "WARNING")
os.environ["ADMIN_MFA_REQUIRED"] = "false"
os.environ["REQUIRE_EMAIL_VERIFICATION"] = "false"
os.environ.setdefault("PAYMENT_GATEWAYS_ENABLED", "mock,bank_transfer,razorpay,stripe")

import asyncio  # noqa: E402

import asyncpg  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core import cache as cache_module  # noqa: E402
from app.core import db as db_module  # noqa: E402
from app.core import email as email_module  # noqa: E402
from app.core import jobs as jobs_module  # noqa: E402
from app.core import rate_limit as rate_limit_module  # noqa: E402
from app.core import settings_store  # noqa: E402
from app.core import storage as storage_module  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.events import load_module_hooks  # noqa: E402
from app.core.logging import configure_logging  # noqa: E402
from app.core.security import create_access_token  # noqa: E402

configure_logging()
import app.models  # noqa: E402, F401  - register all tables
from app.main import app as fastapi_app  # noqa: E402
from app.models.base import Base  # noqa: E402

load_module_hooks()

EXTENSIONS = ("citext", "pg_trgm", "btree_gin", "pgcrypto")


def _asyncpg_dsn(sqlalchemy_url: str, database: str | None = None) -> str:
    url = make_url(sqlalchemy_url).set(drivername="postgresql")
    if database is not None:
        url = url.set(database=database)
    return url.render_as_string(hide_password=False)


def _quote_ident(name: str) -> str:
    if not name.replace("_", "").isalnum():
        raise ValueError(f"unsafe identifier: {name!r}")
    return f'"{name}"'


async def _create_database(admin_dsn: str, test_dsn: str, name: str, sqlalchemy_url: str) -> None:
    conn = await asyncpg.connect(admin_dsn)
    try:
        await conn.execute(f"CREATE DATABASE {_quote_ident(name)} TEMPLATE template0 ENCODING 'UTF8'")
    finally:
        await conn.close()
    conn = await asyncpg.connect(test_dsn)
    try:
        for ext in EXTENSIONS:
            await conn.execute(f"CREATE EXTENSION IF NOT EXISTS {ext}")
    finally:
        await conn.close()
    engine = create_async_engine(sqlalchemy_url, poolclass=NullPool)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    finally:
        await engine.dispose()


async def _drop_database(admin_dsn: str, name: str) -> None:
    conn = await asyncpg.connect(admin_dsn)
    try:
        # Only our own role's client sessions (autovacuum workers belong to the superuser; DROP handles them).
        await conn.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = $1 AND pid <> pg_backend_pid() AND usename = current_user "
            "AND backend_type = 'client backend'",
            name,
        )
        for attempt in range(5):
            try:
                await conn.execute(f"DROP DATABASE IF EXISTS {_quote_ident(name)}")
                break
            except asyncpg.ObjectInUseError:
                if attempt == 4:
                    raise
                await asyncio.sleep(1)
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def test_database_url() -> Iterator[str]:
    """Create the per-session database and yield its SQLAlchemy URL; drop it afterwards."""
    base_url = make_url(settings.DATABASE_URL)
    name = f"hig_test_{os.getpid()}_{secrets.token_hex(3)}"
    admin_dsn = _asyncpg_dsn(settings.DATABASE_URL)  # the project's own "healindia" database
    test_dsn = _asyncpg_dsn(settings.DATABASE_URL, name)
    test_url = base_url.set(database=name).render_as_string(hide_password=False)
    asyncio.run(_create_database(admin_dsn, test_dsn, name, test_url))
    original_url = settings.DATABASE_URL
    settings.DATABASE_URL = test_url
    try:
        yield test_url
    finally:
        settings.DATABASE_URL = original_url
        asyncio.run(_drop_database(admin_dsn, name))
        shutil.rmtree(_STORAGE_DIR, ignore_errors=True)


async def _truncate_all(engine: AsyncEngine) -> None:
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        if tables:
            await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        seqs = (
            await conn.execute(
                text(
                    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE c.relkind = 'S' AND n.nspname = 'public'"
                )
            )
        ).scalars()
        for seq in list(seqs):
            await conn.execute(text(f"ALTER SEQUENCE {_quote_ident(seq)} RESTART"))


async def _reset_state() -> None:
    cache_module.clear_memory()
    await rate_limit_module.reset_rate_limits()
    settings_store.clear_settings_cache()
    jobs_module.reset_periodic_state()
    email_module.outbox.clear()
    storage_module.set_storage(None)


@pytest.fixture(autouse=True)
async def engine(test_database_url: str) -> AsyncIterator[AsyncEngine]:
    """Function-scoped NullPool engine on the test database, bound as the app engine."""
    test_engine = create_async_engine(test_database_url, poolclass=NullPool)
    previous = db_module.get_engine()
    db_module.set_engine(test_engine)
    try:
        yield test_engine
    finally:
        try:
            await _truncate_all(test_engine)
        finally:
            await _reset_state()
            db_module.set_engine(previous)
            await test_engine.dispose()


@pytest.fixture
async def db(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with db_module.SessionLocal() as session:
        try:
            yield session
        finally:
            await session.rollback()


@pytest.fixture
async def client(engine: AsyncEngine) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=fastapi_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def make_user(db: AsyncSession) -> Callable[..., Awaitable[Any]]:
    """``user = await make_user(role="hospital", email=None, password="Passw0rd!2026", **fields)`` - creates
    and commits a user via ``tests.factories.create_user``."""

    async def _make(role: str = "patient", **kwargs: Any) -> Any:
        from tests.factories import create_user

        user = await create_user(db, role=role, **kwargs)
        await db.commit()
        return user

    return _make


@pytest.fixture
def auth_headers() -> Callable[[Any], dict[str, str]]:
    """``headers = auth_headers(user)`` -> ``{"Authorization": "Bearer <access token>"}``."""

    def _headers(user: Any) -> dict[str, str]:
        token = create_access_token(user.id, str(getattr(user.role, "value", user.role)))
        return {"Authorization": f"Bearer {token}"}

    return _headers


@pytest.fixture
def run_jobs(engine: AsyncEngine) -> Callable[..., Awaitable[int]]:
    """``processed = await run_jobs()`` - drain every due background job (including jobs they enqueue)."""

    async def _run(max_jobs: int = 100) -> int:
        return await jobs_module.run_pending_jobs(max_jobs=max_jobs)

    return _run


@pytest.fixture
def email_outbox() -> list[dict[str, Any]]:
    """Messages "sent" by the console email backend during this test."""
    return email_module.outbox


@pytest.fixture
def storage_dir() -> Path:
    return _STORAGE_DIR
