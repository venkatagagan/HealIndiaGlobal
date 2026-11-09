"""Public-website integration of the catalogue: HTTP caching (ETag / Cache-Control / 304), the website's rate
limit budget, on-demand ISR revalidation jobs, and the admin benchmark-gaps report."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select

from app.core import jobs as jobs_module
from app.core.config import settings
from app.core.enums import JobStatus
from app.models import BackgroundJob, Review
from app.modules.catalog import revalidate
from app.modules.catalog.admin import parse_country_groups
from app.modules.catalog.http_cache import PUBLIC_CACHE_CONTROL, etag_matches
from app.modules.catalog.service import invalidate_catalog_cache
from app.modules.catalog.settings import catalog_settings
from tests.factories import create_case, create_hospital, create_package, create_patient
from tests.modules.catalog_helpers import add_benchmark, build_world

API = "/api/v1"
SECRET = "test-revalidate-secret-value-123"


# ----------------------------------------------------------------------------- HTTP caching
async def test_public_get_has_etag_cache_control_and_304(client, db):
    await build_world(db)
    for path in ("/procedures", "/procedures/cabg", "/hospitals", "/hospitals/apollo-delhi", "/doctors"):
        r = await client.get(f"{API}{path}")
        assert r.status_code == 200, (path, r.text)
        assert r.headers["cache-control"] == PUBLIC_CACHE_CONTROL
        etag = r.headers["etag"]
        assert etag.startswith('"') and etag.endswith('"')
        r2 = await client.get(f"{API}{path}", headers={"If-None-Match": etag})
        assert r2.status_code == 304 and r2.content == b""
        assert r2.headers["etag"] == etag
        assert r2.headers["cache-control"] == PUBLIC_CACHE_CONTROL
        # a compressing proxy weakens the tag; still a match
        r3 = await client.get(f"{API}{path}", headers={"If-None-Match": f'W/{etag}, "other"'})
        assert r3.status_code == 304
        assert (await client.get(f"{API}{path}", headers={"If-None-Match": '"stale"'})).status_code == 200


async def test_etag_changes_with_data(client, db):
    w = await build_world(db)
    r = await client.get(f"{API}/procedures/cabg")
    etag = r.headers["etag"]
    w.bypass.description = "Updated description"
    await db.commit()
    await invalidate_catalog_cache()
    r = await client.get(f"{API}/procedures/cabg", headers={"If-None-Match": etag})
    assert r.status_code == 200 and r.headers["etag"] != etag
    assert r.json()["description"] == "Updated description"


async def test_cache_policies_for_auth_availability_and_errors(client, db, make_user, auth_headers):
    w = await build_world(db)
    user = await make_user(role="patient")
    r = await client.get(f"{API}/procedures", headers=auth_headers(user))
    assert r.status_code == 200 and r.headers["cache-control"] == "private, no-cache"
    r = await client.get(f"{API}/doctors/{w.dr_anil.id}/availability")
    assert r.status_code == 200 and r.headers["cache-control"].startswith("public, max-age=60")
    r = await client.get(f"{API}/procedures/does-not-exist")
    assert r.status_code == 404
    assert "public" not in r.headers.get("cache-control", "") and "etag" not in r.headers


def test_etag_matches_rules():
    assert etag_matches('"a"', '"a"')
    assert etag_matches('W/"a"', '"a"')
    assert etag_matches('"x", W/"a"', '"a"')
    assert etag_matches("*", '"a"')
    assert not etag_matches(None, '"a"')
    assert not etag_matches('"b"', '"a"')


async def test_public_hospital_detail_has_no_case_link_or_personal_data(client, db):
    w = await build_world(db)
    patient = await create_patient(db, first_name="Amara", last_name="Okafor")
    case = await create_case(db, patient, w.apollo)
    db.add(
        Review(
            hospital_id=w.apollo.id,
            patient_id=patient.id,
            case_id=case.id,
            rating=5,
            title="Great",
            status="published",
        )
    )
    await db.commit()
    r = await client.get(f"{API}/hospitals/apollo-delhi")
    assert r.status_code == 200
    review = r.json()["reviews"][0]
    assert review["case_id"] is None
    assert review["patient_name"] == "Amara O."
    body = r.text
    assert str(case.id) not in body and str(patient.id) not in body and "Okafor" not in body


# ----------------------------------------------------------------------------- rate limits
@pytest.fixture
def rate_limits_on(monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(catalog_settings, "CATALOG_RATE_LIMIT_PUBLIC", 3)
    monkeypatch.setattr(catalog_settings, "CATALOG_RATE_LIMIT_WEBSITE", 8)


async def test_public_budget_is_limited(client, db, rate_limits_on, monkeypatch):
    monkeypatch.setattr(catalog_settings, "WEBSITE_SERVER_IPS", [])
    codes = [(await client.get(f"{API}/specialties")).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


async def test_website_server_gets_its_own_generous_budget(client, db, rate_limits_on, monkeypatch):
    # The test client connects from 127.0.0.1: declare it the website server.
    monkeypatch.setattr(catalog_settings, "WEBSITE_SERVER_IPS", ["127.0.0.1/32"])
    codes = [(await client.get(f"{API}/specialties")).status_code for _ in range(9)]
    assert codes == [200] * 8 + [429]
    # A public visitor forwarded by the (trusted, local) edge is counted on the public budget instead.
    xff = {"X-Forwarded-For": "203.0.113.7"}
    codes = [(await client.get(f"{API}/specialties", headers=xff)).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


# ----------------------------------------------------------------------------- revalidation jobs
@pytest.fixture
def revalidation_on(monkeypatch):
    monkeypatch.setattr(catalog_settings, "REVALIDATE_SECRET", SECRET)
    monkeypatch.setattr(catalog_settings, "WEBSITE_REVALIDATE_URL", "http://website.test/api/revalidate")


@pytest.fixture
def website(monkeypatch):
    """Mocked website: records requests; ``state["status"]`` / ``state["raise"]`` control the reply."""
    state: dict[str, Any] = {"status": 200, "raise": None, "requests": []}

    def handler(request: httpx.Request) -> httpx.Response:
        state["requests"].append(request)
        if state["raise"] is not None:
            raise state["raise"]
        return httpx.Response(state["status"], json={"revalidated": True})

    monkeypatch.setattr(revalidate, "HTTP_TRANSPORT", httpx.MockTransport(handler))
    return state


async def _jobs(db) -> list[BackgroundJob]:
    db.expire_all()
    rows = await db.execute(
        select(BackgroundJob)
        .where(BackgroundJob.task_name == revalidate.TASK_NAME)
        .order_by(BackgroundJob.created_at, BackgroundJob.id)
    )
    return list(rows.scalars())


async def _run_due() -> int:
    later = datetime.now(UTC) + timedelta(seconds=revalidate.DELAY_SECONDS + 5)
    return await jobs_module.run_pending_jobs(now=later)


async def test_no_job_when_secret_unset(db):
    w = await build_world(db)
    w.bypass.name = "Coronary bypass"
    await db.commit()
    assert await _jobs(db) == []


async def test_procedure_change_enqueues_and_posts_tags(db, revalidation_on, website):
    w = await build_world(db)
    await _run_due()  # the world's own creation job
    website["requests"].clear()
    w.knee.description = "New text"
    await db.commit()
    jobs = await _jobs(db)
    assert jobs, "a revalidation job is enqueued in the same transaction"
    job = jobs[-1]
    assert "procedure:total-knee-replacement" in job.payload["tags"]
    assert SECRET not in json.dumps(job.payload)
    assert job.run_at > datetime.now(UTC)  # small delay so the API cache is cleared first

    assert await _run_due() >= 1
    request = website["requests"][-1]
    assert request.method == "POST" and str(request.url) == "http://website.test/api/revalidate"
    assert request.headers["authorization"] == f"Bearer {SECRET}"
    assert SECRET not in str(request.url)
    tags = json.loads(request.content)["tags"]
    assert "procedure:total-knee-replacement" in tags and tags[-1] == "catalog"
    job = (await _jobs(db))[-1]
    assert job.status == JobStatus.SUCCEEDED


async def test_package_and_hospital_procedure_resolve_slugs(db, revalidation_on, website):
    w = await build_world(db)
    await _run_due()
    website["requests"].clear()
    await create_package(db, w.hp_fortis_bypass, name="Extra package")
    await _run_due()
    tags = json.loads(website["requests"][-1].content)["tags"]
    assert {"hospital:fortis-mumbai", "procedure:cabg", "catalog"} <= set(tags)

    website["requests"].clear()
    await add_benchmark(db, w.bypass, "GB", "GBP", 20_000_00, 30_000_00)
    await _run_due()
    tags = json.loads(website["requests"][-1].content)["tags"]
    assert "procedure:cabg" in tags


async def test_doctor_change_and_slug_rename_include_old_slug(db, revalidation_on, website):
    w = await build_world(db)
    await _run_due()
    website["requests"].clear()
    w.dr_anil.slug = "dr-anil-kumar"
    await db.commit()
    await _run_due()
    tags = set(json.loads(website["requests"][-1].content)["tags"])
    assert {"doctor:dr-anil", "doctor:dr-anil-kumar", "hospital:apollo-delhi", "catalog"} <= tags


async def test_draft_hospital_edit_and_rollback_enqueue_nothing(db, revalidation_on):
    draft = await create_hospital(db, status="draft", slug="only-draft", name="Draft Only")
    before = len(await _jobs(db))
    draft.description = "work in progress"
    await db.commit()
    assert len(await _jobs(db)) == before

    active = await create_hospital(db, slug="active-one", name="Active One")
    before = len(await _jobs(db))
    active.description = "never committed"
    await db.flush()
    await db.rollback()
    assert len(await _jobs(db)) == before


async def test_admin_suspend_enqueues_hospital_tag(client, db, make_user, auth_headers, revalidation_on):
    w = await build_world(db)
    admin = await make_user(role="admin")
    r = await client.post(
        f"{API}/admin/hospitals/{w.apollo.id}/suspend", json={"reason": "Audit"}, headers=auth_headers(admin)
    )
    assert r.status_code == 200, r.text
    tags = set().union(*(set(j.payload.get("tags", [])) for j in await _jobs(db)))
    assert "hospital:apollo-delhi" in tags


async def test_retry_on_5xx_and_unreachable_permanent_on_401(db, revalidation_on, website):
    w = await build_world(db)
    await _run_due()  # flush the world's own job

    website["status"] = 503
    w.knee.description = "retry me"
    await db.commit()
    await _run_due()
    job = (await _jobs(db))[-1]
    assert job.status == JobStatus.QUEUED and job.attempts == 1  # rescheduled with backoff
    assert job.run_at > datetime.now(UTC) + timedelta(seconds=20)
    assert SECRET not in (job.last_error or "")

    website["status"] = 200
    website["raise"] = httpx.ConnectError("connection refused")
    w.bypass.description = "unreachable"
    await db.commit()
    await _run_due()
    job = (await _jobs(db))[-1]
    assert job.status == JobStatus.QUEUED and job.attempts == 1
    assert SECRET not in (job.last_error or "")

    website["raise"] = None
    website["status"] = 401
    w.ortho.description = "bad secret"  # a different change set (identical ones are deduplicated)
    await db.commit()
    await _run_due()
    job = (await _jobs(db))[-1]
    assert job.status == JobStatus.FAILED
    assert "401" in (job.last_error or "") and SECRET not in (job.last_error or "")


async def test_task_is_noop_when_disabled(db, website):
    from app.modules.catalog.tasks import revalidate_website

    await revalidate_website(db, {"tags": ["catalog"]})
    assert website["requests"] == []


# ----------------------------------------------------------------------------- benchmark gaps (admin)
async def test_benchmark_gaps_report(client, db, make_user, auth_headers):
    w = await build_world(db)
    for country, ccy in (("US", "USD"), ("GB", "GBP"), ("NG", "NGN"), ("OM", "OMR"), ("BD", "BDT")):
        await add_benchmark(db, w.knee, country, ccy, 1_000_00, 2_000_00)
    await add_benchmark(db, w.bypass, "US", "USD", 50_000_00, 80_000_00)

    staff = await make_user(role="admin")
    r = await client.get(f"{API}/admin/catalog/benchmark-gaps", headers=auth_headers(staff))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["countries"] == ["US", "GB", "NG", "AE/OM", "BD"]
    assert body["total_active_procedures"] == 2
    assert body["procedures_with_gaps"] == 1 and body["procedures_without_any_benchmark"] == 0
    item = body["items"][0]
    assert item["procedure_slug"] == "cabg"
    assert item["benchmark_countries"] == ["US"]
    assert item["missing_countries"] == ["GB", "NG", "AE/OM", "BD"]
    assert "cache-control" not in r.headers or "public" not in r.headers["cache-control"]

    r = await client.get(
        f"{API}/admin/catalog/benchmark-gaps", params={"countries": "us,ae"}, headers=auth_headers(staff)
    )
    assert [i["procedure_slug"] for i in r.json()["items"]] == ["total-knee-replacement", "cabg"]

    patient = await make_user(role="patient")
    r = await client.get(f"{API}/admin/catalog/benchmark-gaps", headers=auth_headers(patient))
    assert r.status_code == 403
    assert (await client.get(f"{API}/admin/catalog/benchmark-gaps")).status_code == 401


def test_parse_country_groups():
    assert parse_country_groups(None) == (("US",), ("GB",), ("NG",), ("AE", "OM"), ("BD",))
    assert parse_country_groups("us, gb/ie ,x,US") == (("US",), ("GB", "IE"))


async def test_resolve_tags_filters_invalid_and_caps(db):
    tags = await revalidate.resolve_tags(db, {"tags": ["specialty:cardiology", "hospital:Bad Slug!", "x:y"]})
    assert tags == ["specialty:cardiology", "catalog"]
    many = {"tags": [f"procedure:p-{i}" for i in range(150)]}
    assert await revalidate.resolve_tags(db, many) == ["catalog"]


async def test_specialty_change_sends_specialty_tag(db, revalidation_on, website):
    w = await build_world(db)
    await _run_due()
    website["requests"].clear()
    w.cardio.description = "Heart care"
    await db.commit()
    await _run_due()
    assert "specialty:cardiology" in json.loads(website["requests"][-1].content)["tags"]


def test_short_secret_disables_revalidation(monkeypatch):
    monkeypatch.setattr(catalog_settings, "REVALIDATE_SECRET", "too-short")
    assert not catalog_settings.revalidation_enabled
    monkeypatch.setattr(catalog_settings, "REVALIDATE_SECRET", SECRET)
    assert catalog_settings.revalidation_enabled
