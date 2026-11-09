"""Payment controls (INTEGRATION_BACKLOG #24-#26): amount-difference review hold, FX fail-closed."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import respx
from sqlalchemy import delete, select, update

from app.core.config import settings
from app.core.enums import OrderStatus, PaymentStatus
from app.models import FxRate, Invoice, Payment, PaymentOrder, WebhookEvent
from tests.factories import create_user
from tests.modules.payments_helpers import (
    DEPOSIT_INR,
    RAZORPAY_WEBHOOK_SECRET,
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
WEBHOOK = "/api/v1/payments/webhooks/razorpay"
ORDER_USD = 90_909  # DEPOSIT_INR at USD 88


async def _razorpay_order(client, auth_headers, w, rzp_order_id: str) -> str:
    with respx.mock() as mock:
        mock.post(f"{RZP}/orders").mock(return_value=httpx.Response(200, json={"id": rzp_order_id}))
        r = await client.post(
            ORDERS,
            json={"booking_id": str(w.booking.id), "purpose": "booking_deposit", "gateway": "razorpay"},
            headers=auth_headers(w.patient_user),
        )
    assert r.status_code == 201, r.text
    assert r.json()["order"]["amount_minor"] == ORDER_USD
    return r.json()["order"]["id"]


async def _webhook(client, event: dict, event_id: str) -> httpx.Response:
    raw = json_bytes(event)
    return await client.post(
        WEBHOOK,
        content=raw,
        headers={
            "X-Razorpay-Signature": razorpay_signature(RAZORPAY_WEBHOOK_SECRET, raw),
            "X-Razorpay-Event-Id": event_id,
        },
    )


def _captured(payment_id: str, rzp_order_id: str, amount: int) -> dict:
    return {
        "event": "payment.captured",
        "payload": {"payment": {"entity": razorpay_payment_entity(payment_id, rzp_order_id, amount, "USD")}},
    }


async def test_amount_difference_is_held_then_accepted_pro_rata(
    db, client, auth_headers, gateway_keys, recorder: EventRecorder
):
    w = await make_world(db)
    order_id = await _razorpay_order(client, auth_headers, w, "order_H1")
    ph = auth_headers(w.patient_user)
    short = 45_000

    r = await _webhook(client, _captured("pay_H1", "order_H1", short), "evt_h1")
    assert r.status_code == 200, r.text
    assert recorder.of("payment.captured") == []  # nothing applied
    db.expire_all()
    order = await db.get(PaymentOrder, uuid.UUID(order_id))
    assert order is not None and order.status == OrderStatus.PENDING and order.review_required == "amount"
    payment = (await db.execute(select(Payment))).scalar_one()
    assert payment.status == PaymentStatus.AUTHORIZED and payment.captured_at is None
    assert payment.amount_minor == short
    assert (await db.execute(select(Invoice))).scalars().all() == []
    event_row = (await db.execute(select(WebhookEvent))).scalar_one()
    assert event_row.processed_at is not None and event_row.processing_error is None

    # re-delivery (new event id, same payment) stays a no-op
    r = await _webhook(client, _captured("pay_H1", "order_H1", short), "evt_h2")
    assert r.status_code == 200 and recorder.of("payment.captured") == []

    finance = await create_user(db, role="finance")
    fh = auth_headers(finance)
    listing = (await client.get(ORDERS, params={"review": "amount"}, headers=fh)).json()
    assert [o["id"] for o in listing["items"]] == [order_id]
    assert listing["items"][0]["review_required"] == "amount"
    detail = (await client.get(f"{ORDERS}/{order_id}", headers=fh)).json()
    assert detail["amount_reviews"][0]["status"] == "pending"
    assert detail["amount_reviews"][0]["expected_minor"] == ORDER_USD
    assert detail["amount_reviews"][0]["received_minor"] == short
    patient_view = (await client.get(f"{ORDERS}/{order_id}", headers=ph)).json()
    assert patient_view["amount_reviews"] == []

    body = {"payment_id": str(payment.id), "decision": "accept", "note": "Patient confirmed short payment"}
    r = await client.post(f"{ORDERS}/{order_id}/amount-review", json=body, headers=ph)
    assert r.status_code == 403
    r = await client.post(f"{ORDERS}/{order_id}/amount-review", json=body, headers=fh)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paid" and r.json()["review_required"] is None
    captured = recorder.of("payment.captured")
    assert len(captured) == 1
    assert captured[0]["amount_minor"] == short
    assert captured[0]["base_amount_minor"] == round(DEPOSIT_INR * short / ORDER_USD)
    # second decision is refused; later deliveries do not capture twice
    r = await client.post(f"{ORDERS}/{order_id}/amount-review", json=body, headers=fh)
    assert r.status_code == 400 and r.json()["error"]["code"] == "no_pending_review"
    await _webhook(client, _captured("pay_H1", "order_H1", short), "evt_h3")
    assert len(recorder.of("payment.captured")) == 1
    payment_id, finance_id = payment.id, finance.id
    db.expire_all()
    payment = await db.get(Payment, payment_id)
    assert payment is not None and payment.status == PaymentStatus.CAPTURED
    assert payment.raw["amount_review"]["status"] == "accepted"
    assert payment.raw["amount_review"]["decided_by"] == str(finance_id)


async def test_amount_difference_returned_in_full(
    db, client, auth_headers, gateway_keys, recorder: EventRecorder
):
    w = await make_world(db)
    order_id = await _razorpay_order(client, auth_headers, w, "order_H2")
    over = 100_000
    assert (await _webhook(client, _captured("pay_H2", "order_H2", over), "evt_r1")).status_code == 200
    payment = (await db.execute(select(Payment))).scalar_one()
    finance = await create_user(db, role="finance")
    fh = auth_headers(finance)
    body = {"payment_id": str(payment.id), "decision": "return", "note": "Over-payment, returned"}

    with respx.mock(assert_all_called=True) as mock:
        mock.get(f"{RZP}/payments/pay_H2/refunds").mock(return_value=httpx.Response(200, json={"items": []}))
        create = mock.post(f"{RZP}/payments/pay_H2/refund").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": "rfnd_H2",
                    "amount": over,
                    "status": "processed",
                    "notes": {"refund_id": f"rev-{payment.id}"},
                },
            )
        )
        r = await client.post(f"{ORDERS}/{order_id}/amount-review", json=body, headers=fh)
        assert r.status_code == 200, r.text
        assert json.loads(create.calls.last.request.content)["amount"] == over
    assert r.json()["status"] == "failed" and r.json()["review_required"] is None
    assert recorder.of("payment.captured") == [] and recorder.of("refund.processed") == []
    assert [e["error_code"] for e in recorder.of("payment.failed")] == ["amount_mismatch"]
    payment_id = payment.id
    db.expire_all()
    payment = await db.get(Payment, payment_id)
    assert payment is not None and payment.status == PaymentStatus.FAILED
    assert payment.error_code == "amount_mismatch_returned"
    assert payment.raw["amount_review"]["gateway_refund_id"] == "rfnd_H2"

    # the gateway's refund.processed webhook for the return is acknowledged without an "unmatched" error
    event = {
        "event": "refund.processed",
        "payload": {
            "refund": {
                "entity": {
                    "id": "rfnd_H2",
                    "payment_id": "pay_H2",
                    "amount": over,
                    "status": "processed",
                    "notes": {"refund_id": f"rev-{payment.id}"},
                }
            }
        },
    }
    r = await _webhook(client, event, "evt_r2")
    assert r.status_code == 200
    row = (await db.execute(select(WebhookEvent).where(WebhookEvent.event_id == "evt_r2"))).scalar_one()
    assert row.processing_error is None


async def test_fx_rate_missing_or_stale_fails_closed_in_production(
    db, client, auth_headers, monkeypatch, gateway_keys
):
    w = await make_world(db)

    def body(currency: str) -> dict[str, object]:
        return {
            "booking_id": str(w.booking.id),
            "purpose": "booking_deposit",
            "gateway": "bank_transfer",
            "currency": currency,
        }

    await db.execute(delete(FxRate).where(FxRate.quote_currency == "USD"))
    await db.commit()
    ph = auth_headers(w.patient_user)
    # outside production: falls back to the default rate (logged as an alert)
    r = await client.post(ORDERS, json=body("USD"), headers=ph)
    assert r.status_code == 201 and r.json()["order"]["amount_minor"] == ORDER_USD

    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "PAYMENT_GATEWAYS_ENABLED", ["bank_transfer"])
    r = await client.post(ORDERS, json=body("USD"), headers=ph)
    assert r.status_code == 503 and r.json()["error"]["code"] == "fx_rate_unavailable"
    assert r.json()["error"]["details"]["currencies"] == {"USD": "missing"}
    # INR needs no rate
    assert (await client.post(ORDERS, json=body("INR"), headers=ph)).status_code == 201

    db.add(FxRate(base_currency="INR", quote_currency="USD", rate=88, source="test"))
    await db.commit()
    await db.execute(
        update(FxRate)
        .where(FxRate.quote_currency == "USD")
        .values(as_of=datetime.now(UTC) - timedelta(days=5))
    )
    await db.commit()
    r = await client.post(ORDERS, json=body("USD"), headers=ph)
    assert r.status_code == 503 and r.json()["error"]["details"]["currencies"] == {"USD": "stale"}

    await db.execute(update(FxRate).where(FxRate.quote_currency == "USD").values(as_of=datetime.now(UTC)))
    await db.commit()
    r = await client.post(ORDERS, json=body("USD"), headers=ph)
    assert r.status_code == 201 and r.json()["order"]["amount_minor"] == ORDER_USD
