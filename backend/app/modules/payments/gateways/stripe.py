"""Stripe adapter (REST ``https://api.stripe.com/v1``, PaymentIntents with automatic payment methods).

* Orders: ``POST /v1/payment_intents`` (``Idempotency-Key`` = our order id); the client confirms with
  Stripe.js using ``client_secret``. ``gateway_order_id`` and ``gateway_payment_id`` are the PaymentIntent id.
* Webhooks: ``Stripe-Signature: t=<ts>,v1=<hex>[,v1=...]`` where ``v1 = HMAC_SHA256(secret, f"{t}.{raw}")``;
  rejected when ``|now - t| > 300 s``. Handled: ``payment_intent.succeeded``,
  ``payment_intent.payment_failed``, ``charge.refunded``, ``refund.updated`` / ``charge.refund.updated``.
* Refunds: ``POST /v1/refunds`` (``Idempotency-Key`` = our refund id, so retries never double-refund).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any

import httpx
import structlog

from app.core.config import settings
from app.modules.payments.gateways.base import (
    CheckoutContext,
    EventKind,
    GatewayClient,
    GatewayError,
    GatewayNotConfigured,
    GatewayOrderResult,
    GatewayPaymentInfo,
    GatewayPaymentStatus,
    GatewayRefundInfo,
    GatewayRefundStatus,
    NormalizedEvent,
    ParsedWebhook,
    as_dict,
    safe_str,
    to_int,
)

if TYPE_CHECKING:
    from app.models import PaymentOrder

logger = structlog.get_logger(__name__)

API_BASE = "https://api.stripe.com/v1"
TIMEOUT = httpx.Timeout(20.0, connect=10.0)
SIGNATURE_TOLERANCE_SECONDS = 300

_PI_STATUS = {
    "succeeded": GatewayPaymentStatus.CAPTURED,
    "requires_capture": GatewayPaymentStatus.AUTHORIZED,
    "processing": GatewayPaymentStatus.PENDING,
    "requires_payment_method": GatewayPaymentStatus.CREATED,
    "requires_confirmation": GatewayPaymentStatus.CREATED,
    "requires_action": GatewayPaymentStatus.PENDING,
    "canceled": GatewayPaymentStatus.FAILED,
}
_REFUND_STATUS = {
    "pending": GatewayRefundStatus.PENDING,
    "requires_action": GatewayRefundStatus.PENDING,
    "succeeded": GatewayRefundStatus.PROCESSED,
    "failed": GatewayRefundStatus.FAILED,
    "canceled": GatewayRefundStatus.FAILED,
}


def compute_signature(secret: str, timestamp: int | str, raw_body: bytes) -> str:
    signed = f"{timestamp}.".encode() + raw_body
    return hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()


def verify_stripe_signature(
    secret: str,
    raw_body: bytes,
    header: str | None,
    *,
    tolerance: int = SIGNATURE_TOLERANCE_SECONDS,
    now: float | None = None,
) -> bool:
    if not secret or not header:
        return False
    timestamp: int | None = None
    candidates: list[str] = []
    for part in header.split(","):
        key, _, value = part.strip().partition("=")
        if key == "t":
            try:
                timestamp = int(value)
            except ValueError:
                return False
        elif key == "v1" and value:
            candidates.append(value.strip().lower())
    if timestamp is None or not candidates:
        return False
    current = time.time() if now is None else now
    if abs(current - timestamp) > tolerance:
        return False
    expected = compute_signature(secret, timestamp, raw_body)
    return any(hmac.compare_digest(expected, c) for c in candidates)


class StripeGateway(GatewayClient):
    name = "stripe"

    def __init__(
        self,
        secret_key: str | None = None,
        publishable_key: str | None = None,
        webhook_secret: str | None = None,
    ) -> None:
        self.secret_key = secret_key if secret_key is not None else settings.STRIPE_SECRET_KEY
        self.publishable_key = (
            publishable_key if publishable_key is not None else settings.STRIPE_PUBLISHABLE_KEY
        )
        self.webhook_secret = webhook_secret if webhook_secret is not None else settings.STRIPE_WEBHOOK_SECRET

    @property
    def configured(self) -> bool:
        return bool(self.secret_key)

    async def _request(
        self,
        method: str,
        path: str,
        data: dict[str, str] | None = None,
        *,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        if not self.configured:
            raise GatewayNotConfigured(self.name)
        headers = {"Authorization": f"Bearer {self.secret_key}"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        try:
            async with httpx.AsyncClient(base_url=API_BASE, timeout=TIMEOUT) as client:
                response = await client.request(method, path, data=data, headers=headers)
        except httpx.HTTPError as exc:
            raise GatewayError(f"Stripe request failed: {type(exc).__name__}") from exc
        try:
            body = response.json()
        except ValueError:
            body = {}
        if response.status_code >= 400:
            err = body.get("error") if isinstance(body, dict) else None
            message = err.get("message") if isinstance(err, dict) else None
            logger.warning("stripe.error", status=response.status_code, path=path)
            raise GatewayError(
                f"Stripe error: {message or response.status_code}",
                retryable=response.status_code >= 500 or response.status_code == 429,
            )
        return body if isinstance(body, dict) else {}

    # ------------------------------------------------------------------------------------------- orders
    async def create_order(self, order: PaymentOrder, ctx: CheckoutContext) -> GatewayOrderResult:
        form = {
            "amount": str(int(order.amount_minor)),
            "currency": order.currency.lower(),
            "automatic_payment_methods[enabled]": "true",
            "description": ctx.description[:500],
            "metadata[order_id]": str(order.id),
            "metadata[order_number]": order.order_number,
        }
        if ctx.payer_email:
            form["receipt_email"] = ctx.payer_email
        data = await self._request("POST", "/payment_intents", form, idempotency_key=f"order-{order.id}")
        pi_id = safe_str(data.get("id"), 100)
        if not pi_id:
            raise GatewayError("Stripe did not return a PaymentIntent id")
        return GatewayOrderResult(gateway_order_id=pi_id, data={"client_secret": data.get("client_secret")})

    async def checkout_payload(self, order: PaymentOrder, ctx: CheckoutContext) -> dict[str, Any]:
        client_secret = ctx.extra.get("client_secret")
        if not client_secret and order.gateway_order_id:
            data = await self._request("GET", f"/payment_intents/{_path_id(order.gateway_order_id)}")
            client_secret = data.get("client_secret")
        return {"publishable_key": self.publishable_key, "client_secret": client_secret}

    # ------------------------------------------------------------------------------------------- webhooks
    def verify_webhook(self, raw_body: bytes, headers: Mapping[str, str], now: float | None = None) -> bool:
        header = headers.get("stripe-signature") or headers.get("Stripe-Signature")
        return verify_stripe_signature(self.webhook_secret, raw_body, header, now=now)

    def parse_webhook(self, raw_body: bytes, headers: Mapping[str, str]) -> ParsedWebhook:
        try:
            payload = json.loads(raw_body)
        except (ValueError, UnicodeDecodeError) as exc:
            raise GatewayError("Malformed webhook body", retryable=False) from exc
        if not isinstance(payload, dict):
            raise GatewayError("Malformed webhook body", retryable=False)
        event_id = str(payload.get("id") or "")[:255]
        if not event_id:
            raise GatewayError("Webhook has no event id", retryable=False)
        event_type = str(payload.get("type") or "unknown")[:100]
        data = as_dict(payload.get("data"))
        obj = as_dict(data.get("object"))

        events: list[NormalizedEvent] = []
        if event_type == "payment_intent.succeeded":
            info = self._payment_info(obj)
            info.status = GatewayPaymentStatus.CAPTURED
            events.append(
                NormalizedEvent(
                    event_id=event_id,
                    event_type=event_type,
                    kind=EventKind.PAYMENT_CAPTURED,
                    gateway_order_id=info.gateway_order_id,
                    our_order_id=_metadata(obj, "order_id"),
                    payment=info,
                )
            )
        elif event_type == "payment_intent.payment_failed":
            info = self._payment_info(obj)
            info.status = GatewayPaymentStatus.FAILED
            events.append(
                NormalizedEvent(
                    event_id=event_id,
                    event_type=event_type,
                    kind=EventKind.PAYMENT_FAILED,
                    gateway_order_id=info.gateway_order_id,
                    our_order_id=_metadata(obj, "order_id"),
                    payment=info,
                    error_code=info.error_code,
                    error_description=info.error_description,
                )
            )
        elif event_type == "charge.refunded":
            refunds = as_dict(obj.get("refunds"))
            for item in refunds.get("data") or []:
                if isinstance(item, dict):
                    events.append(self._refund_event(event_id, event_type, item))
            if not events:
                events.append(
                    NormalizedEvent(event_id=event_id, event_type=event_type, kind=EventKind.IGNORED)
                )
        elif event_type in ("refund.updated", "charge.refund.updated", "refund.created") and obj:
            events.append(self._refund_event(event_id, event_type, obj))
        else:
            events.append(NormalizedEvent(event_id=event_id, event_type=event_type, kind=EventKind.IGNORED))
        return ParsedWebhook(event_id=event_id, event_type=event_type, events=events, payload=payload)

    def _refund_event(self, event_id: str, event_type: str, item: Mapping[str, Any]) -> NormalizedEvent:
        refund = self._refund_info(item)
        if refund.status == GatewayRefundStatus.PROCESSED:
            kind = EventKind.REFUND_PROCESSED
        elif refund.status == GatewayRefundStatus.FAILED:
            kind = EventKind.REFUND_FAILED
        else:
            kind = EventKind.IGNORED
        return NormalizedEvent(event_id=event_id, event_type=event_type, kind=kind, refund=refund)

    # ------------------------------------------------------------------------------------------- payments
    async def fetch_payment(self, gateway_payment_id: str) -> GatewayPaymentInfo:
        data = await self._request("GET", f"/payment_intents/{_path_id(gateway_payment_id)}")
        return self._payment_info(data)

    async def refund(
        self,
        *,
        gateway_payment_id: str,
        amount_minor: int,
        currency: str,
        refund_id: str,
        reason: str | None,
    ) -> GatewayRefundInfo:
        form = {
            "payment_intent": gateway_payment_id,
            "amount": str(int(amount_minor)),
            "reason": "requested_by_customer",
            "metadata[refund_id]": refund_id,
        }
        data = await self._request("POST", "/refunds", form, idempotency_key=f"refund-{refund_id}")
        return self._refund_info(data)

    # ------------------------------------------------------------------------------------------- mapping
    @staticmethod
    def _payment_info(obj: Mapping[str, Any]) -> GatewayPaymentInfo:
        status = _PI_STATUS.get(str(obj.get("status") or ""), GatewayPaymentStatus.PENDING)
        error = as_dict(obj.get("last_payment_error"))
        amount = to_int(obj.get("amount_received")) or to_int(obj.get("amount"))
        pi_id = str(obj.get("id") or "")[:100]
        types = obj.get("payment_method_types")
        method = "card" if isinstance(types, list) and types == ["card"] else None
        return GatewayPaymentInfo(
            gateway_payment_id=pi_id,
            status=status,
            amount_minor=amount,
            currency=str(obj.get("currency") or "").upper(),
            gateway_order_id=pi_id or None,
            method=method,
            error_code=safe_str(error.get("code") or error.get("decline_code"), 100),
            error_description=safe_str(error.get("message"), 1000),
            raw={
                k: obj.get(k)
                for k in ("id", "object", "amount", "amount_received", "currency", "status", "latest_charge")
                if k in obj
            },
        )

    @staticmethod
    def _refund_info(obj: Mapping[str, Any]) -> GatewayRefundInfo:
        return GatewayRefundInfo(
            gateway_refund_id=str(obj.get("id") or "")[:100],
            status=_REFUND_STATUS.get(str(obj.get("status") or ""), GatewayRefundStatus.PENDING),
            amount_minor=to_int(obj.get("amount"), 0) or None,
            raw={k: obj.get(k) for k in ("id", "amount", "currency", "status", "payment_intent", "charge")},
        )


def _metadata(obj: Mapping[str, Any], key: str) -> str | None:
    meta = obj.get("metadata")
    if isinstance(meta, dict) and meta.get(key):
        return str(meta[key])[:100]
    return None


def _path_id(value: str) -> str:
    if not value or not all(c.isalnum() or c == "_" for c in value) or len(value) > 100:
        raise GatewayError("Invalid gateway identifier", retryable=False)
    return value
