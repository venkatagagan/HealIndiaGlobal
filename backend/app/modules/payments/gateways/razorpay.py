"""Razorpay adapter (REST v1, basic auth ``key_id:key_secret``).

* Orders:   ``POST /v1/orders`` (auto-capture), checkout via Razorpay Checkout.js.
* Client signature: ``HMAC_SHA256(order_id + "|" + payment_id, key_secret)`` (hex).
* Webhooks: ``HMAC_SHA256(raw_body, webhook_secret)`` (hex) in ``X-Razorpay-Signature``; the event id comes
  from the ``X-Razorpay-Event-Id`` header. Handled events: ``payment.captured``, ``payment.authorized``,
  ``payment.failed``, ``order.paid``, ``refund.processed``, ``refund.failed``.
"""

from __future__ import annotations

import hashlib
import hmac
import json
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
    as_list,
    safe_str,
    to_int,
)

if TYPE_CHECKING:
    from app.models import PaymentOrder

logger = structlog.get_logger(__name__)

API_BASE = "https://api.razorpay.com/v1"
TIMEOUT = httpx.Timeout(20.0, connect=10.0)

_PAYMENT_STATUS = {
    "created": GatewayPaymentStatus.CREATED,
    "authorized": GatewayPaymentStatus.AUTHORIZED,
    "captured": GatewayPaymentStatus.CAPTURED,
    "refunded": GatewayPaymentStatus.CAPTURED,
    "failed": GatewayPaymentStatus.FAILED,
}
_REFUND_STATUS = {
    "pending": GatewayRefundStatus.PENDING,
    "created": GatewayRefundStatus.PENDING,
    "processed": GatewayRefundStatus.PROCESSED,
    "failed": GatewayRefundStatus.FAILED,
}
_METHODS = {"card", "upi", "netbanking", "wallet", "emi"}


def hmac_hex(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


class RazorpayGateway(GatewayClient):
    name = "razorpay"

    def __init__(
        self,
        key_id: str | None = None,
        key_secret: str | None = None,
        webhook_secret: str | None = None,
    ) -> None:
        self.key_id = key_id if key_id is not None else settings.RAZORPAY_KEY_ID
        self.key_secret = key_secret if key_secret is not None else settings.RAZORPAY_KEY_SECRET
        self.webhook_secret = (
            webhook_secret if webhook_secret is not None else settings.RAZORPAY_WEBHOOK_SECRET
        )

    @property
    def configured(self) -> bool:
        return bool(self.key_id and self.key_secret)

    # ------------------------------------------------------------------------------------------- http
    async def _request(
        self, method: str, path: str, json_body: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        if not self.configured:
            raise GatewayNotConfigured(self.name)
        try:
            async with httpx.AsyncClient(
                base_url=API_BASE, auth=(self.key_id, self.key_secret), timeout=TIMEOUT
            ) as client:
                response = await client.request(method, path, json=json_body)
        except httpx.HTTPError as exc:
            raise GatewayError(f"Razorpay request failed: {type(exc).__name__}") from exc
        try:
            data = response.json()
        except ValueError:
            data = {}
        if response.status_code >= 400:
            err = data.get("error") if isinstance(data, dict) else None
            description = (err or {}).get("description") if isinstance(err, dict) else None
            code = (err or {}).get("code") if isinstance(err, dict) else None
            logger.warning("razorpay.error", status=response.status_code, code=code, path=path)
            raise GatewayError(
                f"Razorpay error: {description or response.status_code}",
                code="gateway_error",
                retryable=response.status_code >= 500 or response.status_code == 429,
            )
        return data if isinstance(data, dict) else {}

    # ------------------------------------------------------------------------------------------- orders
    async def create_order(self, order: PaymentOrder, ctx: CheckoutContext) -> GatewayOrderResult:
        body = {
            "amount": int(order.amount_minor),
            "currency": order.currency,
            "receipt": order.order_number,
            "payment_capture": 1,
            "notes": {"order_id": str(order.id), "order_number": order.order_number},
        }
        data = await self._request("POST", "/orders", body)
        gateway_order_id = safe_str(data.get("id"), 100)
        if not gateway_order_id:
            raise GatewayError("Razorpay did not return an order id")
        return GatewayOrderResult(gateway_order_id=gateway_order_id, data={"status": data.get("status")})

    async def checkout_payload(self, order: PaymentOrder, ctx: CheckoutContext) -> dict[str, Any]:
        return {
            "key_id": self.key_id,
            "order_id": order.gateway_order_id,
            "amount": int(order.amount_minor),
            "currency": order.currency,
            "name": settings.APP_NAME,
            "description": ctx.description,
            "prefill": {
                "name": ctx.payer_name or "",
                "email": ctx.payer_email or "",
                "contact": ctx.payer_phone or "",
            },
        }

    # ------------------------------------------------------------------------------------------- signatures
    def verify_client_signature(self, gateway_order_id: str, gateway_payment_id: str, signature: str) -> bool:
        if not self.key_secret or not signature:
            return False
        expected = hmac_hex(self.key_secret, f"{gateway_order_id}|{gateway_payment_id}".encode())
        return hmac.compare_digest(expected, signature.strip().lower())

    def verify_webhook(self, raw_body: bytes, headers: Mapping[str, str]) -> bool:
        signature = _header(headers, "x-razorpay-signature")
        if not self.webhook_secret or not signature:
            return False
        expected = hmac_hex(self.webhook_secret, raw_body)
        return hmac.compare_digest(expected, signature.strip().lower())

    # ------------------------------------------------------------------------------------------- webhooks
    def parse_webhook(self, raw_body: bytes, headers: Mapping[str, str]) -> ParsedWebhook:
        try:
            payload = json.loads(raw_body)
        except (ValueError, UnicodeDecodeError) as exc:
            raise GatewayError("Malformed webhook body", retryable=False) from exc
        if not isinstance(payload, dict):
            raise GatewayError("Malformed webhook body", retryable=False)
        event_type = str(payload.get("event") or "unknown")[:100]
        inner = as_dict(payload.get("payload"))
        payment_entity = _entity(inner, "payment")
        refund_entity = _entity(inner, "refund")
        order_entity = _entity(inner, "order")

        event_id = _header(headers, "x-razorpay-event-id")
        if not event_id:
            # Deterministic fallback so retries of the same delivery dedupe.
            ref = (payment_entity or refund_entity or order_entity or {}).get("id", "")
            event_id = f"{event_type}:{ref}:{payload.get('created_at', '')}"
        event_id = event_id[:255]

        events: list[NormalizedEvent] = []
        if event_type in ("payment.captured", "order.paid", "payment.authorized") and payment_entity:
            info = self._payment_info(payment_entity)
            kind = (
                EventKind.PAYMENT_CAPTURED
                if info.status == GatewayPaymentStatus.CAPTURED
                else EventKind.PAYMENT_AUTHORIZED
            )
            if event_type == "order.paid":
                kind = EventKind.PAYMENT_CAPTURED
                info.status = GatewayPaymentStatus.CAPTURED
            events.append(
                NormalizedEvent(
                    event_id=event_id,
                    event_type=event_type,
                    kind=kind,
                    gateway_order_id=info.gateway_order_id or safe_str((order_entity or {}).get("id"), 100),
                    our_order_id=_note(payment_entity, "order_id") or _note(order_entity, "order_id"),
                    payment=info,
                )
            )
        elif event_type == "payment.failed" and payment_entity:
            info = self._payment_info(payment_entity)
            events.append(
                NormalizedEvent(
                    event_id=event_id,
                    event_type=event_type,
                    kind=EventKind.PAYMENT_FAILED,
                    gateway_order_id=info.gateway_order_id,
                    our_order_id=_note(payment_entity, "order_id"),
                    payment=info,
                    error_code=info.error_code,
                    error_description=info.error_description,
                )
            )
        elif event_type in ("refund.processed", "refund.failed") and refund_entity:
            refund = self._refund_info(refund_entity)
            events.append(
                NormalizedEvent(
                    event_id=event_id,
                    event_type=event_type,
                    kind=(
                        EventKind.REFUND_PROCESSED
                        if event_type == "refund.processed"
                        else EventKind.REFUND_FAILED
                    ),
                    refund=refund,
                    our_order_id=_note(refund_entity, "order_id"),
                )
            )
        else:
            events.append(NormalizedEvent(event_id=event_id, event_type=event_type, kind=EventKind.IGNORED))
        return ParsedWebhook(event_id=event_id, event_type=event_type, events=events, payload=payload)

    # ------------------------------------------------------------------------------------------- payments
    async def fetch_payment(self, gateway_payment_id: str) -> GatewayPaymentInfo:
        data = await self._request("GET", f"/payments/{_path_id(gateway_payment_id)}")
        return self._payment_info(data)

    async def capture_payment(self, gateway_payment_id: str, amount_minor: int, currency: str) -> None:
        await self._request(
            "POST",
            f"/payments/{_path_id(gateway_payment_id)}/capture",
            {"amount": int(amount_minor), "currency": currency},
        )

    async def refund(
        self,
        *,
        gateway_payment_id: str,
        amount_minor: int,
        currency: str,
        refund_id: str,
        reason: str | None,
    ) -> GatewayRefundInfo:
        existing = await self.find_refund(gateway_payment_id, refund_id)
        if existing is not None:
            return existing
        data = await self._request(
            "POST",
            f"/payments/{_path_id(gateway_payment_id)}/refund",
            {
                "amount": int(amount_minor),
                "speed": "normal",
                "notes": {"refund_id": refund_id, "reason": (reason or "")[:250]},
                "receipt": refund_id[:40],
            },
        )
        return self._refund_info(data)

    async def find_refund(self, gateway_payment_id: str, refund_id: str) -> GatewayRefundInfo | None:
        """Look for a refund we already created (notes.refund_id) - makes retries after a crash safe."""
        data = await self._request("GET", f"/payments/{_path_id(gateway_payment_id)}/refunds")
        items = as_list(data.get("items"))
        for item in items:
            if isinstance(item, dict) and _note(item, "refund_id") == refund_id:
                return self._refund_info(item)
        return None

    # ------------------------------------------------------------------------------------------- mapping
    @staticmethod
    def _payment_info(entity: Mapping[str, Any]) -> GatewayPaymentInfo:
        status = _PAYMENT_STATUS.get(str(entity.get("status") or ""), GatewayPaymentStatus.PENDING)
        method = str(entity.get("method") or "") or None
        return GatewayPaymentInfo(
            gateway_payment_id=str(entity.get("id") or "")[:100],
            status=status,
            amount_minor=to_int(entity.get("amount")),
            currency=str(entity.get("currency") or "").upper(),
            gateway_order_id=safe_str(entity.get("order_id"), 100),
            method=method if method in _METHODS else None,
            fee_minor=max(to_int(entity.get("fee")), 0),
            tax_minor=max(to_int(entity.get("tax")), 0),
            error_code=safe_str(entity.get("error_code"), 100),
            error_description=safe_str(entity.get("error_description"), 1000),
            raw=_slim_payment(entity),
        )

    @staticmethod
    def _refund_info(entity: Mapping[str, Any]) -> GatewayRefundInfo:
        return GatewayRefundInfo(
            gateway_refund_id=str(entity.get("id") or "")[:100],
            status=_REFUND_STATUS.get(str(entity.get("status") or ""), GatewayRefundStatus.PENDING),
            amount_minor=to_int(entity.get("amount"), 0) or None,
            raw={
                k: entity.get(k)
                for k in ("id", "payment_id", "amount", "currency", "status", "notes", "speed_processed")
            },
        )


def _header(headers: Mapping[str, str], name: str) -> str | None:
    value = headers.get(name) or headers.get(name.title())
    return value.strip() if isinstance(value, str) and value.strip() else None


def _entity(inner: Mapping[str, Any], key: str) -> dict[str, Any] | None:
    wrapper = inner.get(key)
    if isinstance(wrapper, dict):
        entity = wrapper.get("entity")
        if isinstance(entity, dict):
            return entity
    return None


def _note(entity: Mapping[str, Any] | None, key: str) -> str | None:
    if not entity:
        return None
    notes = entity.get("notes")
    if isinstance(notes, dict):
        value = notes.get(key)
        return str(value)[:100] if value else None
    return None


def _path_id(value: str) -> str:
    if not value or not all(c.isalnum() or c == "_" for c in value) or len(value) > 100:
        raise GatewayError("Invalid gateway identifier", retryable=False)
    return value


def _slim_payment(entity: Mapping[str, Any]) -> dict[str, Any]:
    """Keep only non-sensitive fields of a payment entity (no card/contact details)."""
    keys = (
        "id",
        "entity",
        "amount",
        "currency",
        "status",
        "order_id",
        "method",
        "captured",
        "fee",
        "tax",
        "international",
        "error_code",
        "error_description",
        "error_reason",
        "created_at",
    )
    return {k: entity.get(k) for k in keys if k in entity}
