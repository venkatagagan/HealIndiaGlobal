"""SEC-014: suspending a hospital or an agent signs its users out, blocks their access to every module and
holds their payouts until staff reinstate them."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.enums import PayeeType, SettlementItemStatus
from app.core.errors import BadRequest
from app.models import RefreshToken, SettlementItem
from app.modules.settlements import service as settlements
from tests.factories import create_agent, create_booking, create_case, create_hospital, create_patient
from tests.modules.auth_helpers import API, MOBILE, PASSWORD, bearer


async def _login(client, email: str):
    r = await client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD}, headers=MOBILE)
    assert r.status_code == 200, r.text
    return r.json()


async def test_hospital_suspension_revokes_sessions_blocks_access_and_holds_payouts(
    client, db, make_user, auth_headers
):
    admin = await make_user(role="admin")
    owner = await make_user(role="hospital", email="owner.suspend@example.test", password=PASSWORD)
    hospital = await create_hospital(db, owner=owner)
    patient = await create_patient(db)
    case = await create_case(db, patient, hospital, status="accepted")
    booking = await create_booking(db, case, total_minor=1_000_00)
    db.add(
        SettlementItem(
            payee_type=PayeeType.HOSPITAL,
            payee_id=hospital.id,
            booking_id=booking.id,
            gross_minor=1_000_00,
            net_minor=900_00,
            commission_minor=100_00,
            status=SettlementItemStatus.ELIGIBLE,
            eligible_at=datetime.now(UTC) - timedelta(days=1),
        )
    )
    await db.commit()
    session = await _login(client, "owner.suspend@example.test")
    owner_h = {**MOBILE, **bearer(session)}
    r = await client.get(f"{API}/cases/{case.id}", headers=owner_h)
    assert r.status_code == 200, r.text

    r = await client.post(
        f"{API}/admin/hospitals/{hospital.id}/suspend", json={"reason": "Fraud"}, headers=auth_headers(admin)
    )
    assert r.status_code == 200 and r.json()["status"] == "suspended"
    # the refresh token is revoked and the live access token no longer works (any module)
    live = (
        await db.execute(
            select(RefreshToken).where(RefreshToken.user_id == owner.id, RefreshToken.revoked_at.is_(None))
        )
    ).all()
    assert live == []
    r = await client.get(f"{API}/cases/{case.id}", headers=owner_h)
    assert r.status_code in (401, 403)
    r = await client.get(f"{API}/cases/{case.id}", headers=auth_headers(owner))
    assert r.status_code == 403 and r.json()["error"]["code"] == "organisation_suspended"
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": session["refresh_token"]})
    assert r.status_code == 401
    # payouts are held: nothing to batch for a suspended payee
    try:
        await settlements.generate_batch(db, actor=None, payee_type="hospital", payee_id=hospital.id)
        raise AssertionError("a suspended hospital must not be batched")
    except BadRequest as exc:
        assert exc.code == "no_eligible_items"

    # reinstate restores access and payouts
    r = await client.post(f"{API}/admin/hospitals/{hospital.id}/reinstate", headers=auth_headers(admin))
    assert r.status_code == 200 and r.json()["status"] == "active"
    r = await client.get(f"{API}/cases/{case.id}", headers=auth_headers(owner))
    assert r.status_code == 200
    batch = await settlements.generate_batch(db, actor=None, payee_type="hospital", payee_id=hospital.id)
    assert batch.items_count == 1


async def test_agent_suspension_blocks_access(client, db, make_user, auth_headers):
    admin = await make_user(role="admin")
    agent = await create_agent(db)
    agent_user = await db.get(type(admin), agent.user_id)
    assert agent_user is not None
    h = auth_headers(agent_user)
    assert (await client.get(f"{API}/cases", headers=h)).status_code == 200
    r = await client.post(f"{API}/admin/agents/{agent.id}/suspend", json={}, headers=auth_headers(admin))
    assert r.status_code == 200 and r.json()["status"] == "suspended"
    r = await client.get(f"{API}/cases", headers=h)
    assert r.status_code == 403 and r.json()["error"]["code"] == "organisation_suspended"
    # the account itself can still see why (auth endpoints)
    assert (await client.get(f"{API}/auth/me", headers=h)).status_code == 200
    assert await settlements.payee_suspended(db, "agent", agent.id)
