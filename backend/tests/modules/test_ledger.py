"""Ledger service, postings and read endpoints (be-finance)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import time_machine
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.enums import LedgerAccountType, LedgerOwnerType, PaymentGateway
from app.core.jobs import enqueue
from app.modules.ledger import postings
from app.modules.ledger.service import (
    ADJUSTMENTS,
    BANK,
    EQUITY,
    ESCROW,
    FX_GAIN_LOSS,
    GATEWAY_FEES,
    InvalidAccountCode,
    LedgerValidationError,
    get_or_create_account,
    parse_account_code,
    post_transaction,
)
from tests.modules.settlements_helpers import (
    assert_ledger_consistent,
    balance,
    capture_payment,
    complete_booking,
    finance_events_only,
    make_world,
    txn_count,
)


@pytest.fixture(autouse=True)
def _finance_only(monkeypatch: pytest.MonkeyPatch) -> None:
    finance_events_only(monkeypatch)


# ------------------------------------------------------------------------------------------ accounts
def test_parse_account_codes() -> None:
    spec = parse_account_code("GATEWAY:razorpay:RECEIVABLE")
    assert spec.type is LedgerAccountType.ASSET and spec.owner_type is LedgerOwnerType.GATEWAY
    assert parse_account_code(ESCROW).type is LedgerAccountType.LIABILITY
    assert parse_account_code("PLATFORM:COMMISSION_REVENUE").type is LedgerAccountType.REVENUE
    assert parse_account_code("TAX:TDS_194O").owner_type is LedgerOwnerType.TAX
    assert parse_account_code(GATEWAY_FEES).type is LedgerAccountType.EXPENSE
    hid = "0190a000-0000-7000-8000-000000000001"
    spec = parse_account_code(f"HOSPITAL:{hid}:PAYABLE")
    assert spec.owner_type is LedgerOwnerType.HOSPITAL and str(spec.owner_id) == hid
    assert parse_account_code(f"AGENT:{hid}:PAYABLE").owner_type is LedgerOwnerType.AGENT
    assert parse_account_code(f"VENDOR:{hid}:PAYABLE").owner_type is LedgerOwnerType.VENDOR
    for bad in ("PLATFORM:NOPE", "HOSPITAL:not-a-uuid:PAYABLE", "GATEWAY:Razor Pay:RECEIVABLE", ""):
        with pytest.raises(InvalidAccountCode):
            parse_account_code(bad)


async def test_get_or_create_account_is_idempotent(db: Any) -> None:
    a = await get_or_create_account(db, BANK)
    b = await get_or_create_account(db, BANK)
    await db.commit()
    assert a.id == b.id and a.type is LedgerAccountType.ASSET and a.currency == "INR"


# ------------------------------------------------------------------------------------------ posting rules
async def test_post_transaction_validates_and_updates_balances(db: Any) -> None:
    with pytest.raises(LedgerValidationError):
        await post_transaction(
            db,
            txn_type="adjustment",
            reference_type=None,
            reference_id=None,
            idempotency_key="t:unbalanced",
            description=None,
            entries=[(BANK, "debit", 100), (ESCROW, "credit", 99)],
        )
    for bad_entries in (
        [(BANK, "debit", 0), (ESCROW, "credit", 0)],
        [(BANK, "debit", -5), (ESCROW, "credit", -5)],
        [(BANK, "debit", 1.5), (ESCROW, "credit", 1.5)],
        [(BANK, "sideways", 5), (ESCROW, "credit", 5)],
        [(BANK, "debit", 5, "USD"), (ESCROW, "credit", 5, "USD")],
        [(BANK, "debit", 5)],
    ):
        with pytest.raises((LedgerValidationError, InvalidAccountCode)):
            await post_transaction(
                db,
                txn_type="adjustment",
                reference_type=None,
                reference_id=None,
                idempotency_key="t:bad",
                description=None,
                entries=bad_entries,  # type: ignore[arg-type]
            )
    txn = await post_transaction(
        db,
        txn_type="adjustment",
        reference_type="test",
        reference_id=None,
        idempotency_key="t:ok",
        description="opening",
        entries=[(BANK, "debit", 1000), (ESCROW, "credit", 1000)],
    )
    again = await post_transaction(
        db,
        txn_type="adjustment",
        reference_type="test",
        reference_id=None,
        idempotency_key="t:ok",
        description="opening (retry)",
        entries=[(BANK, "debit", 1000), (ESCROW, "credit", 1000)],
    )
    await db.commit()
    assert again.id == txn.id
    assert await balance(db, BANK) == 1000  # asset: debit-positive
    assert await balance(db, ESCROW) == 1000  # liability: credit-positive
    assert await txn_count(db, "t:") == 1
    await assert_ledger_consistent(db)


async def test_ledger_rows_are_immutable(db: Any) -> None:
    await post_transaction(
        db,
        txn_type="adjustment",
        reference_type=None,
        reference_id=None,
        idempotency_key="t:immutable",
        description=None,
        entries=[(BANK, "debit", 500), (ESCROW, "credit", 500)],
    )
    await db.commit()
    with pytest.raises(IntegrityError, match="immutable"):
        await db.execute(text("UPDATE ledger_entries SET amount_minor = 1"))
    await db.rollback()
    with pytest.raises(IntegrityError, match="immutable"):
        await db.execute(text("DELETE FROM ledger_transactions"))
    await db.rollback()
    assert await balance(db, BANK) == 500


async def test_database_rejects_unbalanced_entries(db: Any) -> None:
    txn = await post_transaction(
        db,
        txn_type="adjustment",
        reference_type=None,
        reference_id=None,
        idempotency_key="t:db-balance",
        description=None,
        entries=[(BANK, "debit", 700), (ESCROW, "credit", 700)],
    )
    account = await get_or_create_account(db, BANK)
    await db.execute(
        text(
            "INSERT INTO ledger_entries (id, transaction_id, account_id, direction, amount_minor, currency) "
            "VALUES (gen_random_uuid(), :t, :a, 'debit', 1, 'INR')"
        ),
        {"t": txn.id, "a": account.id},
    )
    with pytest.raises(IntegrityError, match="unbalanced"):
        await db.commit()
    await db.rollback()


# ------------------------------------------------------------------------------------------ capture / sweep
async def test_capture_posting_with_gateway_fee_is_idempotent(db: Any) -> None:
    world = await make_world(db, with_agent=False)
    payment = await capture_payment(
        db, world.booking, 80_000_00, fee_minor=1_888_00, gateway=PaymentGateway.RAZORPAY
    )
    # The same event delivered twice posts once.
    await postings.post_capture(db, payment.id)
    await db.commit()
    assert await txn_count(db, "capture:") == 1
    assert await txn_count(db, "gateway_fee:") == 1
    assert await balance(db, ESCROW) == 80_000_00
    assert await balance(db, "GATEWAY:razorpay:RECEIVABLE") == 80_000_00 - 1_888_00
    assert await balance(db, GATEWAY_FEES) == 1_888_00
    await assert_ledger_consistent(db)


async def test_gateway_sweep_after_t_plus_2(db: Any, run_jobs: Any) -> None:
    world = await make_world(db, with_agent=False)
    await capture_payment(db, world.booking, 50_000_00, fee_minor=1_000_00, gateway=PaymentGateway.RAZORPAY)
    await capture_payment(db, world.booking, 10_000_00, gateway=PaymentGateway.BANK_TRANSFER)
    assert await postings.sweep_gateway_settlements(db) == 1  # bank transfers settle immediately
    await db.commit()
    assert await balance(db, BANK) == 10_000_00
    assert await balance(db, "GATEWAY:razorpay:RECEIVABLE") == 49_000_00

    with time_machine.travel(datetime.now(UTC) + timedelta(days=3), tick=True):
        await enqueue(db, "ledger.sweep_gateway_settlements", {})
        await db.commit()
        assert await run_jobs() >= 1
    assert await balance(db, BANK) == 59_000_00
    assert await balance(db, "GATEWAY:razorpay:RECEIVABLE") == 0
    assert await postings.sweep_gateway_settlements(db, now=datetime.now(UTC) + timedelta(days=5)) == 0
    await assert_ledger_consistent(db)


# ------------------------------------------------------------------------------------------ recognition math
def test_recognition_rounding_half_up() -> None:
    b = postings.compute_recognition(
        paid=1_234_567,
        service_fee=0,
        commission_bps=1500,
        gst_bps=1800,
        tds_bps=10,
        agent_id=None,
        agent_bps=500,
    )
    # C = 185185.05 -> 185185; G = 33333.3 -> 33333; T = 1234.567 -> 1235
    assert (b.commission, b.gst, b.tds) == (185_185, 33_333, 1_235)
    assert b.net == 1_234_567 - 185_185 - 33_333 - 1_235
    half = postings.compute_recognition(
        paid=10, service_fee=0, commission_bps=1500, gst_bps=1800, tds_bps=0, agent_id=None, agent_bps=0
    )
    assert half.commission == 2  # 1.5 rounds half-up
    assert half.gst == 0  # 0.36
    capped = postings.compute_recognition(
        paid=1_000_00,
        service_fee=0,
        commission_bps=300,
        gst_bps=1800,
        tds_bps=10,
        agent_id=__import__("uuid").uuid4(),
        agent_bps=500,
    )
    assert capped.agent_commission == capped.commission == 3_000  # agent commission capped at C
    fee = postings.compute_recognition(
        paid=1_100_00,
        service_fee=100_00,
        commission_bps=1000,
        gst_bps=0,
        tds_bps=0,
        agent_id=None,
        agent_bps=0,
    )
    assert fee.gross == 1_000_00 and fee.commission == 100_00 and fee.net == 900_00


async def test_service_fee_is_recognized_as_platform_revenue(db: Any) -> None:
    world = await make_world(
        db,
        with_agent=False,
        total_minor=1_10_000_00,
        booking_fields={"subtotal_minor": 1_00_000_00, "service_fee_minor": 10_000_00},
    )
    await capture_payment(db, world.booking, 1_10_000_00)
    await complete_booking(db, world.booking)
    assert await balance(db, "PLATFORM:SERVICE_FEE_REVENUE") == 10_000_00
    assert await balance(db, "PLATFORM:COMMISSION_REVENUE") == 15_000_00  # 15% of H = 1,00,000
    assert await balance(db, ESCROW) == 0
    await assert_ledger_consistent(db)


# ------------------------------------------------------------------------------------------ endpoints
async def test_ledger_endpoints_and_trial_balance(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    world = await make_world(db)
    await capture_payment(db, world.booking, 4_00_000_00, fee_minor=2_000_00, gateway=PaymentGateway.RAZORPAY)
    await complete_booking(db, world.booking)
    finance = await make_user(role="finance")
    h = auth_headers(finance)

    r = await client.get("/api/v1/finance/ledger/trial-balance", headers=h)
    assert r.status_code == 200, r.text
    tb = r.json()
    assert tb["net_minor"] == 0 and tb["balanced"] and tb["cached_balances_consistent"]
    assert tb["total_debit_minor"] == tb["total_credit_minor"] > 0
    assert {row["type"] for row in tb["rows"]} == {t.value for t in LedgerAccountType}

    r = await client.get(
        "/api/v1/finance/ledger/accounts", params={"owner_type": "hospital", "page_size": 100}, headers=h
    )
    assert r.status_code == 200, r.text
    accounts = r.json()["items"]
    assert [a["code"] for a in accounts] == [f"HOSPITAL:{world.hospital.id}:PAYABLE"]
    hospital_account = accounts[0]
    assert hospital_account["balance_minor"] == 4_00_000_00 - 60_000_00 - 10_800_00 - 400_00

    r = await client.get("/api/v1/finance/ledger/accounts", params={"q": "escrow"}, headers=h)
    assert [a["code"] for a in r.json()["items"]] == [ESCROW]

    r = await client.get(f"/api/v1/finance/ledger/accounts/{hospital_account['id']}/entries", headers=h)
    assert r.status_code == 200
    entries = r.json()["items"]
    assert len(entries) == 1 and entries[0]["direction"] == "credit"
    assert entries[0]["signed_amount_minor"] == hospital_account["balance_minor"]

    r = await client.get(
        "/api/v1/finance/ledger/transactions", params={"txn_type": "revenue_recognition"}, headers=h
    )
    txns = r.json()["items"]
    assert len(txns) == 1 and txns[0]["reference_id"] == str(world.booking.id)
    assert txns[0]["total_minor"] == 4_00_000_00
    debit = sum(e["amount_minor"] for e in txns[0]["entries"] if e["direction"] == "debit")
    credit = sum(e["amount_minor"] for e in txns[0]["entries"] if e["direction"] == "credit")
    assert debit == credit == 4_00_000_00
    r = await client.get(f"/api/v1/finance/ledger/transactions/{txns[0]['id']}", headers=h)
    assert r.status_code == 200 and r.json()["idempotency_key"] == f"recognize:{world.booking.id}:1"
    r = await client.get(f"/api/v1/finance/ledger/transactions/{world.booking.id}", headers=h)
    assert r.status_code == 404


@pytest.mark.parametrize("role", ["admin", "support", "hospital", "agent", "patient"])
async def test_ledger_endpoints_are_finance_only(
    client: Any, make_user: Any, auth_headers: Any, role: str
) -> None:
    user = await make_user(role=role)
    for path in ("/finance/ledger/accounts", "/finance/ledger/transactions", "/finance/ledger/trial-balance"):
        r = await client.get(f"/api/v1{path}", headers=auth_headers(user))
        assert r.status_code == 403, (path, r.text)
    r = await client.get("/api/v1/finance/ledger/trial-balance")
    assert r.status_code == 401
    super_admin = await make_user(role="super_admin")
    r = await client.get("/api/v1/finance/ledger/trial-balance", headers=auth_headers(super_admin))
    assert r.status_code == 200


# ------------------------------------------------------------------------------------------ adjustments
ADJ = "/api/v1/finance/ledger/adjustments"


def _lines(*rows: tuple[str, str, int]) -> list[dict[str, Any]]:
    return [{"account_code": c, "direction": d, "amount_minor": a} for c, d, a in rows]


async def test_tax_remittance_adjustment_needs_a_second_finance_user(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    world = await make_world(db, with_agent=False)
    await capture_payment(db, world.booking, 1_00_000_00)
    await complete_booking(db, world.booking)
    gst, tds = await balance(db, "TAX:GST_OUTPUT"), await balance(db, "TAX:TDS_194O")
    maker = auth_headers(await make_user(role="finance"))
    checker = auth_headers(await make_user(role="super_admin"))

    body = {
        "kind": "tax_remittance",
        "description": "GSTR-3B and TDS deposit for October",
        "external_reference": "CIN 0510308",
        "entries": _lines(
            ("TAX:GST_OUTPUT", "debit", gst), ("TAX:TDS_194O", "debit", tds), (BANK, "credit", gst + tds)
        ),
    }
    r = await client.post(ADJ, json=body, headers=maker)
    assert r.status_code == 201, r.text
    adj = r.json()
    assert adj["status"] == "pending_approval" and adj["amount_minor"] == gst + tds
    assert await balance(db, "TAX:GST_OUTPUT") == gst  # nothing posted yet

    r = await client.post(f"{ADJ}/{adj['id']}/approve", headers=maker)
    assert r.status_code == 403 and r.json()["error"]["code"] == "maker_checker"
    r = await client.post(f"{ADJ}/{adj['id']}/approve", headers=checker)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "posted" and r.json()["ledger_transaction_id"]
    assert await balance(db, "TAX:GST_OUTPUT") == 0 and await balance(db, "TAX:TDS_194O") == 0
    assert await balance(db, BANK) == -(gst + tds)
    r = await client.get(
        "/api/v1/finance/ledger/transactions", params={"txn_type": "tax_remittance"}, headers=maker
    )
    (txn,) = r.json()["items"]
    assert txn["idempotency_key"] == f"adjustment:{adj['id']}" and "CIN 0510308" in txn["description"]
    r = await client.post(f"{ADJ}/{adj['id']}/approve", headers=checker)
    assert r.status_code == 409
    r = await client.get(ADJ, params={"status": "posted"}, headers=maker)
    assert r.json()["total"] == 1
    await assert_ledger_consistent(db)


async def test_adjustment_validation_and_rejection(
    client: Any, db: Any, make_user: Any, auth_headers: Any
) -> None:
    maker = auth_headers(await make_user(role="finance"))
    checker = auth_headers(await make_user(role="finance"))
    hospital = f"HOSPITAL:{uuid.uuid4()}:PAYABLE"
    invalid = [
        ("tax_remittance", _lines(("TAX:GST_OUTPUT", "debit", 100), (ESCROW, "credit", 100))),
        ("tax_remittance", _lines((GATEWAY_FEES, "debit", 100), (BANK, "credit", 100))),
        ("fx_difference", _lines((BANK, "debit", 100), (ESCROW, "credit", 100))),
        ("manual", _lines((BANK, "debit", 100), (ESCROW, "credit", 100))),
        ("manual", _lines((ADJUSTMENTS, "debit", 100), (hospital, "credit", 100))),
        ("manual", _lines((ADJUSTMENTS, "debit", 100), (BANK, "credit", 99))),
        ("manual", _lines((ADJUSTMENTS, "debit", 100), ("NOPE:X", "credit", 100))),
    ]
    for kind, entries in invalid:
        r = await client.post(
            ADJ, json={"kind": kind, "description": "test", "entries": entries}, headers=maker
        )
        assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_adjustment", (kind, r.text)
    r = await client.post(
        ADJ,
        json={
            "kind": "manual",
            "description": "x",
            "entries": _lines((ADJUSTMENTS, "debit", 0), (BANK, "credit", 0)),
        },
        headers=maker,
    )
    assert r.status_code == 422

    # FX loss on a wire that arrived short, then a capital injection; one is rejected instead of posted
    fx = {
        "kind": "fx_difference",
        "description": "Short wire: rate moved between invoice and receipt",
        "entries": _lines((FX_GAIN_LOSS, "debit", 1_250_00), (ESCROW, "credit", 1_250_00)),
    }
    equity = {
        "kind": "manual",
        "description": "Founders' capital",
        "entries": _lines((BANK, "debit", 10_00_000_00), (EQUITY, "credit", 10_00_000_00)),
    }
    fx_id = (await client.post(ADJ, json=fx, headers=maker)).json()["id"]
    eq_id = (await client.post(ADJ, json=equity, headers=maker)).json()["id"]
    r = await client.post(f"{ADJ}/{fx_id}/approve", headers=checker)
    assert r.status_code == 200 and r.json()["status"] == "posted"
    assert await balance(db, FX_GAIN_LOSS) == 1_250_00
    r = await client.post(f"{ADJ}/{eq_id}/reject", json={"reason": "wrong bank account"}, headers=checker)
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    r = await client.post(f"{ADJ}/{eq_id}/approve", headers=checker)
    assert r.status_code == 409
    assert await balance(db, EQUITY) == 0
    r = await client.get(f"{ADJ}/{eq_id}", headers=maker)
    assert r.json()["rejection_reason"] == "wrong bank account"
    r = await client.get(
        "/api/v1/finance/ledger/transactions", params={"txn_type": "fx_difference"}, headers=maker
    )
    assert r.json()["total"] == 1

    support = auth_headers(await make_user(role="support"))
    r = await client.post(ADJ, json=fx, headers=support)
    assert r.status_code == 403
    await assert_ledger_consistent(db)


def test_new_implementation_accounts_parse() -> None:
    from app.modules.ledger.service import CANCELLATION_REVENUE, TDS_194H, TDS_195

    assert parse_account_code(FX_GAIN_LOSS).type is LedgerAccountType.EXPENSE
    assert parse_account_code(EQUITY).type is LedgerAccountType.EQUITY
    assert parse_account_code(ADJUSTMENTS).type is LedgerAccountType.EXPENSE
    assert parse_account_code(CANCELLATION_REVENUE).type is LedgerAccountType.REVENUE
    for code in (TDS_194H, TDS_195):
        spec = parse_account_code(code)
        assert spec.type is LedgerAccountType.LIABILITY and spec.owner_type is LedgerOwnerType.TAX
