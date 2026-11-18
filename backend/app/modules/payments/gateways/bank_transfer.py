"""Bank transfer (SWIFT/NEFT) "gateway": no external API.

The order stays open while the payer wires the money quoting the order number as reference, uploads a proof
(``POST /payments/orders/{id}/bank-transfer-proof``) and finance reconciles it
(``POST /payments/orders/{id}/mark-paid``). Refunds are paid out manually by finance: the payments service
never calls ``refund`` for this gateway (SEC-010: the refund waits in ``awaiting_payout`` until one finance
user records the payout reference and a different one confirms it). ``refund`` therefore only reports
``pending`` and never invents a reference.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.modules.payments.gateways.base import (
    CheckoutContext,
    GatewayClient,
    GatewayOrderResult,
    GatewayRefundInfo,
    GatewayRefundStatus,
)

if TYPE_CHECKING:
    from app.models import PaymentOrder

BANK_FIELDS = ("beneficiary_name", "bank_name", "account_number", "ifsc", "swift", "iban")


class BankTransferGateway(GatewayClient):
    name = "bank_transfer"

    async def create_order(self, order: PaymentOrder, ctx: CheckoutContext) -> GatewayOrderResult:
        return GatewayOrderResult(gateway_order_id=None)

    async def checkout_payload(self, order: PaymentOrder, ctx: CheckoutContext) -> dict[str, Any]:
        details = ctx.extra.get("bank_details") or {}
        payload: dict[str, Any] = {key: details.get(key) for key in BANK_FIELDS}
        payload["reference"] = order.order_number
        return payload

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
            gateway_refund_id="",
            status=GatewayRefundStatus.PENDING,
            amount_minor=amount_minor,
            raw={"manual": True, "refund_id": refund_id},
        )
