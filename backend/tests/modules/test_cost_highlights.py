"""Home-country vs India price: explicit fallback fields, home-country detection, highlights, imports."""

from __future__ import annotations

import json
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.currency import COUNTRY_CURRENCY, currency_for_country, default_currency_for_country
from app.models import AvailabilitySlot, CostBenchmark, FxRate
from app.modules.catalog.service import today_ist
from app.modules.catalog.settings import catalog_settings
from app.modules.catalog.viewer import accept_language_country
from scripts.import_benchmarks import import_rows, load_file, parse_row
from tests.factories import create_patient, create_user
from tests.modules.catalog_helpers import add_benchmark, build_world

API = "/api/v1"


async def _benchmarks(db, w):
    await add_benchmark(db, w.knee, "US", "USD", 35_000_00, 50_000_00, wait_time_text="4–12 weeks")
    await add_benchmark(db, w.knee, "GB", "GBP", 12_000_00, 15_000_00, wait_time_text="6–18 months (NHS)")
    await add_benchmark(db, w.bypass, "US", "USD", 100_000_00, 150_000_00)
    await add_benchmark(db, w.bypass, "GB", "GBP", 20_000_00, 30_000_00)
    bm = (
        await db.execute(
            select(CostBenchmark).where(
                CostBenchmark.procedure_id == w.knee.id, CostBenchmark.country_code == "GB"
            )
        )
    ).scalar_one()
    bm.source = "NHS private self-pay survey"
    bm.source_url = "https://example.org/nhs-prices"
    bm.price_year = 2025
    bm.confidence = "medium"
    bm.wait_source = "NHS RTT statistics"
    await db.commit()


# ----------------------------------------------------------------------------- cost comparison
async def test_cost_comparison_reports_source_and_country_used(client, db):
    w = await build_world(db)
    await _benchmarks(db, w)
    r = await client.get(
        f"{API}/cost-comparison", params={"procedure": "total-knee-replacement", "country": "gb"}
    )
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["requested_country"] == "GB"
    assert c["country_used"] == "GB"
    assert c["is_fallback"] is False
    assert c["country_source"] == "query"
    home = c["home"]
    assert home["currency"] == "GBP" and home["original_currency"] == "GBP"
    assert home["source"] == "NHS private self-pay survey"
    assert home["source_url"] == "https://example.org/nhs-prices"
    assert home["price_year"] == 2025 and home["confidence"] == "medium"
    assert home["wait_source"] == "NHS RTT statistics"
    assert home["wait_time_text"] == "6–18 months (NHS)"
    assert c["india"]["wait_time_text"]
    assert c["india"]["earliest_admission_date"] is None


async def test_cost_comparison_unknown_country_falls_back_explicitly(client, db):
    w = await build_world(db)
    await _benchmarks(db, w)
    r = await client.get(
        f"{API}/cost-comparison", params={"procedure": "total-knee-replacement", "country": "NG"}
    )
    c = r.json()
    assert (c["requested_country"], c["country_used"], c["is_fallback"]) == ("NG", "US", True)
    # no country at all and nothing to detect: the default, flagged as a fallback
    r = await client.get(f"{API}/cost-comparison", params={"procedure": "total-knee-replacement"})
    c = r.json()
    assert c["requested_country"] is None
    assert (c["country_used"], c["is_fallback"], c["country_source"]) == ("US", True, "default")
    assert "Accept-Language" in r.headers.get("vary", "")
    r = await client.get(
        f"{API}/cost-comparison", params={"procedure": "total-knee-replacement", "country": "1X"}
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_country"


async def test_cost_comparison_earliest_admission_in_india(client, db):
    w = await build_world(db)
    await _benchmarks(db, w)
    day = today_ist() + timedelta(days=4)
    db.add_all(
        [
            AvailabilitySlot(hospital_id=w.fortis.id, date=day, slot_kind="admission", capacity=2, booked=0),
            # full / past / draft-hospital slots never count
            AvailabilitySlot(
                hospital_id=w.apollo.id,
                date=day - timedelta(days=2),
                slot_kind="admission",
                capacity=1,
                booked=1,
            ),
            AvailabilitySlot(
                hospital_id=w.apollo.id,
                date=today_ist() - timedelta(days=1),
                slot_kind="admission",
                capacity=3,
            ),
            AvailabilitySlot(
                hospital_id=w.draft.id, date=today_ist(), slot_kind="admission", capacity=3, booked=0
            ),
        ]
    )
    await db.commit()
    r = await client.get(
        f"{API}/cost-comparison", params={"procedure": "total-knee-replacement", "country": "US"}
    )
    assert r.json()["india"]["earliest_admission_date"] == day.isoformat()


async def test_home_country_from_accept_language(client, db):
    w = await build_world(db)
    await _benchmarks(db, w)
    r = await client.get(
        f"{API}/cost-comparison",
        params={"procedure": "total-knee-replacement"},
        headers={"Accept-Language": "fr;q=0.9, en-GB;q=0.8, en;q=0.7"},
    )
    c = r.json()
    assert (c["requested_country"], c["country_used"], c["country_source"]) == ("GB", "GB", "accept_language")
    assert c["is_fallback"] is False
    assert c["home"]["currency"] == "GBP"


def test_accept_language_parsing():
    assert accept_language_country("en-GB,en;q=0.9") == "GB"
    assert accept_language_country("en;q=1, pt-BR;q=0.5, es-MX;q=0.8") == "MX"
    assert accept_language_country("zh-Hant-TW") == "TW"
    assert accept_language_country("es-419, en") is None
    assert accept_language_country("en") is None
    assert accept_language_country("") is None
    assert accept_language_country("en-XX") is None  # pseudo-country


async def test_home_country_from_patient_profile_and_account(client, db, auth_headers):
    w = await build_world(db)
    await _benchmarks(db, w)
    user = await create_user(db, role="patient", country_code="US")
    await create_patient(db, user=user, country_of_residence="GB", preferred_currency="EUR")
    await create_fx_rates_quick(db)
    r = await client.get(
        f"{API}/cost-comparison",
        params={"procedure": "total-knee-replacement"},
        headers={**auth_headers(user), "Accept-Language": "en-US"},
    )
    c = r.json()
    assert (c["requested_country"], c["country_used"], c["country_source"]) == ("GB", "GB", "profile")
    # default display currency = the patient's preferred currency
    assert c["home"]["currency"] == "EUR" and c["india"]["currency"] == "EUR"
    assert r.headers["cache-control"].startswith("private")

    # account country when the profile has none
    other = await create_user(db, role="patient", country_code="GB")
    await create_patient(db, user=other, country_of_residence=None)
    r = await client.get(
        f"{API}/cost-comparison", params={"procedure": "total-knee-replacement"}, headers=auth_headers(other)
    )
    assert (r.json()["requested_country"], r.json()["country_source"]) == ("GB", "account")

    # an expired/invalid token never breaks the public read
    r = await client.get(
        f"{API}/cost-comparison",
        params={"procedure": "total-knee-replacement"},
        headers={"Authorization": "Bearer not-a-token"},
    )
    assert r.status_code == 200 and r.json()["country_source"] == "default"


async def create_fx_rates_quick(db):
    db.add(FxRate(base_currency="INR", quote_currency="EUR", rate=Decimal("95"), source="test"))
    await db.commit()


async def test_home_country_header_only_when_trusted(client, db, monkeypatch):
    w = await build_world(db)
    await _benchmarks(db, w)
    params = {"procedure": "total-knee-replacement"}
    r = await client.get(f"{API}/cost-comparison", params=params, headers={"CF-IPCountry": "GB"})
    assert r.json()["country_source"] == "default"  # header not trusted by default
    monkeypatch.setattr(catalog_settings, "TRUST_COUNTRY_HEADER", True)
    r = await client.get(f"{API}/cost-comparison", params=params, headers={"CF-IPCountry": "GB"})
    assert (r.json()["requested_country"], r.json()["country_source"]) == ("GB", "header")
    r = await client.get(f"{API}/cost-comparison", params=params, headers={"X-Country": "gb"})
    assert r.json()["country_source"] == "header"
    # Cloudflare's "unknown" / Tor pseudo-countries are ignored
    r = await client.get(f"{API}/cost-comparison", params=params, headers={"CF-IPCountry": "T1"})
    assert r.json()["country_source"] == "default"
    # an untrusted peer cannot set it
    monkeypatch.setattr("app.core.config.settings.TRUSTED_PROXIES", ["10.255.0.0/16"])
    r = await client.get(f"{API}/cost-comparison", params=params, headers={"CF-IPCountry": "GB"})
    assert r.json()["country_source"] == "default"


# ----------------------------------------------------------------------------- highlights
async def test_highlights_rank_by_savings(client, db):
    w = await build_world(db)
    await _benchmarks(db, w)
    r = await client.get(f"{API}/cost-comparison/highlights", params={"country": "GB"})
    assert r.status_code == 200, r.text
    h = r.json()
    assert (h["requested_country"], h["country_used"], h["is_fallback"]) == ("GB", "GB", False)
    assert h["currency"] == "GBP"
    slugs = [i["procedure"]["slug"] for i in h["items"]]
    assert set(slugs) == {"total-knee-replacement", "cabg"}
    pcts = [i["savings"]["pct_max"] for i in h["items"]]
    assert pcts == sorted(pcts, reverse=True)
    knee = next(i for i in h["items"] if i["procedure"]["slug"] == "total-knee-replacement")
    assert knee["specialty"]["slug"] == "orthopedics"
    assert knee["home"]["min_minor"] == 12_000_00 and knee["home"]["max_minor"] == 15_000_00
    assert knee["home"]["source_url"] == "https://example.org/nhs-prices"
    assert knee["home"]["wait_time_text"] == "6–18 months (NHS)"
    assert knee["india"]["currency"] == "GBP" and knee["india"]["wait_time_text"]
    # India ₹3,20,000-₹5,00,000 at 110 INR/GBP
    assert knee["india"]["min_minor"] == 2909_09 and knee["india"]["max_minor"] == 4545_45
    assert knee["savings"]["min_minor"] > 0

    r = await client.get(
        f"{API}/cost-comparison/highlights", params={"country": "GB", "limit": 1, "currency": "USD"}
    )
    h = r.json()
    assert len(h["items"]) == 1 and h["currency"] == "USD"
    assert h["items"][0]["home"]["currency"] == "USD"


async def test_highlights_fallback_and_empty(client, db):
    w = await build_world(db)
    r = await client.get(f"{API}/cost-comparison/highlights", params={"country": "KE"})
    h = r.json()
    assert r.status_code == 200 and h["items"] == [] and h["is_fallback"] is True
    await _benchmarks(db, w)
    from app.modules.catalog.service import invalidate_catalog_cache

    await invalidate_catalog_cache()
    h = (await client.get(f"{API}/cost-comparison/highlights", params={"country": "KE"})).json()
    assert (h["requested_country"], h["country_used"], h["is_fallback"]) == ("KE", "US", True)
    assert h["currency"] == "USD" and len(h["items"]) == 2
    assert (await client.get(f"{API}/cost-comparison/highlights", params={"limit": 0})).status_code == 422


# ----------------------------------------------------------------------------- currency map
async def test_country_currency_map(db):
    for country, ccy in {
        "BD": "BDT",
        "IQ": "IQD",
        "OM": "OMR",
        "YE": "YER",
        "UZ": "UZS",
        "KZ": "KZT",
        "NG": "NGN",
        "KE": "KES",
        "ET": "ETB",
        "SO": "SOS",
        "CD": "CDF",
        "CM": "XAF",
        "CI": "XOF",
        "SN": "XOF",
        "NP": "NPR",
        "MV": "MVR",
        "AF": "AFN",
        "SA": "SAR",
        "AE": "AED",
        "US": "USD",
        "GB": "GBP",
        "RU": "RUB",
        "DE": "EUR",
        "FR": "EUR",
        "IE": "EUR",
    }.items():
        assert currency_for_country(country) == ccy, country
    assert currency_for_country("zz") is None and currency_for_country(None) is None
    assert all(len(k) == 2 and len(v) == 3 for k, v in COUNTRY_CURRENCY.items())
    # default currency: the country's when supported, else USD
    assert await default_currency_for_country(db, "NG") == "NGN"
    assert await default_currency_for_country(db, "GB") == "GBP"
    assert await default_currency_for_country(db, "UZ") == "USD"
    assert await default_currency_for_country(db, None) == "USD"


# ----------------------------------------------------------------------------- import command
FIXTURE_ROWS = [
    {
        "procedure": "total-knee-replacement",
        "country": "GB",
        "currency": "GBP",
        "min": 12500,
        "max": 15000.5,
        "amount_unit": "major",
        "wait_time_text": "18 weeks",
        "source": {
            "title": "Private prices",
            "url": "https://example.org/gb",
            "publisher": "PHIN",
            "year": 2025,
        },
        "confidence": "High",
    },
    {  # USD row for Nigeria -> converted to NGN with the platform rates
        "procedure": "cabg",
        "country": "ng",
        "currency": "USD",
        "min": 800000,
        "max": 1000000,
        "amount_unit": "minor",
        "price_year": 2024,
        "source": {"title": "Lagos private hospitals", "url": "https://example.org/ng"},
        "confidence": "low",
    },
    {"procedure": "unknown-procedure", "country": "GB", "currency": "GBP", "min": 1, "max": 2},
    {"procedure": "cabg", "country": "GBR", "currency": "GBP", "min": 1, "max": 2},
    {"procedure": "cabg", "country": "GB", "currency": "GBP", "min": 1, "max": 2, "confidence": "certain"},
]


async def test_import_benchmarks_upserts_with_sources(db, tmp_path):
    w = await build_world(db)
    await add_benchmark(db, w.knee, "GB", "GBP", 1_00, 2_00)
    knee_id = w.knee.id  # the import rolls back / commits the session: keep plain values
    path = tmp_path / "benchmarks.json"
    path.write_text(json.dumps({"rows": FIXTURE_ROWS}), encoding="utf-8")
    rows = load_file(path)

    report = await import_rows(db, rows, dry_run=True)
    assert (report.inserted, report.updated) == (1, 1) and len(report.errors) == 3
    assert (await db.execute(select(CostBenchmark).where(CostBenchmark.country_code == "NG"))).first() is None

    report = await import_rows(db, rows, strict=True)
    assert len(report.errors) == 3
    assert (await db.execute(select(CostBenchmark).where(CostBenchmark.country_code == "NG"))).first() is None

    report = await import_rows(db, rows)
    assert (report.inserted, report.updated, len(report.errors)) == (1, 1, 3)
    gb = (
        await db.execute(
            select(CostBenchmark)
            .where(CostBenchmark.procedure_id == knee_id, CostBenchmark.country_code == "GB")
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert (gb.currency, gb.cost_min_minor, gb.cost_max_minor) == ("GBP", 12_500_00, 15_000_50)
    assert gb.source == "Private prices - PHIN" and gb.source_url == "https://example.org/gb"
    assert (gb.price_year, gb.confidence, gb.wait_time_text) == (2025, "high", "18 weeks")
    ng = (await db.execute(select(CostBenchmark).where(CostBenchmark.country_code == "NG"))).scalar_one()
    # 8,000 USD * 88 INR/USD / 0.058 INR/NGN
    assert ng.currency == "NGN"
    assert ng.cost_min_minor == round(Decimal(8000) * 88 / Decimal("0.058") * 100)
    assert (ng.price_year, ng.confidence) == (2024, "low")

    # re-import is idempotent
    report = await import_rows(db, rows)
    assert (report.inserted, report.updated, report.unchanged) == (0, 0, 2)


def test_parse_row_validation():
    row = parse_row({"procedure": "X", "country": "us", "currency": "usd", "min": 10, "max": 5})
    assert (row["procedure"], row["country_code"], row["currency"]) == ("x", "US", "USD")
    assert (row["cost_min_minor"], row["cost_max_minor"]) == (500, 1000)  # swapped into order
    with pytest.raises(ValueError):
        parse_row({"procedure": "x", "country": "US", "currency": "USD", "min": -1, "max": 5})
    with pytest.raises(ValueError):
        parse_row({"procedure": "x", "country": "US", "currency": "USD", "min": 1, "amount_unit": "cents"})
    with pytest.raises(ValueError):
        parse_row(
            {"procedure": "x", "country": "US", "currency": "USD", "min": 1, "source": {"url": "ftp://x"}}
        )
