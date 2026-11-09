"""Admin list endpoints: multi-value filters, sorting, per-status counts and filter facets."""

from __future__ import annotations

from typing import Any

from app.models import HospitalSpecialty
from tests.factories import create_agent, create_hospital, create_specialty, create_user

API = "/api/v1"


async def test_hospital_filters_sort_counts_and_facets(client, db, make_user, auth_headers) -> None:
    h = auth_headers(await make_user(role="support"))
    a = await create_hospital(db, status="active", name="Alpha Care", city="Pune", state="Maharashtra")
    a.accreditations = ["jci", "nabh"]
    b = await create_hospital(
        db, status="pending_review", name="Beta Heart", city="Chennai", state="Tamil Nadu"
    )
    b.accreditations = ["nabh"]
    c = await create_hospital(db, status="suspended", name="Gamma Ortho", city="pune", state="Maharashtra")
    c.accreditations = []
    spec = await create_specialty(db)
    db.add(HospitalSpecialty(hospital_id=b.id, specialty_id=spec.id))
    await db.commit()

    async def names(**params: Any) -> list[str]:
        r = await client.get(f"{API}/admin/hospitals", headers=h, params=params)
        assert r.status_code == 200, r.text
        return [x["name"] for x in r.json()["items"]]

    assert await names(status=["active", "suspended"], sort="name") == ["Alpha Care", "Gamma Ortho"]
    assert await names(city="PUNE", sort="-name") == ["Gamma Ortho", "Alpha Care"]
    assert await names(state="Tamil Nadu") == ["Beta Heart"]
    assert await names(accreditation="JCI") == ["Alpha Care"]
    assert set(await names(accreditation=["jci", "nabh"])) == {"Alpha Care", "Beta Heart"}
    assert await names(specialty_id=str(spec.id)) == ["Beta Heart"]
    assert (await names())[0] == "Beta Heart"  # default: approval queue first
    assert (
        await client.get(f"{API}/admin/hospitals", headers=h, params={"sort": "bogus"})
    ).status_code == 422

    r = await client.get(
        f"{API}/admin/hospitals/status-counts", headers=h, params={"city": "pune", "status": "active"}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["active"] == 1 and body["counts"]["suspended"] == 1
    assert body["counts"]["pending_review"] == 0 and body["total"] == 2

    r = await client.get(f"{API}/admin/facets", headers=h)
    assert r.status_code == 200, r.text
    facets = r.json()
    assert {"Pune", "Chennai"} <= set(facets["hospital_cities"])
    assert {"jci", "nabh"} <= set(facets["hospital_accreditations"])
    assert "agent_countries" in facets and "audit_actions" in facets


async def test_agent_filters_and_counts(client, db, make_user, auth_headers) -> None:
    h = auth_headers(await make_user(role="admin"))
    await create_agent(db, status="active", agency_name="Zulu Travel", country="NG", tier="gold")
    await create_agent(db, status="pending", agency_name="Alpha Med", country="KE")
    await create_agent(db, status="active", agency_name="Mike Health", country="KE", tier="silver")
    await db.commit()

    async def names(**params: Any) -> list[str]:
        r = await client.get(f"{API}/admin/agents", headers=h, params=params)
        assert r.status_code == 200, r.text
        return [x["agency_name"] for x in r.json()["items"]]

    assert await names(country="ke", sort="agency_name") == ["Alpha Med", "Mike Health"]
    assert await names(tier=["gold", "silver"], sort="-agency_name") == ["Zulu Travel", "Mike Health"]
    assert await names(status=["pending"]) == ["Alpha Med"]
    r = await client.get(f"{API}/admin/agents/status-counts", headers=h, params={"country": "KE"})
    assert r.json()["counts"]["pending"] == 1 and r.json()["counts"]["active"] == 1
    assert r.json()["total"] == 2


async def test_user_filters_role_counts_and_audit_search(client, db, make_user, auth_headers) -> None:
    admin = await make_user(role="admin", full_name="Asha Admin")
    h = auth_headers(admin)
    await create_user(db, role="patient", full_name="Paula Patient", country_code="US")
    await create_user(db, role="patient", full_name="Quinn Patient", country_code="GB", status="suspended")
    await create_user(db, role="agent", full_name="Ade Agent", country_code="US")
    await db.commit()

    async def names(**params: Any) -> list[str]:
        r = await client.get(f"{API}/admin/users", headers=h, params={"q": "a", **params})
        assert r.status_code == 200, r.text
        return [x["full_name"] for x in r.json()["items"]]

    assert await names(role=["patient", "agent"], country_code="us", sort="full_name") == [
        "Ade Agent",
        "Paula Patient",
    ]
    assert await names(role="patient", status=["suspended"]) == ["Quinn Patient"]
    assert await names(created_to="2000-01-01") == []
    r = await client.get(f"{API}/admin/users/role-counts", headers=h, params={"country_code": ["US", "GB"]})
    assert r.status_code == 200, r.text
    assert r.json()["counts"]["patient"] == 2 and r.json()["counts"]["agent"] == 1
    assert r.json()["counts"]["finance"] == 0

    # an audited action, then search the audit log by actor name and by actor role
    target = (await client.get(f"{API}/admin/users", headers=h, params={"q": "Quinn"})).json()["items"][0]
    r = await client.patch(f"{API}/admin/users/{target['id']}", headers=h, json={"status": "active"})
    assert r.status_code == 200, r.text
    r = await client.get(f"{API}/admin/audit-logs", headers=h, params={"q": "Asha"})
    assert r.status_code == 200, r.text
    assert r.json()["total"] >= 1 and all(x["actor_user_id"] == str(admin.id) for x in r.json()["items"])
    r = await client.get(f"{API}/admin/audit-logs", headers=h, params={"actor_role": "system"})
    assert all(x["actor_user_id"] is None for x in r.json()["items"])
    r = await client.get(f"{API}/admin/audit-logs", headers=h, params={"actor_role": ["admin"]})
    assert r.json()["total"] >= 1
