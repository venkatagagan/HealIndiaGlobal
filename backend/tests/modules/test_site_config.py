"""Website & contact settings: super_admin-only writes, validation, audit, the public ``/site-config`` view
(ETag, no secrets), the server-only IndexNow endpoint and the ``site`` website revalidation."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select

from app.core import jobs as jobs_module
from app.core.settings_store import clear_settings_cache, get_setting
from app.core.site_settings import WEBSITE_DEFAULTS, WEBSITE_KEYS, public_helplines
from app.models import AuditLog, BackgroundJob, PlatformSetting
from app.modules.catalog import revalidate
from app.modules.catalog.settings import catalog_settings

API = "/api/v1"
SECRET = "test-revalidate-secret-value-123"


@pytest.fixture
def revalidation_on(monkeypatch):
    monkeypatch.setattr(catalog_settings, "REVALIDATE_SECRET", SECRET)
    monkeypatch.setattr(catalog_settings, "WEBSITE_REVALIDATE_URL", "http://website.test/api/revalidate")


@pytest.fixture
def website(monkeypatch):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"revalidated": True})

    monkeypatch.setattr(revalidate, "HTTP_TRANSPORT", httpx.MockTransport(handler))
    return requests


async def _put(client, headers, key, value):
    return await client.put(f"{API}/admin/settings/{key}", json={"value": value}, headers=headers)


# ------------------------------------------------------------------------------------------------ roles
async def test_only_super_admin_writes_website_keys(client, db, make_user, auth_headers):
    super_admin = await make_user(role="super_admin")
    for role in ("admin", "finance", "support"):
        user = await make_user(role=role)
        h = auth_headers(user)
        r = await _put(client, h, "website_footer", {"developer_name": "X"})
        assert r.status_code == 403, (role, r.text)
        # support never writes settings (route gate); admin and finance get the specific refusal
        assert r.json()["error"]["code"] == ("forbidden" if role == "support" else "super_admin_required")
        # ... but every staff role can read them (admin may view)
        listing = {s["key"]: s for s in (await client.get(f"{API}/admin/settings", headers=h)).json()}
        assert listing["website_footer"]["group"] == "website"
        assert listing["website_footer"]["super_admin_only"] is True
        assert listing["deposit_pct"]["group"] == "finance"

    r = await _put(
        client,
        auth_headers(super_admin),
        "helplines",
        {"whatsapp": "+91 98765 43210", "24x7": "+91-80-4000-1234", "email": "care@example.com"},
    )
    assert r.status_code == 200, r.text
    value = r.json()["value"]
    assert value["whatsapp"] == "+91 98765 43210"
    assert value["emergency"] == "112"  # missing fields keep their defaults
    assert value["whatsapp_message"] == WEBSITE_DEFAULTS["helplines"]["whatsapp_message"]

    log = (
        await db.execute(
            select(AuditLog).where(AuditLog.action == "settings.update", AuditLog.entity_id == "helplines")
        )
    ).scalar_one()
    assert log.actor_user_id == super_admin.id
    assert log.after["value"]["whatsapp"] == "+91 98765 43210"
    assert log.ip is not None

    # finance keys stay finance-only for everyone but finance / super_admin
    admin = await make_user(role="admin")
    r = await _put(client, auth_headers(admin), "deposit_pct", 25)
    assert r.json()["error"]["code"] == "finance_required"


# ------------------------------------------------------------------------------------------- validation
@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("helplines", {"whatsapp": "98765 43210"}),  # no country code
        ("helplines", {"24x7": "+91-1"}),  # too short
        ("helplines", {"24x7": "call us"}),
        ("helplines", {"email": "not-an-email"}),
        ("helplines", {"support_hours": "x" * 121}),
        ("helplines", {"fax": "+91 11 1234 5678"}),  # unknown field
        ("helplines", ["not", "an", "object"]),
        ("website_floating_buttons", {"show_whatsapp": "yes"}),
        ("website_social_links", {"facebook": "http://facebook.com/x"}),  # https only
        ("website_social_links", {"tiktok": "https://tiktok.com/@x"}),
        ("website_analytics", {"provider": "matomo"}),
        ("website_analytics", {"provider": "ga4", "ga4_measurement_id": ""}),
        ("website_analytics", {"provider": "ga4", "ga4_measurement_id": "UA-12345-1"}),
        ("website_analytics", {"plausible_domain": "not a host"}),
        ("website_search_verification", {"google": "abc def <script>"}),
        ("website_search_verification", {"indexnow_key": "short"}),
        ("website_marketing", {"max_savings_pct": {"value": 150}}),
        ("website_marketing", {"stats": [{"id": "a", "label": "A", "value": ""}]}),
        ("website_marketing", {"stats": [{"id": "a", "label": "A", "value": "1"}] * 2}),
        ("website_reviewers", [{"id": "Bad Id", "active": False}]),
        ("website_reviewers", [{"id": "dr-x", "name": "Dr X", "active": True}]),  # incomplete but active
        ("website_reviewers", [{"id": "dr-x", "photo_url": "javascript:alert(1)"}]),
        ("website_footer", {"developer_url": "ftp://dvsoft.in"}),
        ("website_footer", {"disclaimer": "x" * 1001}),
    ],
)
async def test_validation(client, make_user, auth_headers, key, value):
    h = auth_headers(await make_user(role="super_admin"))
    r = await _put(client, h, key, value)
    assert r.status_code == 400, (key, value, r.text)
    assert r.json()["error"]["code"] == "invalid_setting"


async def test_normalisation(client, make_user, auth_headers):
    h = auth_headers(await make_user(role="super_admin"))
    r = await _put(
        client,
        h,
        "website_analytics",
        {"provider": "GA4", "ga4_measurement_id": "g-abc123xyz", "plausible_domain": "HealIndia.example"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["value"] == {
        "provider": "ga4",
        "plausible_domain": "healindia.example",
        "plausible_script_url": "",
        "ga4_measurement_id": "G-ABC123XYZ",
    }
    # a pasted <meta> tag keeps only its content token
    r = await _put(
        client,
        h,
        "website_search_verification",
        {"google": '<meta name="google-site-verification" content="Ab_1-x2Y" />'},
    )
    assert r.status_code == 200, r.text
    assert r.json()["value"]["google"] == "Ab_1-x2Y"


# ---------------------------------------------------------------------------------------- public view
async def test_public_site_config_is_safe_and_cached(client, db, make_user, auth_headers):
    r = await client.get(f"{API}/site-config")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"contact", "social", "analytics", "verification", "marketing", "reviewers", "footer"}
    assert body["footer"]["developer_name"] == "DV Soft"
    assert body["marketing"]["stats"][0]["value"] == "5,000+"
    assert body["reviewers"] == []  # the seeded placeholder is inactive
    assert body["contact"]["whatsapp"] == "" and body["contact"]["emergency"] == "112"
    etag = r.headers["etag"]
    assert "max-age=60" in r.headers["cache-control"]
    assert (await client.get(f"{API}/site-config", headers={"If-None-Match": etag})).status_code == 304

    # legacy placeholder numbers stored before validation existed are never published
    db.add(
        PlatformSetting(key="helplines", value={"24x7": "+91-11-4000-0000", "whatsapp": "+91-90000-00000"})
    )
    await db.commit()
    clear_settings_cache()
    body = (await client.get(f"{API}/site-config")).json()
    assert body["contact"]["whatsapp"] == "" and body["contact"]["phone"] == ""
    assert (await client.get(f"{API}/content/helplines")).json() == {}

    h = auth_headers(await make_user(role="super_admin"))
    assert (
        await _put(
            client, h, "website_search_verification", {"bing": "ABCDEF123456", "indexnow_key": "k" * 32}
        )
    ).status_code == 200
    reviewer = {
        "id": "dr-asha-rao",
        "name": "Dr Asha Rao",
        "credentials": "MBBS, MD (Cardiology)",
        "registration_number": "KMC 12345",
        "registration_council": "Karnataka Medical Council",
        "bio": "",
        "photo_url": "/brand/reviewers/asha.jpg",
        "active": True,
    }
    draft = {**reviewer, "id": "dr-draft", "name": "", "active": False}
    assert (await _put(client, h, "website_reviewers", [reviewer, draft])).status_code == 200
    r = await client.get(f"{API}/site-config")
    body = r.json()
    assert r.headers["etag"] != etag
    assert body["verification"] == {"google": "", "bing": "ABCDEF123456"}
    assert "k" * 32 not in r.text  # the IndexNow key is server-side only
    assert [x["id"] for x in body["reviewers"]] == ["dr-asha-rao"]

    # /content/helplines (patient apps) only lists phone numbers
    await _put(client, h, "helplines", {"whatsapp": "+91 98765 43210", "email": "care@example.com"})
    assert (await client.get(f"{API}/content/helplines")).json() == {
        "whatsapp": "+91 98765 43210",
        "emergency": "112",
    }


async def test_server_endpoint_needs_the_revalidate_secret(client, make_user, auth_headers, monkeypatch):
    assert (await client.get(f"{API}/site-config/server")).status_code == 503  # not configured
    monkeypatch.setattr(catalog_settings, "REVALIDATE_SECRET", SECRET)
    assert (await client.get(f"{API}/site-config/server")).status_code == 401
    bad = {"Authorization": "Bearer wrong-secret-wrong-secret-wrong-secret"}
    assert (await client.get(f"{API}/site-config/server", headers=bad)).status_code == 401
    h = auth_headers(await make_user(role="super_admin"))
    await _put(client, h, "website_search_verification", {"indexnow_key": "abcdef0123456789"})
    r = await client.get(f"{API}/site-config/server", headers={"Authorization": f"Bearer {SECRET}"})
    assert r.status_code == 200
    assert r.json() == {"indexnow_key": "abcdef0123456789"}
    assert "no-cache" in r.headers["cache-control"]  # never stored by a shared cache


# --------------------------------------------------------------------------------------- revalidation
async def test_change_enqueues_site_revalidation(
    client, db, make_user, auth_headers, revalidation_on, website
):
    h = auth_headers(await make_user(role="super_admin"))
    r = await _put(client, h, "website_floating_buttons", {"show_call": False})
    assert r.status_code == 200, r.text
    db.expire_all()
    jobs = list(
        (
            await db.execute(select(BackgroundJob).where(BackgroundJob.task_name == revalidate.TASK_NAME))
        ).scalars()
    )
    assert len(jobs) == 1 and jobs[0].payload == {"tags": ["site"]}

    later = datetime.now(UTC) + timedelta(seconds=revalidate.DELAY_SECONDS + 5)
    assert await jobs_module.run_pending_jobs(now=later) >= 1
    assert json.loads(website[-1].content) == {"tags": ["site"]}  # no catalogue-wide purge

    # a refused change enqueues nothing
    r = await _put(client, h, "website_footer", {"developer_url": "http://x"})
    assert r.status_code == 400
    db.expire_all()
    count = len(
        list(
            (
                await db.execute(select(BackgroundJob).where(BackgroundJob.task_name == revalidate.TASK_NAME))
            ).scalars()
        )
    )
    assert count == 1


async def test_resolve_tags_keeps_site_with_catalog_changes(db):
    assert await revalidate.resolve_tags(db, {"tags": ["site"]}) == ["site"]
    assert await revalidate.resolve_tags(db, {"tags": ["site", "specialty:cardiology"]}) == [
        "specialty:cardiology",
        "catalog",
        "site",
    ]


def test_defaults_cover_every_website_key_and_helper():
    assert WEBSITE_KEYS == set(WEBSITE_DEFAULTS)
    assert public_helplines({"24x7": "+91 80 1234 5678", "email": "a@b.co", "whatsapp": ""}) == {
        "24x7": "+91 80 1234 5678"
    }


async def test_settings_store_reads_defaults(db):
    assert (await get_setting(db, "website_footer"))["developer_url"] == "https://dvsoft.in"
