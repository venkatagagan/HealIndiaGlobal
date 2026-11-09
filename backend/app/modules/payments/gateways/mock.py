"""Mock gateway for development and tests (refused when ``ENV=production``).

``POST /payments/mock/{order_id}/complete {"outcome": "success"|"failure"}`` drives the same internal
capture / failure path that real webhooks use. Refunds complete immediately.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.core.config import settings
from app.core.ids import uuid7
from app.modules.payments.gateways.base import (
    CheckoutContext,
    GatewayClient,
    GatewayOrderResult,
    GatewayRefundInfo,
    GatewayRefundStatus,
)

if TYPE_CHECKING:
    from app.models import PaymentOrder


class MockGateway(GatewayClient):
    name = "mock"

    @property
    def configured(self) -> bool:
        return not settings.is_production

    async def create_order(self, order: PaymentOrder, ctx: CheckoutContext) -> GatewayOrderResult:
        return GatewayOrderResult(gateway_order_id=f"mock_order_{uuid7().hex}")

    async def checkout_payload(self, order: PaymentOrder, ctx: CheckoutContext) -> dict[str, Any]:
        return {"complete_url": f"/api/v1/payments/mock/{order.id}/complete"}

    async def refund(
        self,
        *,
        gateway_payment_id: str,
        amount_minor: int,
        currency: str,
        refund_id: str,
        reason: str | None,
    ) -> GatewayRefundInfo:
        return GatewayRefundInfo(
            gateway_refund_id=f"mock_rfnd_{uuid7().hex}",
            status=GatewayRefundStatus.PROCESSED,
            amount_minor=amount_minor,
            raw={"mock": True, "refund_id": refund_id},
        )
