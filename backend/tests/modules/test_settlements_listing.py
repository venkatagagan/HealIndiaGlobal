"""Finance table filters: search, date / amount windows, sorting and status counts (settlement lists)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.modules.settlements import service
from tests.modules.settlements_helpers import (
    capture_payment,
    complete_booking,
    finance_events_only,
    make_world,
)

API = "/api/v1"


@pytest.fixture(autouse=True)
def _finance_only(monkeypatch: pytest.MonkeyPatch) -> None:
    finance_events_only(monkeypatch)


async def _verified_account(client: Any, owner: dict[str, str], fin: dict[str, str], holder: str) -> str:
    r = await client.post(
        f"{API}/finance/payout-accounts",
        json={"account_holder_name": holder, "account_number": "001234567890", "ifsc": "hdfc0000123"},
        headers=owner,
    )
    assert r.status_code == 201, r.text
    account_id = str(r.json()["id"])
    r = await client.post(f"{API}/finance/payout-accounts/{account_id}/verify", json={}, headers=fin)
    assert r.status_code == 200, r.text
    return account_id


async def test_item_filters_sort_and_counts(client: Any, db: Any, make_user: Any, auth_headers: Any) -> None:
    small = await make_world(db, with_agent=False, total_minor=50_000_00)
    big = await make_world(db, with_agent=False, total_minor=2_00_000_00)
    await capture_payment(db, small.booking, 50_000_00)
    await complete_booking(db, small.booking)
    await capture_payment(db, big.booking, 2_00_000_00)
    await complete_booking(db, big.booking)
    fin = auth_headers(await make_user(role="finance"))
    url = f"{API}/finance/settlements/items"

    r = await client.get(url, params={"sort": "net_minor"}, headers=fin)
    assert r.status_code == 200, r.text
    nets = [i["net_minor"] for i in r.json()["items"]]
    assert len(nets) == 2 and nets == sorted(nets)
    r = await client.get(url, params={"sort": "-net_minor"}, headers=fin)
    assert [i["net_minor"] for i in r.json()["items"]] == sorted(nets, reverse=True)
    assert (await client.get(url, params={"sort": "drop table"}, headers=fin)).status_code == 422

    # search by payee (hospital) name and by booking number
    r = await client.get(url, params={"q": big.hospital.name}, headers=fin)
    assert {i["payee_id"] for i in r.json()["items"]} == {str(big.hospital.id)}
    r = await client.get(url, params={"q": small.booking.booking_number}, headers=fin)
    assert [i["booking_id"] for i in r.json()["items"]] == [str(small.booking.id)]

    # amount window (minor units) and repeated status
    r = await client.get(url, params={"min_net": max(nets)}, headers=fin)
    assert [i["net_minor"] for i in r.json()["items"]] == [max(nets)]
    r = await client.get(url, params=[("status", "pending"), ("status", "eligible")], headers=fin)
    assert r.json()["total"] == 2
    r = await client.get(url, params={"status": "paid"}, headers=fin)
    assert r.json()["total"] == 0

    # eligible (hold ends) window: both items become eligible after the hold period
    later = (datetime.now(UTC) + timedelta(days=60)).date().isoformat()
    r = await client.get(url, params={"eligible_from": later}, headers=fin)
    assert r.json()["total"] == 0

    r = await client.get(f"{url}/status-counts", params={"status": "paid"}, headers=fin)
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 2 and sum(r.json()["counts"].values()) == 2
    # a payee only counts their own items
    r = await client.get(f"{url}/status-counts", headers=auth_headers(small.hospital_owner))
    assert r.json()["total"] == 1


async def test_batch_payout_document_and_account_counts(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    world = await make_world(db, with_agent=False, total_minor=1_00_000_00)
    await capture_payment(db, world.booking, 1_00_000_00)
    await complete_booking(db, world.booking)
    await service.mark_eligible(db, now=datetime.now(UTC) + timedelta(days=10))
    await db.commit()
    fa = auth_headers(await make_user(role="finance"))
    fb = auth_headers(await make_user(role="super_admin"))
    owner = auth_headers(world.hospital_owner)

    # payout accounts: one verified, one awaiting verification
    await _verified_account(client, owner, fa, "Apex Healthcare Pvt Ltd")
    r = await client.post(
        f"{API}/finance/payout-accounts",
        json={
            "account_holder_name": "Second Account",
            "account_number": "009876543210",
            "ifsc": "icic0000456",
        },
        headers=owner,
    )
    assert r.status_code == 201, r.text
    r = await client.get(
        f"{API}/finance/payout-accounts/verification-counts",
        params={"owner_id": str(world.hospital.id)},
        headers=fa,
    )
    assert r.status_code == 200, r.text
    assert r.json()["counts"] == {"unverified": 1, "verified": 1, "disabled": 0} and r.json()["total"] == 2
    r = await client.get(
        f"{API}/finance/payout-accounts",
        params={"q": "second", "owner_id": str(world.hospital.id), "sort": "account_holder_name"},
        headers=fa,
    )
    assert [a["account_holder_name"] for a in r.json()["items"]] == ["Second Account"]
    r = await client.get(f"{API}/finance/payout-accounts", params={"q": "3210"}, headers=fa)
    assert [a["account_holder_name"] for a in r.json()["items"]] == ["Second Account"]

    period_end = (datetime.now(UTC) + timedelta(days=10)).date().isoformat()
    r = await client.post(
        f"{API}/finance/settlements/batches",
        json={"payee_type": "hospital", "period_end": period_end},
        headers=fa,
    )
    assert r.status_code == 201, r.text
    batch = r.json()

    counts_url = f"{API}/finance/settlements/batches/status-counts"
    r = await client.get(counts_url, headers=fa)
    assert r.status_code == 200, r.text
    assert r.json()["counts"] == {"pending_approval": 1} and r.json()["auto_pending_approval"] == 0
    r = await client.get(f"{API}/finance/settlements/batches", params={"auto": True}, headers=fa)
    assert r.json()["total"] == 0
    r = await client.get(
        f"{API}/finance/settlements/batches", params={"q": batch["batch_number"]}, headers=fa
    )
    assert [b["id"] for b in r.json()["items"]] == [batch["id"]]
    r = await client.get(
        f"{API}/finance/settlements/batches",
        params=[("status", "approved"), ("status", "pending_approval"), ("sort", "-total_net_minor")],
        headers=fa,
    )
    assert r.json()["total"] == 1
    assert (await client.get(counts_url, headers=owner)).status_code == 403

    assert (
        await client.post(f"{API}/finance/settlements/batches/{batch['id']}/approve", json={}, headers=fb)
    ).status_code == 200
    r = await client.post(
        f"{API}/finance/settlements/batches/{batch['id']}/process",
        json={"method": "manual_bank_transfer"},
        headers=fa,
    )
    assert r.status_code == 200, r.text
    (payout,) = r.json()["payouts"]

    payouts_url = f"{API}/finance/settlements/payouts"
    r = await client.get(f"{payouts_url}/status-counts", headers=fa)
    assert r.status_code == 200, r.text
    assert r.json()["counts"] == {"processing": 1}
    assert r.json()["awaiting_confirmation"] == 0 and r.json()["reversal_pending"] == 0
    r = await client.post(
        f"{payouts_url}/{payout['id']}/mark-paid", json={"utr": "HDFCR5202610210001"}, headers=fa
    )
    assert r.status_code == 200, r.text
    r = await client.get(f"{payouts_url}/status-counts", headers=fa)
    assert r.json()["awaiting_confirmation"] == 1
    r = await client.get(payouts_url, params={"q": "hdfcr5202610"}, headers=fa)
    assert [p["id"] for p in r.json()["items"]] == [payout["id"]]
    r = await client.get(
        payouts_url, params={"q": batch["batch_number"], "method": "razorpay_route"}, headers=fa
    )
    assert r.json()["total"] == 0
    r = await client.get(
        payouts_url,
        params={
            "method": "manual_bank_transfer",
            "min_amount": payout["amount_minor"],
            "sort": "-amount_minor",
        },
        headers=fa,
    )
    assert r.json()["total"] == 1
    r = await client.get(payouts_url, params={"max_amount": payout["amount_minor"] - 1}, headers=fa)
    assert r.json()["total"] == 0
    today = datetime.now(UTC).date()
    r = await client.get(
        payouts_url,
        params={
            "created_from": (today - timedelta(days=1)).isoformat(),
            "created_to": (today + timedelta(days=1)).isoformat(),
        },
        headers=fa,
    )
    assert r.json()["total"] == 1

    # documents are issued once the payout is paid (second finance user confirms the UTR)
    r = await client.get(f"{payouts_url}/{payout['id']}", headers=fa)
    pending = r.json()
    r = await client.post(
        f"{payouts_url}/{payout['id']}/mark-paid/approve",
        json={
            "request_id": pending["paid_request_id"],
            "reference": pending["utr"],
            "amount_minor": pending["amount_minor"],
        },
        headers=fb,
    )
    assert r.status_code == 200, r.text
    docs_url = f"{API}/finance/settlements/invoices"
    r = await client.get(f"{docs_url}/kind-counts", headers=fa)
    assert r.status_code == 200, r.text
    assert r.json()["counts"].get("commission_invoice") == 1
    (doc,) = (await client.get(docs_url, params={"kind": "commission_invoice"}, headers=fa)).json()["items"]
    r = await client.get(docs_url, params={"q": doc["invoice_number"], "sort": "-total_minor"}, headers=fa)
    assert [d["id"] for d in r.json()["items"]] == [doc["id"]]
    r = await client.get(docs_url, params=[("kind", "credit_note"), ("kind", "agent_statement")], headers=fa)
    assert r.json()["total"] == 0
    r = await client.get(docs_url, params={"q": world.hospital.name}, headers=fa)
    assert r.json()["total"] >= 1
    r = await client.get(docs_url, params={"min_total": doc["total_minor"] + 1}, headers=fa)
    assert r.json()["total"] == 0
    # the hospital sees counts for its own documents only
    r = await client.get(f"{docs_url}/kind-counts", headers=owner)
    assert r.json()["total"] == 1


async def test_commission_rules_carry_target_names(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    world = await make_world(db, with_agent=True)
    fin = auth_headers(await make_user(role="finance"))
    r = await client.post(
        f"{API}/finance/commission-rules",
        json={"scope": "hospital", "hospital_id": str(world.hospital.id), "rate_bps": 1200},
        headers=fin,
    )
    assert r.status_code == 201, r.text
    assert r.json()["hospital_name"] == world.hospital.name
    r = await client.post(
        f"{API}/finance/commission-rules",
        json={"scope": "agent", "agent_id": str(world.agent.id), "rate_bps": 400},
        headers=fin,
    )
    assert r.status_code == 201, r.text
    rules = (
        await client.get(f"{API}/finance/commission-rules", params={"page_size": 100}, headers=fin)
    ).json()["items"]
    by_scope = {x["scope"]: x for x in rules}
    assert by_scope["hospital"]["hospital_name"] == world.hospital.name
    assert by_scope["agent"]["agent_name"] == world.agent.agency_name
