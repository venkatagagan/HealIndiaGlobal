"""Security controls from the 2026-11-09 review follow-up: SEC-011 (bank account maker-checker), SEC-015
(former case parties), SEC-018 (unpaid booking hold), SEC-021 (AI daily quotas), SEC-038 (no PHI in AI
validation errors)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError
from sqlalchemy import delete, select

from app.core import ai_quota
from app.core.config import settings
from app.core.settings_store import get_setting
from app.models import AuditLog, Booking, ConversationParticipant, HospitalMember, Notification
from app.modules.cases.bookings import expire_unpaid_bookings
from app.modules.screening.ai.claude import _safe_error
from tests.factories import create_booking
from tests.modules.messaging_helpers import API, build_case_world

NEW_ACCOUNT = {
    "beneficiary_name": "Heal India Global Pvt Ltd",
    "bank_name": "State Bank",
    "account_number": "123456789012",
    "ifsc": "sbin0001234",
    "swift": "SBININBB",
    "iban": None,
}


# ------------------------------------------------------------------------------------------------ SEC-011
async def test_bank_transfer_details_need_a_second_finance_approver(client, db, make_user, auth_headers):
    maker = await make_user(role="finance")
    checker = await make_user(role="finance")
    mh, ch = auth_headers(maker), auth_headers(checker)
    url = f"{API}/admin/settings/bank_transfer_details"
    for bad in (
        {**NEW_ACCOUNT, "ifsc": "BAD"},
        {**NEW_ACCOUNT, "account_number": "12"},
        {**NEW_ACCOUNT, "extra": "x"},
        {**NEW_ACCOUNT, "ifsc": None, "swift": None},
    ):
        r = await client.put(url, json={"value": bad}, headers=mh)
        assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_setting", bad

    before = await get_setting(db, "bank_transfer_details")
    r = await client.put(url, json={"value": NEW_ACCOUNT}, headers=mh)
    assert r.status_code == 200, r.text
    pending = r.json()["pending_change"]
    assert pending["value"]["ifsc"] == "SBIN0001234" and pending["requested_by"] == str(maker.id)
    assert r.json()["value"] == before  # nothing applied yet
    assert await get_setting(db, "bank_transfer_details") == before
    notes = (await db.execute(select(Notification).where(Notification.user_id == checker.id))).scalars().all()
    assert [n.kind for n in notes] == ["settings.change"]

    approve = f"{url}/approve"
    r = await client.post(approve, json={"request_id": pending["id"]}, headers=mh)
    assert r.status_code == 403 and r.json()["error"]["code"] == "second_approver_required"
    r = await client.post(approve, json={"request_id": "00000000-0000-7000-8000-000000000000"}, headers=ch)
    assert r.status_code == 409
    r = await client.post(approve, json={"request_id": pending["id"]}, headers=ch)
    assert r.status_code == 200, r.text
    assert r.json()["value"]["account_number"] == "123456789012" and r.json()["pending_change"] is None
    # the audit row keeps a masked number and a keyed fingerprint instead of "[REDACTED]"
    log = (
        await db.execute(
            select(AuditLog).where(
                AuditLog.action == "settings.update", AuditLog.entity_id == "bank_transfer_details"
            )
        )
    ).scalar_one()
    assert log.after["value"]["account_last4"] == "9012"
    assert len(log.after["value"]["account_fingerprint"]) == 32
    assert "123456789012" not in str(log.after)
    assert log.actor_user_id == checker.id


# ------------------------------------------------------------------------------------------------ SEC-015
async def test_removed_hospital_member_loses_case_chat(db, client, auth_headers):
    world = await build_case_world(db)
    r = await client.post(
        f"{API}/conversations", json={"case_id": str(world.case.id)}, headers=auth_headers(world.patient_user)
    )
    conv = r.json()
    coord_h = auth_headers(world.coordinator_member)
    assert (
        await client.get(f"{API}/conversations/{conv['id']}/messages", headers=coord_h)
    ).status_code == 200
    await db.execute(delete(HospitalMember).where(HospitalMember.user_id == world.coordinator_member.id))
    await db.commit()

    # the participant row alone no longer grants access, and the chat is no longer listed
    r = await client.get(f"{API}/conversations/{conv['id']}/messages", headers=coord_h)
    assert r.status_code == 404
    listed = (await client.get(f"{API}/conversations", headers=coord_h)).json()
    assert all(c["id"] != conv["id"] for c in listed)
    # a new message is not fanned out to them: the participant row is pruned before delivery
    r = await client.post(
        f"{API}/conversations/{conv['id']}/messages",
        json={"body": "Post-op plan"},
        headers=auth_headers(world.patient_user),
    )
    assert r.status_code == 201, r.text
    remaining = set(
        (
            await db.execute(
                select(ConversationParticipant.user_id).where(
                    ConversationParticipant.conversation_id == conv["id"]
                )
            )
        ).scalars()
    )
    assert world.coordinator_member.id not in remaining and world.owner.id in remaining
    notes = (
        await db.execute(select(Notification).where(Notification.user_id == world.coordinator_member.id))
    ).scalars()
    assert all(n.kind != "message.created" for n in notes)


# ------------------------------------------------------------------------------------------------ SEC-018
async def test_unpaid_booking_releases_its_slot_after_the_hold(db):
    world = await build_case_world(db, status="accepted")
    booking = await create_booking(
        db, world.case, admission_date=datetime.now(UTC).date() + timedelta(days=30)
    )
    booking_id = booking.id
    assert await expire_unpaid_bookings(db) == 0
    assert await expire_unpaid_bookings(db, now=datetime.now(UTC) + timedelta(hours=25)) == 1
    await db.commit()
    row = await db.get(Booking, booking_id, populate_existing=True)
    assert row is not None and str(row.status) in ("cancelled", "BookingStatus.CANCELLED")


# ------------------------------------------------------------------------------------------------ SEC-021
async def test_ai_daily_quota_per_user_and_global_budget(monkeypatch: pytest.MonkeyPatch):
    from app.core.errors import RateLimited
    from app.core.rate_limit import reset_rate_limits

    await reset_rate_limits()
    monkeypatch.setattr(settings, "AI_USER_DAILY_LIMIT_DOCAI", 2)
    monkeypatch.setattr(settings, "AI_GLOBAL_DAILY_LIMIT", 3)
    await ai_quota.take_user_quota("docai", "user-a")
    await ai_quota.take_user_quota("docai", "user-a")
    with pytest.raises(RateLimited) as exc:
        await ai_quota.take_user_quota("docai", "user-a")
    assert exc.value.code == "ai_daily_limit"
    await ai_quota.take_user_quota("docai", "user-b")  # other users are not affected
    assert [await ai_quota.take_global_budget() for _ in range(4)] == [True, True, True, False]
    with pytest.raises(RateLimited) as exc:
        await ai_quota.require_global_budget()
    assert exc.value.code == "ai_unavailable"
    await reset_rate_limits()


async def test_docai_endpoint_enforces_the_daily_quota(client, db, make_user, auth_headers, monkeypatch):
    from app.core.rate_limit import reset_rate_limits

    await reset_rate_limits()
    monkeypatch.setattr(settings, "AI_USER_DAILY_LIMIT_DOCAI", 1)
    patient = await make_user(role="patient")
    h = auth_headers(patient)
    body: dict[str, Any] = {"document_ids": ["00000000-0000-7000-8000-000000000000"], "consent_ai": True}
    first = await client.post(f"{API}/documents/analyses", json=body, headers=h)
    assert first.status_code != 429
    r = await client.post(f"{API}/documents/analyses", json=body, headers=h)
    assert r.status_code == 429 and r.json()["error"]["code"] == "ai_daily_limit"
    await reset_rate_limits()


# ------------------------------------------------------------------------------------------------ SEC-038
def test_invalid_ai_output_error_never_contains_the_output():
    class Triage(BaseModel):
        urgency: int

    with pytest.raises(ValidationError) as exc:
        Triage.model_validate({"urgency": "patient has HIV and diabetes"})
    detail = _safe_error(exc.value)
    assert "HIV" not in detail and "urgency" in detail


# ------------------------------------------------------------------------------------------------ SEC-044
def test_commission_rates_are_capped():
    from app.core.errors import BadRequest
    from app.core.money import MAX_COMMISSION_BPS
    from app.core.settings_store import validate_setting
    from app.modules.admin.schemas import AdminAgentUpdateIn, AdminHospitalUpdateIn

    assert AdminHospitalUpdateIn(commission_rate_bps=MAX_COMMISSION_BPS).commission_rate_bps == 3000
    for model in (AdminHospitalUpdateIn, AdminAgentUpdateIn):
        with pytest.raises(ValidationError):
            model(commission_rate_bps=MAX_COMMISSION_BPS + 1)
    with pytest.raises(BadRequest):
        validate_setting("default_commission_bps", 9000)
    with pytest.raises(BadRequest):
        validate_setting("fx_rate_max_age_hours", 0)  # SEC-008: the staleness check cannot be disabled
