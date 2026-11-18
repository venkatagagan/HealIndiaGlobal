"""Platform credit "gateway": a booking payment funded from the patient's referral credit (docs/REFERRALS.md).

Never offered at checkout (``is_gateway_enabled`` is always false for it): orders are created and captured in
one step by ``app.modules.referrals.credits.apply_credit``. A refund of such a payment goes back to the
patient as credit (no cash-out), so ``refund`` reports it processed at once; the referrals module reinstates
the credit on ``refund.processed``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

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


class PlatformCreditGateway(GatewayClient):
    name = "platform_credit"

    async def create_order(self, order: PaymentOrder, ctx: CheckoutContext) -> GatewayOrderResult:
        return GatewayOrderResult(gateway_order_id=None)

    async def checkout_payload(self, order: PaymentOrder, ctx: CheckoutContext) -> dict[str, Any]:
        return {"reference": order.order_number}

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
            gateway_refund_id=f"credit_rfnd_{uuid7().hex}",
            status=GatewayRefundStatus.PROCESSED,
            amount_minor=amount_minor,
            raw={"platform_credit": True, "refund_id": refund_id},
        )
