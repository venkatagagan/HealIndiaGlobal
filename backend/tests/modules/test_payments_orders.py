"""Payment orders: amount derivation, FX snapshot, idempotency, scoping, mock/bank-transfer capture paths."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.core.enums import InstallmentStatus, OrderStatus, PaymentStatus
from app.models import Booking, Installment, Invoice, Payment, PaymentOrder
from app.modules.payments import service
from tests.factories import create_agent, create_patient, create_user
from tests.modules.payments_helpers import (
    DEPOSIT_INR,
    TOTAL_INR,
    EventRecorder,
    gateway_keys_fixture,  # noqa: F401
    make_document,
    make_world,
    recorder_fixture,  # noqa: F401
)

ORDERS = "/api/v1/payments/orders"


def _deposit_body(booking_id: uuid.UUID, gateway: str = "mock", **extra: object) -> dict[str, object]:
    return {"booking_id": str(booking_id), "purpose": "booking_deposit", "gateway": gateway, **extra}


async def test_deposit_amount_is_derived_server_side_with_fx_snapshot(db, client, auth_headers):
    w = await make_world(db)
    r = await client.post(ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(w.patient_user))
    assert r.status_code == 201, r.text
    body = r.json()
    order = body["order"]
    assert body["gateway"] == "mock"
    assert order["purpose"] == "booking_deposit"
    assert order["status"] == "created"
    assert order["currency"] == "USD"  # patient preferred currency
    assert order["base_currency"] == "INR"
    assert order["base_amount_minor"] == DEPOSIT_INR  # exact INR equivalent of the booking deposit
    assert order["amount_minor"] == 90909  # 80,000 INR / 88 INR per USD, half-up
    assert Decimal(str(order["fx_rate"])) == Decimal("88")
    assert body["mock"]["complete_url"] == f"/api/v1/payments/mock/{order['id']}/complete"
    assert body["razorpay"] is None and body["stripe"] is None
    expires = datetime.fromisoformat(order["expires_at"])
    assert timedelta(minutes=29) < expires - datetime.now(UTC) <= timedelta(minutes=30)

    row = await db.get(PaymentOrder, uuid.UUID(order["id"]))
    assert row is not None and row.meta["booking_amount_minor"] == DEPOSIT_INR


async def test_explicit_currency_and_balance_purpose(db, client, auth_headers):
    w = await make_world(db)
    w.booking.amount_paid_minor = DEPOSIT_INR
    w.booking.status = "confirmed"
    await db.commit()
    r = await client.post(
        ORDERS,
        json={
            "booking_id": str(w.booking.id),
            "purpose": "booking_balance",
            "gateway": "mock",
            "currency": "inr",
        },
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 201, r.text
    order = r.json()["order"]
    assert order["currency"] == "INR"
    assert order["amount_minor"] == TOTAL_INR - DEPOSIT_INR
    assert order["base_amount_minor"] == TOTAL_INR - DEPOSIT_INR
    # deposit is no longer payable once confirmed
    r = await client.post(ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(w.patient_user))
    assert r.status_code == 400 and r.json()["error"]["code"] == "deposit_not_applicable"


async def test_client_supplied_amount_is_rejected(db, client, auth_headers):
    w = await make_world(db)
    r = await client.post(
        ORDERS, json=_deposit_body(w.booking.id, amount_minor=1), headers=auth_headers(w.patient_user)
    )
    assert r.status_code == 422
    assert await db.scalar(select(func.count()).select_from(PaymentOrder)) == 0


async def test_nothing_due_and_unsupported_purpose(db, client, auth_headers):
    w = await make_world(db)
    w.booking.amount_paid_minor = TOTAL_INR
    await db.commit()
    r = await client.post(
        ORDERS,
        json={"booking_id": str(w.booking.id), "purpose": "booking_full", "gateway": "mock"},
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "nothing_due"
    r = await client.post(
        ORDERS,
        json={"booking_id": str(w.booking.id), "purpose": "service", "gateway": "mock"},
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "unsupported_purpose"


async def test_idempotency_key_returns_same_order(db, client, auth_headers):
    w = await make_world(db)
    headers = {**auth_headers(w.patient_user), "Idempotency-Key": "checkout-123"}
    first = await client.post(ORDERS, json=_deposit_body(w.booking.id), headers=headers)
    second = await client.post(ORDERS, json=_deposit_body(w.booking.id), headers=headers)
    assert first.status_code == 201 and second.status_code == 201
    assert first.json()["order"]["id"] == second.json()["order"]["id"]
    assert await db.scalar(select(func.count()).select_from(PaymentOrder)) == 1
    other = await client.post(
        ORDERS, json=_deposit_body(w.booking.id, gateway="bank_transfer"), headers=headers
    )
    assert other.status_code == 409 and other.json()["error"]["code"] == "idempotency_key_reused"
    # SEC-007: without a key the same open order for the booking is reused (no second charge)...
    r = await client.post(ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(w.patient_user))
    assert r.json()["order"]["id"] == first.json()["order"]["id"]
    # ...and a different payment method supersedes (cancels) it: one open order per booking
    r = await client.post(
        ORDERS,
        json=_deposit_body(w.booking.id, gateway="bank_transfer"),
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 201 and r.json()["order"]["id"] != first.json()["order"]["id"]
    old = await db.get(PaymentOrder, uuid.UUID(first.json()["order"]["id"]), populate_existing=True)
    assert old is not None and old.status == OrderStatus.CANCELLED


async def test_disabled_gateway_and_mock_refused_in_production(db, client, auth_headers, monkeypatch):
    w = await make_world(db)
    monkeypatch.setattr(settings, "PAYMENT_GATEWAYS_ENABLED", ["mock"])
    r = await client.post(
        ORDERS,
        json=_deposit_body(w.booking.id, gateway="bank_transfer"),
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "gateway_unavailable"
    # razorpay enabled but without credentials is unavailable too
    monkeypatch.setattr(settings, "PAYMENT_GATEWAYS_ENABLED", ["razorpay"])
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "")
    r = await client.post(
        ORDERS, json=_deposit_body(w.booking.id, gateway="razorpay"), headers=auth_headers(w.patient_user)
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "gateway_unavailable"
    monkeypatch.setattr(settings, "PAYMENT_GATEWAYS_ENABLED", ["mock"])
    monkeypatch.setattr(settings, "ENV", "production")
    r = await client.post(ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(w.patient_user))
    assert r.status_code == 400 and r.json()["error"]["code"] == "gateway_unavailable"


async def test_scoping_and_idor(db, client, auth_headers):
    w = await make_world(db)
    stranger = await create_user(db, role="patient")
    await create_patient(db, user=stranger)
    r = await client.post(ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(stranger))
    assert r.status_code == 404

    created = await client.post(
        ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(w.patient_user)
    )
    order_id = created.json()["order"]["id"]
    assert (await client.get(f"{ORDERS}/{order_id}", headers=auth_headers(stranger))).status_code == 404
    listing = await client.get(ORDERS, headers=auth_headers(stranger))
    assert listing.status_code == 200 and listing.json()["total"] == 0
    r = await client.post(
        f"/api/v1/payments/mock/{order_id}/complete",
        json={"outcome": "success"},
        headers=auth_headers(stranger),
    )
    assert r.status_code == 404

    # the hospital of the booking sees (read-only) the order, another hospital does not
    r = await client.get(f"{ORDERS}/{order_id}", headers=auth_headers(w.hospital_user))
    assert r.status_code == 200
    r = await client.post(
        f"/api/v1/payments/mock/{order_id}/complete",
        json={"outcome": "success"},
        headers=auth_headers(w.hospital_user),
    )
    assert r.status_code == 404
    other_hospital_user = await create_user(db, role="hospital")
    assert (
        await client.get(f"{ORDERS}/{order_id}", headers=auth_headers(other_hospital_user))
    ).status_code == 404

    # a hospital user cannot create orders at all
    r = await client.post(ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(w.hospital_user))
    assert r.status_code == 403

    mine = await client.get(ORDERS, headers=auth_headers(w.patient_user))
    assert mine.json()["total"] == 1


async def test_managing_agent_can_pay_unrelated_agent_cannot(db, client, auth_headers):
    w = await make_world(db)
    agent = await create_agent(db)
    other_agent = await create_agent(db)
    w.patient.managed_by_agent_id = agent.id
    await db.commit()
    agent_user = await db.get(type(w.patient_user), agent.user_id)
    other_user = await db.get(type(w.patient_user), other_agent.user_id)
    r = await client.post(ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(agent_user))
    assert r.status_code == 201, r.text
    order = r.json()["order"]
    assert (await client.get(ORDERS, headers=auth_headers(agent_user))).json()["total"] == 1
    r = await client.post(ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(other_user))
    assert r.status_code == 404
    assert (await client.get(f"{ORDERS}/{order['id']}", headers=auth_headers(other_user))).status_code == 404
    # the patient sees the order the agent created on their behalf
    assert (
        await client.get(f"{ORDERS}/{order['id']}", headers=auth_headers(w.patient_user))
    ).status_code == 200


async def test_mock_complete_publishes_payment_captured(
    db, client, auth_headers, run_jobs, recorder: EventRecorder
):
    w = await make_world(db)
    created = await client.post(
        ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(w.patient_user)
    )
    order_id = created.json()["order"]["id"]
    r = await client.post(
        f"/api/v1/payments/mock/{order_id}/complete",
        json={"outcome": "success"},
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paid" and r.json()["paid_at"]

    captured = recorder.of("payment.captured")
    assert len(captured) == 1
    payload = captured[0]
    assert payload["order_id"] == order_id
    assert payload["booking_id"] == str(w.booking.id)
    assert payload["amount_minor"] == 90909 and payload["currency"] == "USD"
    assert payload["base_amount_minor"] == DEPOSIT_INR
    assert payload["booking_amount_minor"] == DEPOSIT_INR and payload["booking_currency"] == "INR"
    assert payload["gateway"] == "mock"

    payment = (await db.execute(select(Payment))).scalar_one()
    assert payment.status == PaymentStatus.CAPTURED and payment.base_amount_minor == DEPOSIT_INR

    # second completion is a no-op
    r = await client.post(
        f"/api/v1/payments/mock/{order_id}/complete",
        json={"outcome": "success"},
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 200
    assert len(recorder.of("payment.captured")) == 1
    assert await db.scalar(select(func.count()).select_from(Payment)) == 1

    # receipt invoice + PDF
    detail = (await client.get(f"{ORDERS}/{order_id}", headers=auth_headers(w.patient_user))).json()
    assert len(detail["payments"]) == 1 and detail["payments"][0]["status"] == "captured"
    invoices = (await client.get("/api/v1/payments/invoices", headers=auth_headers(w.patient_user))).json()
    assert invoices["total"] == 1
    invoice = invoices["items"][0]
    assert invoice["kind"] == "patient_receipt" and invoice["total_minor"] == 90909
    assert invoice["invoice_number"].startswith("HIG") and len(invoice["invoice_number"]) <= 16
    assert await run_jobs() >= 1
    pdf = await client.get(
        f"/api/v1/payments/invoices/{invoice['id']}/pdf", headers=auth_headers(w.patient_user)
    )
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
    assert "attachment" in pdf.headers["content-disposition"]

    stranger = await create_user(db, role="patient")
    assert (
        await client.get(f"/api/v1/payments/invoices/{invoice['id']}", headers=auth_headers(stranger))
    ).status_code == 404
    assert (await client.get("/api/v1/payments/invoices", headers=auth_headers(stranger))).json()[
        "total"
    ] == 0

    booking_id = w.booking.id
    db.expire_all()
    booking = await db.get(Booking, booking_id)
    assert booking is not None and booking.amount_paid_minor == DEPOSIT_INR  # applied by the cases handler


async def test_mock_failure_marks_order_failed(db, client, auth_headers, recorder: EventRecorder):
    w = await make_world(db)
    created = await client.post(
        ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(w.patient_user)
    )
    order_id = created.json()["order"]["id"]
    r = await client.post(
        f"/api/v1/payments/mock/{order_id}/complete",
        json={"outcome": "failure"},
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 200 and r.json()["status"] == "failed"
    assert [p["order_id"] for p in recorder.of("payment.failed")] == [order_id]
    assert recorder.of("payment.captured") == []
    # a later success on the same order (customer retried) is still captured
    r = await client.post(
        f"/api/v1/payments/mock/{order_id}/complete",
        json={"outcome": "success"},
        headers=auth_headers(w.patient_user),
    )
    assert r.json()["status"] == "paid"


async def test_mock_endpoint_hidden_in_production(db, client, auth_headers, monkeypatch):
    w = await make_world(db)
    created = await client.post(
        ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(w.patient_user)
    )
    order_id = created.json()["order"]["id"]
    monkeypatch.setattr(settings, "ENV", "production")
    r = await client.post(
        f"/api/v1/payments/mock/{order_id}/complete",
        json={"outcome": "success"},
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 404


async def test_bank_transfer_proof_and_finance_mark_paid(db, client, auth_headers, recorder: EventRecorder):
    w = await make_world(db)
    r = await client.post(
        ORDERS,
        json=_deposit_body(w.booking.id, gateway="bank_transfer", currency="INR"),
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    order_id = body["order"]["id"]
    assert body["bank_transfer"]["reference"] == body["order"]["order_number"]
    assert body["bank_transfer"]["ifsc"]
    assert body["order"]["amount_minor"] == DEPOSIT_INR

    doc = await make_document(db, w.patient_user, w.patient)
    foreign_doc = await make_document(db, await create_user(db, role="patient"))
    r = await client.post(
        f"{ORDERS}/{order_id}/bank-transfer-proof",
        json={"document_id": str(foreign_doc.id), "reference": "SWIFT123"},
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 404
    r = await client.post(
        f"{ORDERS}/{order_id}/bank-transfer-proof",
        json={"document_id": str(doc.id), "reference": "SWIFT123"},
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 200 and r.json()["status"] == "pending"

    finance = await create_user(db, role="finance")
    r = await client.post(
        f"{ORDERS}/{order_id}/mark-paid",
        json={"reference": "UTR1", "amount_minor": DEPOSIT_INR},
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 403
    r = await client.post(
        f"{ORDERS}/{order_id}/mark-paid",
        json={"reference": "UTR1", "amount_minor": DEPOSIT_INR - 1},
        headers=auth_headers(finance),
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "amount_mismatch"
    approve = f"{ORDERS}/{order_id}/mark-paid/approve"
    reviewed = {"reference": "UTR1", "amount_minor": DEPOSIT_INR}
    # maker: only a pending request, nothing captured yet
    assert (await client.post(approve, json=reviewed, headers=auth_headers(finance))).json()["error"][
        "code"
    ] == "no_pending_request"
    r = await client.post(
        f"{ORDERS}/{order_id}/mark-paid",
        json={"reference": "UTR1", "amount_minor": DEPOSIT_INR},
        headers=auth_headers(finance),
    )
    assert r.status_code == 200 and r.json()["status"] == "pending"
    assert r.json()["review_required"] == "mark_paid"
    assert recorder.of("payment.captured") == []
    listing = (await client.get(ORDERS, params={"review": "mark_paid"}, headers=auth_headers(finance))).json()
    assert [o["id"] for o in listing["items"]] == [order_id]
    # checker must be a different finance user
    r = await client.post(approve, json=reviewed, headers=auth_headers(finance))
    assert r.status_code == 403 and r.json()["error"]["code"] == "second_approver_required"
    assert (
        await client.post(approve, json=reviewed, headers=auth_headers(w.patient_user))
    ).status_code == 403
    checker = await create_user(db, role="finance")
    # SEC-063: the approval names the reviewed request; the approve body is required
    assert (await client.post(approve, json={}, headers=auth_headers(checker))).status_code == 422
    detail = (await client.get(f"{ORDERS}/{order_id}", headers=auth_headers(checker))).json()
    request_id = detail["mark_paid_request"]["id"]
    assert request_id
    # the maker replaces the request after the checker reviewed it: the stale approval is refused
    r = await client.post(
        f"{ORDERS}/{order_id}/mark-paid",
        json={"reference": "UTR-OTHER", "amount_minor": DEPOSIT_INR},
        headers=auth_headers(finance),
    )
    assert r.status_code == 200
    r = await client.post(approve, json={**reviewed, "request_id": request_id}, headers=auth_headers(checker))
    assert r.status_code == 409 and r.json()["error"]["code"] == "mark_paid_request_changed"
    r = await client.post(approve, json=reviewed, headers=auth_headers(checker))
    assert r.status_code == 409 and r.json()["error"]["code"] == "mark_paid_request_changed"
    assert recorder.of("payment.captured") == []
    # same reference again, but a new request: an old request id no longer matches
    r = await client.post(f"{ORDERS}/{order_id}/mark-paid", json=reviewed, headers=auth_headers(finance))
    assert r.status_code == 200
    r = await client.post(approve, json={**reviewed, "request_id": request_id}, headers=auth_headers(checker))
    assert r.status_code == 409
    detail = (await client.get(f"{ORDERS}/{order_id}", headers=auth_headers(checker))).json()
    r = await client.post(
        approve,
        json={**reviewed, "request_id": detail["mark_paid_request"]["id"]},
        headers=auth_headers(checker),
    )
    assert r.status_code == 200 and r.json()["status"] == "paid" and r.json()["review_required"] is None
    assert recorder.of("payment.captured")[0]["base_amount_minor"] == DEPOSIT_INR
    r = await client.post(
        f"{ORDERS}/{order_id}/mark-paid",
        json={"reference": "UTR1", "amount_minor": DEPOSIT_INR},
        headers=auth_headers(finance),
    )
    assert r.status_code == 409
    detail = (await client.get(f"{ORDERS}/{order_id}", headers=auth_headers(finance))).json()
    assert detail["bank_transfer_proof"]["reference"] == "SWIFT123"
    assert detail["payments"][0]["method"] == "bank_transfer"
    assert detail["mark_paid_request"]["status"] == "approved"
    assert detail["mark_paid_request"]["requested_by"] == str(finance.id)
    assert detail["mark_paid_request"]["decided_by"] == str(checker.id)
    patient_view = (await client.get(f"{ORDERS}/{order_id}", headers=auth_headers(w.patient_user))).json()
    assert patient_view["mark_paid_request"] is None


async def test_expire_stale_orders(db, client, auth_headers):
    w = await make_world(db)
    created = await client.post(
        ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(w.patient_user)
    )
    order_id = uuid.UUID(created.json()["order"]["id"])
    assert await service.expire_stale_orders(db) == 0
    assert await service.expire_stale_orders(db, now=datetime.now(UTC) + timedelta(minutes=31)) == 1
    await db.commit()
    db.expire_all()
    order = await db.get(PaymentOrder, order_id)
    assert order is not None and order.status == OrderStatus.EXPIRED


# ----------------------------------------------------------------------------------------------- installments
def test_installment_plan_last_absorbs_rounding():
    start = datetime(2026, 1, 31, tzinfo=UTC).date()
    plan = service.installment_plan(1_000_001, 200_000, 3, start)
    assert [amount for _, amount in plan] == [200_000, 266_667, 266_667, 266_667]
    assert sum(amount for _, amount in plan) == 1_000_001
    assert [d.isoformat() for d, _ in plan] == ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]
    plan = service.installment_plan(1_000_000, 200_000, 3, start)
    assert [amount for _, amount in plan] == [200_000, 266_666, 266_666, 266_668]


async def test_booking_created_builds_installments_and_installment_payment(
    db, client, auth_headers, recorder: EventRecorder
):
    from app.core.events import publish

    w = await make_world(db, payment_option="installments", installment_months=6)
    booking_id = w.booking.id
    ph = auth_headers(w.patient_user)
    await publish(db, "booking.created", {"booking_id": str(w.booking.id)})
    await publish(db, "booking.created", {"booking_id": str(w.booking.id)})  # idempotent
    await db.commit()
    r = await client.get(f"/api/v1/payments/bookings/{w.booking.id}/installments", headers=ph)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 7
    assert rows[0]["amount_minor"] == DEPOSIT_INR and rows[0]["seq"] == 1
    assert sum(row["amount_minor"] for row in rows) == TOTAL_INR
    assert len({row["amount_minor"] for row in rows[1:-1]}) == 1

    stranger = await create_user(db, role="patient")
    r = await client.get(
        f"/api/v1/payments/bookings/{w.booking.id}/installments", headers=auth_headers(stranger)
    )
    assert r.status_code == 404

    second = rows[1]
    r = await client.post(
        ORDERS,
        json={"installment_id": second["id"], "purpose": "installment", "gateway": "mock", "currency": "INR"},
        headers=ph,
    )
    assert r.status_code == 201, r.text
    order = r.json()["order"]
    assert order["amount_minor"] == second["amount_minor"]
    assert order["installment_id"] == second["id"] and order["booking_id"] == str(w.booking.id)
    r = await client.post(
        f"/api/v1/payments/mock/{order['id']}/complete",
        json={"outcome": "success"},
        headers=ph,
    )
    assert r.status_code == 200
    assert recorder.of("payment.captured")[0]["installment_id"] == second["id"]
    db.expire_all()
    inst = await db.get(Installment, uuid.UUID(second["id"]))
    assert inst is not None and inst.status == InstallmentStatus.PAID
    r = await client.post(
        ORDERS,
        json={"installment_id": second["id"], "purpose": "installment", "gateway": "mock"},
        headers=ph,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "installment_not_due"
    # installment ids are only accepted with purpose=installment
    r = await client.post(
        ORDERS,
        json={**_deposit_body(booking_id), "installment_id": rows[2]["id"]},
        headers=ph,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_purpose"


async def test_overdue_installments(db):
    w = await make_world(db, payment_option="installments", installment_months=2)
    await service.create_installment_schedule(db, w.booking.id)
    await db.commit()
    assert (
        await service.mark_overdue_installments(db, today=datetime.now(UTC).date() + timedelta(days=45)) == 2
    )
    await db.commit()
    statuses = (await db.execute(select(Installment.status).order_by(Installment.seq))).scalars().all()
    assert statuses == [InstallmentStatus.OVERDUE, InstallmentStatus.OVERDUE, InstallmentStatus.DUE]


@pytest.mark.parametrize("currency", ["KWD"])
async def test_three_decimal_currency_rounding_for_card_gateways(db, client, auth_headers, currency):
    from app.core.enums import PaymentGateway

    assert service._round_for_gateway(12_345, currency, PaymentGateway.RAZORPAY) == 12_350
    assert service._round_for_gateway(12_345, currency, PaymentGateway.MOCK) == 12_345
    assert service._round_for_gateway(12_345, "USD", PaymentGateway.STRIPE) == 12_345


async def test_invoice_count_is_one_per_payment(db, client, auth_headers):
    w = await make_world(db)
    created = await client.post(
        ORDERS, json=_deposit_body(w.booking.id), headers=auth_headers(w.patient_user)
    )
    order_id = created.json()["order"]["id"]
    for _ in range(2):
        await client.post(
            f"/api/v1/payments/mock/{order_id}/complete",
            json={"outcome": "success"},
            headers=auth_headers(w.patient_user),
        )
    assert await db.scalar(select(func.count()).select_from(Invoice)) == 1


async def test_consultation_fee_uses_doctor_fee_and_blocks_double_payment(db, client, auth_headers):
    from app.models import Consultation
    from tests.factories import create_doctor, create_specialty

    w = await make_world(db)
    specialty = await create_specialty(db)
    doctor = await create_doctor(db, w.hospital, specialty, consultation_fee_minor=2_500_00, currency="INR")
    consultation = Consultation(case_id=w.case.id, doctor_id=doctor.id, patient_id=w.patient.id)
    db.add(consultation)
    await db.commit()
    ph = auth_headers(w.patient_user)
    body = {"consultation_id": str(consultation.id), "purpose": "consultation_fee", "gateway": "mock"}
    r = await client.post(ORDERS, json={**body, "currency": "INR"}, headers=ph)
    assert r.status_code == 201, r.text
    order = r.json()["order"]
    assert order["amount_minor"] == 2_500_00 and order["consultation_id"] == str(consultation.id)
    assert order["booking_id"] is None and order["case_id"] == str(w.case.id)
    r = await client.post(
        f"/api/v1/payments/mock/{order['id']}/complete", json={"outcome": "success"}, headers=ph
    )
    assert r.json()["status"] == "paid"
    r = await client.post(ORDERS, json=body, headers=ph)
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_paid"
    stranger = await create_user(db, role="patient")
    await create_patient(db, user=stranger)
    r = await client.post(ORDERS, json=body, headers=auth_headers(stranger))
    assert r.status_code == 404


async def test_bank_transfer_proof_links_document_to_order_case(db, client, auth_headers):
    """A receipt uploaded without ``case_id`` is linked to the order's case when submitted, and finance finds
    it through ``GET /payments/orders/{id}/proof-documents`` (regression: drawer showed "No proof")."""
    from app.models import Document

    w = await make_world(db)
    stale = await make_document(db, w.patient_user, w.patient)  # uploaded before the order: not its proof
    stale.created_at = datetime.now(UTC) - timedelta(days=2)
    await db.commit()
    r = await client.post(
        ORDERS,
        json=_deposit_body(w.booking.id, gateway="bank_transfer", currency="INR"),
        headers=auth_headers(w.patient_user),
    )
    order_id = r.json()["order"]["id"]
    await db.commit()
    doc = await make_document(db, w.patient_user, w.patient)
    assert doc.case_id is None
    r = await client.post(
        f"{ORDERS}/{order_id}/bank-transfer-proof",
        json={"document_id": str(doc.id), "reference": "UTR-42"},
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 200, r.text
    linked = await db.get(Document, doc.id, populate_existing=True)
    assert linked is not None and linked.case_id == w.case.id and linked.patient_id == w.patient.id

    finance = await create_user(db, role="finance")
    url = f"{ORDERS}/{order_id}/proof-documents"
    assert (await client.get(url, headers=auth_headers(w.patient_user))).status_code == 403
    r = await client.get(url, headers=auth_headers(finance))
    assert r.status_code == 200, r.text
    assert [d["id"] for d in r.json()] == [str(doc.id)]
    detail = (await client.get(f"{ORDERS}/{order_id}", headers=auth_headers(finance))).json()
    assert detail["bank_transfer_proof"]["document_id"] == str(doc.id)


async def test_proof_documents_fall_back_to_unlinked_patient_uploads(db, client, auth_headers):
    """Proofs uploaded after the order but never linked to a case (or submitted) still show for finance;
    a proof already submitted against another order of the same patient does not."""
    w = await make_world(db)
    finance = await create_user(db, role="finance")
    r = await client.post(
        ORDERS,
        json=_deposit_body(w.booking.id, gateway="bank_transfer", currency="INR"),
        headers=auth_headers(w.patient_user),
    )
    order_id = r.json()["order"]["id"]
    await db.commit()  # end the test session's open transaction so the upload's now() follows the order
    loose = await make_document(db, w.patient_user, w.patient)  # case_id missing, not submitted
    stranger = await make_document(db, await create_user(db, role="patient"), await create_patient(db))
    r = await client.get(f"{ORDERS}/{order_id}/proof-documents", headers=auth_headers(finance))
    assert r.status_code == 200, r.text
    ids = [d["id"] for d in r.json()]
    assert ids == [str(loose.id)] and str(stranger.id) not in ids

    # the same document submitted against a second order is no longer offered for the first one
    other = PaymentOrder(
        order_number=f"PO-T-{uuid.uuid4().hex[:8]}",
        purpose="booking_balance",
        status=OrderStatus.PENDING,
        gateway="bank_transfer",
        payer_user_id=w.patient_user.id,
        patient_id=w.patient.id,
        case_id=w.case.id,
        booking_id=w.booking.id,
        amount_minor=1000,
        currency="INR",
        base_amount_minor=1000,
        base_currency="INR",
        fx_rate=Decimal("1"),
        meta={"bank_transfer_proof": {"document_id": str(loose.id), "reference": "X"}},
    )
    db.add(other)
    await db.commit()
    r = await client.get(f"{ORDERS}/{order_id}/proof-documents", headers=auth_headers(finance))
    assert r.json() == []
    r = await client.get(f"{ORDERS}/{other.id}/proof-documents", headers=auth_headers(finance))
    assert [d["id"] for d in r.json()] == [str(loose.id)]
