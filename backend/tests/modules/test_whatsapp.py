"""WhatsApp channel: template registry, opt-in with a verified phone, sending as a notification channel,
webhook (challenge, signature, statuses, STOP) and the admin status/log. The Meta Graph API is mocked with an
``httpx.MockTransport`` - nothing leaves the test process."""

from __future__ import annotations

import hashlib
import hmac
import json
import re
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.enums import ConsentKind, WhatsAppMessageStatus, WhatsAppOptInStatus
from app.models import Consent, WhatsAppMessage, WhatsAppOptIn
from app.modules.messaging import whatsapp
from app.modules.messaging.notifications import notify
from tests.modules.test_i18n import enable

PHONE = "+2348031234567"
APP_SECRET = "test-app-secret"  # noqa: S105 - test value
VERIFY_TOKEN = "test-verify-token"  # noqa: S105 - test value


class GraphMock:
    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []
        self.fail_with: tuple[int, dict[str, Any]] | None = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.requests.append({"url": str(request.url), "auth": request.headers.get("authorization"), **body})
        if self.fail_with is not None:
            status, payload = self.fail_with
            return httpx.Response(status, json=payload)
        return httpx.Response(200, json={"messages": [{"id": f"wamid.TEST{len(self.requests)}"}]})

    def last_code(self) -> str:
        sent = [r for r in self.requests if r["template"]["name"] == "hig_verification_code"]
        return sent[-1]["template"]["components"][0]["parameters"][0]["text"]


@pytest.fixture
def graph(monkeypatch: pytest.MonkeyPatch) -> Iterator[GraphMock]:
    mock = GraphMock()
    monkeypatch.setattr(settings, "WHATSAPP_PROVIDER", "meta")
    monkeypatch.setattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "1234567890")
    monkeypatch.setattr(settings, "WHATSAPP_ACCESS_TOKEN", "test-token")
    monkeypatch.setattr(settings, "WHATSAPP_APP_SECRET", APP_SECRET)
    monkeypatch.setattr(settings, "WHATSAPP_VERIFY_TOKEN", VERIFY_TOKEN)
    whatsapp.set_http_transport(httpx.MockTransport(mock.handler))
    try:
        yield mock
    finally:
        whatsapp.set_http_transport(None)


def _sign(raw: bytes) -> str:
    return "sha256=" + hmac.new(APP_SECRET.encode(), raw, hashlib.sha256).hexdigest()


async def _opt_in(client: Any, headers: dict[str, str], graph: GraphMock, run_jobs: Any) -> None:
    resp = await client.post(
        "/api/v1/me/whatsapp/verify", json={"phone": "+234 803 123 4567"}, headers=headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "pending"
    await run_jobs()
    resp = await client.post("/api/v1/me/whatsapp/confirm", json={"code": graph.last_code()}, headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "active"


# ----------------------------------------------------------------------------------------------- registry
def test_template_registry_is_complete() -> None:
    reg = whatsapp.registry()
    assert set(reg.languages) == {"en", "ar", "fr", "bn", "ru"}
    assert set(reg.name_fallback) == {"en", "ar", "fr", "bn", "ru"}
    names = [t.name for t in reg.templates]
    assert len(names) == len(set(names))
    for tpl in reg.templates:
        assert re.fullmatch(r"[a-z0-9_]{1,512}", tpl.name)
        assert tpl.category in ("UTILITY", "AUTHENTICATION")
        assert set(tpl.body) == {"en", "ar", "fr", "bn", "ru"}, tpl.name
        assert len(tpl.examples) == len(tpl.params), tpl.name
        for lng, text in tpl.body.items():
            found = sorted({int(n) for n in re.findall(r"\{\{(\d+)\}\}", text)})
            assert found == list(range(1, len(tpl.params) + 1)), (tpl.name, lng)
            if tpl.category == "UTILITY":
                # Meta rejects templates that start or end with a variable
                assert not text.startswith("{{") and not text.rstrip(".!").endswith("}}"), (tpl.name, lng)
    # every journey event from the spec has a template
    for kind in (
        "quote.sent",
        "quote.overdue",
        "booking.confirmed",
        "consultation.reminder",
        "visa.invitation_issued",
        "payment.captured",
        "installment.due",
        "aftercare.checkin_due",
        "sos.updated",
    ):
        assert kind in reg.kinds
    assert reg.for_notification("sos.updated", "patient", {"status": "resolved"}) is None
    assert reg.for_notification("sos.updated", "patient", {"status": "acknowledged"}) is not None
    assert reg.for_notification("quote.overdue", "hospital", {}).name == "hig_quote_due_hospital"  # type: ignore[union-attr]
    assert reg.for_notification("quote.overdue", "patient", {}).name == "hig_quote_followup"  # type: ignore[union-attr]
    assert reg.for_notification("booking.confirmed", "support", {}) is None


def test_clean_param_and_preview() -> None:
    assert whatsapp.clean_param("a\nb\t c      d") == "a b  c   d"
    tpl = whatsapp.registry().by_name("hig_booking_confirmed")
    assert tpl is not None
    assert "HIG-B-1" in whatsapp.render_preview(tpl, "fr", ["Amara", "HIG-B-1"])
    assert whatsapp.is_stop_reply(" Stop! ")
    assert whatsapp.is_stop_reply("СТОП")
    assert whatsapp.is_stop_reply("توقف")
    assert not whatsapp.is_stop_reply("stop the pain please")


# ----------------------------------------------------------------------------------------------- opt-in
async def test_unavailable_when_not_configured(client: Any, make_user: Any, auth_headers: Any) -> None:
    user = await make_user(role="patient")
    resp = await client.get("/api/v1/me/whatsapp", headers=auth_headers(user))
    assert resp.status_code == 200
    assert resp.json() == {
        "available": False,
        "status": "none",
        "phone_masked": None,
        "verified_at": None,
        "opted_in_at": None,
        "opted_out_at": None,
        "code_expires_at": None,
    }
    resp = await client.post("/api/v1/me/whatsapp/verify", json={"phone": PHONE}, headers=auth_headers(user))
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "whatsapp_unavailable"


async def test_opt_in_with_verification_code(
    client: Any, db: Any, make_user: Any, auth_headers: Any, run_jobs: Any, graph: GraphMock
) -> None:
    await enable(db, "fr")
    user = await make_user(role="patient", preferred_language="fr")
    headers = auth_headers(user)
    resp = await client.post("/api/v1/me/whatsapp/verify", json={"phone": "12345678"}, headers=headers)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_contact"

    resp = await client.post(
        "/api/v1/me/whatsapp/verify", json={"phone": "+234 803 123 4567"}, headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["phone_masked"] == "+234*****567"
    await run_jobs()
    sent = graph.requests[-1]
    assert sent["to"] == "2348031234567"
    assert sent["auth"] == "Bearer test-token"
    assert sent["url"].endswith("/1234567890/messages")
    assert sent["template"]["name"] == "hig_verification_code"
    assert sent["template"]["language"] == {"code": "fr"}
    code = graph.last_code()
    assert re.fullmatch(r"\d{6}", code)
    assert sent["template"]["components"][1]["sub_type"] == "url"  # copy-code button

    wrong = "000000" if code != "000000" else "111111"
    resp = await client.post("/api/v1/me/whatsapp/confirm", json={"code": wrong}, headers=headers)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_code"
    assert resp.json()["error"]["details"]["attempts_left"] == 4

    resp = await client.post("/api/v1/me/whatsapp/confirm", json={"code": code}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"
    consent = (
        await db.execute(
            select(Consent).where(Consent.user_id == user.id, Consent.kind == ConsentKind.WHATSAPP_UPDATES)
        )
    ).scalar_one()
    assert consent.granted is True

    # generic consent endpoint cannot be used to bypass verification
    resp = await client.post(
        "/api/v1/auth/consents",
        json={"kind": "whatsapp_updates", "version": "x", "granted": True},
        headers=headers,
    )
    assert resp.status_code in (400, 404, 405, 422)

    resp = await client.delete("/api/v1/me/whatsapp", headers=headers)
    assert resp.json()["status"] == "opted_out"
    rows = (
        (
            await db.execute(
                select(Consent.granted)
                .where(Consent.user_id == user.id, Consent.kind == ConsentKind.WHATSAPP_UPDATES)
                .order_by(Consent.created_at)
            )
        )
        .scalars()
        .all()
    )
    assert rows == [True, False]
    # the verification message is logged without its text
    log = (await db.execute(select(WhatsAppMessage))).scalars().all()
    assert [m.template_name for m in log] == ["hig_verification_code"]


async def test_too_many_codes(client: Any, make_user: Any, auth_headers: Any, graph: GraphMock) -> None:
    user = await make_user(role="patient")
    for _ in range(3):
        resp = await client.post(
            "/api/v1/me/whatsapp/verify", json={"phone": PHONE}, headers=auth_headers(user)
        )
        assert resp.status_code == 200
    resp = await client.post("/api/v1/me/whatsapp/verify", json={"phone": PHONE}, headers=auth_headers(user))
    assert resp.status_code == 429


# ----------------------------------------------------------------------------------------------- sending
async def test_notification_sends_approved_template_once(
    client: Any, db: Any, make_user: Any, auth_headers: Any, run_jobs: Any, graph: GraphMock
) -> None:
    await enable(db, "ar")
    user = await make_user(role="patient", preferred_language="ar", full_name="Amara Okafor")
    await _opt_in(client, auth_headers(user), graph, run_jobs)
    before = len(graph.requests)
    n = await notify(
        db,
        user.id,
        "booking.confirmed",
        title="Booking confirmed",
        params={"booking_number": "HIG-B-2026-000045", "hospital": "Apex"},
        data={"booking_id": "x", "link": "/bookings/x"},
        dedupe_key="b1",
    )
    assert n is not None
    await db.commit()
    await run_jobs()
    assert len(graph.requests) == before + 1
    sent = graph.requests[-1]
    assert sent["template"]["name"] == "hig_booking_confirmed"
    assert sent["template"]["language"] == {"code": "ar"}
    params = [p["text"] for p in sent["template"]["components"][0]["parameters"]]
    assert params == ["Amara", "HIG-B-2026-000045"]

    log = (
        await db.execute(select(WhatsAppMessage).where(WhatsAppMessage.notification_id == n.id))
    ).scalar_one()
    assert log.status == WhatsAppMessageStatus.SENT
    assert log.provider_message_id == f"wamid.TEST{len(graph.requests)}"
    assert log.phone_masked == "+234*****567"
    # no message text anywhere in the log row
    assert "HIG-B-2026-000045" not in json.dumps({c.name: str(getattr(log, c.name)) for c in log.__table__.c})

    # re-running the job does not send again
    await whatsapp.send_notification_whatsapp(db, {"notification_id": str(n.id), "params": {}})
    assert len(graph.requests) == before + 1

    # kinds without a template and roles without one are skipped
    await notify(db, user.id, "message.created", title="New message", dedupe_key="m1")
    await db.commit()
    await run_jobs()
    assert len(graph.requests) == before + 1


async def test_no_whatsapp_without_opt_in(db: Any, make_user: Any, run_jobs: Any, graph: GraphMock) -> None:
    user = await make_user(role="patient")
    await notify(db, user.id, "booking.confirmed", title="x", params={"booking_number": "B"}, dedupe_key="b")
    await db.commit()
    await run_jobs()
    assert graph.requests == []
    assert (await db.execute(select(WhatsAppMessage))).first() is None


async def test_permanent_error_marks_failed_and_missing_param_skips(
    client: Any, db: Any, make_user: Any, auth_headers: Any, run_jobs: Any, graph: GraphMock
) -> None:
    user = await make_user(role="patient")
    await _opt_in(client, auth_headers(user), graph, run_jobs)
    graph.fail_with = (400, {"error": {"code": 132001, "type": "OAuthException", "message": "no template"}})
    n = await notify(
        db, user.id, "payment.captured", title="Paid", params={"amount": "USD 10.00"}, dedupe_key="p1"
    )
    await db.commit()
    await run_jobs()
    log = (
        await db.execute(select(WhatsAppMessage).where(WhatsAppMessage.notification_id == n.id))  # type: ignore[union-attr]
    ).scalar_one()
    assert log.status == WhatsAppMessageStatus.FAILED
    assert log.error_code == "132001"

    graph.fail_with = None
    n2 = await notify(db, user.id, "payment.captured", title="Paid", params={}, dedupe_key="p2")
    await db.commit()
    await run_jobs()
    log2 = (
        await db.execute(select(WhatsAppMessage).where(WhatsAppMessage.notification_id == n2.id))  # type: ignore[union-attr]
    ).scalar_one()
    assert log2.status == WhatsAppMessageStatus.SKIPPED
    assert log2.error_code == "missing_param"


async def test_daily_limit(
    client: Any, db: Any, make_user: Any, auth_headers: Any, run_jobs: Any, graph: GraphMock, monkeypatch: Any
) -> None:
    monkeypatch.setattr(settings, "WHATSAPP_USER_DAILY_LIMIT", 2)
    user = await make_user(role="patient")
    await _opt_in(client, auth_headers(user), graph, run_jobs)
    for i in range(3):
        await notify(db, user.id, "visa.invitation_issued", title="Letter", dedupe_key=f"v{i}")
    await db.commit()
    await run_jobs()
    statuses = sorted(
        str(s)
        for s in (
            await db.execute(
                select(WhatsAppMessage.status).where(WhatsAppMessage.kind == "visa.invitation_issued")
            )
        ).scalars()
    )
    assert statuses == ["sent", "sent", "skipped"]


# ----------------------------------------------------------------------------------------------- webhook
async def test_webhook_verification_challenge(client: Any, graph: GraphMock) -> None:
    ok = await client.get(
        "/api/v1/webhooks/whatsapp",
        params={"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "12345"},
    )
    assert ok.status_code == 200
    assert ok.text == "12345"
    bad = await client.get(
        "/api/v1/webhooks/whatsapp",
        params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "12345"},
    )
    assert bad.status_code == 403


async def test_webhook_not_configured(client: Any) -> None:
    resp = await client.post("/api/v1/webhooks/whatsapp", content=b"{}")
    assert resp.status_code == 503


async def test_webhook_statuses_and_stop(
    client: Any, db: Any, make_user: Any, auth_headers: Any, run_jobs: Any, graph: GraphMock
) -> None:
    user = await make_user(role="patient")
    await _opt_in(client, auth_headers(user), graph, run_jobs)
    n = await notify(db, user.id, "visa.invitation_issued", title="Letter", dedupe_key="v")
    await db.commit()
    await run_jobs()
    log = (
        await db.execute(select(WhatsAppMessage).where(WhatsAppMessage.notification_id == n.id))  # type: ignore[union-attr]
    ).scalar_one()
    wamid = log.provider_message_id

    def body(statuses: list[dict[str, Any]], messages: list[dict[str, Any]] | None = None) -> bytes:
        value: dict[str, Any] = {"messaging_product": "whatsapp", "statuses": statuses}
        if messages:
            value["messages"] = messages
        return json.dumps(
            {
                "object": "whatsapp_business_account",
                "entry": [{"id": "1", "changes": [{"field": "messages", "value": value}]}],
            }
        ).encode()

    raw = body(
        [{"id": wamid, "status": "delivered", "timestamp": "1790000000", "recipient_id": "2348031234567"}]
    )
    bad = await client.post(
        "/api/v1/webhooks/whatsapp", content=raw, headers={"X-Hub-Signature-256": "sha256=00"}
    )
    assert bad.status_code == 403
    ok = await client.post(
        "/api/v1/webhooks/whatsapp", content=raw, headers={"X-Hub-Signature-256": _sign(raw)}
    )
    assert ok.status_code == 200
    assert ok.json()["statuses"] == 1
    # an older "sent" arriving late does not move the status backwards
    raw = body([{"id": wamid, "status": "sent", "timestamp": "1789999990"}])
    await client.post("/api/v1/webhooks/whatsapp", content=raw, headers={"X-Hub-Signature-256": _sign(raw)})
    raw = body([{"id": wamid, "status": "read", "timestamp": "1790000100"}])
    await client.post("/api/v1/webhooks/whatsapp", content=raw, headers={"X-Hub-Signature-256": _sign(raw)})
    await db.refresh(log)
    assert log.status == WhatsAppMessageStatus.READ
    assert log.delivered_at is not None and log.read_at is not None

    # STOP reply opts the user out (and records the withdrawal)
    raw = body([], [{"from": "2348031234567", "id": "wamid.IN1", "type": "text", "text": {"body": "STOP"}}])
    resp = await client.post(
        "/api/v1/webhooks/whatsapp", content=raw, headers={"X-Hub-Signature-256": _sign(raw)}
    )
    assert resp.json()["opt_outs"] == 1
    row = (await db.execute(select(WhatsAppOptIn).where(WhatsAppOptIn.user_id == user.id))).scalar_one()
    await db.refresh(row)
    assert row.status == WhatsAppOptInStatus.OPTED_OUT
    assert row.opt_out_source == "stop_reply"
    before = len(graph.requests)
    await notify(db, user.id, "visa.invitation_issued", title="Letter", dedupe_key="v2")
    await db.commit()
    await run_jobs()
    assert len(graph.requests) == before


# ----------------------------------------------------------------------------------------------- admin
async def test_admin_status_and_log(
    client: Any, db: Any, make_user: Any, auth_headers: Any, run_jobs: Any, graph: GraphMock
) -> None:
    user = await make_user(role="patient")
    await _opt_in(client, auth_headers(user), graph, run_jobs)
    staff = await make_user(role="admin")
    resp = await client.get("/api/v1/admin/whatsapp/status", headers=auth_headers(staff))
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True and data["webhook_configured"] is True
    assert data["opted_in_users"] == 1
    assert "test-token" not in resp.text and APP_SECRET not in resp.text
    resp = await client.get("/api/v1/admin/whatsapp/messages", headers=auth_headers(staff))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert items and items[0]["template_name"] == "hig_verification_code"
    assert "text" not in items[0] and "body" not in items[0]
    patient_resp = await client.get("/api/v1/admin/whatsapp/status", headers=auth_headers(user))
    assert patient_resp.status_code == 403
