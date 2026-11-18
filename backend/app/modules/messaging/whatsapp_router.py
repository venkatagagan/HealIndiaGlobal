"""WhatsApp routes: the user's opt-in (``/me/whatsapp``), Meta's webhook (``/webhooks/whatsapp``) and the
admin status / delivery log (``/admin/whatsapp``)."""

from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from app.core.deps import STAFF_ROLES, CurrentUser, DbSession, PageParams, require_roles
from app.core.enums import WhatsAppMessageStatus
from app.core.errors import AppError, BadRequest, Forbidden
from app.core.pagination import Page, paginate
from app.core.rate_limit import rate_limit
from app.models import User, WhatsAppMessage
from app.modules.messaging import whatsapp

router = APIRouter(tags=["whatsapp"])

StaffUser = Annotated[User, Depends(require_roles(*STAFF_ROLES))]
VerifyLimit = Annotated[None, Depends(rate_limit("whatsapp.verify", 5, 3600, key="user"))]
ConfirmLimit = Annotated[None, Depends(rate_limit("whatsapp.confirm", 20, 3600, key="user"))]
_webhook_limit = Depends(rate_limit("whatsapp.webhook", 1200, 60))


class WebhookUnavailable(AppError):
    status_code = 503
    code = "whatsapp_not_configured"
    default_message = "WhatsApp is not configured"


# ---------------------------------------------------------------------------------------------- opt-in
@router.get("/me/whatsapp", response_model=whatsapp.WhatsAppStatusOut)
async def my_whatsapp(db: DbSession, user: CurrentUser) -> whatsapp.WhatsAppStatusOut:
    """WhatsApp updates for the signed-in user: ``available`` (configured on this server) and the opt-in
    status (none | pending | active | opted_out) with the masked number."""
    return await whatsapp.get_status(db, user)


@router.post("/me/whatsapp/verify", response_model=whatsapp.WhatsAppStatusOut)
async def start_whatsapp_verification(
    body: whatsapp.WhatsAppVerifyIn, request: Request, db: DbSession, user: CurrentUser, _: VerifyLimit
) -> whatsapp.WhatsAppStatusOut:
    """Send a 6-digit code to the phone number (E.164, e.g. +234 803 123 4567) on WhatsApp."""
    return await whatsapp.start_verification(db, user, body, request)


@router.post("/me/whatsapp/confirm", response_model=whatsapp.WhatsAppStatusOut)
async def confirm_whatsapp_verification(
    body: whatsapp.WhatsAppConfirmIn, request: Request, db: DbSession, user: CurrentUser, _: ConfirmLimit
) -> whatsapp.WhatsAppStatusOut:
    """Confirm the code: the number is verified and consent ``whatsapp_updates`` is recorded."""
    return await whatsapp.confirm_verification(db, user, body, request)


@router.delete("/me/whatsapp", response_model=whatsapp.WhatsAppStatusOut)
async def opt_out_whatsapp(request: Request, db: DbSession, user: CurrentUser) -> whatsapp.WhatsAppStatusOut:
    """Stop WhatsApp updates (same as replying STOP)."""
    return await whatsapp.opt_out(db, user, request)


# ---------------------------------------------------------------------------------------------- webhook
@router.get("/webhooks/whatsapp", response_class=PlainTextResponse, dependencies=[_webhook_limit])
async def whatsapp_webhook_verify(
    mode: Annotated[str | None, Query(alias="hub.mode", max_length=40)] = None,
    token: Annotated[str | None, Query(alias="hub.verify_token", max_length=200)] = None,
    challenge: Annotated[str | None, Query(alias="hub.challenge", max_length=200)] = None,
) -> PlainTextResponse:
    """Meta's subscription check: echo ``hub.challenge`` when ``hub.verify_token`` matches."""
    if not whatsapp.verify_challenge(mode, token) or not challenge:
        raise Forbidden("Verification failed", code="whatsapp_verify_failed")
    return PlainTextResponse(challenge)


@router.post("/webhooks/whatsapp", dependencies=[_webhook_limit])
async def whatsapp_webhook(request: Request, db: DbSession) -> dict[str, Any]:
    """Delivery statuses and STOP replies, signed with ``X-Hub-Signature-256`` (app secret)."""
    if not whatsapp.webhook_configured():
        raise WebhookUnavailable()
    raw = await request.body()
    if not whatsapp.verify_signature(raw, request.headers.get("x-hub-signature-256")):
        raise Forbidden("Invalid signature", code="invalid_signature")
    try:
        body = json.loads(raw)
    except ValueError as exc:
        raise BadRequest("Invalid JSON", code="invalid_payload") from exc
    if not isinstance(body, dict):
        raise BadRequest("Invalid JSON", code="invalid_payload")
    counts = await whatsapp.handle_webhook(db, body)
    return {"received": True, **counts}


# ---------------------------------------------------------------------------------------------- admin
@router.get("/admin/whatsapp/status", response_model=whatsapp.WhatsAppProviderStatusOut)
async def whatsapp_admin_status(db: DbSession, user: StaffUser) -> whatsapp.WhatsAppProviderStatusOut:
    """Provider configuration (never the secrets themselves), templates and opt-in / delivery counts."""
    return await whatsapp.provider_status(db)


@router.get("/admin/whatsapp/messages", response_model=Page[whatsapp.WhatsAppMessageOut])
async def whatsapp_admin_messages(
    db: DbSession,
    user: StaffUser,
    params: PageParams,
    status: WhatsAppMessageStatus | None = None,
    template: Annotated[str | None, Query(max_length=100)] = None,
) -> Page[whatsapp.WhatsAppMessageOut]:
    """Recent WhatsApp messages: template, language, masked number and delivery status. No message bodies."""
    stmt = select(WhatsAppMessage)
    if status is not None:
        stmt = stmt.where(WhatsAppMessage.status == status)
    if template:
        stmt = stmt.where(WhatsAppMessage.template_name == template)
    stmt = stmt.order_by(WhatsAppMessage.created_at.desc(), WhatsAppMessage.id.desc())
    return await paginate(
        db, stmt, params, transform=lambda rows: [whatsapp.WhatsAppMessageOut.model_validate(r) for r in rows]
    )

