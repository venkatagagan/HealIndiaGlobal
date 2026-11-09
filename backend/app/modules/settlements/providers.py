"""Payout providers (PLAN 6.4).

* ``mock`` - immediate success; refused when ``ENV=production``.
* ``manual_bank_transfer`` - the payout stays ``processing`` until finance records the bank UTR
  (``POST /finance/settlements/payouts/{id}/mark-paid``).
* ``razorpay_route`` - Razorpay Route direct transfer to the payee's linked account
  (``POST https://api.razorpay.com/v1/transfers``, basic auth key_id:key_secret). Executed from the
  ``settlements.execute_payout`` job, never inside a request or event handler.

``execute`` returns a :class:`PayoutResult`. Retrying is only safe when the request provably never created
a transfer (SEC-004): connect errors and HTTP 429 raise :class:`PayoutTransientError` (the job retries with
backoff). Read timeouts, other transport errors after the request may have been sent, 5xx and a 2xx without a
transfer id raise :class:`PayoutOutcomeUnknown`; the service then parks the payout as
``needs_reconciliation`` for finance and never re-sends it automatically.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Protocol

import httpx
import structlog

from app.core.config import settings
from app.core.enums import PayoutMethod, PayoutStatus
from app.models.settlements import Payout, PayoutAccount

logger = structlog.get_logger(__name__)

RAZORPAY_API_BASE = "https://api.razorpay.com/v1"
RAZORPAY_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


class PayoutTransientError(Exception):
    """Retryable provider failure: the request certainly did not create a transfer."""


class PayoutOutcomeUnknown(Exception):
    """The request may have created a transfer; do not retry (park for reconciliation)."""


@dataclass(frozen=True, slots=True)
class PayoutResult:
    status: PayoutStatus  # processed | processing | failed
    gateway_payout_id: str | None = None
    failure_reason: str | None = None


class PayoutProvider(Protocol):
    method: PayoutMethod
    requires_account: bool
    runs_inline: bool

    async def execute(self, payout: Payout, account: PayoutAccount | None) -> PayoutResult: ...


class MockPayoutProvider:
    method = PayoutMethod.MOCK
    requires_account = False
    runs_inline = True

    async def execute(self, payout: Payout, account: PayoutAccount | None) -> PayoutResult:
        if settings.is_production:
            return PayoutResult(PayoutStatus.FAILED, failure_reason="mock payouts are disabled in production")
        return PayoutResult(PayoutStatus.PROCESSED, gateway_payout_id=f"mock_po_{secrets.token_hex(8)}")


class ManualBankTransferProvider:
    method = PayoutMethod.MANUAL_BANK_TRANSFER
    requires_account = True
    runs_inline = True

    async def execute(self, payout: Payout, account: PayoutAccount | None) -> PayoutResult:
        # Finance wires the money from the bank portal and records the UTR afterwards.
        return PayoutResult(PayoutStatus.PROCESSING)


class RazorpayRouteProvider:
    method = PayoutMethod.RAZORPAY_ROUTE
    requires_account = True
    runs_inline = False

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    @staticmethod
    def configured() -> bool:
        return bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)

    async def execute(self, payout: Payout, account: PayoutAccount | None) -> PayoutResult:
        if account is None or not account.razorpay_linked_account_id:
            return PayoutResult(PayoutStatus.FAILED, failure_reason="payee has no Razorpay linked account")
        if not self.configured():
            return PayoutResult(PayoutStatus.FAILED, failure_reason="Razorpay is not configured")
        body = {
            "account": account.razorpay_linked_account_id,
            "amount": int(payout.amount_minor),
            "currency": "INR",
            "notes": {
                "payout_id": str(payout.id),
                "batch_id": str(payout.batch_id),
                "payee_type": str(getattr(payout.payee_type, "value", payout.payee_type)),
            },
        }
        auth = (settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
        try:
            if self._client is not None:
                response = await self._client.post(f"{RAZORPAY_API_BASE}/transfers", json=body, auth=auth)
            else:
                async with httpx.AsyncClient(timeout=RAZORPAY_TIMEOUT) as client:
                    response = await client.post(f"{RAZORPAY_API_BASE}/transfers", json=body, auth=auth)
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            # The connection was never established, so Razorpay cannot have received the request.
            raise PayoutTransientError(f"razorpay transfer request failed: {type(exc).__name__}") from exc
        except httpx.HTTPError as exc:
            raise PayoutOutcomeUnknown(f"razorpay transfer outcome unknown: {type(exc).__name__}") from exc
        if response.status_code == 429:
            raise PayoutTransientError("razorpay transfer rate limited (HTTP 429)")
        if response.status_code >= 500:
            raise PayoutOutcomeUnknown(f"razorpay transfer returned HTTP {response.status_code}")
        try:
            data = response.json()
        except ValueError:
            data = {}
        if response.status_code >= 400:
            error = data.get("error") if isinstance(data, dict) else None
            description = (error or {}).get("description") if isinstance(error, dict) else None
            reason = f"razorpay rejected the transfer: {description or f'HTTP {response.status_code}'}"
            logger.warning("payout.razorpay_rejected", payout_id=str(payout.id), status=response.status_code)
            return PayoutResult(PayoutStatus.FAILED, failure_reason=reason[:500])
        transfer_id = str(data.get("id") or "") if isinstance(data, dict) else ""
        if not transfer_id:
            raise PayoutOutcomeUnknown("razorpay transfer response has no id")
        status = str(data.get("status") or "").lower()
        if status in {"failed", "reversed"}:
            return PayoutResult(
                PayoutStatus.FAILED, gateway_payout_id=transfer_id, failure_reason=f"transfer {status}"
            )
        return PayoutResult(PayoutStatus.PROCESSED, gateway_payout_id=transfer_id)


_PROVIDERS: dict[PayoutMethod, PayoutProvider] = {
    PayoutMethod.MOCK: MockPayoutProvider(),
    PayoutMethod.MANUAL_BANK_TRANSFER: ManualBankTransferProvider(),
    PayoutMethod.RAZORPAY_ROUTE: RazorpayRouteProvider(),
}


def get_provider(method: PayoutMethod | str) -> PayoutProvider:
    key = PayoutMethod(str(getattr(method, "value", method)))
    provider = _PROVIDERS.get(key)
    if provider is None:
        raise ValueError(f"payout method {key.value!r} is not supported")
    return provider


def set_provider(method: PayoutMethod, provider: PayoutProvider | None) -> None:
    """Swap a provider (tests). ``None`` restores the default."""
    defaults: dict[PayoutMethod, PayoutProvider] = {
        PayoutMethod.MOCK: MockPayoutProvider(),
        PayoutMethod.MANUAL_BANK_TRANSFER: ManualBankTransferProvider(),
        PayoutMethod.RAZORPAY_ROUTE: RazorpayRouteProvider(),
    }
    _PROVIDERS[method] = provider if provider is not None else defaults[method]


def default_method(account: PayoutAccount | None) -> PayoutMethod:
    """Route-linked accounts use Razorpay Route (when configured); otherwise mock outside production and
    manual bank transfer in production."""
    if account is not None and account.razorpay_linked_account_id and RazorpayRouteProvider.configured():
        return PayoutMethod.RAZORPAY_ROUTE
    if not settings.is_production:
        return PayoutMethod.MOCK
    return PayoutMethod.MANUAL_BANK_TRANSFER
