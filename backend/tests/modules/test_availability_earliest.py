"""Earliest free appointment: cards, details, search, offerings, sort=soonest, /procedures/{slug}/earliest."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import event

from app.models import AvailabilitySlot
from app.modules.catalog.service import invalidate_catalog_cache, today_ist
from tests.factories import create_doctor, create_hospital, create_hospital_procedure
from tests.modules.catalog_helpers import build_world

API = "/api/v1"


def _slot(hospital, day_offset, kind, *, doctor=None, capacity=2, booked=0):
    return AvailabilitySlot(
        hospital_id=hospital.id,
        doctor_id=doctor.id if doctor else None,
        date=today_ist() + timedelta(days=day_offset),
        slot_kind=kind,
        capacity=capacity,
        booked=booked,
    )


def _day(offset):
    return (today_ist() + timedelta(days=offset)).isoformat()


async def _slots(db, w):
    db.add_all(
        [
            # Apollo: doctor slot in 5 days, hospital-wide admission in 9 days; a full and a past slot ignored
            _slot(w.apollo, 5, "consultation", doctor=w.dr_anil),
            _slot(w.apollo, 2, "consultation", doctor=w.dr_anil, capacity=1, booked=1),
            _slot(w.apollo, -1, "admission"),
            _slot(w.apollo, 9, "admission"),
            # an inactive doctor's slot never counts
            _slot(w.apollo, 1, "consultation", doctor=w.dr_inactive),
            # Fortis: hospital-wide consultation in 3 days, admission in 4 days
            _slot(w.fortis, 3, "consultation"),
            _slot(w.fortis, 4, "admission"),
            # Fortis doctor's own consultation tomorrow
            _slot(w.fortis, 1, "consultation", doctor=w.dr_meera),
        ]
    )
    await db.commit()


async def test_hospital_cards_and_detail_show_earliest_dates(client, db):
    w = await build_world(db)
    await _slots(db, w)
    items = {h["slug"]: h for h in (await client.get(f"{API}/hospitals")).json()["items"]}
    assert items["apollo-delhi"]["next_available_consultation"] == _day(5)
    assert items["apollo-delhi"]["next_available_admission"] == _day(9)
    assert items["fortis-mumbai"]["next_available_consultation"] == _day(1)
    assert items["fortis-mumbai"]["next_available_admission"] == _day(4)

    detail = (await client.get(f"{API}/hospitals/apollo-delhi")).json()
    assert detail["next_available_consultation"] == _day(5)
    assert detail["next_available_admission"] == _day(9)
    # offering with a lead doctor: the doctor's slots + hospital-wide ones
    knee = next(p for p in detail["procedures"] if p["procedure"]["slug"] == "total-knee-replacement")
    assert (knee["next_available_consultation"], knee["next_available_admission"]) == (_day(5), _day(9))
    # doctors listed on the hospital page
    anil = next(d for d in detail["doctors"] if d["slug"] == "dr-anil")
    assert anil["next_available_consultation"] == _day(5)


async def test_doctor_cards_combine_own_and_hospital_slots(client, db):
    w = await build_world(db)
    await _slots(db, w)
    docs = {d["slug"]: d for d in (await client.get(f"{API}/doctors")).json()["items"]}
    # Dr Anil: own consultation day 5, admission only hospital-wide (day 9)
    assert (docs["dr-anil"]["next_available_consultation"], docs["dr-anil"]["next_available_admission"]) == (
        _day(5),
        _day(9),
    )
    # Dr Meera: own consultation tomorrow beats the hospital-wide day 3
    assert docs["dr-meera"]["next_available_consultation"] == _day(1)
    assert docs["dr-meera"]["next_available_admission"] == _day(4)
    detail = (await client.get(f"{API}/doctors/{w.dr_meera.id}")).json()
    assert detail["next_available_consultation"] == _day(1) and detail["next_available_admission"] == _day(4)
    assert detail["next_available_date"] == _day(1)  # legacy field (own slots) kept


async def test_search_results_carry_earliest_dates(client, db):
    w = await build_world(db)
    await _slots(db, w)
    data = (await client.get(f"{API}/search", params={"q": "Fortis"})).json()
    assert data["hospitals"][0]["next_available_admission"] == _day(4)
    data = (await client.get(f"{API}/search", params={"q": "Meera"})).json()
    assert data["doctors"][0]["next_available_consultation"] == _day(1)
    assert w


async def test_sort_soonest(client, db):
    w = await build_world(db)
    await _slots(db, w)
    later = await create_hospital(db, slug="no-slots", name="No Slots Hospital", city="Pune")
    r = await client.get(f"{API}/hospitals", params={"sort": "soonest"})
    assert r.status_code == 200, r.text
    assert [h["slug"] for h in r.json()["items"]] == ["fortis-mumbai", "apollo-delhi", later.slug]
    r = await client.get(f"{API}/doctors", params={"sort": "soonest"})
    assert [d["slug"] for d in r.json()["items"]][:2] == ["dr-meera", "dr-anil"]
    assert (await client.get(f"{API}/hospitals", params={"sort": "fastest"})).status_code == 422


async def test_procedure_earliest_orders_by_admission_then_price(client, db):
    w = await build_world(db)
    await _slots(db, w)
    r = await client.get(f"{API}/procedures/total-knee-replacement/earliest")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["procedure"]["slug"] == "total-knee-replacement"
    assert [i["hospital"]["slug"] for i in data["items"]] == ["fortis-mumbai", "apollo-delhi"]
    first = data["items"][0]
    assert first["next_available_admission"] == _day(4)
    assert first["price_min_minor"] == 3_20_000_00 and first["currency"] == "INR"
    assert first["hospital_procedure_id"] == str(w.hp_fortis_knee.id)
    assert data["items"][1]["lead_doctor_ids"] == [str(w.dr_anil.id)]

    # same admission day -> cheaper first; no slots -> last
    extra = await create_hospital(db, slug="cheap-knee", name="Cheap Knee Centre", city="Chennai")
    await create_hospital_procedure(
        db, extra, w.knee, price_min_minor=2_00_000_00, price_max_minor=2_50_000_00
    )
    db.add(_slot(w.apollo, 4, "admission"))
    await db.commit()
    await invalidate_catalog_cache()
    data = (await client.get(f"{API}/procedures/total-knee-replacement/earliest")).json()
    assert [i["hospital"]["slug"] for i in data["items"]] == ["fortis-mumbai", "apollo-delhi", "cheap-knee"]
    assert (await client.get(f"{API}/procedures/unknown/earliest")).status_code == 404


async def test_card_lists_use_constant_queries(client, db, engine):
    """No N+1: the hospital list costs the same number of queries for 2 or 6 hospitals."""
    w = await build_world(db)
    await _slots(db, w)

    async def count_queries() -> int:
        counter = {"n": 0}

        def before(*_args, **_kwargs):
            counter["n"] += 1

        event.listen(engine.sync_engine, "before_cursor_execute", before)
        try:
            await invalidate_catalog_cache()
            r = await client.get(f"{API}/hospitals")
            assert r.status_code == 200
        finally:
            event.remove(engine.sync_engine, "before_cursor_execute", before)
        return counter["n"]

    small = await count_queries()
    for i in range(4):
        h = await create_hospital(db, slug=f"extra-{i}", name=f"Extra {i}", city="Delhi")
        doc = await create_doctor(db, h, w.ortho, slug=f"extra-doc-{i}")
        db.add(_slot(h, i + 1, "consultation", doctor=doc))
    await db.commit()
    assert await count_queries() == small
