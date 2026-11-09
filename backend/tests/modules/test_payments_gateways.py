"""Razorpay / Stripe adapters: checkout, client signature verification, webhooks (respx for HTTP)."""

from __future__ import annotations

import time
import uuid

import httpx
import respx
from sqlalchemy import func, select

from app.core.enums import OrderStatus, PaymentStatus
from app.models import Payment, PaymentOrder, WebhookEvent
from app.modules.payments.gateways.stripe import compute_signature, verify_stripe_signature
from tests.modules.payments_helpers import (
    DEPOSIT_INR,
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET,
    STRIPE_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET,
    EventRecorder,
    gateway_keys_fixture,  # noqa: F401
    json_bytes,
    make_world,
    razorpay_payment_entity,
    razorpay_signature,
    recorder_fixture,  # noqa: F401
)

ORDERS = "/api/v1/payments/orders"
RZP = "https://api.razorpay.com/v1"
STRIPE = "https://api.stripe.com/v1"


async def _razorpay_order(client, auth_headers, w, rzp_order_id: str = "order_RZP123") -> dict:
    with respx.mock(assert_all_called=True) as mock:
        route = mock.post(f"{RZP}/orders").mock(
            return_value=httpx.Response(200, json={"id": rzp_order_id, "status": "created"})
        )
        r = await client.post(
            ORDERS,
            json={"booking_id": str(w.booking.id), "purpose": "booking_deposit", "gateway": "razorpay"},
            headers=auth_headers(w.patient_user),
        )
        assert r.status_code == 201, r.text
        sent = route.calls.last.request
        assert sent.headers["authorization"].startswith("Basic ")
        import json as _json

        payload = _json.loads(sent.content)
        assert payload["amount"] == 90909 and payload["currency"] == "USD"
        assert payload["receipt"] == r.json()["order"]["order_number"]
    return r.json()


async def test_razorpay_checkout_payload(db, client, auth_headers, gateway_keys):
    w = await make_world(db)
    body = await _razorpay_order(client, auth_headers, w)
    assert body["order"]["gateway_order_id"] == "order_RZP123"
    rzp = body["razorpay"]
    assert rzp["key_id"] == RAZORPAY_KEY_ID
    assert rzp["order_id"] == "order_RZP123"
    assert rzp["amount"] == 90909 and rzp["currency"] == "USD"
    assert rzp["prefill"]["email"] == w.patient_user.email
    assert w.booking.booking_number in rzp["description"]


async def test_razorpay_gateway_error_rolls_back(db, client, auth_headers, gateway_keys):
    w = await make_world(db)
    with respx.mock() as mock:
        mock.post(f"{RZP}/orders").mock(return_value=httpx.Response(500, json={"error": {"code": "SERVER"}}))
        r = await client.post(
            ORDERS,
            json={"booking_id": str(w.booking.id), "purpose": "booking_deposit", "gateway": "razorpay"},
            headers=auth_headers(w.patient_user),
        )
    assert r.status_code == 402 and r.json()["error"]["code"] == "gateway_error"
    assert await db.scalar(select(func.count()).select_from(PaymentOrder)) == 0


async def test_razorpay_verify_valid_signature_captures(
    db, client, auth_headers, gateway_keys, recorder: EventRecorder
):
    w = await make_world(db)
    body = await _razorpay_order(client, auth_headers, w)
    order_id = body["order"]["id"]
    signature = razorpay_signature(RAZORPAY_KEY_SECRET, "order_RZP123|pay_ABC")
    with respx.mock(assert_all_called=True) as mock:
        mock.get(f"{RZP}/payments/pay_ABC").mock(
            return_value=httpx.Response(
                200, json=razorpay_payment_entity("pay_ABC", "order_RZP123", 90909, "USD")
            )
        )
        r = await client.post(
            f"{ORDERS}/{order_id}/verify",
            json={
                "razorpay_payment_id": "pay_ABC",
                "razorpay_order_id": "order_RZP123",
                "razorpay_signature": signature,
            },
            headers=auth_headers(w.patient_user),
        )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paid"
    payment = (await db.execute(select(Payment))).scalar_one()
    assert payment.gateway_payment_id == "pay_ABC"
    assert payment.status == PaymentStatus.CAPTURED
    assert payment.method == "card" and payment.fee_minor == 2360
    assert "email" not in payment.raw and "contact" not in payment.raw  # no PII persisted
    events = recorder.of("payment.captured")
    assert len(events) == 1 and events[0]["base_amount_minor"] == DEPOSIT_INR

    # the subsequent webhook for the same payment is a no-op
    event = {
        "entity": "event",
        "event": "payment.captured",
        "payload": {"payment": {"entity": razorpay_payment_entity("pay_ABC", "order_RZP123", 90909, "USD")}},
        "created_at": 1,
    }
    raw = json_bytes(event)
    r = await client.post(
        "/api/v1/payments/webhooks/razorpay",
        content=raw,
        headers={
            "X-Razorpay-Signature": razorpay_signature(RAZORPAY_WEBHOOK_SECRET, raw),
            "X-Razorpay-Event-Id": "evt_after_verify",
            "Content-Type": "application/json",
        },
    )
    assert r.status_code == 200 and r.json()["status"] == "processed"
    assert len(recorder.of("payment.captured")) == 1
    assert await db.scalar(select(func.count()).select_from(Payment)) == 1


async def test_razorpay_verify_invalid_signature_rejected(
    db, client, auth_headers, gateway_keys, recorder: EventRecorder
):
    w = await make_world(db)
    body = await _razorpay_order(client, auth_headers, w)
    order_id = body["order"]["id"]
    with respx.mock(assert_all_called=False) as mock:
        fetch = mock.get(f"{RZP}/payments/pay_ABC").mock(return_value=httpx.Response(200, json={}))
        r = await client.post(
            f"{ORDERS}/{order_id}/verify",
            json={
                "razorpay_payment_id": "pay_ABC",
                "razorpay_order_id": "order_RZP123",
                "razorpay_signature": razorpay_signature("wrong-secret", "order_RZP123|pay_ABC"),
            },
            headers=auth_headers(w.patient_user),
        )
        assert not fetch.called
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_signature"
    r = await client.post(
        f"{ORDERS}/{order_id}/verify",
        json={
            "razorpay_payment_id": "pay_ABC",
            "razorpay_order_id": "order_OTHER",
            "razorpay_signature": razorpay_signature(RAZORPAY_KEY_SECRET, "order_OTHER|pay_ABC"),
        },
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "order_mismatch"
    assert recorder.of("payment.captured") == []
    order = await db.get(PaymentOrder, uuid.UUID(order_id))
    assert order is not None and order.status == OrderStatus.CREATED


async def test_razorpay_webhook_signature_and_dedupe(
    db, client, auth_headers, gateway_keys, recorder: EventRecorder
):
    w = await make_world(db)
    body = await _razorpay_order(client, auth_headers, w)
    order_id = body["order"]["id"]
    event = {
        "entity": "event",
        "event": "payment.captured",
        "payload": {"payment": {"entity": razorpay_payment_entity("pay_W1", "order_RZP123", 90909, "USD")}},
        "created_at": 1700000000,
    }
    raw = json_bytes(event)
    url = "/api/v1/payments/webhooks/razorpay"

    # invalid signature: 400, nothing stored (SEC-046: no table growth from forged requests) or processed
    r = await client.post(
        url,
        content=raw,
        headers={"X-Razorpay-Signature": "0" * 64, "X-Razorpay-Event-Id": "evt_1"},
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_signature"
    stored = (await db.execute(select(WebhookEvent))).scalars().all()
    assert stored == []  # a forged delivery never blocks the real event id either
    assert recorder.of("payment.captured") == []

    headers = {
        "X-Razorpay-Signature": razorpay_signature(RAZORPAY_WEBHOOK_SECRET, raw),
        "X-Razorpay-Event-Id": "evt_1",
    }
    r = await client.post(url, content=raw, headers=headers)
    assert r.status_code == 200 and r.json() == {"status": "processed", "event_id": "evt_1"}
    assert len(recorder.of("payment.captured")) == 1
    db.expire_all()
    order = await db.get(PaymentOrder, uuid.UUID(order_id))
    assert order is not None and order.status == OrderStatus.PAID

    r = await client.post(url, content=raw, headers=headers)
    assert r.status_code == 200 and r.json()["status"] == "duplicate"
    assert len(recorder.of("payment.captured")) == 1
    valid = (
        (await db.execute(select(WebhookEvent).where(WebhookEvent.signature_valid.is_(True)))).scalars().all()
    )
    assert len(valid) == 1 and valid[0].processed_at is not None and valid[0].processing_error is None
    assert "email" not in str(valid[0].payload)


async def test_razorpay_webhook_payment_failed_and_unknown_order(
    db, client, auth_headers, gateway_keys, recorder: EventRecorder
):
    w = await make_world(db)
    body = await _razorpay_order(client, auth_headers, w)
    url = "/api/v1/payments/webhooks/razorpay"
    failed = {
        "event": "payment.failed",
        "payload": {
            "payment": {
                "entity": razorpay_payment_entity("pay_F1", "order_RZP123", 90909, "USD", status="failed")
            }
        },
    }
    raw = json_bytes(failed)
    r = await client.post(
        url,
        content=raw,
        headers={
            "X-Razorpay-Signature": razorpay_signature(RAZORPAY_WEBHOOK_SECRET, raw),
            "X-Razorpay-Event-Id": "evt_f1",
        },
    )
    assert r.status_code == 200 and r.json()["status"] == "processed"
    assert [e["order_id"] for e in recorder.of("payment.failed")] == [body["order"]["id"]]

    unknown = {
        "event": "payment.captured",
        "payload": {"payment": {"entity": razorpay_payment_entity("pay_X", "order_UNKNOWN", 100, "USD")}},
    }
    raw = json_bytes(unknown)
    r = await client.post(
        url,
        content=raw,
        headers={
            "X-Razorpay-Signature": razorpay_signature(RAZORPAY_WEBHOOK_SECRET, raw),
            "X-Razorpay-Event-Id": "evt_unknown",
        },
    )
    assert r.status_code == 200
    stored = (
        await db.execute(select(WebhookEvent).where(WebhookEvent.event_id == "evt_unknown"))
    ).scalar_one()
    assert stored.processed_at is not None and "No matching" in (stored.processing_error or "")


async def test_webhook_not_configured(db, client, monkeypatch, gateway_keys):
    from app.core.config import settings

    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "")
    r = await client.post("/api/v1/payments/webhooks/razorpay", content=b"{}")
    assert r.status_code == 400 and r.json()["error"]["code"] == "webhook_not_configured"
    monkeypatch.setattr(settings, "PAYMENT_GATEWAYS_ENABLED", ["mock"])
    r = await client.post("/api/v1/payments/webhooks/stripe", content=b"{}")
    assert r.status_code == 404


# ----------------------------------------------------------------------------------------------- stripe
def test_stripe_signature_tolerance():
    body = b'{"id":"evt_1"}'
    ts = 1_800_000_000
    header = f"t={ts},v1={compute_signature('whsec_x', ts, body)}"
    assert verify_stripe_signature("whsec_x", body, header, now=ts)
    assert verify_stripe_signature("whsec_x", body, header, now=ts + 300)
    assert verify_stripe_signature("whsec_x", body, header, now=ts - 300)
    assert not verify_stripe_signature("whsec_x", body, header, now=ts + 301)
    assert not verify_stripe_signature("whsec_x", body, header, now=ts - 301)
    assert not verify_stripe_signature("whsec_other", body, header, now=ts)
    assert not verify_stripe_signature("whsec_x", body + b" ", header, now=ts)
    assert not verify_stripe_signature("whsec_x", body, f"t={ts}", now=ts)
    assert not verify_stripe_signature("whsec_x", body, None, now=ts)
    # multiple v1 signatures (secret rotation) - any match is accepted
    rotated = f"t={ts},v1={'0' * 64},v1={compute_signature('whsec_x', ts, body)}"
    assert verify_stripe_signature("whsec_x", body, rotated, now=ts)


async def _stripe_order(client, auth_headers, w) -> dict:
    with respx.mock(assert_all_called=True) as mock:
        route = mock.post(f"{STRIPE}/payment_intents").mock(
            return_value=httpx.Response(200, json={"id": "pi_123", "client_secret": "pi_123_secret_abc"})
        )
        r = await client.post(
            ORDERS,
            json={"booking_id": str(w.booking.id), "purpose": "booking_deposit", "gateway": "stripe"},
            headers=auth_headers(w.patient_user),
        )
        assert r.status_code == 201, r.text
        request = route.calls.last.request
        assert request.headers["idempotency-key"].startswith("order-")
        form = dict(httpx.QueryParams(request.content.decode()))
        assert form["amount"] == "90909" and form["currency"] == "usd"
        assert form["automatic_payment_methods[enabled]"] == "true"
    return r.json()


async def test_stripe_checkout_and_webhook_capture(
    db, client, auth_headers, gateway_keys, recorder: EventRecorder
):
    w = await make_world(db)
    body = await _stripe_order(client, auth_headers, w)
    assert body["stripe"] == {"publishable_key": STRIPE_PUBLISHABLE_KEY, "client_secret": "pi_123_secret_abc"}
    order_id = body["order"]["id"]
    event = {
        "id": "evt_stripe_1",
        "type": "payment_intent.succeeded",
        "data": {
            "object": {
                "id": "pi_123",
                "object": "payment_intent",
                "amount": 90909,
                "amount_received": 90909,
                "currency": "usd",
                "status": "succeeded",
                "metadata": {"order_id": order_id},
                "payment_method_types": ["card"],
                "receipt_email": "x@example.test",
            }
        },
    }
    raw = json_bytes(event)
    url = "/api/v1/payments/webhooks/stripe"
    old_ts = int(time.time()) - 600
    stale = f"t={old_ts},v1={compute_signature(STRIPE_WEBHOOK_SECRET, old_ts, raw)}"
    r = await client.post(url, content=raw, headers={"Stripe-Signature": stale})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_signature"

    ts = int(time.time())
    header = f"t={ts},v1={compute_signature(STRIPE_WEBHOOK_SECRET, ts, raw)}"
    r = await client.post(url, content=raw, headers={"Stripe-Signature": header})
    assert r.status_code == 200 and r.json()["status"] == "processed", r.text
    r = await client.post(url, content=raw, headers={"Stripe-Signature": header})
    assert r.json()["status"] == "duplicate"
    events = recorder.of("payment.captured")
    assert len(events) == 1 and events[0]["gateway"] == "stripe" and events[0]["amount_minor"] == 90909
    db.expire_all()
    order = await db.get(PaymentOrder, uuid.UUID(order_id))
    assert order is not None and order.status == OrderStatus.PAID

    # idempotent replay of the order creation re-fetches the client secret instead of storing it
    payment = (await db.execute(select(Payment))).scalar_one()
    assert payment.gateway_payment_id == "pi_123"


async def test_stripe_verify_fetches_payment_intent(db, client, auth_headers, gateway_keys):
    w = await make_world(db)
    body = await _stripe_order(client, auth_headers, w)
    order_id = body["order"]["id"]
    r = await client.post(
        f"{ORDERS}/{order_id}/verify",
        json={"payment_intent_id": "pi_other"},
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "order_mismatch"
    with respx.mock(assert_all_called=True) as mock:
        mock.get(f"{STRIPE}/payment_intents/pi_123").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": "pi_123",
                    "amount": 90909,
                    "amount_received": 90909,
                    "currency": "usd",
                    "status": "succeeded",
                },
            )
        )
        r = await client.post(
            f"{ORDERS}/{order_id}/verify",
            json={"payment_intent_id": "pi_123"},
            headers=auth_headers(w.patient_user),
        )
    assert r.status_code == 200 and r.json()["status"] == "paid"
