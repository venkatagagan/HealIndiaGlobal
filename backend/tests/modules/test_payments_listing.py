"""Staff payment lists: repeatable filters, date / amount windows, sorting, status counts, display fields."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.core import settings_store
from app.core.enums import (
    OrderStatus,
    PaymentGateway,
    PaymentMethod,
    PaymentPurpose,
    PaymentStatus,
    RefundStatus,
)
from app.models import Payment, Refund
from tests.factories import create_payment_order, create_user
from tests.modules.payments_helpers import make_world

ORDERS = "/api/v1/payments/orders"
REFUNDS = "/api/v1/payments/refunds"


async def _seed(db):
    w = await make_world(db)
    now = datetime.now(UTC)
    paid = await create_payment_order(
        db,
        w.booking,
        status=OrderStatus.PAID,
        gateway=PaymentGateway.RAZORPAY,
        amount_minor=50_000_00,
        base_amount_minor=50_000_00,
        paid_at=now,
    )
    pending = await create_payment_order(
        db,
        w.booking,
        status=OrderStatus.PENDING,
        gateway=PaymentGateway.BANK_TRANSFER,
        purpose=PaymentPurpose.BOOKING_BALANCE,
        amount_minor=2_000_00,
        currency="USD",
        base_amount_minor=1_76_000_00,
        fx_rate=Decimal("88"),
        meta={"mark_paid_request": {"status": "pending"}},
    )
    old_failed = await create_payment_order(
        db, w.booking, status=OrderStatus.FAILED, amount_minor=10_00, base_amount_minor=10_00
    )
    old_failed.created_at = now - timedelta(days=40)
    payment = Payment(
        order_id=paid.id,
        gateway=PaymentGateway.RAZORPAY,
        gateway_payment_id="pay_listing_1",
        method=PaymentMethod.UPI,
        status=PaymentStatus.CAPTURED,
        amount_minor=50_000_00,
        currency="INR",
        base_amount_minor=50_000_00,
        captured_at=now,
    )
    db.add(payment)
    await db.flush()
    await db.commit()
    return w, paid, pending, old_failed, payment


async def test_order_list_filters_sort_and_counts(db, client, auth_headers):
    w, paid, pending, old_failed, _ = await _seed(db)
    h = auth_headers(await create_user(db, role="finance"))

    r = await client.get(ORDERS, params=[("status", "paid"), ("status", "pending")], headers=h)
    assert r.status_code == 200, r.text
    assert {o["id"] for o in r.json()["items"]} == {str(paid.id), str(pending.id)}

    # display fields for staff
    by_id = {o["id"]: o for o in r.json()["items"]}
    assert by_id[str(paid.id)]["booking_number"] == w.booking.booking_number
    assert by_id[str(paid.id)]["patient_name"] == w.patient.full_name
    assert by_id[str(paid.id)]["payer_name"]
    assert by_id[str(paid.id)]["payment_method"] == "upi"

    async def ids(**params):
        res = await client.get(ORDERS, params=params, headers=h)
        assert res.status_code == 200, res.text
        return [o["id"] for o in res.json()["items"]]

    assert await ids(method="upi") == [str(paid.id)]
    assert await ids(currency="usd") == [str(pending.id)]
    assert await ids(purpose="booking_balance") == [str(pending.id)]
    assert await ids(review="any") == [str(pending.id)]
    assert await ids(min_amount=1_00_000_00) == [str(pending.id)]
    assert await ids(max_amount=100_00) == [str(old_failed.id)]
    today = datetime.now(UTC).date()
    assert str(old_failed.id) not in await ids(created_from=(today - timedelta(days=7)).isoformat())
    assert await ids(created_to=(today - timedelta(days=30)).isoformat()) == [str(old_failed.id)]
    assert await ids(paid_from=today.isoformat()) == [str(paid.id)]
    assert set(await ids(q=w.booking.booking_number)) == {str(paid.id), str(pending.id), str(old_failed.id)}
    assert await ids(q=pending.order_number) == [str(pending.id)]
    assert len(await ids(q=w.patient.first_name)) == 3

    assert await ids(sort="-base_amount_minor") == [str(pending.id), str(paid.id), str(old_failed.id)]
    assert await ids(sort="base_amount_minor") == [str(old_failed.id), str(paid.id), str(pending.id)]
    assert (await ids(sort="-paid_at"))[0] == str(paid.id)  # NULLs last
    assert (await client.get(ORDERS, params={"sort": "payer"}, headers=h)).status_code == 422

    r = await client.get(
        f"{ORDERS}/status-counts", params={"status": "paid", "gateway": "razorpay"}, headers=h
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["paid"] == 1 and body["counts"]["pending"] == 0 and body["total"] == 1
    r = await client.get(f"{ORDERS}/status-counts", headers=h)
    body = r.json()
    assert body["total"] == 3 and body["counts"]["failed"] == 1
    assert body["review"] == {"amount": 0, "mark_paid": 1, "any": 1}

    # patients keep their own (scoped) list without staff display fields; counts are staff-only
    r = await client.get(ORDERS, headers=auth_headers(w.patient_user))
    assert r.status_code == 200 and r.json()["total"] == 3
    assert all(o["patient_name"] is None for o in r.json()["items"])
    assert (
        await client.get(f"{ORDERS}/status-counts", headers=auth_headers(w.patient_user))
    ).status_code == 403

    r = await client.get(f"{ORDERS}/{paid.id}", headers=h)
    assert r.status_code == 200 and r.json()["booking_number"] == w.booking.booking_number


async def test_refund_list_filters_queue_and_counts(db, client, auth_headers):
    w, paid, _, _, payment = await _seed(db)
    maker = await create_user(db, role="finance", full_name="Maker Finance")
    h = auth_headers(maker)
    small = Refund(
        payment_id=payment.id,
        order_id=paid.id,
        booking_id=w.booking.id,
        amount_minor=1_000_00,
        currency="INR",
        base_amount_minor=1_000_00,
        reason="Goodwill",
        status=RefundStatus.REQUESTED,
        requested_by=maker.id,
    )
    large = Refund(
        payment_id=payment.id,
        order_id=paid.id,
        booking_id=w.booking.id,
        amount_minor=49_000_00,
        currency="INR",
        base_amount_minor=49_000_00,
        reason="Cancelled",
        status=RefundStatus.REQUESTED,
        requested_by=maker.id,
    )
    done = Refund(
        payment_id=payment.id,
        order_id=paid.id,
        amount_minor=500_00,
        currency="INR",
        base_amount_minor=500_00,
        status=RefundStatus.PROCESSED,
    )
    db.add_all([small, large, done])
    await db.commit()
    # threshold 20,000 INR (the setting may only tighten the default)
    await settings_store.set_setting(db, "refund_dual_approval_threshold_minor", 20_000_00, None)
    await db.commit()

    r = await client.get(REFUNDS, params={"awaiting_second_approval": True}, headers=h)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert [i["id"] for i in items] == [str(large.id)]
    assert items[0]["order_number"] == paid.order_number
    assert items[0]["requested_by_name"] == "Maker Finance"
    assert items[0]["patient_name"] == w.patient.full_name

    r = await client.get(REFUNDS, params=[("status", "requested"), ("status", "processed")], headers=h)
    assert r.json()["total"] == 3
    r = await client.get(REFUNDS, params={"sort": "base_amount_minor"}, headers=h)
    assert [i["id"] for i in r.json()["items"]] == [str(done.id), str(small.id), str(large.id)]
    r = await client.get(REFUNDS, params={"q": paid.order_number, "max_amount": 1_000_00}, headers=h)
    assert {i["id"] for i in r.json()["items"]} == {str(small.id), str(done.id)}

    r = await client.get(f"{REFUNDS}/status-counts", params={"status": "processed"}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["requested"] == 2 and body["counts"]["processed"] == 1 and body["total"] == 3
    assert body["awaiting_second_approval"] == 1 and body["threshold_minor"] == 20_000_00
    r = await client.get(f"{REFUNDS}/status-counts", headers=auth_headers(w.patient_user))
    assert r.status_code == 403
