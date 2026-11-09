"""SEC-007 / SEC-009: one open order per booking, captures that the booking can no longer take are held for
finance (return only), and a bank reference (UTR) settles one order only."""

from __future__ import annotations

import uuid

from sqlalchemy import select

from app.core.enums import BookingStatus, OrderStatus, PaymentStatus
from app.models import Booking, Payment, PaymentOrder
from app.modules.payments import service
from tests.factories import create_user
from tests.modules.payments_helpers import (
    DEPOSIT_INR,
    TOTAL_INR,
    EventRecorder,
    make_document,
    make_world,
    recorder_fixture,  # noqa: F401
)

ORDERS = "/api/v1/payments/orders"


def _body(booking_id: uuid.UUID, gateway: str = "mock", **extra: object) -> dict[str, object]:
    return {"booking_id": str(booking_id), "purpose": "booking_deposit", "gateway": gateway, **extra}


async def _complete_mock(client, headers, order_id: str):
    return await client.post(
        f"/api/v1/payments/mock/{order_id}/complete", json={"outcome": "success"}, headers=headers
    )


async def test_paid_bank_transfer_in_progress_blocks_a_second_order(db, client, auth_headers):
    w = await make_world(db)
    ph = auth_headers(w.patient_user)
    r = await client.post(ORDERS, json=_body(w.booking.id, "bank_transfer", currency="INR"), headers=ph)
    assert r.status_code == 201, r.text
    order_id = r.json()["order"]["id"]
    doc = await make_document(db, w.patient_user, w.patient)
    r = await client.post(
        f"{ORDERS}/{order_id}/bank-transfer-proof",
        json={"document_id": str(doc.id), "reference": "SWIFT-1"},
        headers=ph,
    )
    assert r.status_code == 200
    # the patient says they wired the money: a card order for the same booking would charge twice
    r = await client.post(ORDERS, json=_body(w.booking.id), headers=ph)
    assert r.status_code == 409 and r.json()["error"]["code"] == "payment_in_progress"
    r = await client.post(
        ORDERS,
        json={"booking_id": str(w.booking.id), "purpose": "booking_full", "gateway": "mock"},
        headers=ph,
    )
    assert r.status_code == 409


async def test_capture_on_cancelled_booking_is_held_and_can_only_be_returned(
    db, client, auth_headers, recorder: EventRecorder
):
    w = await make_world(db)
    booking_id = w.booking.id
    ph = auth_headers(w.patient_user)
    order_id = (await client.post(ORDERS, json=_body(booking_id), headers=ph)).json()["order"]["id"]
    booking = await db.get(Booking, booking_id)
    assert booking is not None
    booking.status = BookingStatus.CANCELLED
    await db.commit()

    r = await _complete_mock(client, ph, order_id)
    assert r.status_code == 200, r.text
    assert r.json()["status"] != "paid"
    assert recorder.of("payment.captured") == []
    db.expire_all()
    payment = (await db.execute(select(Payment))).scalar_one()
    assert payment.status == PaymentStatus.AUTHORIZED
    assert payment.raw["amount_review"]["reason"] == "booking_cancelled"
    payment_id = payment.id
    booking = await db.get(Booking, booking_id)
    assert booking is not None and booking.amount_paid_minor == 0

    finance = await create_user(db, role="finance")
    fh = auth_headers(finance)
    detail = (await client.get(f"{ORDERS}/{order_id}", headers=fh)).json()
    assert detail["review_required"] == "amount"
    assert detail["amount_reviews"][0]["reason"] == "booking_cancelled"
    r = await client.post(
        f"{ORDERS}/{order_id}/amount-review",
        json={"payment_id": str(payment_id), "decision": "accept", "note": "try"},
        headers=fh,
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "target_not_payable"
    assert recorder.of("payment.captured") == []


async def test_capture_that_would_overpay_the_booking_is_held(
    db, client, auth_headers, recorder: EventRecorder
):
    w = await make_world(db)
    ph = auth_headers(w.patient_user)
    order_id = (await client.post(ORDERS, json=_body(w.booking.id), headers=ph)).json()["order"]["id"]
    booking = await db.get(Booking, w.booking.id)
    assert booking is not None
    booking.amount_paid_minor = TOTAL_INR - DEPOSIT_INR + 1  # paid elsewhere meanwhile
    await db.commit()
    r = await _complete_mock(client, ph, order_id)
    assert r.status_code == 200 and r.json()["status"] != "paid"
    assert recorder.of("payment.captured") == []
    payment = (await db.execute(select(Payment))).scalar_one()
    assert payment.raw["amount_review"]["reason"] == "overpayment"


async def test_superseded_order_paid_late_is_still_applied_when_the_booking_needs_it(
    db, client, auth_headers, recorder: EventRecorder
):
    w = await make_world(db)
    ph = auth_headers(w.patient_user)
    first = (await client.post(ORDERS, json=_body(w.booking.id), headers=ph)).json()["order"]["id"]
    r = await client.post(ORDERS, json=_body(w.booking.id, "bank_transfer"), headers=ph)
    assert r.status_code == 201
    old = await db.get(PaymentOrder, uuid.UUID(first))
    assert old is not None and old.status == OrderStatus.CANCELLED
    # the gateway still captures the first order: the booking needs the money, so it is applied once
    r = await _complete_mock(client, ph, first)
    assert r.status_code == 200 and r.json()["status"] == "paid"
    assert len(recorder.of("payment.captured")) == 1


async def test_bank_reference_settles_one_order_only(db, client, auth_headers):
    a = await make_world(db)
    b = await make_world(db)
    oa = (
        await client.post(
            ORDERS,
            json=_body(a.booking.id, "bank_transfer", currency="INR"),
            headers=auth_headers(a.patient_user),
        )
    ).json()["order"]["id"]
    ob = (
        await client.post(
            ORDERS,
            json=_body(b.booking.id, "bank_transfer", currency="INR"),
            headers=auth_headers(b.patient_user),
        )
    ).json()["order"]["id"]
    maker = await create_user(db, role="finance")
    checker = await create_user(db, role="finance")
    mh, ch = auth_headers(maker), auth_headers(checker)
    paid = {"reference": "UTR 0001", "amount_minor": DEPOSIT_INR}
    assert (await client.post(f"{ORDERS}/{oa}/mark-paid", json=paid, headers=mh)).status_code == 200
    # the same wire (any case / spacing) cannot be pending for a second order
    r = await client.post(
        f"{ORDERS}/{ob}/mark-paid", json={"reference": "utr0001", "amount_minor": DEPOSIT_INR}, headers=mh
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "reference_already_used"
    r = await client.post(f"{ORDERS}/{oa}/mark-paid/approve", json=paid, headers=ch)
    assert r.status_code == 200 and r.json()["status"] == "paid"
    payment = (await db.execute(select(Payment))).scalar_one()
    assert payment.bank_reference == "UTR0001"
    # ...nor settle another order once it has been used
    r = await client.post(
        f"{ORDERS}/{ob}/mark-paid", json={"reference": "UTR0001", "amount_minor": DEPOSIT_INR}, headers=mh
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "reference_already_used"


async def test_mark_paid_refused_on_cancelled_orders_and_bookings(db, client, auth_headers):
    w = await make_world(db)
    oid = (
        await client.post(
            ORDERS,
            json=_body(w.booking.id, "bank_transfer", currency="INR"),
            headers=auth_headers(w.patient_user),
        )
    ).json()["order"]["id"]
    fh = auth_headers(await create_user(db, role="finance"))
    booking = await db.get(Booking, w.booking.id)
    assert booking is not None
    booking.status = BookingStatus.CANCELLED
    await db.commit()
    r = await client.post(
        f"{ORDERS}/{oid}/mark-paid", json={"reference": "UTR9", "amount_minor": DEPOSIT_INR}, headers=fh
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "target_not_payable"
    order = await db.get(PaymentOrder, uuid.UUID(oid))
    assert order is not None
    order.status = OrderStatus.CANCELLED
    await db.commit()
    r = await client.post(
        f"{ORDERS}/{oid}/mark-paid", json={"reference": "UTR9", "amount_minor": DEPOSIT_INR}, headers=fh
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "order_not_open"


def test_bank_reference_normalisation():
    assert service.normalize_bank_reference(" utr 12 34\t") == "UTR1234"
