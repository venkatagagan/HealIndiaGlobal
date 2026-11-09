"""Public catalog API (PLAN 8.4)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import (
    AccommodationHospitalLink,
    AccommodationProvider,
    AvailabilitySlot,
    CulturalTip,
    FxRate,
    PlatformSetting,
    Review,
    ServiceProvider,
)
from app.modules.catalog.service import invalidate_catalog_cache, today_ist
from app.modules.catalog.symptoms import BODY_AREAS, SPECIALTY_SLUGS, SYMPTOMS
from tests.factories import create_case, create_hospital, create_patient, create_quote, create_specialty
from tests.modules.catalog_helpers import add_benchmark, build_world

API = "/api/v1"


# ----------------------------------------------------------------------------- specialties
async def test_specialties_list_counts_and_hides_inactive(client, db):
    w = await build_world(db)
    await create_specialty(db, slug="hidden-spec", name="Hidden", is_active=False)
    r = await client.get(f"{API}/specialties")
    assert r.status_code == 200, r.text
    data = r.json()
    slugs = [s["slug"] for s in data]
    assert slugs == ["orthopedics", "cardiology"]
    assert data[0]["procedures_count"] == 1
    assert {"id", "slug", "name", "description", "icon", "savings_min_pct", "savings_max_pct"} <= set(data[0])

    r = await client.get(f"{API}/specialties/cardiology")
    assert r.status_code == 200
    assert r.json()["id"] == str(w.cardio.id)
    assert (await client.get(f"{API}/specialties/hidden-spec")).status_code == 404


# ----------------------------------------------------------------------------- procedures
async def test_procedures_filter_search_and_detail(client, db):
    w = await build_world(db)
    await add_benchmark(db, w.knee, "US", "USD", 35_000_00, 50_000_00)
    r = await client.get(f"{API}/procedures", params={"specialty": "cardiology"})
    assert r.status_code == 200
    assert [p["slug"] for p in r.json()] == ["cabg"]

    r = await client.get(f"{API}/procedures", params={"q": "knee"})
    assert [p["slug"] for p in r.json()] == ["total-knee-replacement"]
    # trigram similarity tolerates typos
    r = await client.get(f"{API}/procedures", params={"q": "Total Kne Replacment"})
    assert "total-knee-replacement" in [p["slug"] for p in r.json()]
    # keywords match
    r = await client.get(f"{API}/procedures", params={"q": "bypass"})
    assert [p["slug"] for p in r.json()] == ["cabg"]

    r = await client.get(f"{API}/procedures/total-knee-replacement")
    assert r.status_code == 200
    body = r.json()
    assert body["specialty"] == {"id": str(w.ortho.id), "slug": "orthopedics", "name": "Orthopedics"}
    assert body["benchmarks"][0]["country_code"] == "US"
    assert body["benchmarks"][0]["cost_min_minor"] == 35_000_00
    assert (await client.get(f"{API}/procedures/nope")).status_code == 404


async def test_inactive_procedure_hidden(client, db):
    w = await build_world(db)
    w.bypass.is_active = False
    await db.commit()
    r = await client.get(f"{API}/procedures")
    assert "cabg" not in [p["slug"] for p in r.json()]
    assert (await client.get(f"{API}/procedures/cabg")).status_code == 404


# ----------------------------------------------------------------------------- hospitals
async def test_hospital_list_only_active_with_cards(client, db):
    w = await build_world(db)
    r = await client.get(f"{API}/hospitals")
    assert r.status_code == 200, r.text
    page = r.json()
    assert page["total"] == 2
    assert page["page"] == 1 and page["pages"] == 1
    ids = [h["id"] for h in page["items"]]
    assert str(w.draft.id) not in ids
    apollo = next(h for h in page["items"] if h["slug"] == "apollo-delhi")
    assert apollo["specialties"] == ["Orthopedics"]
    assert apollo["starting_price_minor"] == 3_50_000_00
    assert apollo["currency"] == "INR"
    assert apollo["rating_avg"] == 4.7
    fortis = next(h for h in page["items"] if h["slug"] == "fortis-mumbai")
    assert fortis["specialties"] == ["Cardiology"]


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"city": "delhi"}, ["apollo-delhi"]),
        ({"specialty": "cardiology"}, ["fortis-mumbai"]),
        ({"procedure": "cabg"}, ["fortis-mumbai"]),
        ({"procedure": "total-knee-replacement", "sort": "name"}, ["apollo-delhi", "fortis-mumbai"]),
        ({"accreditation": "jci"}, ["apollo-delhi"]),
        ({"language": "Arabic"}, ["apollo-delhi"]),
        ({"language": "ru"}, ["fortis-mumbai"]),
        ({"q": "fortis"}, ["fortis-mumbai"]),
        ({"q": "Apolo Indraprasta"}, ["apollo-delhi"]),
        ({"sort": "rating"}, ["apollo-delhi", "fortis-mumbai"]),
        ({"sort": "price"}, ["fortis-mumbai", "apollo-delhi"]),
        ({"sort": "name"}, ["apollo-delhi", "fortis-mumbai"]),
    ],
)
async def test_hospital_filters_and_sorting(client, db, params, expected):
    await build_world(db)
    r = await client.get(f"{API}/hospitals", params=params)
    assert r.status_code == 200, r.text
    assert [h["slug"] for h in r.json()["items"]] == expected


async def test_hospital_pagination(client, db):
    for i in range(5):
        await create_hospital(db, slug=f"h-{i}", name=f"Hospital {i}")
    r = await client.get(f"{API}/hospitals", params={"page": 2, "page_size": 2, "sort": "name"})
    body = r.json()
    assert body["total"] == 5 and body["pages"] == 3 and body["page"] == 2
    assert [h["slug"] for h in body["items"]] == ["h-2", "h-3"]
    assert (await client.get(f"{API}/hospitals", params={"page_size": 500})).status_code == 422
    assert (await client.get(f"{API}/hospitals", params={"sort": "bogus"})).status_code == 422


async def test_hospital_detail(client, db):
    w = await build_world(db)
    patient = await create_patient(db, first_name="Amara", last_name="Okafor")
    db.add_all(
        [
            Review(
                hospital_id=w.apollo.id, patient_id=patient.id, rating=5, title="Great", status="published"
            ),
            Review(hospital_id=w.apollo.id, patient_id=patient.id, rating=1, title="Hidden", status="hidden"),
        ]
    )
    await db.commit()
    for key in ("apollo-delhi", str(w.apollo.id)):
        r = await client.get(f"{API}/hospitals/{key}")
        assert r.status_code == 200, r.text
    d = r.json()
    assert [doc["slug"] for doc in d["doctors"]] == ["dr-anil"]  # inactive doctor hidden
    assert d["doctors"][0]["hospital"]["slug"] == "apollo-delhi"
    assert len(d["procedures"]) == 1
    hp = d["procedures"][0]
    assert hp["procedure"]["slug"] == "total-knee-replacement"
    assert {p["tier"] for p in hp["packages"]} == {"medical_only", "all_inclusive"}  # inactive package hidden
    assert [rv["title"] for rv in d["reviews"]] == ["Great"]
    assert d["reviews"][0]["patient_name"] == "Amara O."
    assert d["airport_distance_km"] == 18.5
    assert (await client.get(f"{API}/hospitals/draft-hosp")).status_code == 404
    assert (await client.get(f"{API}/hospitals/{w.draft.id}")).status_code == 404


# ----------------------------------------------------------------------------- doctors
@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({}, ["dr-anil", "dr-meera"]),
        ({"specialty": "cardiology"}, ["dr-meera"]),
        ({"language": "arabic"}, ["dr-meera"]),
        ({"gender": "female"}, ["dr-meera"]),
        ({"procedure": "total-knee-replacement"}, ["dr-anil"]),
        ({"procedure": "cabg"}, ["dr-meera"]),
        ({"q": "meera"}, ["dr-meera"]),
        ({"q": "Anil Kapor"}, ["dr-anil"]),
    ],
)
async def test_doctor_filters(client, db, params, expected):
    await build_world(db)
    r = await client.get(f"{API}/doctors", params=params)
    assert r.status_code == 200, r.text
    assert [d["slug"] for d in r.json()["items"]] == expected


async def test_doctor_hospital_filter_and_detail(client, db):
    w = await build_world(db)
    r = await client.get(f"{API}/doctors", params={"hospital_id": str(w.apollo.id)})
    assert [d["slug"] for d in r.json()["items"]] == ["dr-anil"]

    today = today_ist()
    db.add_all(
        [
            AvailabilitySlot(
                hospital_id=w.apollo.id,
                doctor_id=w.dr_anil.id,
                date=today + timedelta(days=3),
                slot_kind="consultation",
                capacity=2,
                booked=2,
            ),
            AvailabilitySlot(
                hospital_id=w.apollo.id,
                doctor_id=w.dr_anil.id,
                date=today + timedelta(days=5),
                slot_kind="consultation",
                capacity=2,
                booked=1,
            ),
        ]
    )
    await db.commit()
    r = await client.get(f"{API}/doctors/{w.dr_anil.id}")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["next_available_date"] == (today + timedelta(days=5)).isoformat()
    assert [p["procedure"]["slug"] for p in d["procedures"]] == ["total-knee-replacement"]
    assert d["specialty"]["slug"] == "orthopedics"
    assert d["registration_number"] is None and d["registration_verified"] is False
    assert (await client.get(f"{API}/doctors/dr-anil")).status_code == 200
    assert (await client.get(f"{API}/doctors/{w.dr_inactive.id}")).status_code == 404
    assert (await client.get(f"{API}/doctors/{w.dr_draft.id}")).status_code == 404


# ----------------------------------------------------------------------------- availability
async def test_availability_endpoints(client, db):
    w = await build_world(db)
    today = today_ist()
    d1, d2 = today + timedelta(days=1), today + timedelta(days=2)
    db.add_all(
        [
            AvailabilitySlot(
                hospital_id=w.apollo.id,
                doctor_id=w.dr_anil.id,
                date=d1,
                slot_kind="consultation",
                capacity=4,
                booked=1,
            ),
            AvailabilitySlot(
                hospital_id=w.apollo.id,
                doctor_id=None,
                date=d1,
                slot_kind="consultation",
                capacity=2,
                booked=0,
            ),
            AvailabilitySlot(
                hospital_id=w.apollo.id,
                doctor_id=w.dr_inactive.id,
                date=d1,
                slot_kind="consultation",
                capacity=9,
                booked=0,
            ),
            AvailabilitySlot(
                hospital_id=w.apollo.id,
                doctor_id=w.dr_anil.id,
                date=d2,
                slot_kind="admission",
                capacity=1,
                booked=1,
            ),
            AvailabilitySlot(
                hospital_id=w.apollo.id,
                doctor_id=w.dr_anil.id,
                date=today + timedelta(days=200),
                slot_kind="admission",
                capacity=1,
                booked=0,
            ),
        ]
    )
    await db.commit()
    r = await client.get(f"{API}/doctors/{w.dr_anil.id}/availability")
    assert r.status_code == 200, r.text
    assert r.json() == [
        {"date": d1.isoformat(), "slot_kind": "consultation", "capacity": 4, "booked": 1, "available": 3},
        {"date": d2.isoformat(), "slot_kind": "admission", "capacity": 1, "booked": 1, "available": 0},
    ]
    r = await client.get(
        f"{API}/hospitals/{w.apollo.id}/availability", params={"from": d1.isoformat(), "to": d1.isoformat()}
    )
    assert r.json() == [
        {"date": d1.isoformat(), "slot_kind": "consultation", "capacity": 6, "booked": 1, "available": 5}
    ]
    r = await client.get(
        f"{API}/hospitals/{w.apollo.id}/availability",
        params={"doctor_id": str(w.dr_anil.id), "from": d2.isoformat(), "to": d2.isoformat()},
    )
    assert [x["slot_kind"] for x in r.json()] == ["admission"]
    # doctor of another hospital -> 404; bad ranges -> 400
    r = await client.get(
        f"{API}/hospitals/{w.apollo.id}/availability", params={"doctor_id": str(w.dr_meera.id)}
    )
    assert r.status_code == 404
    r = await client.get(
        f"{API}/doctors/{w.dr_anil.id}/availability", params={"from": d2.isoformat(), "to": d1.isoformat()}
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_date_range"
    assert (await client.get(f"{API}/hospitals/{w.draft.id}/availability")).status_code == 404


# ----------------------------------------------------------------------------- cost comparison
async def test_cost_comparison_math_and_conversion(client, db):
    w = await build_world(db)
    await add_benchmark(db, w.knee, "US", "USD", 35_000_00, 50_000_00, wait_time_text="3–6 months")
    db.add(FxRate(base_currency="INR", quote_currency="USD", rate=Decimal("80"), source="test"))
    await db.commit()
    r = await client.get(
        f"{API}/cost-comparison",
        params={"procedure": "total-knee-replacement", "country": "US", "currency": "USD"},
    )
    assert r.status_code == 200, r.text
    c = r.json()
    # India: min over active HPs = ₹3,20,000 (fortis), max = ₹5,00,000 (fortis) -> USD at 80
    assert c["india"] == {
        "min_minor": 4000_00,
        "max_minor": 6250_00,
        "currency": "USD",
        "wait_time_text": "1–2 weeks",
    }
    assert c["home"] == {
        "country_code": "US",
        "min_minor": 35_000_00,
        "max_minor": 50_000_00,
        "currency": "USD",
        "wait_time_text": "3–6 months",
    }
    # savings: 35000-4000 = 31000 (88.57% -> 89), 50000-6250 = 43750 (87.5% -> 88)
    assert c["savings"] == {
        "min_minor": 31_000_00,
        "max_minor": 43_750_00,
        "currency": "USD",
        "pct_min": 88,
        "pct_max": 89,
    }
    # itemized default split of the India midpoint (5125.00 USD)
    items = {i["category"]: i["amount_minor"] for i in c["itemized"]}
    assert items == {
        "surgery": 2818_75,
        "hospital_stay": 1025_00,
        "medications": 512_50,
        "tests_scans": 512_50,
        "doctor_fees": 256_25,
    }
    assert sum(items.values()) == 5125_00
    assert c["procedure"]["slug"] == "total-knee-replacement"


async def test_cost_comparison_fallbacks(client, db):
    w = await build_world(db)
    # Only a US benchmark exists -> a GB request falls back to US; currency converted to GBP (default rates).
    await add_benchmark(db, w.bypass, "US", "USD", 100_000_00, 150_000_00)
    # No active hospital procedure -> procedure india_price_* fallback.
    w.hp_fortis_bypass.is_active = False
    await db.commit()
    r = await client.get(
        f"{API}/cost-comparison", params={"procedure": "cabg", "country": "GB", "currency": "GBP"}
    )
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["home"]["country_code"] == "US"
    assert c["home"]["currency"] == "GBP"
    # 100000 USD * 88 / 110 = 80000 GBP ; India ₹4,00,000 / 110 = 3636.36 GBP
    assert c["home"]["min_minor"] == 80_000_00
    assert c["india"]["min_minor"] == 3636_36
    assert c["india"]["max_minor"] == 6363_64
    assert 0 < c["savings"]["pct_min"] <= c["savings"]["pct_max"] <= 100

    # default currency = benchmark currency
    r = await client.get(f"{API}/cost-comparison", params={"procedure": "cabg"})
    assert r.json()["india"]["currency"] == "USD"
    # errors
    r = await client.get(f"{API}/cost-comparison", params={"procedure": "total-knee-replacement"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "benchmark_not_found"
    r = await client.get(f"{API}/cost-comparison", params={"procedure": "cabg", "currency": "XYZ"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "unsupported_currency"
    assert (await client.get(f"{API}/cost-comparison", params={"procedure": "missing"})).status_code == 404
    assert (await client.get(f"{API}/cost-comparison")).status_code == 422


async def test_cost_comparison_uses_quote_itemization(client, db):
    w = await build_world(db)
    await add_benchmark(db, w.knee, "US", "USD", 35_000_00, 50_000_00)
    patient = await create_patient(db)
    case = await create_case(db, patient, w.apollo, procedure_id=w.knee.id)
    await create_quote(
        db,
        case,
        line_items=[
            {"category": "surgery", "description": "Surgery", "amount_minor": 3_00_000_00},
            {"category": "implants", "description": "Implant", "amount_minor": 1_00_000_00},
        ],
    )
    r = await client.get(
        f"{API}/cost-comparison", params={"procedure": "total-knee-replacement", "currency": "INR"}
    )
    assert r.status_code == 200, r.text
    c = r.json()
    items = {i["category"]: i["amount_minor"] for i in c["itemized"]}
    assert set(items) == {"surgery", "implants"}
    mid = (c["india"]["min_minor"] + c["india"]["max_minor"] + 1) // 2
    assert sum(items.values()) == mid
    assert items["surgery"] == mid * 3 // 4


# ----------------------------------------------------------------------------- search
async def test_unified_search(client, db):
    await build_world(db)
    r = await client.get(f"{API}/search", params={"q": "knee"})
    assert r.status_code == 200
    body = r.json()
    assert [p["slug"] for p in body["procedures"]] == ["total-knee-replacement"]
    r = await client.get(f"{API}/search", params={"q": "cardio"})
    body = r.json()
    assert [s["slug"] for s in body["specialties"]] == ["cardiology"]
    r = await client.get(f"{API}/search", params={"q": "Meera"})
    assert [d["slug"] for d in r.json()["doctors"]] == ["dr-meera"]
    r = await client.get(f"{API}/search", params={"q": "Hidden Draft"})
    assert r.json()["hospitals"] == []
    r = await client.get(f"{API}/search", params={"q": "a"})
    assert r.json() == {"specialties": [], "procedures": [], "hospitals": [], "doctors": []}


async def test_search_escapes_like_wildcards(client, db):
    await build_world(db)
    r = await client.get(f"{API}/search", params={"q": "%_"})
    assert r.status_code == 200
    assert r.json()["hospitals"] == []


# ----------------------------------------------------------------------------- caching
async def test_public_reads_are_cached(client, db):
    w = await build_world(db)
    r1 = await client.get(f"{API}/hospitals/apollo-delhi")
    w.apollo.name = "Renamed Directly In DB"
    await db.commit()
    r2 = await client.get(f"{API}/hospitals/apollo-delhi")
    assert r2.json()["name"] == r1.json()["name"]
    from app.modules.catalog.service import invalidate_catalog_cache

    await invalidate_catalog_cache()
    r3 = await client.get(f"{API}/hospitals/apollo-delhi")
    assert r3.json()["name"] == "Renamed Directly In DB"


# ----------------------------------------------------------------------------- content
async def test_symptom_library_is_consistent(client):
    assert len(SYMPTOMS) >= 80
    names = [s["name"] for s in SYMPTOMS]
    assert len(names) == len(set(names))
    for s in SYMPTOMS:
        assert s["specialty_slugs"] and set(s["specialty_slugs"]) <= set(SPECIALTY_SLUGS)
        assert s["body_areas"] and set(s["body_areas"]) <= set(BODY_AREAS)
    assert {slug for s in SYMPTOMS for slug in s["specialty_slugs"]} == set(SPECIALTY_SLUGS)
    r = await client.get(f"{API}/content/symptoms", params={"specialty": "cardiology", "body_area": "chest"})
    assert r.status_code == 200
    items = r.json()
    assert items and all("cardiology" in i["specialty_slugs"] and "chest" in i["body_areas"] for i in items)
    assert set(items[0]) == {"name", "specialty_slugs", "body_areas"}
    assert len((await client.get(f"{API}/content/symptoms")).json()) == len(SYMPTOMS)


async def test_helplines_and_tips(client, db):
    r = await client.get(f"{API}/content/helplines")
    assert r.json()["emergency"] == "112"
    db.add(PlatformSetting(key="helplines", value={"24x7": "+91-1", "emergency": "112"}))
    await db.commit()
    from app.core.settings_store import clear_settings_cache

    clear_settings_cache()
    assert (await client.get(f"{API}/content/helplines")).json() == {"24x7": "+91-1", "emergency": "112"}

    defaults = (await client.get(f"{API}/content/cultural-tips")).json()
    assert len(defaults) >= 5
    db.add_all(
        [
            CulturalTip(title="B", body="b", category="food", sort_order=2),
            CulturalTip(title="A", body="a", category="etiquette", sort_order=1),
            CulturalTip(title="Off", body="x", sort_order=0, is_active=False),
        ]
    )
    await db.commit()
    from app.modules.catalog.service import invalidate_catalog_cache

    await invalidate_catalog_cache()
    assert [t["title"] for t in (await client.get(f"{API}/content/cultural-tips")).json()] == ["A", "B"]
    r = await client.get(f"{API}/content/cultural-tips", params={"category": "food"})
    assert [t["title"] for t in r.json()] == ["B"]


async def test_fx_rates(client, db):
    db.add(FxRate(base_currency="INR", quote_currency="USD", rate=Decimal("83.25"), source="rbi"))
    await db.commit()
    rates = {r["quote_currency"]: r for r in (await client.get(f"{API}/content/fx-rates")).json()}
    assert rates["USD"]["rate"] == "83.25" and rates["USD"]["source"] == "rbi"
    assert rates["EUR"]["source"] == "default"
    assert "INR" not in rates


async def test_accommodations_and_service_providers(client, db):
    w = await build_world(db)
    near = AccommodationProvider(name="Near Stay", type="hotel", city="Delhi", nightly_rate_minor=4000_00)
    far = AccommodationProvider(name="Far Stay", type="guest_house", city="Delhi", nightly_rate_minor=2000_00)
    off = AccommodationProvider(name="Closed", type="hotel", city="Delhi", is_active=False)
    mumbai = AccommodationProvider(name="Sea View", type="service_apartment", city="Mumbai")
    db.add_all([near, far, off, mumbai])
    await db.flush()
    db.add_all(
        [
            AccommodationHospitalLink(
                provider_id=near.id, hospital_id=w.apollo.id, distance_km=Decimal("0.5")
            ),
            AccommodationHospitalLink(
                provider_id=far.id, hospital_id=w.apollo.id, distance_km=Decimal("4.2")
            ),
            AccommodationHospitalLink(
                provider_id=off.id, hospital_id=w.apollo.id, distance_km=Decimal("0.1")
            ),
        ]
    )
    db.add_all(
        [
            ServiceProvider(
                kind="translator",
                name="Arabic Interpreters",
                city="Delhi",
                languages=["ar", "en"],
                rating_avg=Decimal("4.8"),
                rate_minor=500_00,
                rate_unit="hour",
            ),
            ServiceProvider(kind="translator", name="Russian Help", city="Mumbai", languages=["ru"]),
            ServiceProvider(kind="local_guide", name="Delhi Guides", city="Delhi", languages=["en"]),
        ]
    )
    await db.commit()
    r = await client.get(f"{API}/accommodations", params={"hospital_id": str(w.apollo.id)})
    assert [(a["name"], a["distance_km"]) for a in r.json()] == [("Near Stay", 0.5), ("Far Stay", 4.2)]
    r = await client.get(f"{API}/accommodations", params={"city": "mumbai"})
    assert [a["name"] for a in r.json()] == ["Sea View"]

    r = await client.get(f"{API}/service-providers", params={"kind": "translator", "language": "Arabic"})
    body = r.json()
    assert [s["name"] for s in body] == ["Arabic Interpreters"]
    assert body[0]["rate_unit"] == "hour" and body[0]["rating_avg"] == 4.8
    r = await client.get(f"{API}/service-providers", params={"city": "Delhi"})
    assert {s["name"] for s in r.json()} == {"Arabic Interpreters", "Delhi Guides"}
    assert (await client.get(f"{API}/service-providers", params={"kind": "bogus"})).status_code == 422


async def test_starting_price_ignores_inactive_procedures(client, db):
    w = await build_world(db)
    w.hp_fortis_knee.is_active = False
    await db.commit()
    r = await client.get(f"{API}/hospitals", params={"sort": "price"})
    fortis = next(h for h in r.json()["items"] if h["slug"] == "fortis-mumbai")
    assert fortis["starting_price_minor"] == 4_50_000_00
    rows = (await db.execute(select(AvailabilitySlot))).scalars().all()
    assert rows == []


async def test_doctor_registration_shown_publicly(client, db):
    w = await build_world(db)
    w.dr_anil.registration_number = "DMC/R/2006/12345"
    w.dr_anil.registration_council = "delhi"
    await db.commit()
    d = (await client.get(f"{API}/doctors/{w.dr_anil.id}")).json()
    assert d["registration_number"] == "DMC/R/2006/12345"
    assert d["registration_council"] == "delhi"
    assert d["registration_council_name"] == "Delhi Medical Council"
    # on file but nobody checked the register yet -> not "verified"
    assert d["registration_verified"] is False
    assert "registration_verified_at" not in d and "registration_verified_by_user_id" not in d

    w.dr_anil.registration_verified_at = datetime.now(UTC)
    await db.commit()
    await invalidate_catalog_cache()
    d = (await client.get(f"{API}/doctors/{w.dr_anil.id}")).json()
    assert d["registration_verified"] is True

    councils = (await client.get(f"{API}/content/medical-councils")).json()
    assert councils[0] == {"code": "nmc", "name": "National Medical Commission (Indian Medical Register)"}
    assert {"code": "kerala", "name": "Travancore-Cochin Medical Council (Kerala)"} in councils
    assert len({c["code"] for c in councils}) == len(councils) > 25
