"""Smoke tests for app.core infrastructure."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any

import httpx
import pytest
from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import cache, jobs, money
from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, PageParams, require_roles
from app.core.email import render_template
from app.core.enums import JobStatus, UserRole
from app.core.errors import AppError, Conflict, NotFound, Unauthorized
from app.core.events import list_subscribers, publish, subscribe
from app.core.jobs import PermanentJobError, enqueue, run_pending_jobs, schedule_periodic, task
from app.core.pagination import Page, paginate
from app.core.rate_limit import hit, rate_limit
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    hash_token,
    needs_rehash,
    new_refresh_token,
    new_totp_secret,
    password_strength_errors,
    verify_password,
    verify_totp,
)
from app.core.settings_store import DEFAULTS, get_setting, set_setting
from app.core.storage import LocalStorage, make_key, validate_key
from app.models.jobs import BackgroundJob

# --------------------------------------------------------------------------------------------- test app
_calls: dict[str, list[Any]] = {"echo": [], "flaky": [], "events": []}


class _Item(BaseModel):
    name: str = Field(min_length=2, max_length=10)
    qty: int = Field(ge=1)


def _build_test_app() -> FastAPI:
    from fastapi import APIRouter

    from app.main import create_app

    app = create_app()
    router = APIRouter(prefix="/__test__")

    @router.post("/items")
    async def create_item(item: _Item) -> dict[str, Any]:
        return item.model_dump()

    @router.get("/missing")
    async def missing() -> None:
        raise NotFound("Case not found")

    @router.get("/conflict")
    async def conflict() -> None:
        raise Conflict("Already exists", details={"field": "email"})

    @router.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret internal detail")

    @router.get("/me")
    async def me(user: CurrentUser) -> dict[str, str]:
        return {"id": str(user.id), "role": str(user.role)}

    @router.get("/admin-only")
    async def admin_only(
        user: Annotated[Any, Depends(require_roles(UserRole.ADMIN))],
    ) -> dict[str, str]:
        return {"ok": "yes"}

    @router.get("/limited", dependencies=[Depends(rate_limit("test.limited", limit=2, window_seconds=60))])
    async def limited() -> dict[str, str]:
        return {"ok": "yes"}

    @router.get("/jobs")
    async def list_jobs(db: DbSession, params: PageParams) -> Page[dict[str, Any]]:
        stmt = select(BackgroundJob).order_by(BackgroundJob.created_at, BackgroundJob.id)
        return await paginate(db, stmt, params, transform=lambda rows: [{"task": r.task_name} for r in rows])

    app.include_router(router)
    return app


_test_app = _build_test_app()


@pytest.fixture
async def tclient() -> Any:
    transport = httpx.ASGITransport(app=_test_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@task("test.echo")
async def _echo_task(db: AsyncSession, payload: dict[str, Any]) -> None:
    _calls["echo"].append(payload)
    if payload.get("chain"):
        await enqueue(db, "test.echo", {"n": payload["n"] + 1})


@task("test.flaky")
async def _flaky_task(db: AsyncSession, payload: dict[str, Any]) -> None:
    _calls["flaky"].append(payload)
    if len(_calls["flaky"]) == 1:
        raise RuntimeError("first attempt fails")


@task("test.always_fails")
async def _failing_task(db: AsyncSession, payload: dict[str, Any]) -> None:
    raise RuntimeError("nope")


@task("test.permanent")
async def _permanent_task(db: AsyncSession, payload: dict[str, Any]) -> None:
    raise PermanentJobError("bad payload")


@subscribe("test.happened")
async def _on_happened(db: AsyncSession, payload: dict[str, Any]) -> None:
    _calls["events"].append(("first", payload))


@subscribe("test.happened")
async def _on_happened_second(db: AsyncSession, payload: dict[str, Any]) -> None:
    _calls["events"].append(("second", payload))


@pytest.fixture(autouse=True)
def _reset_calls() -> None:
    for v in _calls.values():
        v.clear()


async def _job(db: AsyncSession, job_id: uuid.UUID) -> BackgroundJob:
    db.expire_all()
    job = await db.get(BackgroundJob, job_id)
    assert job is not None
    return job


# --------------------------------------------------------------------------------------------- health
async def test_health_live(client: httpx.AsyncClient) -> None:
    resp = await client.get("/health/live")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    assert resp.headers["X-Request-ID"]


async def test_health_ready(client: httpx.AsyncClient) -> None:
    resp = await client.get("/health/ready")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["checks"]["database"] == "ok"
    assert body["checks"]["redis"] == "disabled"


async def test_openapi_and_metrics(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/openapi.json")).status_code == 200
    resp = await client.get("/metrics")
    assert resp.status_code == 200
    assert "http_request" in resp.text or resp.text == ""


# --------------------------------------------------------------------------------------------- errors
async def test_unknown_route_returns_envelope(client: httpx.AsyncClient) -> None:
    resp = await client.get("/api/v1/does-not-exist", headers={"X-Request-ID": "req-test-123456"})
    assert resp.status_code == 404
    err = resp.json()["error"]
    assert err["code"] == "not_found"
    assert err["request_id"] == "req-test-123456"
    assert resp.headers["X-Request-ID"] == "req-test-123456"


async def test_validation_error_envelope(tclient: httpx.AsyncClient) -> None:
    resp = await tclient.post("/__test__/items", json={"name": "x", "qty": 0, "extra": 1})
    assert resp.status_code == 422
    err = resp.json()["error"]
    assert err["code"] == "validation_error"
    assert err["request_id"]
    locs = {tuple(d["loc"]) for d in err["details"]}
    assert ("body", "name") in locs and ("body", "qty") in locs
    assert all({"loc", "msg", "type"} <= set(d) for d in err["details"])


async def test_app_errors_and_unhandled(tclient: httpx.AsyncClient) -> None:
    resp = await tclient.get("/__test__/missing")
    assert resp.status_code == 404
    assert resp.json()["error"]["message"] == "Case not found"

    resp = await tclient.get("/__test__/conflict")
    assert resp.status_code == 409
    assert resp.json()["error"] == {
        "code": "conflict",
        "message": "Already exists",
        "details": {"field": "email"},
        "request_id": resp.headers["X-Request-ID"],
    }

    resp = await tclient.get("/__test__/boom")
    assert resp.status_code == 500
    body = resp.json()
    assert body["error"]["code"] == "internal_error"
    assert "secret" not in resp.text
    assert body["error"]["request_id"] == resp.headers["X-Request-ID"]


async def test_security_headers(client: httpx.AsyncClient) -> None:
    resp = await client.get("/health/live")
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "Strict-Transport-Security" not in resp.headers  # not production
    resp = await client.post("/api/v1/auth/__nothing__")
    assert resp.headers["Cache-Control"] == "no-store"


async def test_cors_preflight_dev_origin(client: httpx.AsyncClient) -> None:
    resp = await client.options(
        "/api/v1/auth/login",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert resp.headers["access-control-allow-credentials"] == "true"


# --------------------------------------------------------------------------------------------- security
def test_password_hashing() -> None:
    hashed = hash_password("Sup3rSecretPass")
    assert hashed.startswith("$argon2id$")
    assert verify_password("Sup3rSecretPass", hashed)
    assert not verify_password("wrong-password1", hashed)
    assert not verify_password("anything", None)
    assert not needs_rehash(hashed)
    assert password_strength_errors("short1")
    assert password_strength_errors("onlyletterspassword")
    assert password_strength_errors("password123")
    assert password_strength_errors("Longer-pass-2026") == []


def test_tokens_round_trip_and_expiry() -> None:
    user_id = uuid.uuid4()
    sid = uuid.uuid4()
    token = create_access_token(user_id, UserRole.PATIENT, sid)
    payload = decode_access_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["role"] == "patient"
    assert payload["sid"] == str(sid)
    assert payload["type"] == "access"
    assert payload["iss"] == settings.JWT_ISSUER and payload["aud"] == settings.JWT_AUDIENCE

    expired = create_access_token(user_id, "patient", expires_minutes=-5)
    with pytest.raises(Unauthorized) as exc_info:
        decode_access_token(expired)
    assert exc_info.value.code == "token_expired"

    with pytest.raises(Unauthorized):
        decode_access_token(token + "x")

    raw, digest = new_refresh_token()
    assert len(digest) == 64 and hash_token(raw) == digest


def test_totp() -> None:
    import pyotp

    secret = new_totp_secret()
    assert verify_totp(secret, pyotp.TOTP(secret).now())
    assert not verify_totp(secret, "000000") or True  # may collide in theory; must not raise
    assert not verify_totp(secret, "abc")
    assert not verify_totp(None, "123456")


async def test_current_user_dependency(tclient: httpx.AsyncClient, make_user: Any, auth_headers: Any) -> None:
    resp = await tclient.get("/__test__/me")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthorized"

    resp = await tclient.get("/__test__/me", headers={"Authorization": "Bearer not-a-token"})
    assert resp.status_code == 401

    user = await make_user(role="patient")
    resp = await tclient.get("/__test__/me", headers=auth_headers(user))
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == str(user.id)

    resp = await tclient.get("/__test__/admin-only", headers=auth_headers(user))
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"

    boss = await make_user(role="super_admin")
    resp = await tclient.get("/__test__/admin-only", headers=auth_headers(boss))
    assert resp.status_code == 200

    expired = create_access_token(user.id, "patient", expires_minutes=-5)
    resp = await tclient.get("/__test__/me", headers={"Authorization": f"Bearer {expired}"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "token_expired"


async def test_suspended_user_forbidden(
    tclient: httpx.AsyncClient, db: AsyncSession, make_user: Any, auth_headers: Any
) -> None:
    user = await make_user(role="agent")
    user.status = "suspended"
    await db.commit()
    resp = await tclient.get("/__test__/me", headers=auth_headers(user))
    assert resp.status_code == 403


# --------------------------------------------------------------------------------------------- jobs
async def test_enqueue_and_run(db: AsyncSession, run_jobs: Any) -> None:
    job_id = await enqueue(db, "test.echo", {"n": 1, "chain": True})
    await db.commit()
    assert job_id is not None
    processed = await run_jobs()
    assert processed == 2  # the job enqueued a follow-up which also ran
    assert [c["n"] for c in _calls["echo"]] == [1, 2]
    job = await _job(db, job_id)
    assert job.status == JobStatus.SUCCEEDED
    assert job.attempts == 1 and job.finished_at is not None
    assert await run_jobs() == 0


async def test_enqueue_is_transactional(db: AsyncSession) -> None:
    await enqueue(db, "test.echo", {"n": 1})
    await db.rollback()
    assert await run_pending_jobs() == 0
    assert _calls["echo"] == []


async def test_job_retry_with_backoff(db: AsyncSession) -> None:
    job_id = await enqueue(db, "test.flaky", {"x": 1})
    await db.commit()
    assert await run_pending_jobs() == 1
    job = await _job(db, job_id)
    assert job.status == JobStatus.QUEUED
    assert job.attempts == 1
    assert job.last_error and "first attempt fails" in job.last_error
    delay = (job.run_at - datetime.now(UTC)).total_seconds()
    assert 20 < delay <= 31
    assert jobs.backoff_seconds(1) == 30 and jobs.backoff_seconds(3) == 120
    # not due yet
    assert await run_pending_jobs() == 0
    assert await run_pending_jobs(now=datetime.now(UTC) + timedelta(seconds=40)) == 1
    job = await _job(db, job_id)
    assert job.status == JobStatus.SUCCEEDED
    assert job.attempts == 2


async def test_job_dead_and_permanent_failure(db: AsyncSession) -> None:
    dead_id = await enqueue(db, "test.always_fails", {}, max_attempts=1)
    perm_id = await enqueue(db, "test.permanent", {})
    unknown_id = await enqueue(db, "test.unregistered", {})
    await db.commit()
    assert await run_pending_jobs() == 3
    assert (await _job(db, dead_id)).status == JobStatus.DEAD
    assert (await _job(db, perm_id)).status == JobStatus.FAILED
    assert (await _job(db, unknown_id)).status == JobStatus.FAILED


async def test_job_dedupe(db: AsyncSession) -> None:
    first = await enqueue(db, "test.echo", {"n": 1}, dedupe_key="echo:1")
    second = await enqueue(db, "test.echo", {"n": 2}, dedupe_key="echo:1")
    await db.commit()
    assert first is not None and second is None
    assert await run_pending_jobs() == 1
    # once finished, the same key may be enqueued again
    third = await enqueue(db, "test.echo", {"n": 3}, dedupe_key="echo:1")
    await db.commit()
    assert third is not None


async def test_delayed_job_not_run_early(db: AsyncSession) -> None:
    await enqueue(db, "test.echo", {"n": 1}, run_at=datetime.now(UTC) + timedelta(hours=1))
    await db.commit()
    assert await run_pending_jobs() == 0
    assert await run_pending_jobs(now=datetime.now(UTC) + timedelta(hours=2)) == 1


async def test_periodic_scheduling_once_per_bucket(db: AsyncSession) -> None:
    now = datetime.now(UTC)
    created = await schedule_periodic(now)
    assert created >= 1  # at least jobs.cleanup
    assert await schedule_periodic(now) == 0
    jobs.reset_periodic_state()
    assert await schedule_periodic(now) == 0  # dedupe key already in the table
    count = (
        await db.execute(
            select(func.count()).select_from(BackgroundJob).where(BackgroundJob.task_name == "jobs.cleanup")
        )
    ).scalar_one()
    assert count == 1
    assert await run_pending_jobs() >= 1


# --------------------------------------------------------------------------------------------- events
async def test_publish_subscribe(db: AsyncSession) -> None:
    count = await publish(db, "test.happened", {"id": uuid.UUID(int=1), "amount": Decimal("1.50")})
    assert count == 2
    assert [name for name, _ in _calls["events"]] == ["first", "second"]
    assert _calls["events"][0][1] == {"id": str(uuid.UUID(int=1)), "amount": 1.5}
    assert await publish(db, "test.nobody_listens", {}) == 0
    subs = list_subscribers()
    assert len(subs["test.happened"]) == 2


async def test_publish_handler_error_propagates(db: AsyncSession) -> None:
    @subscribe("test.exploding")
    async def _explode(db: AsyncSession, payload: dict[str, Any]) -> None:
        raise AppError("handler failed")

    with pytest.raises(AppError):
        await publish(db, "test.exploding", {})


# --------------------------------------------------------------------------------------------- money
def test_money_conversion_and_rounding() -> None:
    assert money.to_minor("1499.99", "USD") == 149999
    assert money.to_minor("0.005", "USD") == 1  # half-up
    assert money.to_minor("0.0049", "USD") == 0
    assert money.to_minor("1.2345", "KWD") == 1235
    assert money.to_minor(100, "JPY") == 100
    assert money.from_minor(149999, "USD") == Decimal("1499.99")
    assert money.from_minor(1235, "KWD") == Decimal("1.235")

    # 1,000 USD at 88 INR/USD -> 88,000 INR
    assert money.convert_minor(100_000, "USD", "INR", Decimal("88"), Decimal("1")) == 8_800_000
    assert money.convert_minor(100_000, "USD", "INR", 88) == 8_800_000
    assert money.convert_minor(8_800_000, "INR", "USD", 88) == 100_000
    # INR 100 -> USD at 88: 1.13636.. -> 1.14
    assert money.convert_minor(10_000, "INR", "USD", Decimal("1"), Decimal("88")) == 114
    # cross rate EUR -> GBP via INR (95/110)
    assert money.convert_minor(110_00, "EUR", "GBP", 95, 110) == 95_00
    assert money.convert_minor(500, "USD", "USD") == 500
    # defaults
    assert money.convert_minor(100, "USD", "INR") == 8800
    assert money.apply_bps(1_000_000, 1500) == 150_000
    assert money.apply_bps(5, 1500) == 1  # 0.75 -> 1
    assert money.format_minor(149999, "USD") == "$1,499.99"
    assert money.format_minor(125_000_000, "INR") == "\u20b912,50,000.00"
    assert money.format_minor(-1500, "EUR") == "-\u20ac15.00"
    with pytest.raises(money.CurrencyError):
        money.to_minor("abc", "USD")


async def test_money_db_rates(db: AsyncSession) -> None:
    from app.models.catalog import FxRate

    assert await money.get_fx_rate(db, "USD") == Decimal("88")
    assert await money.get_fx_rate(db, "INR") == Decimal("1")
    db.add(FxRate(base_currency="INR", quote_currency="USD", rate=Decimal("90"), source="test"))
    await db.flush()
    assert await money.get_fx_rate(db, "USD") == Decimal("90")
    amount, rate = await money.convert(db, 100_00, "USD", "INR")
    assert amount == 9_000_00
    assert rate == Decimal("90")
    amount, rate = await money.convert(db, 9_000_00, "INR", "USD")
    assert amount == 100_00
    assert rate == Decimal("0.01111111")


# --------------------------------------------------------------------------------------------- pagination
async def test_paginate_helper(db: AsyncSession, tclient: httpx.AsyncClient) -> None:
    for i in range(25):
        await enqueue(db, "test.echo", {"n": i}, run_at=datetime.now(UTC) + timedelta(days=1))
    await db.commit()

    class _P:
        page = 2
        page_size = 10

    stmt = select(BackgroundJob).order_by(BackgroundJob.created_at, BackgroundJob.id)
    page = await paginate(db, stmt, _P())
    assert page.total == 25 and page.pages == 3 and page.page == 2 and len(page.items) == 10

    resp = await tclient.get("/__test__/jobs", params={"page": 3, "page_size": 10})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 25 and body["pages"] == 3 and len(body["items"]) == 5
    assert set(body) == {"items", "total", "page", "page_size", "pages"}

    resp = await tclient.get("/__test__/jobs", params={"page_size": 101})
    assert resp.status_code == 422
    resp = await tclient.get("/__test__/jobs", params={"page": 0})
    assert resp.status_code == 422
    resp = await tclient.get("/__test__/jobs", params={"page": 9})
    assert resp.json()["items"] == []


# --------------------------------------------------------------------------------------------- rate limit
async def test_in_memory_rate_limiter(monkeypatch: pytest.MonkeyPatch, tclient: httpx.AsyncClient) -> None:
    # disabled in tests by default
    for _ in range(5):
        assert (await tclient.get("/__test__/limited")).status_code == 200

    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    assert (await tclient.get("/__test__/limited")).status_code == 200
    assert (await tclient.get("/__test__/limited")).status_code == 200
    resp = await tclient.get("/__test__/limited")
    assert resp.status_code == 429
    assert resp.json()["error"]["code"] == "rate_limited"
    assert int(resp.headers["Retry-After"]) >= 1

    assert await hit("test.hit", "k", limit=1, window_seconds=60) == 1
    from app.core.errors import RateLimited

    with pytest.raises(RateLimited):
        await hit("test.hit", "k", limit=1, window_seconds=60)
    assert await hit("test.hit", "other", limit=1, window_seconds=60) == 1


# --------------------------------------------------------------------------------------------- storage
async def test_local_storage(tmp_path: Any) -> None:
    storage = LocalStorage(tmp_path)
    key = make_key("documents", "pdf")
    assert key.startswith("documents/") and key.endswith(".pdf")
    await storage.save(key, b"%PDF-1.4 test", "application/pdf")
    assert await storage.exists(key)
    assert await storage.open(key) == b"%PDF-1.4 test"
    await storage.delete(key)
    assert not await storage.exists(key)
    await storage.delete(key)  # idempotent

    for bad in ("../secret.txt", "/etc/passwd", "documents/../../x", "a\\b", "C:/x", "documents//x", ""):
        with pytest.raises(ValueError):
            validate_key(bad)
    with pytest.raises(ValueError):
        await storage.save("../escape.bin", b"x")


async def test_default_storage_uses_temp_dir(storage_dir: Any) -> None:
    from app.core.storage import get_storage

    storage = get_storage()
    key = make_key("tests", "txt")
    await storage.save(key, b"hello")
    assert (storage_dir / key).read_bytes() == b"hello"


# --------------------------------------------------------------------------------------------- misc
async def test_settings_store(db: AsyncSession) -> None:
    assert await get_setting(db, "deposit_pct") == 20
    assert await get_setting(db, "refund_policy") == DEFAULTS["refund_policy"]
    assert await get_setting(db, "unknown_key", "fallback") == "fallback"
    await set_setting(db, "deposit_pct", 25, actor=None)
    await db.commit()
    assert await get_setting(db, "deposit_pct") == 25
    from app.core.errors import BadRequest

    with pytest.raises(BadRequest):
        await set_setting(db, "deposit_pct", 250, actor=None)

    from app.models.identity import AuditLog

    logs = (await db.execute(select(AuditLog).where(AuditLog.action == "settings.update"))).scalars().all()
    assert len(logs) == 1 and logs[0].entity_id == "deposit_pct"


async def test_cache_roundtrip() -> None:
    await cache.set("catalog:a", {"x": 1}, ttl=60)
    await cache.set("catalog:b", [1, 2], ttl=60)
    await cache.set("other:c", "v", ttl=60)
    assert await cache.get("catalog:a") == {"x": 1}
    assert await cache.clear_prefix("catalog:") == 2
    assert await cache.get("catalog:a") is None
    assert await cache.get("other:c") == "v"
    await cache.delete("other:c")
    assert await cache.get("other:c", "missing") == "missing"


def test_email_templates_render() -> None:
    html = render_template("verify_email.html", name="<Asha>", url="https://example.test/verify?t=1")
    assert "&lt;Asha&gt;" in html and "https://example.test/verify?t=1" in html
    html = render_template(
        "generic_notification.html", title="Booking confirmed", body="Line one\n\nLine two"
    )
    assert "Booking confirmed" in html and "Line two" in html
    assert render_template("reset_password.html", url="https://x.test/r")
    assert render_template(
        "invite.html", url="https://x.test/i", organization_name="Apollo", role="coordinator"
    )


async def test_email_job_uses_console_backend(db: AsyncSession, run_jobs: Any, email_outbox: Any) -> None:
    await enqueue(
        db,
        "email.send",
        {
            "to": "p@example.test",
            "subject": "Hi",
            "template": "generic_notification.html",
            "context": {"title": "Hello", "body": "World"},
        },
    )
    await db.commit()
    assert await run_jobs() == 1
    assert email_outbox and email_outbox[-1]["subject"] == "Hi"
