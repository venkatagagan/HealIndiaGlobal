"""Shared fixtures/builders for the payments tests."""

from __future__ import annotations

import hashlib
import hmac
import json
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import events as events_module
from app.core.config import settings
from app.core.storage import make_key
from app.models import Booking, Case, Document, Hospital, PatientProfile, User
from tests.factories import (
    create_booking,
    create_case,
    create_fx_rates,
    create_hospital,
    create_patient,
    create_user,
)

RAZORPAY_KEY_ID = "rzp_test_key"
RAZORPAY_KEY_SECRET = "rzp_test_secret_value"
RAZORPAY_WEBHOOK_SECRET = "rzp_webhook_secret_value"
STRIPE_SECRET_KEY = "sk_test_value"
STRIPE_PUBLISHABLE_KEY = "pk_test_value"
STRIPE_WEBHOOK_SECRET = "whsec_test_value"

TOTAL_INR = 4_00_000_00
DEPOSIT_INR = 80_000_00


@dataclass
class World:
    patient_user: User
    patient: PatientProfile
    hospital_user: User
    hospital: Hospital
    case: Case
    booking: Booking


async def make_world(db: AsyncSession, **booking_fields: Any) -> World:
    await create_fx_rates(db)
    patient_user = await create_user(db, role="patient")
    patient = await create_patient(db, user=patient_user, preferred_currency="USD")
    hospital_user = await create_user(db, role="hospital")
    hospital = await create_hospital(db, owner=hospital_user)
    case = await create_case(db, patient, hospital, status="accepted")
    booking = await create_booking(db, case, total_minor=TOTAL_INR, **booking_fields)
    return World(patient_user, patient, hospital_user, hospital, case, booking)


async def make_document(db: AsyncSession, owner: User, patient: PatientProfile | None = None) -> Document:
    doc = Document(
        owner_user_id=owner.id,
        patient_id=patient.id if patient else None,
        kind="payment_proof",
        file_name="swift.pdf",
        content_type="application/pdf",
        size_bytes=1234,
        storage_key=make_key("documents", "pdf"),
        sha256=hashlib.sha256(b"proof").hexdigest(),
    )
    db.add(doc)
    await db.commit()
    return doc


def razorpay_signature(secret: str, message: str | bytes) -> str:
    data = message.encode() if isinstance(message, str) else message
    return hmac.new(secret.encode(), data, hashlib.sha256).hexdigest()


def razorpay_payment_entity(
    payment_id: str, order_id: str, amount: int, currency: str, status: str = "captured"
) -> dict[str, Any]:
    return {
        "id": payment_id,
        "entity": "payment",
        "amount": amount,
        "currency": currency,
        "status": status,
        "order_id": order_id,
        "method": "card",
        "captured": status == "captured",
        "fee": 2360,
        "tax": 360,
        "email": "someone@example.test",
        "contact": "+10000000000",
        "error_code": None if status != "failed" else "BAD_REQUEST_ERROR",
        "error_description": None if status != "failed" else "Card declined",
        "notes": {},
    }


def json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":")).encode()


@pytest.fixture(name="gateway_keys")
def gateway_keys_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", RAZORPAY_KEY_ID)
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", RAZORPAY_KEY_SECRET)
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", RAZORPAY_WEBHOOK_SECRET)
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", STRIPE_SECRET_KEY)
    monkeypatch.setattr(settings, "STRIPE_PUBLISHABLE_KEY", STRIPE_PUBLISHABLE_KEY)
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", STRIPE_WEBHOOK_SECRET)
    monkeypatch.setattr(settings, "PAYMENT_GATEWAYS_ENABLED", ["mock", "bank_transfer", "razorpay", "stripe"])


class EventRecorder:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    def of(self, name: str) -> list[dict[str, Any]]:
        return [payload for event, payload in self.events if event == name]


@pytest.fixture(name="recorder")
def recorder_fixture() -> Iterator[EventRecorder]:
    """Test subscriber for the payments events; removed again after the test."""
    rec = EventRecorder()
    names = ("payment.captured", "payment.failed", "refund.processed")
    handlers = []
    for name in names:

        async def _handler(db: AsyncSession, payload: dict[str, Any], _name: str = name) -> None:
            rec.events.append((_name, payload))

        _handler.__qualname__ = f"payments_test_recorder_{name.replace('.', '_')}"
        events_module.subscribe(name)(_handler)
        handlers.append((name, _handler))
    try:
        yield rec
    finally:
        for name, handler in handlers:
            subs = events_module._subscribers.get(name, [])
            if handler in subs:
                subs.remove(handler)
