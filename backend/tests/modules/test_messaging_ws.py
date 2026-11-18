"""WebSocket endpoint ``/api/v1/ws`` - authentication, heartbeat and realtime delivery (PLAN 8.9)."""

from __future__ import annotations

import json
from typing import Any

import anyio
import pytest
from starlette.testclient import TestClient, WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from app.core import realtime
from app.core.security import create_access_token
from app.main import app as fastapi_app
from tests.factories import create_user
from tests.modules.messaging_helpers import API, build_case_world

WS = f"{API}/ws"


def _token(user: Any, **kwargs: Any) -> str:
    return create_access_token(user.id, str(getattr(user.role, "value", user.role)), **kwargs)


def _recv(ws: WebSocketTestSession, timeout: float = 5.0) -> dict[str, Any]:
    """Receive one JSON frame, failing instead of hanging when nothing arrives."""

    async def _receive() -> Any:
        with anyio.fail_after(timeout):
            return await ws._send_rx.receive()

    message = ws.portal.call(_receive)
    ws._raise_on_close(message)
    return json.loads(message["text"])


def _recv_until(ws: WebSocketTestSession, event_type: str, max_frames: int = 10) -> dict[str, Any]:
    for _ in range(max_frames):
        frame = _recv(ws)
        if frame["type"] == event_type:
            return frame
    raise AssertionError(f"no {event_type} frame received")


@pytest.mark.parametrize("token", [None, "", "not-a-jwt"])
async def test_ws_rejects_missing_or_invalid_token(token: str | None) -> None:
    url = WS if token is None else f"{WS}?token={token}"
    with TestClient(fastapi_app) as tc, tc.websocket_connect(url) as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            _recv(ws)
        assert exc.value.code == 4401


async def test_ws_rejects_expired_token_and_suspended_user(db) -> None:
    user = await create_user(db, role="patient")
    suspended = await create_user(db, role="patient", status="suspended")
    with TestClient(fastapi_app) as tc:
        with tc.websocket_connect(f"{WS}?token={_token(user, expires_minutes=-5)}") as ws:
            with pytest.raises(WebSocketDisconnect) as exc:
                _recv(ws)
            assert exc.value.code == 4401
        with tc.websocket_connect(f"{WS}?token={_token(suspended)}") as ws:
            with pytest.raises(WebSocketDisconnect) as exc:
                _recv(ws)
            assert exc.value.code == 4401


async def test_ws_enforces_portal_claim_and_staff_ips(db, monkeypatch) -> None:
    """SEC-061: the handshake applies the HTTP door checks (portal claim, ``STAFF_ALLOWED_IPS``)."""
    from app.core.config import settings

    staff = await create_user(db, role="support")
    patient = await create_user(db, role="patient")

    def _closed(token: str) -> None:
        with tc.websocket_connect(f"{WS}?token={token}") as ws:
            with pytest.raises(WebSocketDisconnect) as exc:
                _recv(ws)
            assert exc.value.code == 4401

    with TestClient(fastapi_app) as tc:
        _closed(_token(staff, portal="public"))  # staff role with a public-door token
        _closed(_token(patient, portal="staff"))  # public role with a staff-door token
        with tc.websocket_connect(f"{WS}?token={_token(staff)}") as ws:
            assert _recv(ws)["type"] == "connected"
        monkeypatch.setattr(settings, "STAFF_ALLOWED_IPS", ["203.0.113.0/24"])
        _closed(_token(staff))  # staff from a network outside the allowlist
        with tc.websocket_connect(f"{WS}?token={_token(patient)}") as ws:
            assert _recv(ws)["type"] == "connected"  # the allowlist only applies to staff


async def test_ws_connect_heartbeat_and_cleanup(db) -> None:
    user = await create_user(db, role="patient")
    with TestClient(fastapi_app) as tc:
        with tc.websocket_connect(f"{WS}?token={_token(user)}") as ws:
            hello = _recv(ws)
            assert hello == {"type": "connected", "data": {"user_id": str(user.id)}}
            assert realtime.hub.is_online(user.id)
            ws.send_text("ping")
            assert _recv(ws)["type"] == "pong"
            ws.send_text(json.dumps({"type": "ping"}))
            assert _recv(ws)["type"] == "pong"
            ws.send_text("ignored frame")
            ws.send_text("ping")
            assert _recv(ws)["type"] == "pong"
        # Leaving the context waits for the endpoint to finish, which unregisters the socket.
        assert not realtime.hub.is_online(user.id)


async def test_ws_delivers_message_and_notification(db) -> None:
    world = await build_case_world(db)
    patient_h = {"Authorization": f"Bearer {_token(world.patient_user)}"}
    with TestClient(fastapi_app) as tc:
        r = tc.post(f"{API}/conversations", json={"case_id": str(world.case.id)}, headers=patient_h)
        assert r.status_code == 201, r.text
        conv_id = r.json()["id"]
        with tc.websocket_connect(f"{WS}?token={_token(world.owner)}") as owner_ws:
            assert _recv(owner_ws)["type"] == "connected"
            r = tc.post(
                f"{API}/conversations/{conv_id}/messages", json={"body": "Hello hospital"}, headers=patient_h
            )
            assert r.status_code == 201, r.text
            message = _recv_until(owner_ws, "message.created")
            assert message["data"]["body"] == "Hello hospital"
            assert message["data"]["conversation_id"] == conv_id
            assert message["data"]["sender"]["id"] == str(world.patient_user.id)
            notification = _recv_until(owner_ws, "notification.created")
            assert notification["data"]["kind"] == "message.created"
            assert notification["data"]["data"]["conversation_id"] == conv_id
            assert "dedupe_key" not in notification["data"]["data"]

        # The sender's own socket does not receive its message back.
        with tc.websocket_connect(f"{WS}?token={_token(world.patient_user)}") as patient_ws:
            assert _recv(patient_ws)["type"] == "connected"
            owner_h = {"Authorization": f"Bearer {_token(world.owner)}"}
            tc.post(f"{API}/conversations/{conv_id}/messages", json={"body": "Reply"}, headers=owner_h)
            frame = _recv_until(patient_ws, "message.created")
            assert frame["data"]["body"] == "Reply"
            patient_ws.send_text("ping")
            assert _recv_until(patient_ws, "pong")["type"] == "pong"


def _closed_code(ws: WebSocketTestSession) -> int:
    """Read frames until the server closes the socket; return the close code."""
    for _ in range(20):
        try:
            _recv(ws)
        except WebSocketDisconnect as exc:
            return int(exc.code)
    raise AssertionError("the socket was not closed")


async def test_ws_closed_when_its_session_is_revoked(db) -> None:
    """SEC-031: logout closes that session's open sockets (other sessions stay); revoking every session
    (e.g. suspension, password change) closes the rest."""
    from tests.factories import DEFAULT_PASSWORD

    user = await create_user(db, role="patient", password=DEFAULT_PASSWORD)
    email, user_id = user.email, user.id
    mobile = {"X-Client-Type": "mobile"}
    with TestClient(fastapi_app) as tc:
        sessions = []
        for _ in range(2):
            r = tc.post(
                f"{API}/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}, headers=mobile
            )
            assert r.status_code == 200, r.text
            sessions.append(r.json())
        a, b = sessions
        with (
            tc.websocket_connect(f"{WS}?token={a['access_token']}") as ws_a,
            tc.websocket_connect(f"{WS}?token={b['access_token']}") as ws_b,
        ):
            assert _recv(ws_a)["type"] == "connected" and _recv(ws_b)["type"] == "connected"
            assert realtime.hub.connection_count(user_id) == 2
            r = tc.post(
                f"{API}/auth/logout",
                json={"refresh_token": a["refresh_token"]},
                headers={**mobile, "Authorization": f"Bearer {a['access_token']}"},
            )
            assert r.status_code == 204, r.text
            assert _closed_code(ws_a) == realtime.WS_CLOSE_SESSION_REVOKED
            ws_b.send_text("ping")
            assert _recv_until(ws_b, "pong")["type"] == "pong"
            assert realtime.hub.connection_count(user_id) == 1

            # every session revoked (as on suspension / password change / admin revocation)
            async def _revoke_all() -> None:
                from app.core.db import SessionLocal
                from app.modules.auth.service import revoke_all_sessions

                async with SessionLocal() as s:
                    await revoke_all_sessions(s, user_id)
                    await s.commit()
                await realtime.drain_background()

            ws_b.portal.call(_revoke_all)
            assert _closed_code(ws_b) == realtime.WS_CLOSE_SESSION_REVOKED
