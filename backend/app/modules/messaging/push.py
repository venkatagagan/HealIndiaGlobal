"""Push notifications through Firebase Cloud Messaging HTTP v1 (CG-15).

Every in-app notification (``notifications.notify``) also enqueues ``messaging.send_push`` when push is
configured and the user has a registered device. The job sends one FCM message per device token with GENERIC
text only (Apple 4.5.4 / privacy: never conditions, procedures, documents or amounts) plus
``{"kind", "notification_id", "link"}`` so the app can open the right screen and load the details over the
authenticated API.

Configuration (all optional; push is disabled cleanly when unset): ``FCM_PROJECT_ID`` and a service account
key, either ``FCM_SERVICE_ACCOUNT_FILE`` (path to the JSON key) or ``FCM_SERVICE_ACCOUNT_JSON`` (the JSON
itself).
OAuth access tokens are minted with a self-signed RS256 JWT (PyJWT + cryptography) exchanged at Google's token
endpoint with httpx, and cached until shortly before they expire.

Tokens FCM reports as ``UNREGISTERED`` are deleted; tokens it rejects as invalid are marked ``revoked_at``.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import httpx
import jwt
import structlog
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import DevicePlatform
from app.core.ids import uuid7
from app.core.jobs import PermanentJobError, task
from app.models import DeviceToken, Notification, User
from app.modules.messaging.policies import is_active_user

logger = structlog.get_logger(__name__)

FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token"  # noqa: S105 - public endpoint, not a secret
FCM_SEND_URL = "https://fcm.googleapis.com/v1/projects/{project}/messages:send"
PUSH_TITLE = "Heal India Global"
PUSH_TASK = "messaging.send_push"

# Kinds that never produce a push (the user is in the app when they happen).
PUSH_SKIP_KINDS: frozenset[str] = frozenset({"user.registered"})

SendResult = Literal["sent", "unregistered", "invalid"]


# ------------------------------------------------------------------------------------------- generic text
def push_body_for(kind: str) -> str:
    """Generic push text for a notification kind - never health, document or payment details."""
    if kind.startswith("message.") or kind in ("conversation.created", "support.conversation_created"):
        return "You have a new message."
    if kind.startswith("sos.") or kind == "screening.emergency":
        return "You have an urgent update. Please open the app."
    if kind.startswith(("payment.", "refund.", "installment.", "payout.", "settlement_batch.")):
        return "You have an update about a payment."
    if kind.startswith(("travel.", "booking.")):
        return "You have an update about your trip."
    if kind.startswith("consultation."):
        return "You have an update about a consultation."
    if kind.startswith("moderation."):
        return "You have a message from our team."
    if kind.startswith("site_enquiry."):
        return "A new website enquiry has arrived."
    return "You have an update on your case."


# ------------------------------------------------------------------------------------------- configuration
def push_configured() -> bool:
    return bool(
        settings.FCM_PROJECT_ID and (settings.FCM_SERVICE_ACCOUNT_JSON or settings.FCM_SERVICE_ACCOUNT_FILE)
    )


@dataclass(frozen=True, slots=True)
class _ServiceAccount:
    client_email: str
    private_key: str
    token_uri: str


def _service_account() -> _ServiceAccount:
    raw = settings.FCM_SERVICE_ACCOUNT_JSON.strip()
    if not raw and settings.FCM_SERVICE_ACCOUNT_FILE:
        raw = Path(settings.FCM_SERVICE_ACCOUNT_FILE).read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
        return _ServiceAccount(
            client_email=str(data["client_email"]),
            private_key=str(data["private_key"]),
            token_uri=str(data.get("token_uri") or DEFAULT_TOKEN_URI),
        )
    except (ValueError, KeyError, TypeError) as exc:
        raise PermanentJobError("FCM service account JSON is invalid") from exc


_token_cache: dict[str, Any] = {}
_token_lock = asyncio.Lock()


def reset_token_cache() -> None:
    """Forget the cached OAuth token (tests, credential rotation)."""
    _token_cache.clear()


async def _access_token(client: httpx.AsyncClient) -> str:
    async with _token_lock:
        cached = _token_cache.get("token")
        if cached and float(_token_cache.get("expires_at", 0)) - 60 > time.time():
            return str(cached)
        sa = _service_account()
        now = int(time.time())
        assertion = jwt.encode(
            {"iss": sa.client_email, "scope": FCM_SCOPE, "aud": sa.token_uri, "iat": now, "exp": now + 3600},
            sa.private_key,
            algorithm="RS256",
        )
        resp = await client.post(
            sa.token_uri,
            data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
        )
        if resp.status_code >= 400:
            # 400/401 here means the key is wrong or revoked: retrying will not help.
            if resp.status_code < 500:
                raise PermanentJobError(f"FCM OAuth token request failed ({resp.status_code})")
            resp.raise_for_status()
        body = resp.json()
        _token_cache["token"] = body["access_token"]
        _token_cache["expires_at"] = now + int(body.get("expires_in", 3600))
        return str(body["access_token"])


def _error_code(resp: httpx.Response) -> str:
    try:
        error = resp.json().get("error", {})
    except ValueError:
        return ""
    for detail in error.get("details", []) or []:
        code = detail.get("errorCode") if isinstance(detail, dict) else None
        if code:
            return str(code)
    return str(error.get("status") or "")


async def send_to_token(client: httpx.AsyncClient, token: str, body: str, data: dict[str, str]) -> SendResult:
    """Send one message. Raises on transient failures (the job retries); returns the token's fate."""
    access = await _access_token(client)
    message = {
        "message": {
            "token": token,
            "notification": {"title": PUSH_TITLE, "body": body},
            "data": data,
            "android": {"priority": "high", "notification": {"tag": data.get("kind", "")[:64]}},
            "apns": {"payload": {"aps": {"sound": "default"}}},
        }
    }
    resp = await client.post(
        FCM_SEND_URL.format(project=settings.FCM_PROJECT_ID),
        json=message,
        headers={"Authorization": f"Bearer {access}"},
    )
    if resp.status_code < 300:
        return "sent"
    code = _error_code(resp)
    if resp.status_code == 404 or code == "UNREGISTERED":
        return "unregistered"
    if resp.status_code == 400 and code in ("INVALID_ARGUMENT", "SENDER_ID_MISMATCH"):
        return "invalid"
    if resp.status_code in (401, 403):
        reset_token_cache()
        raise PermanentJobError(f"FCM rejected the credentials ({resp.status_code} {code})")
    # 429 QUOTA_EXCEEDED, 5xx UNAVAILABLE/INTERNAL: let the job retry with backoff.
    raise RuntimeError(f"FCM send failed ({resp.status_code} {code})")


# ------------------------------------------------------------------------------------------- devices
async def register_device(
    db: AsyncSession, user: User, platform: DevicePlatform, token: str, app_version: str | None
) -> None:
    """Upsert a device token for ``user`` (a token moves to the latest user who registers it)."""
    now = datetime.now(UTC)
    values = {
        "user_id": user.id,
        "platform": platform,
        "app_version": app_version,
        "last_seen_at": now,
        "revoked_at": None,
        "updated_at": func.now(),
    }
    await db.execute(
        pg_insert(DeviceToken)
        .values(id=uuid7(), token=token, **{k: v for k, v in values.items() if k != "updated_at"})
        .on_conflict_do_update(index_elements=[DeviceToken.token], set_=values)
    )
    await db.commit()


async def remove_device(db: AsyncSession, user: User, token: str) -> None:
    await db.execute(delete(DeviceToken).where(DeviceToken.token == token, DeviceToken.user_id == user.id))
    await db.commit()


async def has_active_device(db: AsyncSession, user_id: uuid.UUID) -> bool:
    found = (
        await db.execute(
            select(DeviceToken.id)
            .where(DeviceToken.user_id == user_id, DeviceToken.revoked_at.is_(None))
            .limit(1)
        )
    ).scalar_one_or_none()
    return found is not None


# ------------------------------------------------------------------------------------------- pipeline
def push_data(notification: Notification) -> dict[str, str]:
    data = {"kind": notification.kind, "notification_id": str(notification.id)}
    link = (notification.data or {}).get("link")
    if isinstance(link, str) and link.startswith("/") and not link.startswith("//"):
        data["link"] = link[:200]
    return data


@task(PUSH_TASK, timeout_seconds=120)
async def send_notification_push(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Push a notification to every active device of its user (idempotent per device via ``data.pushed``)."""
    if not push_configured():
        return
    try:
        notification_id = uuid.UUID(str(payload["notification_id"]))
    except (KeyError, ValueError) as exc:
        raise PermanentJobError("invalid notification_id") from exc
    notification = await db.get(Notification, notification_id)
    if notification is None:
        return
    user = await db.get(User, notification.user_id)
    if user is None or not is_active_user(user):
        return
    tokens = list(
        (
            await db.execute(
                select(DeviceToken).where(DeviceToken.user_id == user.id, DeviceToken.revoked_at.is_(None))
            )
        )
        .scalars()
        .all()
    )
    pushed: set[str] = set((notification.data or {}).get("pushed_devices") or [])
    body = push_body_for(notification.kind)
    data = push_data(notification)
    sent = gone = 0
    async with httpx.AsyncClient(timeout=10) as client:
        for device in tokens:
            if str(device.id) in pushed:
                continue
            result = await send_to_token(client, device.token, body, data)
            if result == "unregistered":
                await db.execute(delete(DeviceToken).where(DeviceToken.id == device.id))
                gone += 1
            elif result == "invalid":
                await db.execute(
                    update(DeviceToken)
                    .where(DeviceToken.id == device.id)
                    .values(revoked_at=datetime.now(UTC))
                    .execution_options(synchronize_session=False)
                )
                gone += 1
            else:
                sent += 1
            pushed.add(str(device.id))
            # Record progress so a retry after a transient failure does not re-send to earlier devices.
            notification.data = {**(notification.data or {}), "pushed_devices": sorted(pushed)}
            await db.commit()
    logger.info("messaging.push_sent", notification_id=str(notification.id), sent=sent, removed=gone)
