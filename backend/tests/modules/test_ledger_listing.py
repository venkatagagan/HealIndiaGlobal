"""Ledger list filters, sorting, type summary and adjustment status counts (finance tables)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.core.enums import PaymentGateway
from app.modules.ledger.service import BANK, ESCROW
from tests.modules.settlements_helpers import (
    capture_payment,
    complete_booking,
    finance_events_only,
    make_world,
)

API = "/api/v1/finance/ledger"


@pytest.fixture(autouse=True)
def _finance_only(monkeypatch: pytest.MonkeyPatch) -> None:
    finance_events_only(monkeypatch)


async def test_account_filters_sort_and_summary(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    world = await make_world(db)
    await capture_payment(db, world.booking, 4_00_000_00, fee_minor=2_000_00, gateway=PaymentGateway.RAZORPAY)
    await complete_booking(db, world.booking)
    h = auth_headers(await make_user(role="finance"))

    r = await client.get(f"{API}/accounts", params=[("type", "revenue"), ("type", "expense")], headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["total"] > 0 and {a["type"] for a in r.json()["items"]} <= {"revenue", "expense"}

    r = await client.get(f"{API}/accounts", params={"sort": "-balance_minor", "page_size": 100}, headers=h)
    balances = [a["balance_minor"] for a in r.json()["items"]]
    assert balances == sorted(balances, reverse=True)
    r = await client.get(f"{API}/accounts", params={"nonzero": True, "page_size": 100}, headers=h)
    assert all(a["balance_minor"] != 0 for a in r.json()["items"])
    assert (await client.get(f"{API}/accounts", params={"sort": "owner_id"}, headers=h)).status_code == 422

    r = await client.get(f"{API}/accounts/summary", params={"type": "asset"}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    all_accounts = (await client.get(f"{API}/accounts", params={"page_size": 100}, headers=h)).json()
    assert body["total"] == all_accounts["total"]
    assert set(body["counts"]) == {"asset", "liability", "revenue", "expense", "equity"}
    revenue = [a for a in all_accounts["items"] if a["type"] == "revenue"]
    assert body["counts"]["revenue"] == len(revenue)
    assert body["balances"]["revenue"] == sum(a["balance_minor"] for a in revenue)

    escrow = next(a for a in all_accounts["items"] if a["code"] == ESCROW)
    r = await client.get(f"{API}/accounts/{escrow['id']}/entries", params={"direction": "debit"}, headers=h)
    assert r.status_code == 200 and all(e["direction"] == "debit" for e in r.json()["items"])
    r = await client.get(
        f"{API}/accounts/{escrow['id']}/entries",
        params={"sort": "amount_minor", "txn_type": "payment_captured"},
        headers=h,
    )
    amounts = [e["amount_minor"] for e in r.json()["items"]]
    assert amounts == sorted(amounts) and all(e["txn_type"] == "payment_captured" for e in r.json()["items"])
    future = (datetime.now(UTC) + timedelta(days=3)).date().isoformat()
    r = await client.get(f"{API}/accounts/{escrow['id']}/entries", params={"posted_from": future}, headers=h)
    assert r.json()["total"] == 0


async def test_transaction_filters(client: Any, db: Any, make_user: Any, auth_headers: Any) -> None:
    world = await make_world(db)
    await capture_payment(db, world.booking, 4_00_000_00, gateway=PaymentGateway.RAZORPAY)
    await complete_booking(db, world.booking)
    h = auth_headers(await make_user(role="finance"))

    r = await client.get(f"{API}/transactions", headers=h)
    total = r.json()["total"]
    assert total >= 2
    r = await client.get(
        f"{API}/transactions",
        params=[("txn_type", "revenue_recognition"), ("txn_type", "payment_captured")],
        headers=h,
    )
    assert {t["txn_type"] for t in r.json()["items"]} == {"revenue_recognition", "payment_captured"}
    r = await client.get(
        f"{API}/transactions", params={"min_amount": 4_00_000_00, "max_amount": 4_00_000_00}, headers=h
    )
    assert r.json()["total"] >= 1 and all(t["total_minor"] == 4_00_000_00 for t in r.json()["items"])
    r = await client.get(f"{API}/transactions", params={"q": str(world.booking.id)}, headers=h)
    assert r.json()["total"] >= 1 and all(
        t["reference_id"] == str(world.booking.id) for t in r.json()["items"]
    )
    today = datetime.now(UTC).date()
    r = await client.get(
        f"{API}/transactions",
        params={
            "posted_from": (today - timedelta(days=1)).isoformat(),
            "posted_to": (today + timedelta(days=1)).isoformat(),
        },
        headers=h,
    )
    assert r.json()["total"] == total
    r = await client.get(
        f"{API}/transactions", params={"posted_to": (today - timedelta(days=5)).isoformat()}, headers=h
    )
    assert r.json()["total"] == 0
    r = await client.get(f"{API}/transactions", params={"sort": "posted_at"}, headers=h)
    posted = [t["posted_at"] for t in r.json()["items"]]
    assert posted == sorted(posted)


async def test_adjustment_filters_and_counts(client: Any, db: Any, make_user: Any, auth_headers: Any) -> None:
    await make_world(db)
    maker = auth_headers(await make_user(role="finance"))
    checker = auth_headers(await make_user(role="super_admin"))

    def body(amount: int, description: str) -> dict[str, Any]:
        return {
            "kind": "manual",
            "description": description,
            "external_reference": f"MEMO-{amount}",
            "entries": [
                {"account_code": "PLATFORM:ADJUSTMENTS", "direction": "debit", "amount_minor": amount},
                {"account_code": BANK, "direction": "credit", "amount_minor": amount},
            ],
        }

    ids = []
    for amount, text in ((100_00, "Bank charges October"), (5_000_00, "Courier refund write-off")):
        r = await client.post(f"{API}/adjustments", json=body(amount, text), headers=maker)
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    r = await client.post(f"{API}/adjustments/{ids[1]}/approve", headers=checker)
    assert r.status_code == 200, r.text

    r = await client.get(f"{API}/adjustments", params={"q": "courier"}, headers=maker)
    assert [a["id"] for a in r.json()["items"]] == [ids[1]]
    r = await client.get(f"{API}/adjustments", params={"q": "MEMO-100"}, headers=maker)
    assert [a["id"] for a in r.json()["items"]] == [ids[0]]
    r = await client.get(f"{API}/adjustments", params={"sort": "-amount_minor"}, headers=maker)
    assert [a["id"] for a in r.json()["items"]] == [ids[1], ids[0]]
    r = await client.get(f"{API}/adjustments", params={"min_amount": 1_000_00}, headers=maker)
    assert [a["id"] for a in r.json()["items"]] == [ids[1]]
    r = await client.get(
        f"{API}/adjustments",
        params=[("status", "posted"), ("status", "rejected"), ("kind", "manual")],
        headers=maker,
    )
    assert [a["id"] for a in r.json()["items"]] == [ids[1]]

    r = await client.get(f"{API}/adjustments/status-counts", headers=maker)
    assert r.status_code == 200, r.text
    assert r.json() == {"counts": {"pending_approval": 1, "posted": 1, "rejected": 0}, "total": 2}
    r = await client.get(f"{API}/adjustments/status-counts", params={"kind": "tax_remittance"}, headers=maker)
    assert r.json()["total"] == 0
