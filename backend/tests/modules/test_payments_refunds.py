"""Refunds: limits, approval workflow, gateway processing, cancellation auto-refunds."""

from __future__ import annotations

import uuid

import httpx
import respx
from sqlalchemy import select

from app.core import settings_store
from app.core.enums import OrderStatus, PaymentStatus, RefundStatus
from app.core.events import publish
from app.models import Booking, Payment, PaymentOrder, PlatformSetting, Refund
from app.modules.payments import service
from tests.factories import create_payment_order, create_user
from tests.modules.payments_helpers import (
    DEPOSIT_INR,
    RAZORPAY_KEY_SECRET,
    EventRecorder,
    gateway_keys_fixture,  # noqa: F401
    make_world,
    razorpay_payment_entity,
    razorpay_signature,
    recorder_fixture,  # noqa: F401
)

ORDERS = "/api/v1/payments/orders"
REFUNDS = "/api/v1/payments/refunds"


async def _paid_mock_order(client, auth_headers, w, currency: str | None = None) -> dict:
    body = {"booking_id": str(w.booking.id), "purpose": "booking_deposit", "gateway": "mock"}
    if currency:
        body["currency"] = currency
    r = await client.post(ORDERS, json=body, headers=auth_headers(w.patient_user))
    assert r.status_code == 201, r.text
    order = r.json()["order"]
    r = await client.post(
        f"/api/v1/payments/mock/{order['id']}/complete",
        json={"outcome": "success"},
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 200 and r.json()["status"] == "paid"
    return order


async def test_refund_limits_and_flow(db, client, auth_headers, run_jobs, recorder: EventRecorder):
    w = await make_world(db)
    order = await _paid_mock_order(client, auth_headers, w)
    payment = (await db.execute(select(Payment))).scalar_one()
    payment_id = payment.id
    finance = await create_user(db, role="finance")
    admin = await create_user(db, role="admin")
    fh, ah, ph = auth_headers(finance), auth_headers(admin), auth_headers(w.patient_user)

    # who may request
    body = {"payment_id": str(payment_id), "amount_minor": 10_000, "reason": "Goodwill"}
    assert (await client.post(REFUNDS, json=body, headers=ph)).status_code == 403
    assert (await client.get(REFUNDS, headers=ph)).status_code == 403

    # limits
    too_much = {**body, "amount_minor": 90_910}
    r = await client.post(REFUNDS, json=too_much, headers=fh)
    assert r.status_code == 400 and r.json()["error"]["code"] == "refund_exceeds_refundable"
    assert r.json()["error"]["details"]["refundable_minor"] == 90_909
    assert (await client.post(REFUNDS, json={**body, "amount_minor": 0}, headers=fh)).status_code == 422

    # admin requests (by order id), finance approves
    r = await client.post(
        REFUNDS, json={"order_id": order["id"], "amount_minor": 30_000, "reason": "Partial"}, headers=ah
    )
    assert r.status_code == 201, r.text
    refund = r.json()
    assert refund["status"] == "requested" and refund["currency"] == "USD"
    assert refund["base_amount_minor"] == round(DEPOSIT_INR * 30_000 / 90_909)
    # in-flight refunds reduce what is refundable
    r = await client.post(REFUNDS, json={**body, "amount_minor": 60_910}, headers=fh)
    assert r.status_code == 400 and r.json()["error"]["details"]["refundable_minor"] == 60_909

    assert (await client.post(f"{REFUNDS}/{refund['id']}/approve", headers=ah)).status_code == 403
    r = await client.post(f"{REFUNDS}/{refund['id']}/approve", headers=fh)
    assert r.status_code == 200 and r.json()["status"] == "approved"
    assert (await client.post(f"{REFUNDS}/{refund['id']}/approve", headers=fh)).status_code == 400
    assert await run_jobs() >= 1

    processed = recorder.of("refund.processed")
    assert len(processed) == 1
    assert processed[0]["refund_id"] == refund["id"]
    assert processed[0]["payment_id"] == str(payment_id)
    assert processed[0]["booking_id"] == str(w.booking.id)
    assert processed[0]["base_amount_minor"] == refund["base_amount_minor"]

    db.expire_all()
    payment = await db.get(Payment, payment_id)
    assert payment is not None
    assert payment.status == PaymentStatus.PARTIALLY_REFUNDED and payment.amount_refunded_minor == 30_000
    order_row = await db.get(PaymentOrder, uuid.UUID(order["id"]))
    assert order_row is not None and order_row.status == OrderStatus.PARTIALLY_REFUNDED
    refund_row = await db.get(Refund, uuid.UUID(refund["id"]))
    assert refund_row is not None and refund_row.status == RefundStatus.PROCESSED
    assert refund_row.gateway_refund_id and refund_row.gateway_refund_id.startswith("mock_rfnd_")

    # refund the rest: base amount is the exact remainder (no rounding drift)
    r = await client.post(REFUNDS, json={**body, "amount_minor": 60_909}, headers=fh)
    assert r.status_code == 201
    rest = r.json()
    assert rest["base_amount_minor"] == DEPOSIT_INR - refund["base_amount_minor"]
    # maker-checker: above the threshold (INR 50,000 default) the requester cannot approve their own refund
    assert rest["base_amount_minor"] > service.DEFAULT_REFUND_DUAL_APPROVAL_MINOR
    r = await client.post(f"{REFUNDS}/{rest['id']}/approve", headers=fh)
    assert r.status_code == 403 and r.json()["error"]["code"] == "second_approver_required"
    checker = await create_user(db, role="finance")
    r = await client.post(f"{REFUNDS}/{rest['id']}/approve", headers=auth_headers(checker))
    assert r.status_code == 200 and r.json()["approved_by"] == str(checker.id)
    await run_jobs()
    db.expire_all()
    payment = await db.get(Payment, payment_id)
    assert payment is not None and payment.status == PaymentStatus.REFUNDED
    order_row = await db.get(PaymentOrder, uuid.UUID(order["id"]))
    assert order_row is not None and order_row.status == OrderStatus.REFUNDED
    r = await client.post(REFUNDS, json={**body, "amount_minor": 1}, headers=fh)
    assert r.status_code == 400

    listing = (await client.get(REFUNDS, params={"status": "processed"}, headers=fh)).json()
    assert listing["total"] == 2
    detail = (await client.get(f"{ORDERS}/{order['id']}", headers=ph)).json()
    assert len(detail["refunds"]) == 2


async def test_refund_reject(db, client, auth_headers, run_jobs, recorder: EventRecorder):
    w = await make_world(db)
    await _paid_mock_order(client, auth_headers, w)
    payment = (await db.execute(select(Payment))).scalar_one()
    finance = await create_user(db, role="finance")
    fh = auth_headers(finance)
    r = await client.post(
        REFUNDS, json={"payment_id": str(payment.id), "amount_minor": 500, "reason": "dup"}, headers=fh
    )
    refund_id = r.json()["id"]
    r = await client.post(f"{REFUNDS}/{refund_id}/reject", json={"reason": "Not eligible"}, headers=fh)
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    await run_jobs()
    assert recorder.of("refund.processed") == []
    # rejected refunds do not consume the refundable amount
    r = await client.post(
        REFUNDS, json={"payment_id": str(payment.id), "amount_minor": 90_909, "reason": "full"}, headers=fh
    )
    assert r.status_code == 201
    full_id = r.json()["id"]
    assert (await client.post(f"{REFUNDS}/{full_id}/approve", headers=fh)).status_code == 403
    # SEC-057: the threshold setting can only tighten the control - one finance user raising it (a single
    # PUT /admin/settings call) must not let them approve their own large refund
    db.add(PlatformSetting(key=service.REFUND_DUAL_APPROVAL_SETTING, value=DEPOSIT_INR))
    await db.commit()
    settings_store.clear_settings_cache()
    r = await client.post(f"{REFUNDS}/{full_id}/approve", headers=fh)
    assert r.status_code == 403 and r.json()["error"]["code"] == "second_approver_required"
    r = await client.post(
        f"{REFUNDS}/{full_id}/approve", headers=auth_headers(await create_user(db, role="finance"))
    )
    assert r.status_code == 200


async def test_refund_self_approval_cannot_be_split_or_raised(db, client, auth_headers, run_jobs):
    """SEC-057: splitting a large refund into pieces below the threshold, or raising the threshold through the
    settings API, must not let the requester approve their own refunds (backlog #26 maker-checker)."""
    w = await make_world(db)
    await _paid_mock_order(client, auth_headers, w)
    payment = (await db.execute(select(Payment))).scalar_one()
    finance = await create_user(db, role="finance")
    fh = auth_headers(finance)
    r = await client.put(
        "/api/v1/admin/settings/" + service.REFUND_DUAL_APPROVAL_SETTING, json={"value": 10**12}, headers=fh
    )
    assert r.status_code == 200, r.text
    body = {"payment_id": str(payment.id), "amount_minor": 30_000, "reason": "Goodwill"}
    first = (await client.post(REFUNDS, json=body, headers=fh)).json()
    assert first["base_amount_minor"] < service.DEFAULT_REFUND_DUAL_APPROVAL_MINOR
    r = await client.post(f"{REFUNDS}/{first['id']}/approve", headers=fh)
    assert r.status_code == 200, r.text  # small refund: self-approval allowed
    second = (await client.post(REFUNDS, json=body, headers=fh)).json()
    assert (
        first["base_amount_minor"] + second["base_amount_minor"] > service.DEFAULT_REFUND_DUAL_APPROVAL_MINOR
    )
    r = await client.post(f"{REFUNDS}/{second['id']}/approve", headers=fh)
    assert r.status_code == 403 and r.json()["error"]["code"] == "second_approver_required"
    checker = await create_user(db, role="finance")
    r = await client.post(f"{REFUNDS}/{second['id']}/approve", headers=auth_headers(checker))
    assert r.status_code == 200


async def test_cancellation_creates_auto_refunds(db, client, auth_headers, run_jobs, recorder: EventRecorder):
    w = await make_world(db)
    order = await _paid_mock_order(client, auth_headers, w)
    booking_id = w.booking.id
    # 50% of the INR deposit is refundable; the payment was made in USD
    refundable = DEPOSIT_INR // 2
    await publish(
        db,
        "booking.cancelled",
        {
            "booking_id": str(booking_id),
            "refundable_minor": refundable,
            "currency": "INR",
            "reason": "Changed plans",
        },
    )
    await publish(db, "booking.cancelled", {"booking_id": str(booking_id), "refundable_minor": refundable})
    await db.commit()
    refunds = (await db.execute(select(Refund))).scalars().all()
    assert len(refunds) == 1  # idempotent
    refund = refunds[0]
    assert refund.status == RefundStatus.APPROVED and refund.requested_by is None
    assert refund.currency == "USD" and refund.amount_minor == 45_455  # half of 909.09 USD, half-up
    assert refund.base_amount_minor == refundable  # INR booking: exact refundable amount, no FX drift
    assert refund.order_id == uuid.UUID(order["id"])
    assert refund.reason and refund.reason.startswith("Booking cancelled")
    refund_id = refund.id

    assert await run_jobs() >= 1
    processed = recorder.of("refund.processed")
    assert len(processed) == 1 and processed[0]["refund_id"] == str(refund_id)
    assert processed[0]["booking_amount_minor"] == refundable


async def test_cancellation_cancels_open_orders_and_spreads_over_payments(db, client, auth_headers, run_jobs):
    w = await make_world(db)
    booking_id = w.booking.id
    first = await _paid_mock_order(client, auth_headers, w, currency="INR")  # 80,000 INR
    # a paid balance order, and (created outside the API, which allows one open order per booking since
    # SEC-007) a stale open order that the cancellation must cancel
    r = await client.post(
        ORDERS,
        json={
            "booking_id": str(booking_id),
            "purpose": "booking_balance",
            "gateway": "mock",
            "currency": "INR",
        },
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 201, r.text
    balance_order = r.json()["order"]
    booking_row = await db.get(Booking, booking_id)
    assert booking_row is not None
    stale = await create_payment_order(db, booking_row, purpose="booking_balance", amount_minor=1_000_00)
    open_order = {"id": str(stale.id)}
    r = await client.post(
        f"/api/v1/payments/mock/{balance_order['id']}/complete",
        json={"outcome": "success"},
        headers=auth_headers(w.patient_user),
    )
    assert r.json()["status"] == "paid"

    paid_balance = balance_order["amount_minor"]
    refundable = paid_balance + 10_000_00  # all of the newest payment + part of the deposit
    await publish(db, "booking.cancelled", {"booking_id": str(booking_id), "refundable_minor": refundable})
    await db.commit()
    rows = (await db.execute(select(Refund).order_by(Refund.amount_minor.desc()))).scalars().all()
    by_order = {str(r.order_id): r.amount_minor for r in rows}
    assert by_order == {balance_order["id"]: paid_balance, first["id"]: 10_000_00}
    db.expire_all()
    still_open = await db.get(PaymentOrder, uuid.UUID(open_order["id"]))
    assert still_open is not None and still_open.status == OrderStatus.CANCELLED
    await run_jobs()
    statuses = {r.status for r in (await db.execute(select(Refund))).scalars().all()}
    assert statuses == {RefundStatus.PROCESSED}


async def test_razorpay_refund_via_gateway_then_webhook(
    db, client, auth_headers, run_jobs, gateway_keys, recorder: EventRecorder
):
    from tests.modules.payments_helpers import RAZORPAY_WEBHOOK_SECRET, json_bytes

    w = await make_world(db)
    with respx.mock() as mock:
        mock.post("https://api.razorpay.com/v1/orders").mock(
            return_value=httpx.Response(200, json={"id": "order_R1"})
        )
        mock.get("https://api.razorpay.com/v1/payments/pay_R1").mock(
            return_value=httpx.Response(200, json=razorpay_payment_entity("pay_R1", "order_R1", 90909, "USD"))
        )
        r = await client.post(
            ORDERS,
            json={"booking_id": str(w.booking.id), "purpose": "booking_deposit", "gateway": "razorpay"},
            headers=auth_headers(w.patient_user),
        )
        order_id = r.json()["order"]["id"]
        r = await client.post(
            f"{ORDERS}/{order_id}/verify",
            json={
                "razorpay_payment_id": "pay_R1",
                "razorpay_order_id": "order_R1",
                "razorpay_signature": razorpay_signature(RAZORPAY_KEY_SECRET, "order_R1|pay_R1"),
            },
            headers=auth_headers(w.patient_user),
        )
        assert r.json()["status"] == "paid"

    finance = await create_user(db, role="finance")
    fh = auth_headers(finance)
    payment = (await db.execute(select(Payment))).scalar_one()
    refund = (
        await client.post(
            REFUNDS, json={"payment_id": str(payment.id), "amount_minor": 10_000, "reason": "x"}, headers=fh
        )
    ).json()
    await client.post(f"{REFUNDS}/{refund['id']}/approve", headers=fh)

    with respx.mock(assert_all_called=True) as mock:
        mock.get("https://api.razorpay.com/v1/payments/pay_R1/refunds").mock(
            return_value=httpx.Response(200, json={"items": []})
        )
        create = mock.post("https://api.razorpay.com/v1/payments/pay_R1/refund").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": "rfnd_1",
                    "amount": 10_000,
                    "status": "pending",
                    "notes": {"refund_id": refund["id"]},
                },
            )
        )
        assert await run_jobs() >= 1
        import json as _json

        assert _json.loads(create.calls.last.request.content)["amount"] == 10_000
    db.expire_all()
    row = await db.get(Refund, uuid.UUID(refund["id"]))
    assert row is not None and row.status == RefundStatus.PROCESSING and row.gateway_refund_id == "rfnd_1"
    assert recorder.of("refund.processed") == []

    event = {
        "event": "refund.processed",
        "payload": {
            "refund": {
                "entity": {"id": "rfnd_1", "payment_id": "pay_R1", "amount": 10_000, "status": "processed"}
            }
        },
    }
    raw = json_bytes(event)
    r = await client.post(
        "/api/v1/payments/webhooks/razorpay",
        content=raw,
        headers={
            "X-Razorpay-Signature": razorpay_signature(RAZORPAY_WEBHOOK_SECRET, raw),
            "X-Razorpay-Event-Id": "evt_rf1",
        },
    )
    assert r.status_code == 200 and r.json()["status"] == "processed"
    assert [e["refund_id"] for e in recorder.of("refund.processed")] == [refund["id"]]
    db.expire_all()
    row = await db.get(Refund, uuid.UUID(refund["id"]))
    assert row is not None and row.status == RefundStatus.PROCESSED


async def test_staff_platform_cancellation_refund_needs_second_approver(db, client, auth_headers, run_jobs):
    """SEC-059: only admin/super_admin may cancel as the platform, and the 100% refund it creates is a
    ``requested`` refund (requester = the cancelling admin) that a different finance user must approve."""
    w = await make_world(db)
    await _paid_mock_order(client, auth_headers, w, currency="INR")
    booking_id = w.booking.id
    support = await create_user(db, role="support")
    finance = await create_user(db, role="finance")
    boss = await create_user(db, role="super_admin")
    boss_id = boss.id
    sh, fh, bh = auth_headers(support), auth_headers(finance), auth_headers(boss)
    cancel = f"/api/v1/bookings/{booking_id}/cancel"

    for initiator in ("platform", "hospital"):
        r = await client.post(
            cancel,
            json={"reason": "Hospital unavailable", "initiated_by": initiator},
            headers=sh,
        )
        assert r.status_code == 403 and r.json()["error"]["code"] == "platform_cancel_admin_only"
    assert (await db.execute(select(Refund))).scalars().all() == []

    r = await client.post(cancel, json={"reason": "Hospital unavailable"}, headers=bh)
    assert r.status_code == 200, r.text
    assert r.json()["refund_pct"] == 100
    refund = (await db.execute(select(Refund))).scalar_one()
    assert refund.status == RefundStatus.REQUESTED and refund.requested_by == boss_id
    assert refund.amount_minor == DEPOSIT_INR
    refund_id = refund.id
    await run_jobs()
    db.expire_all()
    assert (await db.get(Refund, refund_id)).status == RefundStatus.REQUESTED  # nothing auto-processed

    approve = f"{REFUNDS}/{refund_id}/approve"
    r = await client.post(approve, headers=bh)
    assert r.status_code == 403 and r.json()["error"]["code"] == "second_approver_required"
    r = await client.post(approve, headers=fh)
    assert r.status_code == 200, r.text
    await run_jobs()
    db.expire_all()
    assert (await db.get(Refund, refund_id)).status == RefundStatus.PROCESSED
