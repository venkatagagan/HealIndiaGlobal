"""Gateway abstraction (PLAN 8.11).

Every gateway adapter implements :class:`GatewayClient`:

* ``create_order``            create the gateway-side order / intent for a ``PaymentOrder``
* ``checkout_payload``        the client-facing data for ``CheckoutOut`` (``razorpay`` / ``stripe`` / ...)
* ``verify_client_signature`` verify the signature returned to the browser after checkout (Razorpay)
* ``verify_webhook``          verify a webhook signature over the RAW request body
* ``parse_webhook``           turn a verified webhook body into :class:`NormalizedEvent` objects
* ``fetch_payment``           read the authoritative payment state from the gateway
* ``refund``                  create a refund at the gateway

Adapters never touch the database; ``app.modules.payments.service`` owns all state changes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models import PaymentOrder


class GatewayError(Exception):
    """The gateway rejected a request or could not be reached."""

    def __init__(self, message: str, *, code: str = "gateway_error", retryable: bool = True) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class GatewayNotConfigured(GatewayError):
    def __init__(self, gateway: str) -> None:
        super().__init__(f"Payment gateway '{gateway}' is not configured", code="gateway_unavailable")


class SignatureError(Exception):
    """A client or webhook signature did not verify."""


class EventKind(StrEnum):
    PAYMENT_CAPTURED = "payment_captured"
    PAYMENT_AUTHORIZED = "payment_authorized"
    PAYMENT_FAILED = "payment_failed"
    REFUND_PROCESSED = "refund_processed"
    REFUND_FAILED = "refund_failed"
    IGNORED = "ignored"


class GatewayPaymentStatus(StrEnum):
    CREATED = "created"
    AUTHORIZED = "authorized"
    CAPTURED = "captured"
    PENDING = "pending"
    FAILED = "failed"


class GatewayRefundStatus(StrEnum):
    PENDING = "pending"
    PROCESSED = "processed"
    FAILED = "failed"


@dataclass(slots=True)
class GatewayOrderResult:
    gateway_order_id: str | None
    data: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class GatewayPaymentInfo:
    """Authoritative payment state read from the gateway. ``fee_minor``/``tax_minor`` are in INR minor units
    (Razorpay reports fees in its settlement currency, INR); 0 when unknown."""

    gateway_payment_id: str
    status: GatewayPaymentStatus
    amount_minor: int
    currency: str
    gateway_order_id: str | None = None
    method: str | None = None
    fee_minor: int = 0
    tax_minor: int = 0
    error_code: str | None = None
    error_description: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class GatewayRefundInfo:
    gateway_refund_id: str
    status: GatewayRefundStatus
    amount_minor: int | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class NormalizedEvent:
    event_id: str
    event_type: str
    kind: EventKind
    gateway_order_id: str | None = None
    our_order_id: str | None = None
    payment: GatewayPaymentInfo | None = None
    refund: GatewayRefundInfo | None = None
    error_code: str | None = None
    error_description: str | None = None


@dataclass(slots=True)
class ParsedWebhook:
    event_id: str
    event_type: str
    events: list[NormalizedEvent]
    payload: dict[str, Any]


@dataclass(slots=True)
class CheckoutContext:
    """Display data used to build checkout payloads (prefill etc.)."""

    description: str
    payer_name: str | None = None
    payer_email: str | None = None
    payer_phone: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class GatewayClient(ABC):
    name: str

    @property
    def configured(self) -> bool:
        return True

    @abstractmethod
    async def create_order(self, order: PaymentOrder, ctx: CheckoutContext) -> GatewayOrderResult: ...

    @abstractmethod
    async def checkout_payload(self, order: PaymentOrder, ctx: CheckoutContext) -> dict[str, Any]: ...

    def verify_client_signature(self, gateway_order_id: str, gateway_payment_id: str, signature: str) -> bool:
        return False

    def verify_webhook(self, raw_body: bytes, headers: Mapping[str, str]) -> bool:
        return False

    def parse_webhook(self, raw_body: bytes, headers: Mapping[str, str]) -> ParsedWebhook:
        raise GatewayError("Webhooks are not supported by this gateway", retryable=False)

    async def fetch_payment(self, gateway_payment_id: str) -> GatewayPaymentInfo:
        raise GatewayError("fetch_payment is not supported by this gateway", retryable=False)

    async def capture_payment(self, gateway_payment_id: str, amount_minor: int, currency: str) -> None:
        """Capture an authorized payment (gateways that auto-capture make this a no-op)."""
        return None

    @abstractmethod
    async def refund(
        self,
        *,
        gateway_payment_id: str,
        amount_minor: int,
        currency: str,
        refund_id: str,
        reason: str | None,
    ) -> GatewayRefundInfo: ...


def to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_str(value: Any, limit: int = 255) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text[:limit] if text else None


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []
