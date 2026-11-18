"""SEC-010: bank-transfer refunds are not processed instantly. After approval they wait in
``awaiting_payout``; one finance user records the payout (bank reference / UTR, value date, optional proof)
and a DIFFERENT finance user confirms it - only then is the refund ``processed`` (``refund.processed``,
ledger posting). Also covers ``refund.requested`` (patient + finance notifications)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import select

from app.core.enums import PaymentStatus, RefundStatus
from app.models import AuditLog, Notification, Payment, Refund
from tests.factories import create_user
from tests.modules.payments_helpers import (
    DEPOSIT_INR,
    EventRecorder,
    make_document,
    make_world,
    recorder_fixture,  # noqa: F401
)

ORDERS = "/api/v1/payments/orders"
REFUNDS = "/api/v1/payments/refunds"


async def _paid_bank_transfer(db, client, auth_headers, w) -> str:
    r = await client.post(
        ORDERS,
        json={
            "booking_id": str(w.booking.id),
            "purpose": "booking_deposit",
            "gateway": "bank_transfer",
            "currency": "INR",
        },
        headers=auth_headers(w.patient_user),
    )
    assert r.status_code == 201, r.text
    order_id = r.json()["order"]["id"]
    maker, checker = await create_user(db, role="finance"), await create_user(db, role="finance")
    reviewed = {"reference": f"UTR-IN-{uuid.uuid4().hex[:8]}", "amount_minor": DEPOSIT_INR}
    r = await client.post(f"{ORDERS}/{order_id}/mark-paid", json=reviewed, headers=auth_headers(maker))
    assert r.status_code == 200, r.text
    r = await client.post(
        f"{ORDERS}/{order_id}/mark-paid/approve", json=reviewed, headers=auth_headers(checker)
    )
    assert r.status_code == 200 and r.json()["status"] == "paid", r.text
    return order_id


async def test_bank_transfer_refund_waits_for_a_confirmed_payout(
    db, client, auth_headers, run_jobs, recorder: EventRecorder
):
    w = await make_world(db)
    order_id = await _paid_bank_transfer(db, client, auth_headers, w)
    finance_a = await create_user(db, role="finance")
    finance_b = await create_user(db, role="finance")
    fa, fb, ph = auth_headers(finance_a), auth_headers(finance_b), auth_headers(w.patient_user)
    patient_user_id = w.patient_user.id
    doc = await make_document(db, finance_a)
    a_id, b_id, doc_id = finance_a.id, finance_b.id, doc.id

    r = await client.post(
        REFUNDS, json={"order_id": order_id, "amount_minor": 10_000, "reason": "Goodwill"}, headers=fa
    )
    assert r.status_code == 201, r.text
    refund_id = r.json()["id"]
    # refund.requested: published, the patient is told, and other finance users are asked to approve
    requested = recorder.of("refund.requested")
    assert [e["refund_id"] for e in requested] == [refund_id] and requested[0]["status"] == "requested"
    kinds = {
        (n.user_id, n.kind)
        for n in (await db.execute(select(Notification).where(Notification.kind.like("refund.%")))).scalars()
    }
    assert (patient_user_id, "refund.requested") in kinds
    assert (b_id, "refund.approval_needed") in kinds
    assert (a_id, "refund.approval_needed") not in kinds

    r = await client.post(f"{REFUNDS}/{refund_id}/approve", headers=fa)
    assert r.status_code == 200
    await run_jobs()

    # no instant "processed" with a synthetic id: the refund waits for a manual payout
    db.expire_all()
    row = await db.get(Refund, uuid.UUID(refund_id))
    assert row is not None and row.status == RefundStatus.AWAITING_PAYOUT and row.gateway_refund_id is None
    assert recorder.of("refund.processed") == []
    queue = (await client.get(REFUNDS, params={"status": "awaiting_payout"}, headers=fa)).json()
    assert [i["id"] for i in queue["items"]] == [refund_id]
    counts = (await client.get(f"{REFUNDS}/status-counts", headers=fa)).json()
    assert counts["counts"]["awaiting_payout"] == 1
    # the in-flight amount still counts against the refundable amount
    r = await client.post(
        REFUNDS, json={"order_id": order_id, "amount_minor": DEPOSIT_INR, "reason": "All"}, headers=fa
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "refund_exceeds_refundable"

    # nothing recorded yet: confirm refused; patients cannot record
    payout = f"{REFUNDS}/{refund_id}/payout"
    r = await client.post(f"{payout}/confirm", json={"reference": "X"}, headers=fb)
    assert r.status_code == 400 and r.json()["error"]["code"] == "no_payout_recorded"
    body = {"reference": "utr 0001", "paid_on": date.today().isoformat(), "note": "NEFT"}
    assert (await client.post(payout, json=body, headers=ph)).status_code == 403
    future = {**body, "paid_on": (date.today() + timedelta(days=5)).isoformat()}
    r = await client.post(payout, json=future, headers=fa)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_payout_date"

    # maker records the payout (with a proof document)
    r = await client.post(payout, json={**body, "proof_document_id": str(doc_id)}, headers=fa)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["status"] == "awaiting_payout" and out["payout_reference"] == "UTR0001"
    assert out["payout_recorded_by"] == str(a_id) and out["payout_recorded_by_name"]
    assert recorder.of("refund.processed") == []
    # the maker cannot confirm their own payout
    r = await client.post(f"{payout}/confirm", json={"reference": "UTR0001"}, headers=fa)
    assert r.status_code == 403 and r.json()["error"]["code"] == "second_approver_required"
    # the checker must confirm the reference that is recorded
    r = await client.post(f"{payout}/confirm", json={"reference": "UTR0002"}, headers=fb)
    assert r.status_code == 409 and r.json()["error"]["code"] == "payout_changed"
    # checker rejects: the record is cleared, the refund keeps waiting
    r = await client.post(f"{payout}/reject", json={"reason": "Not on the statement"}, headers=fb)
    assert r.status_code == 200 and r.json()["payout_reference"] is None
    assert r.json()["status"] == "awaiting_payout"
    r = await client.post(payout, json=body, headers=fa)
    assert r.status_code == 200
    r = await client.post(f"{payout}/confirm", json={"reference": "UTR 0001"}, headers=fb)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["status"] == "processed" and out["payout_confirmed_by"] == str(b_id)
    assert out["gateway_refund_id"] == "UTR0001"

    processed = recorder.of("refund.processed")
    assert [e["refund_id"] for e in processed] == [refund_id]
    db.expire_all()
    payment = (await db.execute(select(Payment).where(Payment.order_id == uuid.UUID(order_id)))).scalar_one()
    assert payment.status == PaymentStatus.PARTIALLY_REFUNDED and payment.amount_refunded_minor == 10_000
    # cannot be confirmed twice
    r = await client.post(f"{payout}/confirm", json={"reference": "UTR0001"}, headers=fb)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_refund_state"
    actions = set(
        (await db.execute(select(AuditLog.action).where(AuditLog.entity_id == refund_id))).scalars()
    )
    assert {
        "refund.awaiting_payout",
        "refund.payout_recorded",
        "refund.payout_rejected",
        "refund.payout_confirmed",
        "refund.processed",
    } <= actions


async def test_payout_reference_settles_one_refund_only(db, client, auth_headers, run_jobs):
    w = await make_world(db)
    order_id = await _paid_bank_transfer(db, client, auth_headers, w)
    finance = await create_user(db, role="finance")
    fh = auth_headers(finance)
    ids = []
    for _ in range(2):
        r = await client.post(
            REFUNDS, json={"order_id": order_id, "amount_minor": 1_000, "reason": "Part"}, headers=fh
        )
        assert r.status_code == 201
        ids.append(r.json()["id"])
        assert (await client.post(f"{REFUNDS}/{ids[-1]}/approve", headers=fh)).status_code == 200
    await run_jobs()
    body = {"reference": "UTR-SAME", "paid_on": date.today().isoformat()}
    assert (await client.post(f"{REFUNDS}/{ids[0]}/payout", json=body, headers=fh)).status_code == 200
    r = await client.post(f"{REFUNDS}/{ids[1]}/payout", json={**body, "reference": "utr-same"}, headers=fh)
    assert r.status_code == 409 and r.json()["error"]["code"] == "reference_already_used"
