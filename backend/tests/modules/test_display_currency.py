"""Display amounts in the viewer's currency (catalogue, cases, quotes, bookings) and the patient currency
default that follows the country of residence."""

from __future__ import annotations

from decimal import Decimal

from app.core.currency import add_display_amounts
from app.models import FxRate, PatientProfile, User
from tests.factories import create_booking, create_case, create_patient, create_quote, create_user
from tests.modules.auth_helpers import bearer, register
from tests.modules.cases_helpers import make_world, reload
from tests.modules.catalog_helpers import build_world

API = "/api/v1"


async def _usd_rate(db, rate="80"):
    db.add(FxRate(base_currency="INR", quote_currency="USD", rate=Decimal(rate), source="test"))
    await db.commit()


# ----------------------------------------------------------------------------- catalogue
async def test_catalog_display_amounts_with_currency_param(client, db):
    await build_world(db)
    await _usd_rate(db)
    r = await client.get(f"{API}/hospitals", params={"currency": "USD"})
    assert r.status_code == 200, r.text
    fortis = next(h for h in r.json()["items"] if h["slug"] == "fortis-mumbai")
    assert fortis["starting_price_minor"] == 3_20_000_00 and fortis["currency"] == "INR"
    assert fortis["display_starting_price"] == {
        "amount_minor": 4000_00,
        "currency": "USD",
        "fx_rate": "0.0125",
        "approximate": True,
    }
    detail = (await client.get(f"{API}/hospitals/apollo-delhi", params={"currency": "USD"})).json()
    knee = detail["procedures"][0]
    assert knee["display_price_min"]["amount_minor"] == 4375_00
    assert knee["packages"][0]["display_price"]["currency"] == "USD"
    proc = (await client.get(f"{API}/procedures/total-knee-replacement", params={"currency": "USD"})).json()
    assert proc["display_india_price_min"]["amount_minor"] == 3750_00
    search = (await client.get(f"{API}/search", params={"q": "Fortis", "currency": "USD"})).json()
    assert search["hospitals"][0]["display_starting_price"]["amount_minor"] == 4000_00

    # anonymous without ?currency: no display amounts; the cached payload is not polluted
    plain = (await client.get(f"{API}/hospitals")).json()
    assert all(h["display_starting_price"] is None for h in plain["items"])
    # INR -> INR is exact
    same = (await client.get(f"{API}/hospitals", params={"currency": "INR"})).json()["items"][0]
    assert same["display_starting_price"]["approximate"] is False
    r = await client.get(f"{API}/hospitals", params={"currency": "XYZ"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "unsupported_currency"


async def test_catalog_defaults_to_patient_preferred_currency(client, db, auth_headers):
    await build_world(db)
    user = await create_user(db, role="patient")
    await create_patient(db, user=user, preferred_currency="GBP")
    r = await client.get(f"{API}/doctors", headers=auth_headers(user))
    assert r.status_code == 200
    # doctors in the world have no consultation fee -> null display, hospital ref unaffected
    r = await client.get(f"{API}/hospitals", headers=auth_headers(user))
    fortis = next(h for h in r.json()["items"] if h["slug"] == "fortis-mumbai")
    assert fortis["display_starting_price"]["currency"] == "GBP"
    # an explicit currency wins
    r = await client.get(f"{API}/hospitals", headers=auth_headers(user), params={"currency": "EUR"})
    assert r.json()["items"][0]["display_starting_price"]["currency"] == "EUR"


async def test_add_display_amounts_walks_nested_payloads(db):
    data = {
        "currency": "INR",
        "total_minor": 88_00,
        "line_items": [{"category": "surgery", "amount_minor": 44_00}, {"category": "other"}],
        "nested": [{"currency": "USD", "price_minor": 100, "original_price_minor": None}],
        "flag": True,
    }
    out = await add_display_amounts(db, data, "USD")  # no FX rows: code default 88 INR/USD
    assert out["display_total"] == {
        "amount_minor": 100,
        "currency": "USD",
        "fx_rate": "0.01136364",
        "approximate": True,
    }
    assert out["line_items"][0]["display_amount"]["amount_minor"] == 50
    assert "display_amount" not in out["line_items"][1]
    assert out["nested"][0]["display_price"]["approximate"] is False
    assert out["nested"][0]["display_original_price"] is None
    assert await add_display_amounts(db, {"currency": "INR", "total_minor": 1}, None) == {
        "currency": "INR",
        "total_minor": 1,
    }


# ----------------------------------------------------------------------------- cases / quotes / bookings
async def test_patient_sees_quotes_and_bookings_in_preferred_currency(client, db, auth_headers):
    w = await make_world(db)  # creates FX rates from the defaults (USD 88)
    case = await create_case(db, w.patient, w.hospital, procedure_id=w.procedure.id)
    quote = await create_quote(db, case)
    await create_booking(db, case, quote_id=quote.id, total_minor=4_00_000_00)
    h = auth_headers(w.patient_user)  # preferred currency USD

    detail = (await client.get(f"{API}/cases/{case.id}", headers=h)).json()
    q = detail["quotes"][0]
    assert q["currency"] == "INR" and q["total_minor"] == 4_00_000_00
    assert q["display_total"]["currency"] == "USD"
    assert q["display_total"]["amount_minor"] == 4545_45  # 4,00,000 / 88
    assert q["display_total"]["approximate"] is True
    assert q["line_items"][0]["display_amount"]["amount_minor"] == 2840_91  # 2,50,000 / 88
    assert detail["latest_quote"]["display_total"]["amount_minor"] == 4545_45
    assert detail["booking"]["display_total"]["amount_minor"] == 4545_45
    assert detail["booking"]["display_deposit"]["amount_minor"] == 909_09

    cases = (await client.get(f"{API}/cases", headers=h)).json()
    assert cases["items"][0]["latest_quote"]["display_total"]["currency"] == "USD"
    bookings = (await client.get(f"{API}/bookings", headers=h)).json()
    assert bookings["items"][0]["display_balance_due"]["currency"] == "USD"
    one = await client.get(
        f"{API}/bookings/{bookings['items'][0]['id']}", headers=h, params={"currency": "EUR"}
    )
    assert one.json()["display_total"]["currency"] == "EUR"

    # hospitals see plain INR unless they ask
    hh = auth_headers(w.hospital_user)
    plain = (await client.get(f"{API}/cases/{case.id}", headers=hh)).json()
    assert plain["quotes"][0]["display_total"] is None
    asked = (await client.get(f"{API}/cases/{case.id}", headers=hh, params={"currency": "USD"})).json()
    assert asked["quotes"][0]["display_total"]["currency"] == "USD"
    r = await client.get(f"{API}/cases/{case.id}", headers=h, params={"currency": "ZZZ"})
    assert r.status_code == 400


# ----------------------------------------------------------------------------- currency follows the country
async def test_registration_defaults_currency_from_country(client, db):
    _, token = await register(client, "patient", country_code="NG")
    profile = (await client.get(f"{API}/patient/profile", headers=bearer(token))).json()
    assert profile["preferred_currency"] == "NGN" and profile["currency_set_by_user"] is False
    assert profile["country_of_residence"] == "NG"
    # a currency the platform does not support (Uzbekistan) -> USD
    _, token = await register(client, "patient", country_code="UZ")
    assert (await client.get(f"{API}/patient/profile", headers=bearer(token))).json()[
        "preferred_currency"
    ] == "USD"


async def test_country_and_currency_stay_in_sync(client, db, auth_headers):
    user = await create_user(db, role="patient", country_code="NG")
    await create_patient(db, user=user, country_of_residence="NG", preferred_currency="NGN")
    h = auth_headers(user)

    # profile country change -> account country + currency follow
    r = await client.put(f"{API}/patient/profile", headers=h, json={"country_of_residence": "KE"})
    assert r.status_code == 200, r.text
    assert (r.json()["country_of_residence"], r.json()["preferred_currency"]) == ("KE", "KES")
    assert (await reload(db, User, user.id)).country_code == "KE"

    # account country change (PATCH /auth/me) -> profile follows
    r = await client.patch(f"{API}/auth/me", headers=h, json={"country_code": "GB"})
    assert r.status_code == 200, r.text
    profile = (await client.get(f"{API}/patient/profile", headers=h)).json()
    assert (profile["country_of_residence"], profile["preferred_currency"]) == ("GB", "GBP")

    # once the patient picks a currency, a later country change keeps it
    r = await client.put(f"{API}/patient/profile", headers=h, json={"preferred_currency": "EUR"})
    assert r.json()["currency_set_by_user"] is True
    r = await client.put(f"{API}/patient/profile", headers=h, json={"country_of_residence": "SA"})
    assert (r.json()["country_of_residence"], r.json()["preferred_currency"]) == ("SA", "EUR")
    row = await reload(db, PatientProfile, r.json()["id"])
    assert row.currency_set_by_user is True
    assert (await reload(db, User, user.id)).country_code == "SA"
