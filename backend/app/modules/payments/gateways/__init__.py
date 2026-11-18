"""Payment gateway adapters and the registry used by the payments service."""

from __future__ import annotations

from app.core.config import settings
from app.core.enums import PaymentGateway
from app.modules.payments.gateways.bank_transfer import BankTransferGateway
from app.modules.payments.gateways.base import (
    GatewayClient,
    GatewayError,
    GatewayNotConfigured,
    SignatureError,
)
from app.modules.payments.gateways.mock import MockGateway
from app.modules.payments.gateways.platform_credit import PlatformCreditGateway
from app.modules.payments.gateways.razorpay import RazorpayGateway
from app.modules.payments.gateways.stripe import StripeGateway

__all__ = [
    "GatewayClient",
    "GatewayError",
    "GatewayNotConfigured",
    "SignatureError",
    "get_gateway",
    "is_gateway_enabled",
]


def get_gateway(name: PaymentGateway | str) -> GatewayClient:
    """A fresh adapter for ``name``; credentials are read from settings at call time (tests patch them)."""
    gateway = PaymentGateway(str(getattr(name, "value", name)))
    if gateway == PaymentGateway.RAZORPAY:
        return RazorpayGateway()
    if gateway == PaymentGateway.STRIPE:
        return StripeGateway()
    if gateway == PaymentGateway.BANK_TRANSFER:
        return BankTransferGateway()
    if gateway == PaymentGateway.PLATFORM_CREDIT:
        return PlatformCreditGateway()
    return MockGateway()


def is_gateway_enabled(name: PaymentGateway | str) -> bool:
    """Enabled in ``PAYMENT_GATEWAYS_ENABLED`` and allowed in this environment (no mock in production)."""
    value = str(getattr(name, "value", name)).lower()
    if value == PaymentGateway.PLATFORM_CREDIT.value:
        return False  # internal: only app.modules.referrals.credits creates these orders
    if value == PaymentGateway.MOCK.value and settings.is_production:
        return False
    return value in settings.PAYMENT_GATEWAYS_ENABLED
