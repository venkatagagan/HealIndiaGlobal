"""SEC-044: commission rate changes (hospital/agent rates, commission rules, default settings) need a second
admin/finance approver."""

from __future__ import annotations

from sqlalchemy import select

from app.core.settings_store import get_setting
from app.models import CommissionRule, Hospital, Notification
from tests.factories import create_agent, create_hospital

API = "/api/v1"
CHANGES = f"{API}/admin/commission-changes"


async def test_hospital_rate_needs_a_different_approver(client, db, make_user, auth_headers):
    maker = await make_user(role="finance")
    checker = await make_user(role="admin")
    support = await make_user(role="support")
    other_finance = await make_user(role="finance")
    other_finance_id = other_finance.id
    hospital = await create_hospital(db)
    hospital_id = hospital.id
    mh, ch = auth_headers(maker), auth_headers(checker)

    r = await client.patch(
        f"{API}/admin/hospitals/{hospital_id}", json={"commission_rate_bps": 1500}, headers=mh
    )
    assert r.status_code == 200, r.text
    first = r.json()["pending_commission_change"]
    assert r.json()["commission_rate_bps"] is None and first["before"] == {"commission_rate_bps": None}
    # approvers are told (in their language)
    kinds = (
        await db.execute(
            select(Notification.user_id).where(Notification.kind == "commission_change.requested")
        )
    ).scalars()
    assert other_finance_id in set(kinds)

    # the queue
    assert (await client.get(CHANGES, headers=auth_headers(support))).status_code == 403
    queue = (await client.get(CHANGES, headers=ch)).json()
    assert [c["id"] for c in queue] == [first["id"]] and queue[0]["target_name"]

    # the requester cannot approve their own change
    r = await client.post(f"{CHANGES}/{first['id']}/approve", headers=mh)
    assert r.status_code == 403 and r.json()["error"]["code"] == "second_approver_required"
    # a new request supersedes the reviewed one
    r = await client.patch(
        f"{API}/admin/hospitals/{hospital_id}", json={"commission_rate_bps": 2900}, headers=mh
    )
    second = r.json()["pending_commission_change"]
    r = await client.post(f"{CHANGES}/{first['id']}/approve", headers=ch)
    assert r.status_code == 409 and r.json()["error"]["code"] == "request_changed"
    # the rate changed underneath (e.g. a data fix): the stale request cannot be applied
    row = await db.get(Hospital, hospital_id)
    assert row is not None
    row.commission_rate_bps = 100
    await db.commit()
    r = await client.post(f"{CHANGES}/{second['id']}/approve", headers=ch)
    assert r.status_code == 409 and r.json()["error"]["code"] == "target_changed"
    # reject (by the checker) / withdraw (by the requester)
    r = await client.post(f"{CHANGES}/{second['id']}/reject", json={"reason": "Too high"}, headers=ch)
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    r = await client.patch(
        f"{API}/admin/hospitals/{hospital_id}", json={"commission_rate_bps": 1200}, headers=mh
    )
    third = r.json()["pending_commission_change"]
    r = await client.post(f"{CHANGES}/{third['id']}/reject", json={}, headers=mh)
    assert r.status_code == 200 and r.json()["status"] == "withdrawn"
    db.expire_all()
    assert (await db.get(Hospital, hospital_id)).commission_rate_bps == 100  # type: ignore[union-attr]
    # unchanged value: nothing to approve
    r = await client.patch(
        f"{API}/admin/hospitals/{hospital_id}", json={"commission_rate_bps": 100}, headers=mh
    )
    assert r.json()["pending_commission_change"] is None


async def test_agent_rate_and_rules_wait_for_approval(client, db, make_user, auth_headers):
    maker = await make_user(role="admin")
    checker = await make_user(role="finance")
    mh, ch = auth_headers(maker), auth_headers(checker)
    agent = await create_agent(db)
    agent_id = agent.id
    r = await client.patch(f"{API}/admin/agents/{agent_id}", json={"commission_rate_bps": 650}, headers=mh)
    assert r.status_code == 200 and r.json()["commission_rate_bps"] is None
    change = r.json()["pending_commission_change"]
    assert (await client.post(f"{CHANGES}/{change['id']}/approve", headers=ch)).status_code == 200
    assert (await client.get(f"{API}/admin/agents/{agent_id}", headers=mh)).json()[
        "commission_rate_bps"
    ] == 650

    # a new rule starts inactive; its activation is the pending change
    r = await client.post(
        f"{API}/finance/commission-rules", json={"scope": "global", "rate_bps": 1100}, headers=mh
    )
    assert r.status_code == 201, r.text
    rule = r.json()
    assert rule["is_active"] is False and rule["pending_change"]["changes"] == {"is_active": True}
    r = await client.post(f"{CHANGES}/{rule['pending_change']['id']}/approve", headers=mh)
    assert r.status_code == 403
    assert (
        await client.post(f"{CHANGES}/{rule['pending_change']['id']}/approve", headers=ch)
    ).status_code == 200
    # a rate change on the rule waits too
    r = await client.patch(
        f"{API}/finance/commission-rules/{rule['id']}", json={"rate_bps": 2500}, headers=mh
    )
    assert r.status_code == 200 and r.json()["rate_bps"] == 1100 and r.json()["is_active"] is True
    assert r.json()["pending_change"]["changes"] == {"rate_bps": 2500}
    assert (
        await client.post(f"{CHANGES}/{r.json()['pending_change']['id']}/approve", headers=ch)
    ).status_code == 200
    db.expire_all()
    stored = await db.get(CommissionRule, rule["id"])
    assert stored is not None and stored.rate_bps == 2500 and stored.is_active


async def test_default_commission_settings_are_dual_control(client, db, make_user, auth_headers):
    maker = await make_user(role="finance")
    checker = await make_user(role="finance")
    url = f"{API}/admin/settings/default_commission_bps"
    before = await get_setting(db, "default_commission_bps")
    r = await client.put(url, json={"value": 1800}, headers=auth_headers(maker))
    assert r.status_code == 200, r.text
    pending = r.json()["pending_change"]
    assert pending["value"] == 1800
    assert await get_setting(db, "default_commission_bps") == before
    r = await client.post(f"{url}/approve", json={"request_id": pending["id"]}, headers=auth_headers(maker))
    assert r.status_code == 403 and r.json()["error"]["code"] == "second_approver_required"
    r = await client.post(f"{url}/approve", json={"request_id": pending["id"]}, headers=auth_headers(checker))
    assert r.status_code == 200 and r.json()["value"] == 1800
