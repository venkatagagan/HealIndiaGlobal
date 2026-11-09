"""Settlement items, the money flow through events, batches with maker-checker, payouts (be-finance)."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import time_machine
from sqlalchemy import select, text

from app.core.config import settings
from app.core.enums import PaymentGateway, SettlementItemStatus
from app.core.jobs import enqueue
from app.core.money import apply_bps
from app.models.identity import AuditLog
from app.models.ledger import LedgerTransaction
from app.models.settlements import PayoutAccount
from app.modules.ledger import postings
from app.modules.ledger.service import (
    AGENT_COMMISSION_EXPENSE,
    BANK,
    CANCELLATION_REVENUE,
    COMMISSION_REVENUE,
    ESCROW,
    GATEWAY_FEES,
    GST_OUTPUT,
    TDS_194H,
    TDS_194O,
    TDS_195,
    agent_payable,
    hospital_payable,
)
from app.modules.settlements import service
from tests.factories import create_user
from tests.modules.settlements_helpers import (
    assert_ledger_consistent,
    balance,
    capture_payment,
    complete_booking,
    finance_events_only,
    items_for,
    make_world,
    process_refund,
    publish_captured,
    txn_count,
)

API = "/api/v1"
TOTAL = 4_00_000_00
COMMISSION = apply_bps(TOTAL, 1500)  # 60,000.00
GST = apply_bps(COMMISSION, 1800)  # 10,800.00
TDS = apply_bps(TOTAL, 10)  # 400.00
NET = TOTAL - COMMISSION - GST - TDS  # 3,28,800.00
AGENT_K = apply_bps(TOTAL, 500)  # 20,000.00


@pytest.fixture(autouse=True)
def _finance_only(monkeypatch: pytest.MonkeyPatch) -> None:
    finance_events_only(monkeypatch)


async def _run_task(db: Any, run_jobs: Any, name: str) -> None:
    await enqueue(db, name, {})
    await db.commit()
    assert await run_jobs() >= 1


async def _add_verified_account(
    client: Any, owner_headers: dict[str, str], finance_headers: dict[str, str]
) -> str:
    r = await client.post(
        f"{API}/finance/payout-accounts",
        json={
            "account_holder_name": "Apex Healthcare Pvt Ltd",
            "account_number": "001234567890",
            "ifsc": "hdfc0000123",
            "bank_name": "HDFC Bank",
        },
        headers=owner_headers,
    )
    assert r.status_code == 201, r.text
    account = r.json()
    assert account["account_number_masked"] == "********7890" and "001234567890" not in r.text
    assert (
        account["is_primary"] is True and account["is_verified"] is False and account["ifsc"] == "HDFC0000123"
    )
    r = await client.post(
        f"{API}/finance/payout-accounts/{account['id']}/verify", json={}, headers=finance_headers
    )
    assert r.status_code == 200 and r.json()["is_verified"] is True
    return str(account["id"])


# ================================================================================================ full flow
async def test_full_money_flow(
    client: Any, db: Any, make_user: Any, auth_headers: Any, run_jobs: Any
) -> None:
    world = await make_world(db)
    assert world.agent is not None
    fin_a = await make_user(role="finance", full_name="Farah Maker")
    fin_b = await make_user(role="finance", full_name="Felix Checker")
    admin = await make_user(role="admin")
    support = await make_user(role="support")
    agent_user = await db.get(type(fin_a), world.agent.user_id)

    # 1. capture (deposit + balance, one with a gateway fee)
    deposit = await capture_payment(
        db, world.booking, 80_000_00, fee_minor=1_500_00, gateway=PaymentGateway.RAZORPAY
    )
    await capture_payment(db, world.booking, TOTAL - 80_000_00)
    assert await balance(db, ESCROW) == TOTAL
    assert await balance(db, "GATEWAY:razorpay:RECEIVABLE") == 80_000_00 - 1_500_00
    assert await balance(db, "GATEWAY:mock:RECEIVABLE") == TOTAL - 80_000_00
    assert await balance(db, GATEWAY_FEES) == 1_500_00
    # duplicate delivery of the same event posts nothing new
    await publish_captured(db, deposit)
    await db.commit()
    assert await txn_count(db, "capture:") == 2

    r = await client.get(f"{API}/finance/summary", headers=auth_headers(fin_a))
    assert r.status_code == 200 and r.json()["escrow_minor"] == TOTAL and r.json()["gmv_minor"] == TOTAL

    # 2. completion -> revenue recognition + agent commission + settlement items
    await complete_booking(db, world.booking)
    hcode, acode = hospital_payable(world.hospital.id), agent_payable(world.agent.id)
    assert await balance(db, ESCROW) == 0
    assert await balance(db, hcode) == NET
    assert await balance(db, COMMISSION_REVENUE) == COMMISSION
    assert await balance(db, GST_OUTPUT) == GST
    assert await balance(db, TDS_194O) == TDS
    assert await balance(db, acode) == AGENT_K
    assert await balance(db, AGENT_COMMISSION_EXPENSE) == AGENT_K
    await assert_ledger_consistent(db)

    items = await items_for(db, world.booking.id)
    assert len(items) == 2
    h_item = next(i for i in items if i.payee_type == "hospital")
    a_item = next(i for i in items if i.payee_type == "agent")
    assert (
        h_item.gross_minor,
        h_item.commission_minor,
        h_item.tax_minor,
        h_item.tds_minor,
        h_item.net_minor,
    ) == (
        TOTAL,
        COMMISSION,
        GST,
        TDS,
        NET,
    )
    assert (a_item.gross_minor, a_item.net_minor) == (AGENT_K, AGENT_K)
    assert h_item.status == a_item.status == SettlementItemStatus.PENDING
    hold_days = 3
    await db.refresh(world.booking)
    assert world.booking.completed_at is not None
    assert h_item.eligible_at == world.booking.completed_at + timedelta(days=hold_days)

    # same event again -> no new postings or items
    from app.core.events import publish

    await publish(db, "booking.completed", {"booking_id": str(world.booking.id)})
    await db.commit()
    assert await txn_count(db, "recognize:") == 1 and len(await items_for(db, world.booking.id)) == 2

    # payees see their own pending earnings
    owner_h = auth_headers(world.hospital_owner)
    r = await client.get(f"{API}/finance/summary", headers=owner_h)
    assert r.status_code == 200, r.text
    assert r.json()["pending_minor"] == NET and r.json()["paid_minor"] == 0 and r.json()["next_payout_date"]
    r = await client.get(f"{API}/finance/settlements/items", headers=auth_headers(agent_user))
    assert [i["id"] for i in r.json()["items"]] == [str(a_item.id)]
    assert r.json()["items"][0]["payee_name"] == world.agent.agency_name
    r = await client.get(f"{API}/finance/summary", headers=auth_headers(support))
    assert r.status_code == 200 and r.json()["hospital_payables_minor"] == NET

    # nothing is batchable during the hold; support/admin/hospital cannot generate batches
    r = await client.post(
        f"{API}/finance/settlements/batches", json={"payee_type": "hospital"}, headers=auth_headers(fin_a)
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "no_eligible_items"
    for actor_headers in (auth_headers(admin), auth_headers(support), owner_h):
        r = await client.post(
            f"{API}/finance/settlements/batches", json={"payee_type": "hospital"}, headers=actor_headers
        )
        assert r.status_code == 403

    # 3. hold passes -> eligible
    with time_machine.travel(datetime.now(UTC) + timedelta(days=hold_days, hours=1), tick=True):
        fa, fb = auth_headers(fin_a), auth_headers(fin_b)
        owner_h = auth_headers(world.hospital_owner)
        agent_h = auth_headers(agent_user)
        await _run_task(db, run_jobs, "settlements.mark_eligible")
        r = await client.get(f"{API}/finance/settlements/items", params={"status": "eligible"}, headers=fa)
        assert {i["id"] for i in r.json()["items"]} == {str(h_item.id), str(a_item.id)}

        await _add_verified_account(client, owner_h, fa)
        await _add_verified_account(client, agent_h, fa)

        # 4. maker-checker batch approval
        r = await client.post(
            f"{API}/finance/settlements/batches",
            json={"payee_type": "hospital", "payee_id": str(world.hospital.id)},
            headers=fa,
        )
        assert r.status_code == 201, r.text
        batch = r.json()
        assert batch["status"] == "pending_approval" and batch["batch_number"].startswith("HIG-S-")
        assert (batch["items_count"], batch["total_net_minor"], batch["total_gross_minor"]) == (1, NET, TOTAL)
        assert batch["total_commission_minor"] == COMMISSION and batch["created_by_name"] == "Farah Maker"
        assert [i["status"] for i in batch["items"]] == ["batched"]

        for headers, expected in ((fa, 403), (auth_headers(admin), 403), (auth_headers(support), 403)):
            r = await client.post(
                f"{API}/finance/settlements/batches/{batch['id']}/approve", json={}, headers=headers
            )
            assert r.status_code == expected, r.text
        r = await client.post(f"{API}/finance/settlements/batches/{batch['id']}/approve", json={}, headers=fa)
        assert r.json()["error"]["code"] == "maker_checker"
        # cannot process before approval
        r = await client.post(f"{API}/finance/settlements/batches/{batch['id']}/process", json={}, headers=fb)
        assert r.status_code == 409
        r = await client.post(f"{API}/finance/settlements/batches/{batch['id']}/approve", json={}, headers=fb)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved" and r.json()["approved_by_name"] == "Felix Checker"

        # 5. process with the mock provider -> payout processed -> ledger payout posting
        r = await client.post(f"{API}/finance/settlements/batches/{batch['id']}/process", json={}, headers=fb)
        assert r.status_code == 200, r.text
        done = r.json()
        assert done["status"] == "completed" and done["processed_at"]
        assert [(p["status"], p["method"], p["amount_minor"]) for p in done["payouts"]] == [
            ("processed", "mock", NET)
        ]
        assert [i["status"] for i in done["items"]] == ["paid"]
        assert await balance(db, hcode) == 0
        assert await balance(db, BANK) == -NET

        # agent batch for all agents (payee_id omitted)
        r = await client.post(f"{API}/finance/settlements/batches", json={"payee_type": "agent"}, headers=fb)
        assert (
            r.status_code == 201 and r.json()["payee_id"] is None and r.json()["total_net_minor"] == AGENT_K
        )
        agent_batch = r.json()["id"]
        await client.post(f"{API}/finance/settlements/batches/{agent_batch}/approve", json={}, headers=fa)
        r = await client.post(f"{API}/finance/settlements/batches/{agent_batch}/process", json={}, headers=fa)
        assert r.json()["status"] == "completed"
        assert await balance(db, acode) == 0

        # 6. gateway sweep (T+2) brings the bank back
        await _run_task(db, run_jobs, "ledger.sweep_gateway_settlements")
        assert await balance(db, "GATEWAY:razorpay:RECEIVABLE") == 0
        assert await balance(db, "GATEWAY:mock:RECEIVABLE") == 0
        assert await balance(db, BANK) == TOTAL - 1_500_00 - NET - AGENT_K

        r = await client.get(f"{API}/finance/ledger/trial-balance", headers=fa)
        assert r.json()["net_minor"] == 0 and r.json()["cached_balances_consistent"] is True
        await assert_ledger_consistent(db)

        # payee views after payout
        r = await client.get(f"{API}/finance/summary", headers=owner_h)
        summary = r.json()
        assert summary["paid_minor"] == NET and summary["pending_minor"] == 0
        assert summary["last_payout"]["amount_minor"] == NET and summary["next_payout_date"] is None
        r = await client.get(f"{API}/finance/settlements/payouts", headers=owner_h)
        assert [p["payee_id"] for p in r.json()["items"]] == [str(world.hospital.id)]
        r = await client.get(f"{API}/finance/settlements/payouts", headers=fa)
        assert r.json()["total"] == 2
        r = await client.get(f"{API}/finance/summary", headers=fa)
        staff = r.json()
        assert staff["hospital_payables_minor"] == 0 and staff["agent_payables_minor"] == 0
        assert staff["pending_settlement_minor"] == 0 and staff["commission_revenue_minor"] == COMMISSION

        # settlement documents: commission tax invoice (hospital), commission statement (agent); own only
        r = await client.get(f"{API}/finance/settlements/invoices", headers=owner_h)
        (inv,) = r.json()["items"]
        assert inv["kind"] == "commission_invoice" and re.fullmatch(r"HIG\d{10}", inv["invoice_number"])
        assert (inv["subtotal_minor"], inv["tax_minor"], inv["total_minor"]) == (
            COMMISSION,
            GST,
            COMMISSION + GST,
        )
        assert inv["line_items"][0]["gst_split"] == [{"tax": "IGST", "amount_minor": GST}]
        # detail (finance portal modal) carries SAC, taxable value and the GST heads per line
        r = await client.get(f"{API}/finance/settlements/invoices/{inv['id']}", headers=fa)
        assert r.status_code == 200, r.text
        (line,) = r.json()["line_items"]
        assert line["sac"] == "998599"
        assert (line["taxable_minor"], line["gst_minor"], line["amount_minor"]) == (
            COMMISSION,
            GST,
            COMMISSION + GST,
        )
        assert line["gst_split"] == [{"tax": "IGST", "amount_minor": GST}]
        r = await client.get(f"{API}/finance/settlements/invoices", headers=agent_h)
        (statement_doc,) = r.json()["items"]
        assert statement_doc["kind"] == "agent_statement"
        assert statement_doc["invoice_number"].startswith("HAS")
        assert statement_doc["total_minor"] == AGENT_K
        r = await client.get(f"{API}/finance/settlements/invoices/{inv['id']}/pdf", headers=owner_h)
        assert r.status_code == 200 and r.content.startswith(b"%PDF")
        r = await client.get(f"{API}/finance/settlements/invoices/{inv['id']}/pdf", headers=agent_h)
        assert r.status_code == 404
        r = await client.get(f"{API}/finance/settlements/invoices", headers=fa)
        assert r.json()["total"] == 2

        # statements (JSON + CSV)
        today = datetime.now(UTC).date()
        r = await client.get(
            f"{API}/finance/statements",
            params={"from": (today - timedelta(days=10)).isoformat(), "to": today.isoformat()},
            headers=owner_h,
        )
        assert r.status_code == 200, r.text
        stmt = r.json()
        assert [row["kind"] for row in stmt["rows"]] == ["earning", "payout"]
        assert stmt["total_earned_minor"] == NET and stmt["total_paid_minor"] == NET
        assert stmt["closing_balance_minor"] == stmt["opening_balance_minor"] == 0
        r = await client.get(f"{API}/finance/statements", params={"format": "csv"}, headers=owner_h)
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
        assert r.text.splitlines()[0].startswith("date,kind,reference")
        r = await client.get(f"{API}/finance/statements", headers=fa)
        assert r.status_code == 400


# ================================================================================================ refunds
async def test_refund_before_completion(db: Any) -> None:
    world = await make_world(db, with_agent=False)
    payment = await capture_payment(db, world.booking, 1_00_000_00)
    refund = await process_refund(db, payment, 30_000_00)
    assert await balance(db, ESCROW) == 70_000_00
    assert await balance(db, "GATEWAY:mock:RECEIVABLE") == 70_000_00
    # duplicate event -> no double refund
    await postings.post_refund(db, refund.id)
    await db.commit()
    assert await txn_count(db, "refund:") == 1 and await txn_count(db, "reverse:") == 0

    await complete_booking(db, world.booking)
    assert await balance(db, ESCROW) == 0
    assert await balance(db, COMMISSION_REVENUE) == apply_bps(70_000_00, 1500)
    (item,) = await items_for(db, world.booking.id)
    assert item.gross_minor == 70_000_00
    await assert_ledger_consistent(db)


async def test_partial_refund_after_completion_claws_back(db: Any) -> None:
    world = await make_world(db)
    assert world.agent is not None
    payment = await capture_payment(db, world.booking, TOTAL)
    await complete_booking(db, world.booking)
    refund_amount = 1_00_000_00  # 25%
    await process_refund(db, payment, refund_amount)

    hcode, acode = hospital_payable(world.hospital.id), agent_payable(world.agent.id)
    assert await balance(db, ESCROW) == 0
    assert await balance(db, "GATEWAY:mock:RECEIVABLE") == TOTAL - refund_amount
    c_rev, g_rev, t_rev = COMMISSION // 4, GST // 4, TDS // 4
    assert await balance(db, COMMISSION_REVENUE) == COMMISSION - c_rev
    assert await balance(db, GST_OUTPUT) == GST - g_rev
    assert await balance(db, TDS_194O) == TDS - t_rev
    assert await balance(db, hcode) == NET - (refund_amount - c_rev - g_rev - t_rev)
    assert await balance(db, acode) == AGENT_K * 3 // 4
    assert await balance(db, AGENT_COMMISSION_EXPENSE) == AGENT_K * 3 // 4
    await assert_ledger_consistent(db)

    items = await items_for(db, world.booking.id)
    clawbacks = [i for i in items if i.net_minor < 0]
    assert len(clawbacks) == 2
    h_claw = next(i for i in clawbacks if i.payee_type == "hospital")
    a_claw = next(i for i in clawbacks if i.payee_type == "agent")
    assert h_claw.gross_minor == -refund_amount and h_claw.net_minor == -(
        refund_amount - c_rev - g_rev - t_rev
    )
    assert h_claw.commission_minor == -c_rev and h_claw.status == SettlementItemStatus.ELIGIBLE
    assert a_claw.net_minor == -(AGENT_K // 4)
    # the item nets equal the payables in the ledger
    assert sum(i.net_minor for i in items if i.payee_type == "hospital") == await balance(db, hcode)

    hospital_id = world.hospital.id  # ORM instances expire on rollback below
    # clawback alone (positive item still in its hold) is not batchable
    with pytest.raises(Exception) as exc:
        await service.generate_batch(db, actor=None, payee_type="hospital")
    assert getattr(exc.value, "code", "") == "no_eligible_items"
    await db.rollback()

    # after the hold, the batch nets the clawback against the earning
    with time_machine.travel(datetime.now(UTC) + timedelta(days=4), tick=True):
        assert await service.mark_eligible(db) == 2
        batch = await service.generate_batch(db, actor=None, payee_type="hospital", payee_id=hospital_id)
        await db.commit()
        assert batch.items_count == 2 and batch.total_net_minor == await balance(db, hcode)


async def test_full_refund_after_completion_reverses_everything(db: Any) -> None:
    world = await make_world(db)
    payment = await capture_payment(db, world.booking, 1_23_457)
    await complete_booking(db, world.booking)
    await process_refund(db, payment, 1_23_457)
    for code in (ESCROW, COMMISSION_REVENUE, GST_OUTPUT, TDS_194O, AGENT_COMMISSION_EXPENSE):
        assert await balance(db, code) == 0, code
    assert await balance(db, hospital_payable(world.hospital.id)) == 0
    items = await items_for(db, world.booking.id)
    assert sum(i.net_minor for i in items) == 0 and len(items) == 4
    await assert_ledger_consistent(db)


async def test_late_payment_after_completion_is_recognized_incrementally(db: Any) -> None:
    world = await make_world(db, with_agent=False)
    await capture_payment(db, world.booking, 3_00_000_00)
    await complete_booking(db, world.booking)
    late = await capture_payment(db, world.booking, 1_00_000_00)
    assert await balance(db, ESCROW) == 0
    assert await txn_count(db, f"recognize:{world.booking.id}:") == 2
    assert await balance(db, COMMISSION_REVENUE) == apply_bps(3_00_000_00, 1500) + apply_bps(
        1_00_000_00, 1500
    )
    items = await items_for(db, world.booking.id)
    assert [i.gross_minor for i in items] == [3_00_000_00, 1_00_000_00]
    assert items[1].payment_id == late.id and items[1].eligible_at > items[0].eligible_at


# ================================================================================================ holds etc.
async def test_hold_and_release(client: Any, db: Any, make_user: Any, auth_headers: Any) -> None:
    world = await make_world(db, with_agent=False)
    await capture_payment(db, world.booking, 50_000_00)
    await complete_booking(db, world.booking)
    (item,) = await items_for(db, world.booking.id)
    fin = auth_headers(await make_user(role="finance"))
    r = await client.post(
        f"{API}/finance/settlements/items/{item.id}/hold", json={"reason": "KYC re-check"}, headers=fin
    )
    assert (
        r.status_code == 200 and r.json()["status"] == "on_hold" and r.json()["hold_reason"] == "KYC re-check"
    )
    r = await client.post(
        f"{API}/finance/settlements/items/{item.id}/hold", json={"reason": "again"}, headers=fin
    )
    assert r.status_code == 409
    owner_h = auth_headers(world.hospital_owner)
    r = await client.post(f"{API}/finance/settlements/items/{item.id}/release", json={}, headers=owner_h)
    assert r.status_code == 403

    with time_machine.travel(datetime.now(UTC) + timedelta(days=5), tick=True):
        fin = auth_headers(await make_user(role="finance"))
        assert await service.mark_eligible(db) == 0  # held items stay on hold
        await db.commit()
        r = await client.post(
            f"{API}/finance/settlements/batches", json={"payee_type": "hospital"}, headers=fin
        )
        assert r.status_code == 400
        r = await client.post(f"{API}/finance/settlements/items/{item.id}/release", json={}, headers=fin)
        assert r.status_code == 200 and r.json()["status"] == "eligible" and r.json()["hold_reason"] is None
        r = await client.get(f"{API}/finance/summary", headers=auth_headers(world.hospital_owner))
        assert r.json()["eligible_minor"] == item.net_minor and r.json()["on_hold_minor"] == 0
        r = await client.post(
            f"{API}/finance/settlements/batches", json={"payee_type": "hospital"}, headers=fin
        )
        assert r.status_code == 201


async def test_reject_batch_releases_items(client: Any, db: Any, make_user: Any, auth_headers: Any) -> None:
    world = await make_world(db, with_agent=False)
    await capture_payment(db, world.booking, 50_000_00)
    await complete_booking(db, world.booking)
    with time_machine.travel(datetime.now(UTC) + timedelta(days=5), tick=True):
        fin = auth_headers(await make_user(role="finance"))
        await service.mark_eligible(db)
        await db.commit()
        r = await client.post(
            f"{API}/finance/settlements/batches", json={"payee_type": "hospital"}, headers=fin
        )
        batch_id = r.json()["id"]
        r = await client.post(
            f"{API}/finance/settlements/batches/{batch_id}/reject",
            json={"reason": "wrong period"},
            headers=fin,
        )
        assert r.status_code == 200 and r.json()["status"] == "cancelled" and r.json()["items"] == []
        (item,) = await items_for(db, world.booking.id)
        assert item.status == SettlementItemStatus.ELIGIBLE and item.batch_id is None
        r = await client.post(f"{API}/finance/settlements/batches/{batch_id}/approve", json={}, headers=fin)
        assert r.status_code == 409
        r = await client.get(
            f"{API}/finance/settlements/batches", params={"status": "cancelled"}, headers=fin
        )
        assert r.json()["total"] == 1


async def test_auto_batch_for_due_payees(
    db: Any, run_jobs: Any, client: Any, make_user: Any, auth_headers: Any
) -> None:
    world = await make_world(db)
    await capture_payment(db, world.booking, 2_00_000_00)
    await complete_booking(db, world.booking)
    with time_machine.travel(datetime.now(UTC) + timedelta(days=4), tick=True):
        await _run_task(db, run_jobs, "settlements.auto_batch")
        fin = auth_headers(await make_user(role="finance"))
        r = await client.get(
            f"{API}/finance/settlements/batches", params={"status": "pending_approval"}, headers=fin
        )
        batches = r.json()["items"]
        assert sorted(b["payee_type"] for b in batches) == ["agent", "hospital"]
        assert all(b["created_by_name"] == "System" for b in batches)
        assert all(b["approved_by"] is None for b in batches)
        # a system batch still needs a human approver: it cannot be processed before approval
        r = await client.post(
            f"{API}/finance/settlements/batches/{batches[0]['id']}/process", json={}, headers=fin
        )
        assert r.status_code == 409
        # system batches can be approved by any finance user; a second run does not duplicate them
        r = await client.post(
            f"{API}/finance/settlements/batches/{batches[0]['id']}/approve", json={}, headers=fin
        )
        assert r.status_code == 200
        await _run_task(db, run_jobs, "settlements.auto_batch")
        r = await client.get(f"{API}/finance/settlements/batches", headers=fin)
        assert r.json()["total"] == 2


# ================================================================================================ payouts
async def _approved_hospital_batch(
    client: Any, db: Any, make_user: Any, auth_headers: Any, world: Any
) -> tuple[str, dict[str, str]]:
    await service.mark_eligible(db, now=datetime.now(UTC) + timedelta(days=10))
    await db.commit()
    fa = auth_headers(await make_user(role="finance"))
    fb = auth_headers(await make_user(role="super_admin"))
    await _add_verified_account(client, auth_headers(world.hospital_owner), fa)
    r = await client.post(
        f"{API}/finance/settlements/batches",
        json={
            "payee_type": "hospital",
            "period_end": (datetime.now(UTC) + timedelta(days=10)).date().isoformat(),
        },
        headers=fa,
    )
    assert r.status_code == 201, r.text
    batch_id = r.json()["id"]
    r = await client.post(f"{API}/finance/settlements/batches/{batch_id}/approve", json={}, headers=fb)
    assert r.status_code == 200, r.text
    return batch_id, fa


async def test_manual_bank_transfer_mark_paid_and_failed(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    world = await make_world(db, with_agent=False)
    await capture_payment(db, world.booking, 1_00_000_00)
    await complete_booking(db, world.booking)
    net = await balance(db, hospital_payable(world.hospital.id))
    batch_id, fin = await _approved_hospital_batch(client, db, make_user, auth_headers, world)

    r = await client.post(
        f"{API}/finance/settlements/batches/{batch_id}/process",
        json={"method": "manual_bank_transfer"},
        headers=fin,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "processing"
    (payout,) = r.json()["payouts"]
    assert payout["status"] == "processing" and payout["method"] == "manual_bank_transfer"
    assert await balance(db, hospital_payable(world.hospital.id)) == net  # nothing paid yet

    r = await client.post(
        f"{API}/finance/settlements/payouts/{payout['id']}/mark-paid", json={"utr": "x"}, headers=fin
    )
    assert r.status_code == 422
    # maker-checker: the first finance user records the UTR, the payout stays processing
    paid_url = f"{API}/finance/settlements/payouts/{payout['id']}/mark-paid"
    checker = auth_headers(await make_user(role="finance"))
    r = await client.post(f"{paid_url}/approve", json={}, headers=checker)
    assert r.status_code == 422  # the checker must name the reviewed request (SEC-063)
    nothing = {"request_id": str(uuid.uuid4()), "reference": "WRONG1234", "amount_minor": 1}
    r = await client.post(f"{paid_url}/approve", json=nothing, headers=checker)
    assert r.status_code == 400 and r.json()["error"]["code"] == "no_pending_request"
    r = await client.post(paid_url, json={"utr": "WRONG1234"}, headers=fin)
    assert r.status_code == 200, r.text
    # a wrong request can be rejected; the payout stays in flight
    r = await client.post(f"{paid_url}/reject", json={"reason": "typo in UTR"}, headers=checker)
    assert r.status_code == 200 and r.json()["paid_requested_by"] is None and r.json()["utr"] is None
    r = await client.post(paid_url, json={"utr": "hdfcr52026102100001"}, headers=fin)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "processing" and r.json()["paid_requested_by"] is not None
    assert await balance(db, hospital_payable(world.hospital.id)) == net
    r = await client.get(
        f"{API}/finance/settlements/payouts", params={"awaiting_confirmation": True}, headers=fin
    )
    assert [p["id"] for p in r.json()["items"]] == [payout["id"]] and r.json()["items"][0][
        "awaiting_confirmation"
    ]
    r = await client.get(
        f"{API}/finance/settlements/payouts", params={"awaiting_confirmation": False}, headers=fin
    )
    assert r.json()["total"] == 0
    r = await client.get(f"{API}/finance/summary", headers=fin)
    assert r.json()["payouts_awaiting_confirmation"] == 1

    # SEC-063: the approval is bound to the request the checker reviewed
    reviewed = (await client.get(f"{API}/finance/settlements/payouts/{payout['id']}", headers=checker)).json()
    assert reviewed["paid_request_id"] and reviewed["utr"] == "HDFCR52026102100001"

    def approval(view: dict[str, Any], **overrides: Any) -> dict[str, Any]:
        return {
            "request_id": view["paid_request_id"],
            "reference": view["utr"],
            "amount_minor": view["amount_minor"],
            **overrides,
        }

    # the maker swaps the UTR after the review: the stale approval is refused
    r = await client.post(paid_url, json={"utr": "HDFCR52026102199999"}, headers=fin)
    assert r.status_code == 200 and r.json()["paid_request_id"] != reviewed["paid_request_id"]
    r = await client.post(f"{paid_url}/approve", json=approval(reviewed), headers=checker)
    assert r.status_code == 409 and r.json()["error"]["code"] == "mark_paid_request_changed"
    # ... and swapping it back still invalidates the old request id
    r = await client.post(paid_url, json={"utr": "hdfcr52026102100001"}, headers=fin)
    current = r.json()
    r = await client.post(f"{paid_url}/approve", json=approval(reviewed), headers=checker)
    assert r.status_code == 409 and r.json()["error"]["code"] == "mark_paid_request_changed"
    r = await client.post(
        f"{paid_url}/approve",
        json=approval(current, amount_minor=current["amount_minor"] + 1),
        headers=checker,
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "mark_paid_request_changed"
    r = await client.post(f"{paid_url}/approve", json=approval(current), headers=fin)
    assert r.status_code == 403 and r.json()["error"]["code"] == "second_approver_required"
    r = await client.post(
        f"{paid_url}/approve", json=approval(current, reference="hdfcr52026102100001"), headers=checker
    )
    assert (
        r.status_code == 200
        and r.json()["status"] == "processed"
        and r.json()["utr"] == "HDFCR52026102100001"
        and r.json()["paid_confirmed_by"] is not None
    )
    assert await balance(db, hospital_payable(world.hospital.id)) == 0
    # the paid payout produced the hospital's commission tax invoice (GST-compliant number <= 16 chars)
    r = await client.get(f"{API}/finance/settlements/invoices", headers=fin)
    (invoice,) = r.json()["items"]
    assert invoice["kind"] == "commission_invoice" and len(invoice["invoice_number"]) <= 16
    assert invoice["invoice_number"].startswith("HIG")
    assert invoice["subtotal_minor"] == apply_bps(1_00_000_00, 1500)
    assert invoice["tax_minor"] == apply_bps(invoice["subtotal_minor"], 1800)
    r = await client.get(f"{API}/finance/settlements/batches/{batch_id}", headers=fin)
    assert r.json()["status"] == "completed"
    r = await client.post(
        f"{API}/finance/settlements/payouts/{payout['id']}/mark-paid", json={"utr": "AGAIN123"}, headers=fin
    )
    assert r.status_code == 409

    # the bank bounces it: a reversal needs a reference and a second finance user (SEC-003)
    failed_url = f"{API}/finance/settlements/payouts/{payout['id']}/mark-failed"
    r = await client.post(failed_url, json={"reason": "account closed"}, headers=fin)
    assert r.status_code == 400 and r.json()["error"]["code"] == "reference_required"
    r = await client.post(failed_url, json={"reason": "account closed", "reference": "RET-881"}, headers=fin)
    assert r.status_code == 200 and r.json()["status"] == "processed"
    reversal = {"request_id": r.json()["reversal_request_id"], "reference": "RET-881"}
    assert reversal["request_id"]
    assert r.json()["reversal_requested_by"] is not None
    assert await balance(db, hospital_payable(world.hospital.id)) == 0  # nothing reversed yet
    r = await client.get(f"{API}/finance/settlements/payouts", params={"reversal_pending": True}, headers=fin)
    assert [p["id"] for p in r.json()["items"]] == [payout["id"]]
    r = await client.post(f"{failed_url}/approve", json=reversal, headers=fin)
    assert r.status_code == 403 and r.json()["error"]["code"] == "second_approver_required"
    r = await client.post(f"{failed_url}/approve", json={**reversal, "reference": "RET-999"}, headers=checker)
    assert r.status_code == 409 and r.json()["error"]["code"] == "mark_failed_request_changed"
    r = await client.post(
        f"{failed_url}/approve", json={**reversal, "request_id": str(uuid.uuid4())}, headers=checker
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "mark_failed_request_changed"
    r = await client.post(f"{failed_url}/approve", json=reversal, headers=checker)
    assert r.status_code == 200 and r.json()["status"] == "reversed"
    assert "RET-881" in r.json()["failure_reason"]
    assert await balance(db, hospital_payable(world.hospital.id)) == net
    (item,) = await items_for(db, world.booking.id)
    assert item.status == SettlementItemStatus.ELIGIBLE
    r = await client.get(f"{API}/finance/settlements/batches/{batch_id}", headers=fin)
    assert r.json()["status"] == "partially_failed"
    await assert_ledger_consistent(db)


async def test_payout_without_verified_account_fails_and_returns_items(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    world = await make_world(db, with_agent=False)
    await capture_payment(db, world.booking, 1_00_000_00)
    await complete_booking(db, world.booking)
    batch_id, fin = await _approved_hospital_batch(client, db, make_user, auth_headers, world)
    accounts = (await db.execute(select(PayoutAccount))).scalars().all()
    for account in accounts:
        account.is_verified = False
    await db.commit()
    r = await client.post(
        f"{API}/finance/settlements/batches/{batch_id}/process",
        json={"method": "manual_bank_transfer"},
        headers=fin,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "partially_failed"
    assert r.json()["payouts"][0]["status"] == "failed"
    (item,) = await items_for(db, world.booking.id)
    assert item.status == SettlementItemStatus.ELIGIBLE
    assert await txn_count(db, "payout") == 0


async def _route_world(
    client: Any, db: Any, make_user: Any, auth_headers: Any, monkeypatch: pytest.MonkeyPatch
) -> tuple[Any, str, dict[str, str], dict[str, str]]:
    """A completed booking whose hospital has a verified Route-linked account, and an approved batch.
    Returns (world, batch_id, maker headers, checker headers)."""
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "rzp_test_secret")
    world = await make_world(db, with_agent=False)
    await capture_payment(db, world.booking, 1_00_000_00)
    await complete_booking(db, world.booking)
    await service.mark_eligible(db, now=datetime.now(UTC) + timedelta(days=10))
    await db.commit()
    fa = auth_headers(await make_user(role="finance"))
    fb = auth_headers(await make_user(role="finance"))
    owner_h = auth_headers(world.hospital_owner)
    account_id = await _add_verified_account(client, owner_h, fa)
    r = await client.patch(
        f"{API}/finance/payout-accounts/{account_id}",
        json={"razorpay_linked_account_id": "acc_ABC123xyz"},
        headers=owner_h,
    )
    assert r.status_code == 403
    r = await client.patch(
        f"{API}/finance/payout-accounts/{account_id}",
        json={"razorpay_linked_account_id": "acc_ABC123xyz"},
        headers=fa,
    )
    assert r.status_code == 200 and r.json()["is_verified"] is False  # changed routing -> re-verify
    # SEC-003: the finance user who changed the destination cannot verify it
    r = await client.post(f"{API}/finance/payout-accounts/{account_id}/verify", json={}, headers=fa)
    assert r.status_code == 403 and r.json()["error"]["code"] == "maker_checker"
    r = await client.post(f"{API}/finance/payout-accounts/{account_id}/verify", json={}, headers=fb)
    assert r.status_code == 200 and r.json()["verified_by"] is not None
    period_end = (datetime.now(UTC) + timedelta(days=10)).date().isoformat()
    r = await client.post(
        f"{API}/finance/settlements/batches",
        json={"payee_type": "hospital", "period_end": period_end},
        headers=fa,
    )
    assert r.status_code == 201, r.text
    batch_id = r.json()["id"]
    frozen = r.json()["payout_accounts_snapshot"][str(world.hospital.id)]
    assert frozen["razorpay_linked_account_id"] == "acc_ABC123xyz"
    assert frozen["account_number_masked"].endswith("7890") and "001234567890" not in r.text
    r = await client.post(f"{API}/finance/settlements/batches/{batch_id}/approve", json={}, headers=fb)
    assert r.status_code == 200, r.text
    return world, batch_id, fa, fb


async def test_razorpay_route_payout_via_job(
    client: Any, db: Any, make_user: Any, auth_headers: Any, run_jobs: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    import httpx
    import respx

    world, batch_id, fin, _ = await _route_world(client, db, make_user, auth_headers, monkeypatch)
    net = await balance(db, hospital_payable(world.hospital.id))
    with respx.mock(assert_all_called=True) as router:
        route = router.post("https://api.razorpay.com/v1/transfers").mock(
            return_value=httpx.Response(200, json={"id": "trf_TEST123", "status": "processed"})
        )
        r = await client.post(f"{API}/finance/settlements/batches/{batch_id}/process", json={}, headers=fin)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "processing"
        assert r.json()["payouts"][0]["method"] == "razorpay_route"
        assert await run_jobs() >= 1
        sent = route.calls.last.request
        assert b'"account":"acc_ABC123xyz"' in sent.content.replace(b" ", b"")
        assert sent.headers["authorization"].startswith("Basic ")
    r = await client.get(f"{API}/finance/settlements/batches/{batch_id}", headers=fin)
    assert r.json()["status"] == "completed"
    assert r.json()["payouts"][0]["gateway_payout_id"] == "trf_TEST123"
    assert await balance(db, hospital_payable(world.hospital.id)) == 0 and net > 0


async def test_razorpay_created_transfer_is_confirmed_before_paid(
    client: Any, db: Any, make_user: Any, auth_headers: Any, run_jobs: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """SEC-043: a transfer that Razorpay reports as ``created``/``pending`` is not money paid yet."""
    import httpx
    import respx

    world, batch_id, fin, _ = await _route_world(client, db, make_user, auth_headers, monkeypatch)
    net = await balance(db, hospital_payable(world.hospital.id))
    with respx.mock() as router:
        router.post("https://api.razorpay.com/v1/transfers").mock(
            return_value=httpx.Response(200, json={"id": "trf_PEND1", "status": "created"})
        )
        lookup = router.get("https://api.razorpay.com/v1/transfers/trf_PEND1").mock(
            return_value=httpx.Response(200, json={"id": "trf_PEND1", "status": "pending"})
        )
        await client.post(f"{API}/finance/settlements/batches/{batch_id}/process", json={}, headers=fin)
        await run_jobs()
        r = await client.get(f"{API}/finance/settlements/batches/{batch_id}", headers=fin)
        assert r.json()["payouts"][0]["status"] == "processing"
        assert await balance(db, hospital_payable(world.hospital.id)) == net  # nothing paid out yet
        assert await service.reconcile_processing_transfers(db) == 0  # still pending
        lookup.mock(return_value=httpx.Response(200, json={"id": "trf_PEND1", "status": "processed"}))
        assert await service.reconcile_processing_transfers(db) == 1
    r = await client.get(f"{API}/finance/settlements/batches/{batch_id}", headers=fin)
    assert r.json()["status"] == "completed" and r.json()["payouts"][0]["status"] == "processed"
    assert await balance(db, hospital_payable(world.hospital.id)) == 0
    assert (
        await db.execute(select(AuditLog).where(AuditLog.action == "payout.confirmed"))
    ).scalars().first() is not None


async def test_razorpay_rejection_marks_payout_failed(
    client: Any, db: Any, make_user: Any, auth_headers: Any, run_jobs: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    import httpx
    import respx

    world, batch_id, fin, _ = await _route_world(client, db, make_user, auth_headers, monkeypatch)
    with respx.mock() as router:
        router.post("https://api.razorpay.com/v1/transfers").mock(
            return_value=httpx.Response(
                400, json={"error": {"description": "Linked account is not activated"}}
            )
        )
        await client.post(f"{API}/finance/settlements/batches/{batch_id}/process", json={}, headers=fin)
        await run_jobs()
    r = await client.get(f"{API}/finance/settlements/batches/{batch_id}", headers=fin)
    assert r.json()["status"] == "partially_failed"
    assert "not activated" in r.json()["payouts"][0]["failure_reason"]
    (item,) = await items_for(db, world.booking.id)
    assert item.status == SettlementItemStatus.ELIGIBLE


async def test_razorpay_timeout_is_parked_never_resent(
    client: Any, db: Any, make_user: Any, auth_headers: Any, run_jobs: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """SEC-004: a read timeout may mean the transfer exists; the payout is parked, never re-sent."""
    import httpx
    import respx

    from app.core.jobs import enqueue as enqueue_job

    world, batch_id, fin, checker = await _route_world(client, db, make_user, auth_headers, monkeypatch)
    with respx.mock() as router:
        route = router.post("https://api.razorpay.com/v1/transfers").mock(
            side_effect=httpx.ReadTimeout("read timed out")
        )
        await client.post(f"{API}/finance/settlements/batches/{batch_id}/process", json={}, headers=fin)
        await run_jobs()
        (payout,) = (await client.get(f"{API}/finance/settlements/batches/{batch_id}", headers=fin)).json()[
            "payouts"
        ]
        assert payout["status"] == "needs_reconciliation" and route.call_count == 1
        # a duplicate job (stale-lock requeue, manual retry) does not call Razorpay again
        await enqueue_job(db, "settlements.execute_payout", {"payout_id": payout["id"]})
        await db.commit()
        await run_jobs()
        assert route.call_count == 1
    r = await client.get(f"{API}/finance/summary", headers=fin)
    assert r.json()["payouts_needs_reconciliation"] == 1
    assert await balance(db, hospital_payable(world.hospital.id)) > 0
    # finance found the transfer on the dashboard: record it with the second-approver flow
    paid_url = f"{API}/finance/settlements/payouts/{payout['id']}/mark-paid"
    r = await client.post(paid_url, json={"utr": "trf_FOUND123"}, headers=fin)
    assert r.status_code == 200 and r.json()["awaiting_confirmation"] is True
    body = {
        "request_id": r.json()["paid_request_id"],
        "reference": "trf_FOUND123",
        "amount_minor": r.json()["amount_minor"],
    }
    r = await client.post(f"{paid_url}/approve", json=body, headers=checker)
    assert r.status_code == 200 and r.json()["status"] == "processed"
    assert await balance(db, hospital_payable(world.hospital.id)) == 0


async def test_razorpay_connect_error_is_retried(
    client: Any, db: Any, make_user: Any, auth_headers: Any, run_jobs: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """SEC-004: a connect error never reached Razorpay: the marker is cleared and the job retries."""
    import httpx
    import respx

    from app.models.settlements import Payout

    world, batch_id, fin, _ = await _route_world(client, db, make_user, auth_headers, monkeypatch)
    with respx.mock() as router:
        router.post("https://api.razorpay.com/v1/transfers").mock(side_effect=httpx.ConnectError("refused"))
        await client.post(f"{API}/finance/settlements/batches/{batch_id}/process", json={}, headers=fin)
        await run_jobs()
    (payout,) = (await db.execute(select(Payout).execution_options(populate_existing=True))).scalars().all()
    assert payout.status == "processing" and payout.gateway_attempted_at is None
    job = (
        await db.execute(
            text(
                "SELECT status, attempts FROM background_jobs WHERE task_name = 'settlements.execute_payout'"
            )
        )
    ).one()
    assert job.status in ("queued", "failed") and job.attempts == 1


# ============================================================================================ access / IDOR
async def test_scoping_and_payout_accounts(client: Any, db: Any, make_user: Any, auth_headers: Any) -> None:
    world = await make_world(db)
    other = await make_world(db)
    await capture_payment(db, world.booking, 1_00_000_00)
    await complete_booking(db, world.booking)
    await capture_payment(db, other.booking, 2_00_000_00)
    await complete_booking(db, other.booking)
    my_items = await items_for(db, world.booking.id)
    other_items = await items_for(db, other.booking.id)
    owner_h = auth_headers(world.hospital_owner)

    r = await client.get(
        f"{API}/finance/settlements/items", params={"payee_id": str(other.hospital.id)}, headers=owner_h
    )
    assert {i["payee_id"] for i in r.json()["items"]} == {str(world.hospital.id)}
    other_h_item = next(i for i in other_items if i.payee_type == "hospital")
    r = await client.get(f"{API}/finance/settlements/items/{other_h_item.id}", headers=owner_h)
    assert r.status_code == 404
    mine = next(i for i in my_items if i.payee_type == "hospital")
    r = await client.get(f"{API}/finance/settlements/items/{mine.id}", headers=owner_h)
    assert r.status_code == 200 and r.json()["booking_number"] == world.booking.booking_number

    # patients and non-finance hospital members are refused
    patient_user = await db.get(type(world.hospital_owner), world.patient.user_id)
    r = await client.get(f"{API}/finance/summary", headers=auth_headers(patient_user))
    assert r.status_code == 403
    from app.models import HospitalMember

    doctor_user = await create_user(db, role="hospital")
    db.add(HospitalMember(hospital_id=world.hospital.id, user_id=doctor_user.id, member_role="doctor"))
    await db.commit()
    r = await client.get(f"{API}/finance/settlements/items", headers=auth_headers(doctor_user))
    assert r.status_code == 403

    # payout accounts: own only, write-only number, finance-only fields and verification
    r = await client.post(
        f"{API}/finance/payout-accounts",
        json={"account_holder_name": "X", "account_number": "12345678901", "ifsc": "BAD"},
        headers=owner_h,
    )
    assert r.status_code == 422
    r = await client.post(
        f"{API}/finance/payout-accounts",
        json={
            "account_holder_name": "Apex",
            "account_number": "1234 5678 9012",
            "ifsc": "ICIC0001234",
            "razorpay_linked_account_id": "acc_ABCDEF123",
        },
        headers=owner_h,
    )
    assert r.status_code == 403
    r = await client.post(
        f"{API}/finance/payout-accounts",
        json={"account_holder_name": "Apex", "account_number": "1234 5678 9012", "ifsc": "ICIC0001234"},
        headers=owner_h,
    )
    assert r.status_code == 201 and r.json()["account_number_masked"] == "********9012"
    account_id = r.json()["id"]
    raw = (await db.execute(text("SELECT account_number FROM payout_accounts"))).scalar_one()
    assert raw.startswith("v1:") and "123456789012" not in raw
    r = await client.post(f"{API}/finance/payout-accounts/{account_id}/verify", json={}, headers=owner_h)
    assert r.status_code == 403
    other_h = auth_headers(other.hospital_owner)
    for method, path in (("GET", ""), ("PATCH", "")):
        r = await client.request(
            method,
            f"{API}/finance/payout-accounts/{account_id}{path}",
            headers=other_h,
            json={} if method == "PATCH" else None,
        )
        assert r.status_code == 404
    r = await client.get(f"{API}/finance/payout-accounts", headers=other_h)
    assert r.json()["total"] == 0
    # a second primary account demotes the first
    r = await client.post(
        f"{API}/finance/payout-accounts",
        json={
            "account_holder_name": "Apex",
            "account_number": "99887766",
            "swift": "ICICINBBXXX",
            "is_primary": True,
        },
        headers=owner_h,
    )
    assert r.status_code == 201
    r = await client.get(f"{API}/finance/payout-accounts", headers=owner_h)
    assert [a["is_primary"] for a in r.json()["items"]] == [True, False]
    fin = auth_headers(await make_user(role="finance"))
    r = await client.post(
        f"{API}/finance/payout-accounts",
        json={"account_holder_name": "Agency", "account_number": "5566778899", "ifsc": "SBIN0000001"},
        headers=fin,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "owner_required"
    assert world.agent is not None
    r = await client.post(
        f"{API}/finance/payout-accounts",
        json={
            "owner_type": "agent",
            "owner_id": str(world.agent.id),
            "account_holder_name": "Agency",
            "account_number": "5566778899",
            "ifsc": "SBIN0000001",
        },
        headers=fin,
    )
    assert r.status_code == 201 and r.json()["owner_name"] == world.agent.agency_name

    # batches/payout actions are finance-only
    r = await client.get(f"{API}/finance/settlements/batches", headers=owner_h)
    assert r.status_code == 403


# ================================================================================================ commission
async def test_commission_rule_precedence(client: Any, db: Any, make_user: Any, auth_headers: Any) -> None:
    from tests.factories import create_procedure, create_specialty

    world = await make_world(db)
    assert world.agent is not None
    specialty = await create_specialty(db)
    procedure = await create_procedure(db, specialty=specialty)
    hid, pid, sid = world.hospital.id, procedure.id, specialty.id

    async def rate() -> int:
        return await service.resolve_commission_bps(db, hospital_id=hid, procedure_id=pid)

    assert await rate() == 1500  # settings default
    admin = auth_headers(await make_user(role="admin"))
    support = auth_headers(await make_user(role="support"))
    r = await client.post(
        f"{API}/finance/commission-rules", json={"scope": "global", "rate_bps": 1200}, headers=support
    )
    assert r.status_code == 403

    async def add(body: dict[str, Any]) -> str:
        r = await client.post(f"{API}/finance/commission-rules", json=body, headers=admin)
        assert r.status_code == 201, r.text
        return str(r.json()["id"])

    await add({"scope": "global", "rate_bps": 1200})
    assert await rate() == 1200
    await add({"scope": "specialty", "specialty_id": str(sid), "rate_bps": 1100})
    assert await rate() == 1100  # specialty derived from the procedure
    await add({"scope": "procedure", "procedure_id": str(pid), "rate_bps": 1000})
    assert await rate() == 1000
    world.hospital.commission_rate_bps = 900
    await db.commit()
    assert await rate() == 900  # hospital override beats procedure/specialty/global rules
    hospital_rule = await add({"scope": "hospital", "hospital_id": str(hid), "rate_bps": 800})
    assert await rate() == 800
    await add({"scope": "procedure", "procedure_id": str(pid), "hospital_id": str(hid), "rate_bps": 700})
    assert await rate() == 700
    # other hospitals are unaffected by hospital-specific rules
    assert await service.resolve_commission_bps(db, hospital_id=None, procedure_id=pid) == 1000
    # future-dated and inactive rules are ignored
    future = (datetime.now(UTC) + timedelta(days=30)).date().isoformat()
    await add(
        {
            "scope": "procedure",
            "procedure_id": str(pid),
            "hospital_id": str(hid),
            "rate_bps": 100,
            "effective_from": future,
        }
    )
    assert await rate() == 700
    r = await client.patch(
        f"{API}/finance/commission-rules/{hospital_rule}", json={"is_active": False}, headers=admin
    )
    assert r.status_code == 200 and r.json()["is_active"] is False

    r = await client.post(
        f"{API}/finance/commission-rules", json={"scope": "hospital", "rate_bps": 10}, headers=admin
    )
    assert r.status_code == 422
    r = await client.post(
        f"{API}/finance/commission-rules", json={"scope": "global", "rate_bps": 10001}, headers=admin
    )
    assert r.status_code == 422

    # agents: specific rule > agent column > generic agent rule > default
    aid = world.agent.id
    assert await service.resolve_agent_commission_bps(db, aid) == 500
    await add({"scope": "agent", "rate_bps": 400})
    assert await service.resolve_agent_commission_bps(db, aid) == 400
    world.agent.commission_rate_bps = 300
    await db.commit()
    assert await service.resolve_agent_commission_bps(db, aid) == 300
    await add({"scope": "agent", "agent_id": str(aid), "rate_bps": 250})
    assert await service.resolve_agent_commission_bps(db, aid) == 250
    r = await client.get(
        f"{API}/finance/commission-rules/resolve",
        params={"hospital_id": str(hid), "procedure_id": str(pid), "agent_id": str(aid)},
        headers=admin,
    )
    assert r.json() == {"commission_bps": 700, "agent_commission_bps": 250}
    r = await client.get(f"{API}/finance/commission-rules", params={"scope": "agent"}, headers=admin)
    assert r.json()["total"] == 2

    # the resolved rates drive recognition
    booking = world.booking
    booking.procedure_id = pid
    await db.commit()
    await capture_payment(db, booking, 1_00_000_00)
    await complete_booking(db, booking)
    assert await balance(db, COMMISSION_REVENUE) == apply_bps(1_00_000_00, 700)
    assert await balance(db, agent_payable(aid)) == apply_bps(1_00_000_00, 250)
    txn = (
        await db.execute(select(LedgerTransaction).where(LedgerTransaction.txn_type == "revenue_recognition"))
    ).scalar_one()
    assert "700 bps" in (txn.description or "")


# ================================================================================================ agent tax
async def test_resident_agent_commission_has_tds_and_reverses_on_refund(db: Any) -> None:
    world = await make_world(db, total_minor=1_00_000_00)
    assert world.agent is not None
    world.agent.country = "IN"
    await db.commit()
    payment = await capture_payment(db, world.booking, 1_00_000_00)
    await complete_booking(db, world.booking)
    k = apply_bps(1_00_000_00, 500)
    w = apply_bps(k, 200)  # s.194H default 2 %
    acode = agent_payable(world.agent.id)
    assert await balance(db, AGENT_COMMISSION_EXPENSE) == k
    assert await balance(db, acode) == k - w
    assert await balance(db, TDS_194H) == w
    a_item = next(i for i in await items_for(db, world.booking.id) if i.payee_type == "agent")
    assert (a_item.gross_minor, a_item.tds_minor, a_item.net_minor) == (k, w, k - w)

    # a 25 % refund after completion reverses the commission, the withholding and the payable pro rata
    await process_refund(db, payment, 25_000_00)
    assert await balance(db, AGENT_COMMISSION_EXPENSE) == k - apply_bps(k, 2500)
    assert await balance(db, TDS_194H) == w - apply_bps(w, 2500)
    assert await balance(db, acode) == (k - apply_bps(k, 2500)) - (w - apply_bps(w, 2500))
    clawback = next(
        i for i in await items_for(db, world.booking.id) if i.payee_type == "agent" and i.net_minor < 0
    )
    assert clawback.tds_minor == -apply_bps(w, 2500)
    await assert_ledger_consistent(db)


async def test_foreign_agent_withholding_is_configurable_and_noted(db: Any) -> None:
    from app.core.settings_store import set_setting

    world = await make_world(db, total_minor=1_00_000_00)  # the factory agent is NG (non-resident)
    assert world.agent is not None
    k = apply_bps(1_00_000_00, 500)
    await set_setting(db, "agent_nonresident_withholding_bps", 1000, None)
    await db.commit()
    await capture_payment(db, world.booking, 1_00_000_00)
    await complete_booking(db, world.booking)
    assert await balance(db, TDS_195) == apply_bps(k, 1000)
    assert await balance(db, TDS_194H) == 0
    assert await balance(db, agent_payable(world.agent.id)) == k - apply_bps(k, 1000)
    txn = (
        await db.execute(select(LedgerTransaction).where(LedgerTransaction.txn_type == "agent_commission"))
    ).scalar_one()
    assert "CA review" in (txn.description or "")
    await assert_ledger_consistent(db)


# ============================================================================================= cancellation
async def _cancelled_world(db: Any, *, paid: int, refund: int, admission_in_days: int) -> tuple[Any, Any]:
    from app.core.enums import BookingStatus
    from app.models import Booking

    world = await make_world(db, with_agent=True, total_minor=paid)
    payment = await capture_payment(db, world.booking, paid)
    booking = await db.get(Booking, world.booking.id)
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = datetime.now(UTC)
    booking.admission_date = datetime.now(UTC).date() + timedelta(days=admission_in_days)
    booking.amount_paid_minor = paid
    await db.commit()
    if refund:
        await process_refund(db, payment, refund)
    return world, payment


async def test_cancellation_retention_is_recognized_for_the_hospital(db: Any, run_jobs: Any) -> None:
    from app.core.enums import RefundStatus
    from app.models import Booking, Refund

    paid, refund = 2_00_000_00, 1_00_000_00  # 50 % tier: INR 1,00,000 retained
    world, payment = await _cancelled_world(db, paid=paid, refund=refund, admission_in_days=5)
    retained = paid - refund
    assert await balance(db, ESCROW) == retained

    # not yet due (admission date in the future)
    await _run_task(db, run_jobs, "settlements.recognize_cancellation_retention")
    assert await txn_count(db, "retain:") == 0
    booking = await db.get(Booking, world.booking.id)
    booking.admission_date = datetime.now(UTC).date() - timedelta(days=1)
    # an open refund blocks the retention
    open_refund = Refund(
        payment_id=payment.id,
        order_id=payment.order_id,
        booking_id=world.booking.id,
        amount_minor=1_00,
        currency="INR",
        base_amount_minor=1_00,
        reason="pending",
        status=RefundStatus.REQUESTED,
    )
    db.add(open_refund)
    await db.commit()
    assert await postings.recognize_cancellation_retention(db, world.booking.id) is None
    await db.commit()
    open_refund.status = RefundStatus.REJECTED
    await db.commit()

    await _run_task(db, run_jobs, "settlements.recognize_cancellation_retention")
    # hospital agreement Example 4 (Option A): C = 15,000, G = 2,700, T = 100, hospital 82,200
    c = apply_bps(retained, 1500)
    g = apply_bps(c, 1800)
    t = apply_bps(retained, 10)
    assert (c, g, t) == (15_000_00, 2_700_00, 100_00)
    assert await balance(db, ESCROW) == 0
    assert await balance(db, hospital_payable(world.hospital.id)) == retained - c - g - t == 82_200_00
    assert await balance(db, COMMISSION_REVENUE) == c
    assert await balance(db, AGENT_COMMISSION_EXPENSE) == 0  # no agent commission on retention
    (item,) = await items_for(db, world.booking.id)
    assert (item.payee_type, item.gross_minor, item.net_minor) == ("hospital", retained, 82_200_00)
    assert item.status == SettlementItemStatus.PENDING
    txn = (
        await db.execute(select(LedgerTransaction).where(LedgerTransaction.idempotency_key.like("retain:%")))
    ).scalar_one()
    assert txn.txn_type == "cancellation_retention"

    # idempotent
    await _run_task(db, run_jobs, "settlements.recognize_cancellation_retention")
    assert await txn_count(db, "retain:") == 1 and len(await items_for(db, world.booking.id)) == 1

    # a goodwill refund afterwards reverses the retention proportionally
    await process_refund(db, payment, 50_000_00)
    assert await balance(db, ESCROW) == 0
    assert await balance(db, COMMISSION_REVENUE) == c - apply_bps(c, 5000)
    assert await balance(db, hospital_payable(world.hospital.id)) == 82_200_00 - 41_100_00
    await assert_ledger_consistent(db)


async def test_cancellation_retention_platform_share(db: Any) -> None:
    from app.core.settings_store import set_setting

    await set_setting(db, "cancellation_retention_hospital_share_bps", 4000, None)
    await db.commit()
    paid = 1_00_000_00
    world, _ = await _cancelled_world(db, paid=paid, refund=0, admission_in_days=-1)
    assert await postings.recognize_cancellation_retention(db, world.booking.id) is not None
    await db.commit()
    hospital_part = apply_bps(paid, 4000)
    c = apply_bps(hospital_part, 1500)
    g = apply_bps(c, 1800)
    t = apply_bps(hospital_part, 10)
    assert await balance(db, CANCELLATION_REVENUE) == paid - hospital_part
    assert await balance(db, hospital_payable(world.hospital.id)) == hospital_part - c - g - t
    assert await balance(db, ESCROW) == 0
    await assert_ledger_consistent(db)


# ============================================================================================= credit notes
async def test_clawback_in_batch_produces_credit_note(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    from tests.factories import create_booking, create_case

    world = await make_world(db, with_agent=False, total_minor=1_00_000_00)
    first_payment = await capture_payment(db, world.booking, 1_00_000_00)
    await complete_booking(db, world.booking)
    batch_id, fa = await _approved_hospital_batch(client, db, make_user, auth_headers, world)
    r = await client.post(f"{API}/finance/settlements/batches/{batch_id}/process", json={}, headers=fa)
    assert r.json()["status"] == "completed"
    (original,) = (await client.get(f"{API}/finance/settlements/invoices", headers=fa)).json()["items"]

    # refund after completion -> clawback; a second booking of the same hospital nets it in the next batch
    await process_refund(db, first_payment, 20_000_00)
    second_case = await create_case(db, world.patient, world.hospital)
    second = await create_booking(db, second_case, total_minor=1_00_000_00)
    await db.commit()
    await capture_payment(db, second, 1_00_000_00)
    await complete_booking(db, second)
    await service.mark_eligible(db, now=datetime.now(UTC) + timedelta(days=10))
    await db.commit()
    fb = auth_headers(await make_user(role="finance"))
    period_end = (datetime.now(UTC) + timedelta(days=10)).date().isoformat()
    r = await client.post(
        f"{API}/finance/settlements/batches",
        json={"payee_type": "hospital", "period_end": period_end},
        headers=fa,
    )
    assert r.status_code == 201, r.text
    batch2 = r.json()["id"]
    await client.post(f"{API}/finance/settlements/batches/{batch2}/approve", json={}, headers=fb)
    r = await client.post(f"{API}/finance/settlements/batches/{batch2}/process", json={}, headers=fa)
    assert r.json()["status"] == "completed", r.text
    r = await client.get(f"{API}/finance/settlements/invoices", params={"batch_id": batch2}, headers=fa)
    docs = {d["kind"]: d for d in r.json()["items"]}
    assert set(docs) == {"commission_invoice", "credit_note"}
    note = docs["credit_note"]
    assert re.fullmatch(r"HCN\d{10}", note["invoice_number"])
    assert note["subtotal_minor"] == apply_bps(20_000_00, 1500)
    assert note["tax_minor"] == apply_bps(apply_bps(20_000_00, 1500), 1800)
    assert note["line_items"][0]["original_invoice_number"] == original["invoice_number"]
    assert docs["commission_invoice"]["subtotal_minor"] == apply_bps(1_00_000_00, 1500)


# ======================================================================================== document access
async def test_settlement_document_access_control(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    from app.models import Booking, PaymentOrder, User
    from app.modules.payments.invoices import create_receipt

    world = await make_world(db, total_minor=1_00_000_00)
    assert world.agent is not None
    payment = await capture_payment(db, world.booking, 1_00_000_00)
    order = await db.get(PaymentOrder, payment.order_id)
    receipt = await create_receipt(
        db, order=order, payment=payment, booking=await db.get(Booking, world.booking.id)
    )
    await db.commit()
    await complete_booking(db, world.booking)
    batch_id, fa = await _approved_hospital_batch(client, db, make_user, auth_headers, world)
    r = await client.post(f"{API}/finance/settlements/batches/{batch_id}/process", json={}, headers=fa)
    assert r.json()["status"] == "completed", r.text
    agent_user = await db.get(User, world.agent.user_id)
    agent_h = auth_headers(agent_user)
    await _add_verified_account(client, agent_h, fa)
    period_end = (datetime.now(UTC) + timedelta(days=10)).date().isoformat()
    r = await client.post(
        f"{API}/finance/settlements/batches",
        json={"payee_type": "agent", "period_end": period_end},
        headers=fa,
    )
    assert r.status_code == 201, r.text
    agent_batch = r.json()["id"]
    fb = auth_headers(await make_user(role="finance"))
    await client.post(f"{API}/finance/settlements/batches/{agent_batch}/approve", json={}, headers=fb)
    r = await client.post(f"{API}/finance/settlements/batches/{agent_batch}/process", json={}, headers=fa)
    assert r.json()["status"] == "completed", r.text

    docs = {
        d["kind"]: d
        for d in (await client.get(f"{API}/finance/settlements/invoices", headers=fa)).json()["items"]
    }
    commission, statement = docs["commission_invoice"], docs["agent_statement"]
    owner_h = auth_headers(world.hospital_owner)
    patient_h = auth_headers(await db.get(User, world.patient.user_id))
    other = await make_world(db, with_agent=False)
    other_owner_h = auth_headers(other.hospital_owner)
    support_h = auth_headers(await make_user(role="support"))
    admin_h = auth_headers(await make_user(role="admin"))

    def pdf(doc_id: str) -> str:
        return f"{API}/finance/settlements/invoices/{doc_id}/pdf"

    # settlements route: finance all; payees only their own; everyone else refused
    for headers, doc, expected in (
        (fa, commission, 200),
        (fa, statement, 200),
        (owner_h, commission, 200),
        (owner_h, statement, 404),
        (agent_h, statement, 200),
        (agent_h, commission, 404),
        (other_owner_h, commission, 404),
        (patient_h, commission, 403),
        (support_h, commission, 403),
        (admin_h, statement, 403),
    ):
        r = await client.get(pdf(doc["id"]), headers=headers)
        assert r.status_code == expected, (doc["kind"], expected, r.text[:200])
        if expected == 200:
            assert r.content.startswith(b"%PDF")
    r = await client.get(pdf(str(receipt.id)), headers=fa)
    assert r.status_code == 404  # receipts are not settlement documents
    r = await client.get(f"{API}/finance/settlements/invoices", headers=other_owner_h)
    assert r.json()["total"] == 0

    # payments route: patient receipts only, never settlement documents (not even for finance)
    for headers in (fa, owner_h, agent_h):
        for doc in (commission, statement):
            r = await client.get(f"{API}/payments/invoices/{doc['id']}/pdf", headers=headers)
            assert r.status_code == 404, r.text
            r = await client.get(f"{API}/payments/invoices/{doc['id']}", headers=headers)
            assert r.status_code == 404
    r = await client.get(f"{API}/payments/invoices", params={"kind": "commission_invoice"}, headers=fa)
    assert r.json()["total"] == 0
    r = await client.get(f"{API}/payments/invoices", headers=fa)
    assert [i["kind"] for i in r.json()["items"]] == ["patient_receipt"]
    r = await client.get(f"{API}/payments/invoices/{receipt.id}/pdf", headers=patient_h)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    other_patient_h = auth_headers(await db.get(User, other.patient.user_id))
    r = await client.get(f"{API}/payments/invoices/{receipt.id}/pdf", headers=other_patient_h)
    assert r.status_code == 404


async def test_finance_settings_defaults_and_validation(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    from app.core.settings_store import DEFAULTS, FINANCE_KEYS, get_setting, validate_setting

    keys = (
        "cancellation_retention_hospital_share_bps",
        "agent_tds_rate_bps",
        "agent_nonresident_withholding_bps",
        "platform_gstin",
        "platform_gst_state",
    )
    assert all(k in DEFAULTS and k in FINANCE_KEYS for k in keys)
    assert await get_setting(db, "agent_tds_rate_bps") == 200
    assert await get_setting(db, "cancellation_retention_hospital_share_bps") == 10_000
    assert validate_setting("platform_gstin", " 29abcde1234f1z5 ") == "29ABCDE1234F1Z5"
    assert validate_setting("platform_gstin", "") == ""
    from app.core.errors import BadRequest

    for key, value in (
        ("platform_gstin", "NOT-A-GSTIN"),
        ("agent_tds_rate_bps", 10_001),
        ("cancellation_retention_hospital_share_bps", -1),
        ("platform_gst_state", 5),
    ):
        with pytest.raises(BadRequest):
            validate_setting(key, value)


# ======================================================================================= SEC-003 / SEC-023
async def test_payout_account_changed_after_batch_generation_is_refused(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    world = await make_world(db, with_agent=False)
    await capture_payment(db, world.booking, 1_00_000_00)
    await complete_booking(db, world.booking)
    batch_id, fa = await _approved_hospital_batch(client, db, make_user, auth_headers, world)
    fb = auth_headers(await make_user(role="finance"))
    (account,) = (await db.execute(select(PayoutAccount))).scalars().all()
    # a rogue edit after approval (new destination re-verified by an accomplice) must not receive the money
    r = await client.patch(
        f"{API}/finance/payout-accounts/{account.id}", json={"account_number": "999988887777"}, headers=fa
    )
    assert r.status_code == 200 and r.json()["is_verified"] is False
    r = await client.post(f"{API}/finance/payout-accounts/{account.id}/verify", json={}, headers=fb)
    assert r.status_code == 200
    r = await client.post(f"{API}/finance/settlements/batches/{batch_id}/process", json={}, headers=fa)
    assert r.status_code == 200, r.text
    (payout,) = r.json()["payouts"]
    assert (
        payout["status"] == "failed" and "changed since the batch was generated" in payout["failure_reason"]
    )
    (item,) = await items_for(db, world.booking.id)
    assert item.status == SettlementItemStatus.ELIGIBLE  # regenerated batches snapshot the new account
    assert await balance(db, BANK) == 0


async def test_system_batch_approver_cannot_process(
    client: Any, db: Any, run_jobs: Any, make_user: Any, auth_headers: Any
) -> None:
    world = await make_world(db, with_agent=False)
    await capture_payment(db, world.booking, 1_00_000_00)
    await complete_booking(db, world.booking)
    with time_machine.travel(datetime.now(UTC) + timedelta(days=4), tick=True):
        await _run_task(db, run_jobs, "settlements.auto_batch")
        fa = auth_headers(await make_user(role="finance"))
        fb = auth_headers(await make_user(role="finance"))
        r = await client.get(f"{API}/finance/settlements/batches", headers=fa)
        (batch,) = r.json()["items"]
        assert batch["created_by"] is None
        assert batch["payout_accounts_snapshot"] == {str(world.hospital.id): None}
        r = await client.post(f"{API}/finance/settlements/batches/{batch['id']}/approve", json={}, headers=fa)
        assert r.status_code == 200
        r = await client.post(f"{API}/finance/settlements/batches/{batch['id']}/process", json={}, headers=fa)
        assert r.status_code == 403 and r.json()["error"]["code"] == "maker_checker"
        r = await client.post(f"{API}/finance/settlements/batches/{batch['id']}/process", json={}, headers=fb)
        assert r.status_code == 200, r.text


async def test_payout_account_verification_and_reactivation(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    world = await make_world(db, with_agent=False)
    owner_h = auth_headers(world.hospital_owner)
    fa = auth_headers(await make_user(role="finance"))
    fb = auth_headers(await make_user(role="finance"))
    # finance creates an account for a payee: the same finance user cannot verify it
    r = await client.post(
        f"{API}/finance/payout-accounts",
        json={
            "owner_type": "hospital",
            "owner_id": str(world.hospital.id),
            "account_holder_name": "Apex Healthcare",
            "account_number": "001234567890",
            "ifsc": "HDFC0000123",
        },
        headers=fa,
    )
    assert r.status_code == 201 and r.json()["submitted_by"] is not None
    account_id = r.json()["id"]
    r = await client.post(f"{API}/finance/payout-accounts/{account_id}/verify", json={}, headers=fa)
    assert r.status_code == 403 and r.json()["error"]["code"] == "maker_checker"
    r = await client.post(f"{API}/finance/payout-accounts/{account_id}/verify", json={}, headers=fb)
    assert r.status_code == 200 and r.json()["is_verified"] is True

    # SEC-023: finance disables it; the payee re-activates it -> it must be verified again
    r = await client.patch(
        f"{API}/finance/payout-accounts/{account_id}", json={"status": "disabled"}, headers=fa
    )
    assert r.status_code == 200 and r.json()["status"] == "disabled"
    r = await client.patch(
        f"{API}/finance/payout-accounts/{account_id}",
        json={"status": "active", "is_primary": True},
        headers=owner_h,
    )
    assert r.status_code == 200
    assert (
        r.json()["status"] == "active"
        and r.json()["is_verified"] is False
        and r.json()["verified_by"] is None
    )
    # the payee submitted the re-activation, so any finance user may verify it again
    r = await client.post(f"{API}/finance/payout-accounts/{account_id}/verify", json={}, headers=fa)
    assert r.status_code == 200 and r.json()["is_verified"] is True
    # an unrelated change (bank name) keeps the verification
    r = await client.patch(
        f"{API}/finance/payout-accounts/{account_id}", json={"bank_name": "HDFC"}, headers=owner_h
    )
    assert r.status_code == 200 and r.json()["is_verified"] is True


async def test_settlement_documents_carry_payee_name(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    world = await make_world(db, with_agent=False)
    await capture_payment(db, world.booking, 1_00_000_00)
    await complete_booking(db, world.booking)
    batch_id, fa = await _approved_hospital_batch(client, db, make_user, auth_headers, world)
    r = await client.post(f"{API}/finance/settlements/batches/{batch_id}/process", json={}, headers=fa)
    assert r.json()["status"] == "completed"
    r = await client.get(f"{API}/finance/settlements/invoices", headers=fa)
    (doc,) = r.json()["items"]
    assert doc["payee_name"] == world.hospital.name
    r = await client.get(
        f"{API}/finance/settlements/invoices/{doc['id']}", headers=auth_headers(world.hospital_owner)
    )
    assert r.status_code == 200 and r.json()["payee_name"] == world.hospital.name
    other = await make_world(db, with_agent=False)
    r = await client.get(
        f"{API}/finance/settlements/invoices/{doc['id']}", headers=auth_headers(other.hospital_owner)
    )
    assert r.status_code == 404


# ================================================================================ settlement document PDF
def _pdf_text(data: bytes) -> str:
    import zlib

    out = []
    for stream in re.findall(rb"stream\r?\n(.*?)\r?\nendstream", data, re.S):
        try:
            out.append(zlib.decompress(stream).decode("latin-1"))
        except zlib.error:
            out.append(stream.decode("latin-1"))
    return "\n".join(out)


def test_commission_invoice_pdf_shows_sac_and_gst_heads_per_line() -> None:
    """The PDF has the same columns as the finance portal modal: SAC, taxable, CGST/SGST (or IGST), total."""
    from app.models import Invoice
    from app.modules.settlements.invoices import (
        document_tax_heads,
        line_tax_split,
        render_settlement_document_pdf,
    )

    line = {
        "description": "Platform commission - booking HIB2026000001",
        "sac": "998599",
        "taxable_minor": 60_000_00,
        "gst_minor": 10_800_00,
        "gst_split": [{"tax": "CGST", "amount_minor": 5_400_00}, {"tax": "SGST", "amount_minor": 5_400_00}],
        "amount_minor": 70_800_00,
        "currency": "INR",
    }
    assert line_tax_split(line) == {"CGST": 5_400_00, "SGST": 5_400_00}
    assert document_tax_heads([line]) == ["CGST", "SGST"]
    assert document_tax_heads([{**line, "gst_split": [{"tax": "IGST", "amount_minor": 1}]}]) == ["IGST"]
    invoice = Invoice(
        invoice_number="HIG2026000001",
        kind="commission_invoice",
        line_items=[line],
        subtotal_minor=60_000_00,
        tax_minor=10_800_00,
        total_minor=70_800_00,
        currency="INR",
        place_of_supply="Haryana (CGST+SGST)",
        issued_at=datetime.now(UTC),
    )
    text = _pdf_text(render_settlement_document_pdf(invoice, "Test Hospital", None))
    for needle in ("SAC", "998599", "Taxable", "CGST", "SGST", "INR 5,400.00", "INR 70,800.00"):
        assert needle in text, needle
    assert "IGST" not in text
