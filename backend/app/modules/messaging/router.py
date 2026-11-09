"""HTTP + WebSocket routes for conversations, messages and notifications (PLAN 8.9).

WebSocket protocol (``/api/v1/ws?token=<access JWT>``):
* invalid/expired/missing token, or an inactive account -> the socket is accepted then closed with 4401;
  the server also closes with 4401 when the access token expires (reconnect with a fresh token).
* server -> client frames are ``{"type": "...", "data": {...}}``; the first frame is ``connected``.
* heartbeat: the client may send ``ping`` or ``{"type": "ping"}`` and receives ``{"type": "pong"}``; the
  server sends ``{"type": "ping"}`` after ``WS_HEARTBEAT_SECONDS`` of silence (dead sockets are dropped).
"""

from __future__ import annotations

import asyncio
import contextlib
import time
import uuid
from typing import Annotated, Any, cast

import orjson
import structlog
from fastapi import APIRouter, Depends, Query, Request, Response, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from starlette.websockets import WebSocketState

from app.core import realtime
from app.core.db import SessionLocal
from app.core.deps import (
    CurrentUser,
    DbSession,
    PageParams,
    ensure_organisation_active,
    ensure_portal_matches,
    ensure_session_live,
    is_staff,
    staff_ip_allowed,
)
from app.core.enums import ConversationKind
from app.core.errors import AppError, NotFound
from app.core.pagination import Page, paginate
from app.core.rate_limit import rate_limit
from app.core.security import decode_access_token
from app.models import Notification, User
from app.modules.messaging import notifications as notif_service
from app.modules.messaging import service
from app.modules.messaging.policies import is_active_user
from app.modules.messaging.schemas import (
    ConversationCreate,
    ConversationOut,
    MessageCreate,
    MessageOut,
    NotificationOut,
    ReadAllOut,
    UnreadCountOut,
)

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["messaging"])

# Declared after ``user`` in signatures so the limit keys on the authenticated user.
SendMessageLimit = Annotated[None, Depends(rate_limit("messaging.send", 60, 60, key="user"))]
CreateConversationLimit = Annotated[
    None, Depends(rate_limit("messaging.create_conversation", 30, 3600, key="user"))
]

WS_CLOSE_UNAUTHORIZED = 4401
WS_HEARTBEAT_SECONDS = 25.0


# -------------------------------------------------------------------------------------------- conversations
@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    db: DbSession,
    user: CurrentUser,
    kind: ConversationKind | None = None,
    case_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[ConversationOut]:
    return await service.list_conversations(db, user, kind=kind, case_id=case_id, limit=limit)


@router.post("/conversations", response_model=ConversationOut, status_code=201)
async def create_conversation(
    body: ConversationCreate, db: DbSession, user: CurrentUser, _: CreateConversationLimit
) -> ConversationOut:
    return await service.create_conversation(db, user, body)


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
async def get_conversation(conversation_id: uuid.UUID, db: DbSession, user: CurrentUser) -> ConversationOut:
    conversation = await service.get_conversation_for_user(db, user, conversation_id)
    return await service.conversation_out(db, user, conversation)


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conversation_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    before: Annotated[str | None, Query(max_length=64)] = None,
    limit: Annotated[int, Query(ge=1, le=service.MAX_MESSAGE_LIMIT)] = service.DEFAULT_MESSAGE_LIMIT,
) -> list[MessageOut]:
    return await service.list_messages(db, user, conversation_id, before=before, limit=limit)


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(
    conversation_id: uuid.UUID, body: MessageCreate, db: DbSession, user: CurrentUser, _: SendMessageLimit
) -> MessageOut:
    return await service.send_message(db, user, conversation_id, body)


@router.post("/conversations/{conversation_id}/read", status_code=204)
async def mark_conversation_read(conversation_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Response:
    await service.mark_conversation_read(db, user, conversation_id)
    return Response(status_code=204)


# -------------------------------------------------------------------------------------------- notifications
@router.get("/notifications", response_model=Page[NotificationOut])
async def list_notifications(
    db: DbSession, user: CurrentUser, params: PageParams, unread: bool | None = None
) -> Page[NotificationOut]:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread is True:
        stmt = stmt.where(Notification.read_at.is_(None))
    elif unread is False:
        stmt = stmt.where(Notification.read_at.is_not(None))
    stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc())
    return await paginate(
        db, stmt, params, transform=lambda rows: [notif_service.notification_out(n) for n in rows]
    )


@router.get("/notifications/unread-count", response_model=UnreadCountOut)
async def notifications_unread_count(db: DbSession, user: CurrentUser) -> UnreadCountOut:
    return UnreadCountOut(count=await notif_service.unread_count(db, user.id))


@router.post("/notifications/read-all", response_model=ReadAllOut)
async def notifications_read_all(db: DbSession, user: CurrentUser) -> ReadAllOut:
    return ReadAllOut(updated=await notif_service.mark_all_read(db, user.id))


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
async def notification_read(notification_id: uuid.UUID, db: DbSession, user: CurrentUser) -> NotificationOut:
    n = await notif_service.mark_read(db, user.id, notification_id)
    if n is None:
        raise NotFound("Notification not found")
    return notif_service.notification_out(n)


# ------------------------------------------------------------------------------------------------ websocket
async def _authenticate_ws(token: str | None, websocket: WebSocket) -> tuple[uuid.UUID, float] | None:
    """Return ``(user_id, exp_timestamp)`` for a valid access token of an active user, else ``None``.

    SEC-061: the same door checks as HTTP (``deps._user_from_token``): the token's ``portal`` claim must
    match the role (staff tokens only for staff and vice versa) and staff connect only from
    ``STAFF_ALLOWED_IPS`` (client IP resolved by the shared ``get_client_ip``)."""
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except AppError:
        return None
    user_id = uuid.UUID(str(payload["sub"]))
    async with SessionLocal() as db:
        user = await db.get(User, user_id)
        if user is None or not is_active_user(user):
            return None
        try:
            ensure_portal_matches(user, payload)
            # SEC-031 / SEC-014: a revoked session or a suspended organisation cannot open a socket
            await ensure_session_live(db, payload)
            await ensure_organisation_active(db, user, None)
        except AppError:
            return None
        # the helpers read only ``.client`` / ``.headers``, which a WebSocket (HTTPConnection) has too
        if is_staff(user) and not staff_ip_allowed(cast(Request, websocket)):
            return None
    return user_id, float(payload.get("exp", 0))


def _frame(event_type: str, data: Any = None) -> str:
    return orjson.dumps({"type": event_type, "data": data or {}}).decode()


def _is_ping(raw: str) -> bool:
    text = raw.strip()
    if text.lower() == "ping":
        return True
    if text.startswith("{"):
        try:
            parsed = orjson.loads(text)
        except orjson.JSONDecodeError:
            return False
        return isinstance(parsed, dict) and parsed.get("type") == "ping"
    return False


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = None) -> None:
    auth = await _authenticate_ws(token, websocket)
    await websocket.accept()
    if auth is None:
        await websocket.close(code=WS_CLOSE_UNAUTHORIZED, reason="unauthorized")
        return
    user_id, expires_at = auth
    await realtime.connect(user_id, websocket, accept=False)
    try:
        await websocket.send_text(_frame("connected", {"user_id": str(user_id)}))
        while True:
            remaining = expires_at - time.time()
            if remaining <= 0:
                await websocket.close(code=WS_CLOSE_UNAUTHORIZED, reason="token_expired")
                return
            try:
                message = await asyncio.wait_for(
                    websocket.receive(), timeout=min(WS_HEARTBEAT_SECONDS, remaining)
                )
            except TimeoutError:
                if time.time() >= expires_at:
                    await websocket.close(code=WS_CLOSE_UNAUTHORIZED, reason="token_expired")
                    return
                await websocket.send_text(_frame("ping"))
                continue
            if message.get("type") == "websocket.disconnect":
                return
            raw = message.get("text")
            if raw is None and message.get("bytes") is not None:
                raw = bytes(message["bytes"][:1024]).decode("utf-8", errors="ignore")
            if raw and len(raw) <= 1024 and _is_ping(raw):
                await websocket.send_text(_frame("pong"))
            # Other client frames are ignored (messages are sent through the REST API).
    except WebSocketDisconnect:
        pass
    except RuntimeError as exc:  # socket already closed underneath us
        logger.debug("ws.closed", error=str(exc))
    finally:
        await realtime.disconnect(user_id, websocket)
        with contextlib.suppress(Exception):
            if websocket.application_state == WebSocketState.CONNECTED:
                await websocket.close()
