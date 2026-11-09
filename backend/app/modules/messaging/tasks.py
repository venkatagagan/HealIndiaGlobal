"""Background jobs of the messaging module."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.email import render_template, send_email
from app.core.enums import UserRole
from app.core.jobs import PermanentJobError, task
from app.models import Notification, User
from app.modules.messaging.policies import is_active_user, role_of

logger = structlog.get_logger(__name__)


def portal_url_for(user: User) -> str:
    role = role_of(user)
    if role == UserRole.AGENT.value:
        base = settings.AGENT_PORTAL_URL
    elif role == UserRole.HOSPITAL.value:
        base = settings.HOSPITAL_PORTAL_URL
    elif role in (
        UserRole.ADMIN.value,
        UserRole.FINANCE.value,
        UserRole.SUPPORT.value,
        UserRole.SUPER_ADMIN.value,
    ):
        base = settings.ADMIN_PORTAL_URL
    else:
        base = settings.PATIENT_WEB_URL
    return base.rstrip("/")


@task("messaging.send_email", timeout_seconds=120)
async def send_notification_email(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Email a notification to its user (idempotent: skipped once ``data.emailed_at`` is set)."""
    try:
        notification_id = uuid.UUID(str(payload["notification_id"]))
    except (KeyError, ValueError) as exc:
        raise PermanentJobError("invalid notification_id") from exc
    notification = await db.get(Notification, notification_id)
    if notification is None:
        return
    data = dict(notification.data or {})
    if data.get("emailed_at"):
        return
    user = await db.get(User, notification.user_id)
    if user is None or not user.email or user.is_guest or not is_active_user(user):
        return
    link = data.get("link")
    url = portal_url_for(user)
    if isinstance(link, str) and link.startswith("/") and not link.startswith("//"):
        url = f"{url}{link}"
    html = render_template(
        "generic_notification.html",
        title=notification.title,
        body=notification.body or "",
        name=user.full_name or "",
        url=url,
        action_label="View details",
    )
    await send_email(user.email, notification.title, html)
    data["emailed_at"] = datetime.now(UTC).isoformat()
    notification.data = data
    logger.info(
        "messaging.notification_emailed", notification_id=str(notification.id), kind=notification.kind
    )
