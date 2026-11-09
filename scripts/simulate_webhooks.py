#!/usr/bin/env python3
"""Send realistic, correctly signed Razorpay / Stripe webhook deliveries to a local Heal India Global API.

Exercises ``POST /api/v1/payments/webhooks/{razorpay,stripe}`` (PLAN.md section 8.11) without a gateway
account or a tunnel: signature verification, event-id idempotency, the Stripe timestamp tolerance and the
event handlers (payment captured / failed, refund processed).

Signing is byte-for-byte what the gateways do:

* Razorpay: ``X-Razorpay-Signature`` = hex HMAC-SHA256 of the raw request body, keyed with
  ``RAZORPAY_WEBHOOK_SECRET``; the event id travels in the ``X-Razorpay-Event-Id`` header.
* Stripe: ``Stripe-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`` keyed with
  ``STRIPE_WEBHOOK_SECRET`` (the whole ``whsec_...`` string); the event id is the body's ``id``.

Examples (repo root; only the standard library is used, so any Python 3.10+ works)::

    py=scripts/simulate_webhooks.py
    python $py razorpay payment.captured --order-id order_Pq1... --amount 2500000 --currency INR
    python $py stripe payment_intent.succeeded --order-id pi_3Q... --amount 250000 --replay
    python $py stripe charge.refunded --order-id pi_3Q... --payment-id ch_3Q... --amount 250000
                                      --refund-amount 50000 --refund-id re_3Q...      (one line)
    python $py razorpay payment.captured --bad-signature      # expects a 4xx
    python $py stripe payment_intent.succeeded --stale         # expects a 4xx

Secrets are read from the process environment, then ``backend/.env`` (the API's own precedence), and are never
printed. ``--secret`` overrides both; use it only with throw-away test secrets (command lines end up in shell
history and process listings).

Exit status: 0 = every delivery got the expected status (2xx for valid deliveries, 4xx for ``--bad-signature``
/ ``--stale``, or exactly ``--expect-status``); 1 = an unexpected status; 2 = usage, configuration or
connection error.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import string
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = REPO_ROOT / "backend" / ".env"
DEFAULT_BASE_URL = "http://127.0.0.1:8000"
API_PREFIX = "/api/v1"
WEBHOOK_PATH = API_PREFIX + "/payments/webhooks/{gateway}"
STRIPE_TOLERANCE_SECONDS = 300
DEFAULT_STALE_SECONDS = 600
STRIPE_API_VERSION = "2024-06-20"
MAX_BODY_PRINT = 6000

GATEWAYS = ("razorpay", "stripe")
# Index 0 = success, 1 = failure, 2 = refund; the same intent maps across gateways.
EVENTS: dict[str, tuple[str, str, str]] = {
    "razorpay": ("payment.captured", "payment.failed", "refund.processed"),
    "stripe": ("payment_intent.succeeded", "payment_intent.payment_failed", "charge.refunded"),
}
INTENT_ALIASES: dict[str, int] = {
    "captured": 0,
    "capture": 0,
    "succeeded": 0,
    "success": 0,
    "paid": 0,
    "failed": 1,
    "failure": 1,
    "fail": 1,
    "refunded": 2,
    "refund": 2,
}
SECRET_KEYS = {"razorpay": "RAZORPAY_WEBHOOK_SECRET", "stripe": "STRIPE_WEBHOOK_SECRET"}
DEFAULT_CURRENCY = {"razorpay": "INR", "stripe": "USD"}
RAZORPAY_METHODS = ("card", "upi", "netbanking", "wallet", "emi")

_B62 = string.ascii_letters + string.digits


# ---------------------------------------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------------------------------------
def _rand(length: int, alphabet: str = _B62) -> str:
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _digits(length: int) -> str:
    return _rand(length, string.digits)


def razorpay_id(prefix: str) -> str:
    """Razorpay entity ids: ``<prefix>_`` + 14 base62 characters (e.g. ``pay_DESlfW9H8K9uqM``)."""
    return f"{prefix}_{_rand(14)}"


def stripe_id(prefix: str, lead: str = "3") -> str:
    """Stripe object ids: ``<prefix>_`` + 24 characters (e.g. ``pi_3MtwBwLkdIwHu7ix28a3tqPa``)."""
    return f"{prefix}_{lead}{_rand(23)}"


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path)


def read_dotenv(path: Path) -> dict[str, str]:
    """Minimal python-dotenv compatible reader (KEY=value, quotes, ``export``, inline `` # comments``).

    Values are returned to the caller only; nothing here prints them.
    """
    values: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return values
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        key, sep, value = line.partition("=")
        key = key.strip()
        if not sep or not key:
            continue
        value = value.strip()
        if value[:1] in ("'", '"'):
            quote = value[0]
            end = 1
            while end < len(value):
                if value[end] == "\\" and quote == '"':
                    end += 2
                    continue
                if value[end] == quote:
                    break
                end += 1
            inner = value[1:end]
            if quote == '"':
                inner = (
                    inner.replace("\\n", "\n").replace("\\t", "\t").replace('\\"', '"').replace("\\\\", "\\")
                )
            value = inner
        else:
            comment = re.search(r"\s#", value)
            if comment:
                value = value[: comment.start()].rstrip()
        values[key] = value
    return values


def resolve_secret(gateway: str, override: str | None, env_file: Path) -> tuple[str | None, str]:
    """Return ``(secret, human readable source)``. Precedence mirrors pydantic-settings: env var > .env."""
    key = SECRET_KEYS[gateway]
    if override is not None:
        return (override or None), "--secret"
    from_env = os.environ.get(key, "")
    if from_env:
        return from_env, f"environment variable {key}"
    from_file = read_dotenv(env_file).get(key, "")
    if from_file:
        return from_file, f"{display_path(env_file)} ({key})"
    return None, f"{key} is not set in the environment or in {display_path(env_file)}"


def resolve_event(gateway: str, name: str) -> str:
    raw = name.strip()
    if raw in EVENTS[gateway]:
        return raw
    lowered = raw.lower()
    if lowered in INTENT_ALIASES:
        return EVENTS[gateway][INTENT_ALIASES[lowered]]
    for other, names in EVENTS.items():
        if other != gateway and raw in names:
            mapped = EVENTS[gateway][names.index(raw)]
            print(f"note: '{raw}' is a {other} event; sending the {gateway} equivalent '{mapped}'")
            return mapped
    choices = ", ".join(EVENTS[gateway]) + " (aliases: " + ", ".join(sorted(INTENT_ALIASES)) + ")"
    raise SystemExit(f"error: unknown {gateway} event '{name}'. Choose one of: {choices}")


def parse_meta(items: list[str]) -> dict[str, str]:
    meta: dict[str, str] = {}
    for item in items:
        key, sep, value = item.partition("=")
        if not sep or not key.strip():
            raise SystemExit(f"error: --meta expects KEY=VALUE, got '{item}'")
        meta[key.strip()] = value
    return meta


# ---------------------------------------------------------------------------------------------------------
# payloads
# ---------------------------------------------------------------------------------------------------------
@dataclass
class Scenario:
    gateway: str
    event: str
    event_id: str
    order_id: str
    payment_id: str
    refund_id: str
    amount: int
    currency: str
    refund_amount: int
    total_refunded: int
    created_at: int
    pay_method: str
    email: str
    contact: str
    description: str
    fee: int | None
    tax: int | None
    base_amount: int | None
    error_code: str | None
    error_description: str | None
    meta: dict[str, str] = field(default_factory=dict)
    generated: list[str] = field(default_factory=list)


def _razorpay_payment(
    s: Scenario,
    *,
    status: str,
    captured: bool,
    failed: bool = False,
    amount_refunded: int = 0,
    refund_status: str | None = None,
) -> dict[str, Any]:
    ccy = s.currency.upper()
    entity: dict[str, Any] = {
        "id": s.payment_id,
        "entity": "payment",
        "amount": s.amount,
        "currency": ccy,
        "status": status,
        "order_id": s.order_id,
        "invoice_id": None,
        "international": ccy != "INR",
        "method": s.pay_method,
        "amount_refunded": amount_refunded,
        "amount_transferred": 0,
        "refund_status": refund_status,
        "captured": captured,
        "description": s.description,
        "card_id": None,
        "bank": None,
        "wallet": None,
        "vpa": None,
        "email": s.email,
        "contact": s.contact,
        "notes": dict(s.meta) if s.meta else [],
        "fee": None if failed else s.fee,
        "tax": None if failed else s.tax,
        "error_code": None,
        "error_description": None,
        "error_source": None,
        "error_step": None,
        "error_reason": None,
        "acquirer_data": {},
        "created_at": s.created_at - 8,
    }
    if s.base_amount is not None:
        entity["base_amount"] = s.base_amount
    elif ccy == "INR":
        entity["base_amount"] = s.amount
    if s.pay_method in ("card", "emi"):
        card_id = "card_" + _rand(14)
        entity["card_id"] = card_id
        entity["card"] = {
            "id": card_id,
            "entity": "card",
            "name": "Test Patient",
            "last4": "1111",
            "network": "Visa",
            "type": "credit",
            "issuer": None,
            "international": ccy != "INR",
            "emi": s.pay_method == "emi",
            "sub_type": "consumer",
        }
        entity["acquirer_data"] = {"auth_code": None if failed else _digits(6)}
    elif s.pay_method == "upi":
        entity["vpa"] = "success@razorpay"
        entity["acquirer_data"] = {"rrn": _digits(12), "upi_transaction_id": _rand(32).upper()}
    elif s.pay_method == "netbanking":
        entity["bank"] = "HDFC"
        entity["acquirer_data"] = {"bank_transaction_id": _digits(10)}
    elif s.pay_method == "wallet":
        entity["wallet"] = "paytm"
        entity["acquirer_data"] = {"transaction_id": None}
    if failed:
        entity.update(
            {
                "error_code": s.error_code or "BAD_REQUEST_ERROR",
                "error_description": s.error_description
                or "Your payment didn't go through as it was declined by the bank. "
                "Try another payment method or contact your bank.",
                "error_source": "bank",
                "error_step": "payment_authorization",
                "error_reason": "payment_failed",
            }
        )
    return entity


def build_razorpay_payload(s: Scenario) -> dict[str, Any]:
    envelope: dict[str, Any] = {
        "entity": "event",
        "account_id": "acc_" + _rand(14),
        "event": s.event,
        "contains": ["payment"],
        "payload": {},
        "created_at": s.created_at,
    }
    kind = EVENTS["razorpay"].index(s.event) if s.event in EVENTS["razorpay"] else 0
    if kind == 0:
        envelope["payload"]["payment"] = {"entity": _razorpay_payment(s, status="captured", captured=True)}
    elif kind == 1:
        envelope["payload"]["payment"] = {
            "entity": _razorpay_payment(s, status="failed", captured=False, failed=True)
        }
    else:
        full = s.total_refunded >= s.amount
        envelope["contains"] = ["refund", "payment"]
        envelope["payload"]["refund"] = {
            "entity": {
                "id": s.refund_id,
                "entity": "refund",
                "amount": s.refund_amount,
                "receipt": None,
                "currency": s.currency.upper(),
                "payment_id": s.payment_id,
                "notes": dict(s.meta) if s.meta else [],
                "acquirer_data": {"arn": _digits(23)},
                "created_at": s.created_at - 3,
                "batch_id": None,
                "status": "processed",
                "speed_processed": "normal",
                "speed_requested": "normal",
            }
        }
        envelope["payload"]["payment"] = {
            "entity": _razorpay_payment(
                s,
                status="refunded" if full else "captured",
                captured=True,
                amount_refunded=s.total_refunded,
                refund_status="full" if full else "partial",
            )
        }
    return envelope


def _stripe_card_details() -> dict[str, Any]:
    return {
        "brand": "visa",
        "checks": {"address_line1_check": None, "address_postal_code_check": None, "cvc_check": "pass"},
        "country": "US",
        "exp_month": 12,
        "exp_year": 2030,
        "fingerprint": _rand(16),
        "funding": "credit",
        "last4": "4242",
        "network": "visa",
    }


def _stripe_charge(
    s: Scenario,
    *,
    succeeded: bool,
    payment_method: str,
    amount_refunded: int = 0,
    refunds: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    ccy = s.currency.lower()
    charge: dict[str, Any] = {
        "id": s.payment_id,
        "object": "charge",
        "amount": s.amount,
        "amount_captured": s.amount if succeeded else 0,
        "amount_refunded": amount_refunded,
        "application": None,
        "application_fee": None,
        "application_fee_amount": None,
        "balance_transaction": ("txn_" + "3" + _rand(23)) if succeeded else None,
        "billing_details": {
            "address": {
                "city": None,
                "country": None,
                "line1": None,
                "line2": None,
                "postal_code": None,
                "state": None,
            },
            "email": s.email,
            "name": "Test Patient",
            "phone": None,
        },
        "calculated_statement_descriptor": "HEAL INDIA GLOBAL",
        "captured": succeeded,
        "created": s.created_at - 30,
        "currency": ccy,
        "customer": None,
        "description": s.description,
        "disputed": False,
        "failure_balance_transaction": None,
        "failure_code": None if succeeded else (s.error_code or "card_declined"),
        "failure_message": None if succeeded else (s.error_description or "Your card was declined."),
        "fraud_details": {},
        "livemode": False,
        "metadata": dict(s.meta),
        "outcome": {
            "network_status": "approved_by_network" if succeeded else "declined_by_network",
            "reason": None if succeeded else "generic_decline",
            "risk_level": "normal",
            "seller_message": (
                "Payment complete." if succeeded else "The bank did not return any further details."
            ),
            "type": "authorized" if succeeded else "issuer_declined",
        },
        "paid": succeeded,
        "payment_intent": s.order_id,
        "payment_method": payment_method,
        "payment_method_details": {"card": _stripe_card_details(), "type": "card"},
        "receipt_email": s.email,
        "receipt_url": f"https://pay.stripe.com/receipts/payment/{_rand(48)}",
        "refunded": succeeded and amount_refunded >= s.amount,
        "status": "succeeded" if succeeded else "failed",
    }
    if refunds is not None:
        charge["refunds"] = {
            "object": "list",
            "data": refunds,
            "has_more": False,
            "total_count": len(refunds),
            "url": f"/v1/charges/{s.payment_id}/refunds",
        }
    return charge


def _stripe_payment_intent(s: Scenario, *, succeeded: bool) -> dict[str, Any]:
    payment_method = "pm_1" + _rand(23)
    intent: dict[str, Any] = {
        "id": s.order_id,
        "object": "payment_intent",
        "amount": s.amount,
        "amount_capturable": 0,
        "amount_details": {"tip": {}},
        "amount_received": s.amount if succeeded else 0,
        "application": None,
        "application_fee_amount": None,
        "automatic_payment_methods": {"allow_redirects": "always", "enabled": True},
        "canceled_at": None,
        "cancellation_reason": None,
        "capture_method": "automatic_async",
        "client_secret": f"{s.order_id}_secret_{_rand(25)}",
        "confirmation_method": "automatic",
        "created": s.created_at - 60,
        "currency": s.currency.lower(),
        "customer": None,
        "description": s.description,
        "invoice": None,
        "last_payment_error": None,
        "latest_charge": s.payment_id,
        "livemode": False,
        "metadata": dict(s.meta),
        "next_action": None,
        "on_behalf_of": None,
        "payment_method": payment_method if succeeded else None,
        "payment_method_configuration_details": None,
        "payment_method_options": {
            "card": {
                "installments": None,
                "mandate_options": None,
                "network": None,
                "request_three_d_secure": "automatic",
            }
        },
        "payment_method_types": ["card"],
        "processing": None,
        "receipt_email": s.email,
        "review": None,
        "setup_future_usage": None,
        "shipping": None,
        "source": None,
        "statement_descriptor": None,
        "statement_descriptor_suffix": None,
        "status": "succeeded" if succeeded else "requires_payment_method",
        "transfer_data": None,
        "transfer_group": None,
    }
    if not succeeded:
        intent["last_payment_error"] = {
            "charge": s.payment_id,
            "code": s.error_code or "card_declined",
            "decline_code": "generic_decline",
            "doc_url": "https://stripe.com/docs/error-codes/card-declined",
            "message": s.error_description or "Your card was declined.",
            "payment_method": {
                "id": payment_method,
                "object": "payment_method",
                "billing_details": {"email": s.email, "name": "Test Patient"},
                "card": _stripe_card_details() | {"last4": "0002"},
                "created": s.created_at - 40,
                "customer": None,
                "livemode": False,
                "metadata": {},
                "type": "card",
            },
            "type": "card_error",
        }
    # Legacy shape (API versions before 2022-11-15 embedded the charges list): kept so a parser written
    # against either the old or the new docs finds what it looks for.
    intent["charges"] = {
        "object": "list",
        "data": [_stripe_charge(s, succeeded=succeeded, payment_method=payment_method)],
        "has_more": False,
        "total_count": 1,
        "url": f"/v1/charges?payment_intent={s.order_id}",
    }
    return intent


def build_stripe_payload(s: Scenario) -> dict[str, Any]:
    kind = EVENTS["stripe"].index(s.event) if s.event in EVENTS["stripe"] else 0
    data: dict[str, Any]
    if kind in (0, 1):
        data = {"object": _stripe_payment_intent(s, succeeded=kind == 0)}
    else:
        refund = {
            "id": s.refund_id,
            "object": "refund",
            "amount": s.refund_amount,
            "balance_transaction": "txn_3" + _rand(23),
            "charge": s.payment_id,
            "created": s.created_at - 2,
            "currency": s.currency.lower(),
            "destination_details": {
                "card": {
                    "reference": _digits(23),
                    "reference_status": "available",
                    "reference_type": "acquirer_reference_number",
                    "type": "refund",
                },
                "type": "card",
            },
            "metadata": dict(s.meta),
            "payment_intent": s.order_id,
            "reason": "requested_by_customer",
            "receipt_number": None,
            "source_transfer_reversal": None,
            "status": "succeeded",
            "transfer_reversal": None,
        }
        previously_refunded = max(0, s.total_refunded - s.refund_amount)
        data = {
            "object": _stripe_charge(
                s,
                succeeded=True,
                payment_method="pm_1" + _rand(23),
                amount_refunded=s.total_refunded,
                refunds=[refund],
            ),
            "previous_attributes": {"amount_refunded": previously_refunded, "refunded": False},
        }
    return {
        "id": s.event_id,
        "object": "event",
        "api_version": STRIPE_API_VERSION,
        "created": s.created_at,
        "data": data,
        "livemode": False,
        "pending_webhooks": 1,
        "request": {"id": "req_" + _rand(14), "idempotency_key": str(uuid.uuid4())},
        "type": s.event,
    }


# ---------------------------------------------------------------------------------------------------------
# signing + delivery
# ---------------------------------------------------------------------------------------------------------
def razorpay_signature(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def stripe_signature_header(body: bytes, secret: str, timestamp: int) -> str:
    signed_payload = str(timestamp).encode("ascii") + b"." + body
    v1 = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={v1}"


def build_headers(
    s: Scenario, body: bytes, secret: str, *, bad_signature: bool, timestamp: int
) -> dict[str, str]:
    key = secret + ":not-the-webhook-secret" if bad_signature else secret
    if s.gateway == "razorpay":
        return {
            "Content-Type": "application/json",
            "Accept": "*/*",
            "User-Agent": "Razorpay-Webhook/v1",
            "X-Razorpay-Event-Id": s.event_id,
            "X-Razorpay-Signature": razorpay_signature(body, key),
        }
    return {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "*/*; q=0.5, application/xml",
        "Cache-Control": "no-cache",
        "User-Agent": "Stripe/1.0 (+https://stripe.com/docs/webhooks)",
        "Stripe-Signature": stripe_signature_header(body, key, timestamp),
    }


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # surface 3xx as-is: a redirect usually means a wrong URL / trailing slash


@dataclass
class Delivery:
    status: int
    reason: str
    headers: dict[str, str]
    body: bytes
    elapsed_ms: float


def deliver(url: str, body: bytes, headers: dict[str, str], timeout: float) -> Delivery:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
    started = time.perf_counter()
    try:
        with opener.open(request, timeout=timeout) as response:
            status, reason = response.status, response.reason
            resp_headers = {k.lower(): v for k, v in response.headers.items()}
            data = response.read()
    except urllib.error.HTTPError as exc:
        status, reason = exc.code, str(exc.reason)
        resp_headers = {k.lower(): v for k, v in (exc.headers.items() if exc.headers else [])}
        try:
            data = exc.read()
        except Exception:
            data = b""
    except urllib.error.URLError as exc:
        raise ConnectionError(f"cannot reach {url}: {exc.reason}") from exc
    except (TimeoutError, OSError) as exc:
        raise ConnectionError(f"cannot reach {url}: {exc}") from exc
    return Delivery(status, reason, resp_headers, data, (time.perf_counter() - started) * 1000)


def render_body(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="replace")
    if not text.strip():
        return "(empty body)"
    try:
        text = json.dumps(json.loads(text), indent=2, ensure_ascii=False)
    except ValueError:
        pass
    if len(text) > MAX_BODY_PRINT:
        text = text[:MAX_BODY_PRINT] + f"\n... ({len(text) - MAX_BODY_PRINT} more characters)"
    return text


def explain(gateway: str, result: Delivery, attempt: int, event_id: str, bad: bool) -> str | None:
    """One-line hint for the outcomes the Heal India Global API is known to produce."""
    try:
        body = json.loads(result.body.decode("utf-8", errors="replace") or "null")
    except ValueError:
        body = None
    error = body.get("error") if isinstance(body, dict) and isinstance(body.get("error"), dict) else {}
    code = error.get("code")
    ack = body.get("status") if isinstance(body, dict) else None
    key = SECRET_KEYS[gateway]
    if result.status == 404:
        return (
            f"hint: 404 - '{gateway}' is probably not in PAYMENT_GATEWAYS_ENABLED (backend/.env), or the URL "
            "is wrong; restart the API after changing .env"
        )
    if code == "webhook_not_configured":
        return f"hint: the API has no {key}; add it to backend/.env and restart the API"
    if code == "invalid_signature" and not bad:
        return (
            f"hint: the API rejected a correctly signed delivery - its {key} differs from the one used here "
            "(restarted the API after editing .env? passing a different --secret?), or the timestamp is "
            "outside the 300 s window"
        )
    if result.status == 429:
        return "hint: rate limited (600 webhook deliveries/min per IP) - wait a minute"
    if ack == "duplicate" and attempt == 1:
        return f"hint: event id {event_id} was already received earlier - omit --event-id for a fresh event"
    if ack == "ignored":
        return "hint: acknowledged but not handled (event type not processed by the API)"
    if ack == "error":
        return (
            f"hint: stored but processing failed - check webhook_events.processing_error for event id "
            f"{event_id} (unknown order/payment id?)"
        )
    return None


def _indent(text: str, prefix: str = "    ") -> str:
    return "\n".join(prefix + line for line in text.splitlines())


def _safe_print(text: str = "") -> None:
    try:
        print(text)
    except UnicodeEncodeError:
        enc = sys.stdout.encoding or "ascii"
        print(text.encode(enc, errors="replace").decode(enc, errors="replace"))


def build_url(args: argparse.Namespace, gateway: str) -> str:
    if args.url:
        return args.url
    base = args.base_url.rstrip("/")
    path = WEBHOOK_PATH.format(gateway=gateway)
    base = base.removesuffix(API_PREFIX)
    return base + path


# ---------------------------------------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    events_help = "; ".join(f"{gw}: {', '.join(names)}" for gw, names in EVENTS.items())
    parser = argparse.ArgumentParser(
        prog="simulate_webhooks.py",
        description="Send signed Razorpay/Stripe webhook deliveries to the local Heal India Global API.",
        epilog=(
            "Events - " + events_help + ". Aliases: success/captured, failed, refund. "
            "Exit status: 0 expected outcome, 1 unexpected HTTP status, 2 usage/config/connection error. "
            "See scripts/README-tools.md for walkthroughs."
        ),
    )
    parser.add_argument(
        "gateway", choices=GATEWAYS, help="which gateway's webhook format and signature to use"
    )
    parser.add_argument("event", help="event type (see below) or an alias: success | failed | refund")

    ids = parser.add_argument_group("payment identity (copy these from the order / checkout response)")
    ids.add_argument(
        "--order-id",
        help="gateway order id: Razorpay order_... / Stripe PaymentIntent pi_... "
        "(PaymentOrderOut.gateway_order_id); generated when omitted",
    )
    ids.add_argument(
        "--payment-id",
        help="gateway payment id: Razorpay pay_... / Stripe charge ch_...; generated when omitted",
    )
    ids.add_argument(
        "--refund-id",
        help="gateway refund id for refund events: Razorpay rfnd_... / "
        "Stripe re_... "
        "(refunds.gateway_refund_id); generated when omitted",
    )
    ids.add_argument(
        "--event-id",
        help="event id (Razorpay X-Razorpay-Event-Id header / Stripe evt_...); "
        "generated when omitted - reuse one to test dedupe across runs",
    )
    ids.add_argument(
        "--amount",
        type=int,
        default=100000,
        help="amount in minor units of --currency (default 100000 = 1,000.00)",
    )
    ids.add_argument("--currency", help="ISO-4217 code (default INR for razorpay, USD for stripe)")
    ids.add_argument("--refund-amount", type=int, help="refund amount in minor units (default: --amount)")
    ids.add_argument(
        "--total-refunded",
        type=int,
        help="cumulative refunded amount on the payment after this refund (default: --refund-amount)",
    )
    ids.add_argument(
        "--meta",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="add to Stripe metadata / Razorpay notes (repeatable), e.g. --meta order_number=HIG-P-...",
    )

    details = parser.add_argument_group("payment details")
    details.add_argument(
        "--method",
        dest="pay_method",
        choices=RAZORPAY_METHODS,
        default="card",
        help="Razorpay payment method (default card)",
    )
    details.add_argument(
        "--fee", type=int, help="Razorpay fee incl. GST in minor units (default ~2%% + 18%% GST)"
    )
    details.add_argument("--tax", type=int, help="Razorpay GST part of the fee in minor units")
    details.add_argument(
        "--base-amount", type=int, help="Razorpay base_amount (INR paise) for non-INR payments"
    )
    details.add_argument("--email", default="patient@example.com", help="payer e-mail in the payload")
    details.add_argument("--contact", default="+15555550100", help="payer phone in the Razorpay payload")
    details.add_argument("--description", default="Heal India Global booking payment")
    details.add_argument("--error-code", help="failure code for failed events")
    details.add_argument("--error-description", help="failure message for failed events")
    details.add_argument(
        "--event-name",
        help="advanced: override the event type string (same payload shape), e.g. to "
        "check that unknown events are acknowledged and ignored",
    )

    mode = parser.add_argument_group("delivery")
    mode.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"API origin (default {DEFAULT_BASE_URL}); '{API_PREFIX}' is appended unless present",
    )
    mode.add_argument("--url", help="exact webhook URL (overrides --base-url)")
    mode.add_argument(
        "--replay",
        action="store_true",
        help="deliver the identical event twice (idempotency check: both should be 2xx and the "
        "second must not be processed again)",
    )
    mode.add_argument("--replay-delay", type=float, default=0.5, help="seconds between the two deliveries")
    mode.add_argument(
        "--bad-signature",
        action="store_true",
        help="sign with the wrong key (expects a 4xx and no state change)",
    )
    mode.add_argument(
        "--stale",
        action="store_true",
        help=f"Stripe only: timestamp older than the {STRIPE_TOLERANCE_SECONDS} s tolerance "
        "(valid HMAC, expects a 4xx)",
    )
    mode.add_argument(
        "--stale-seconds",
        type=int,
        default=DEFAULT_STALE_SECONDS,
        help=f"age of the --stale timestamp in seconds (default {DEFAULT_STALE_SECONDS})",
    )
    mode.add_argument("--timestamp", type=int, help="Stripe: exact unix timestamp to sign with")
    mode.add_argument("--expect-status", type=int, help="exact HTTP status every delivery must return")
    mode.add_argument("--timeout", type=float, default=15.0, help="HTTP timeout in seconds (default 15)")
    mode.add_argument("--dry-run", action="store_true", help="build, sign and print; do not send")
    mode.add_argument("--show-payload", action="store_true", help="print the JSON body that is sent")

    sec = parser.add_argument_group("secret (never printed)")
    sec.add_argument("--secret", help="webhook secret override (test secrets only)")
    sec.add_argument(
        "--env-file",
        type=Path,
        default=DEFAULT_ENV_FILE,
        help=f"dotenv file to read the secret from (default {display_path(DEFAULT_ENV_FILE)})",
    )
    return parser


def _expected(status: int, args: argparse.Namespace) -> bool:
    if args.expect_status is not None:
        return status == args.expect_status
    if args.bad_signature or args.stale:
        return 400 <= status < 500
    return 200 <= status < 300


def _expectation_text(args: argparse.Namespace) -> str:
    if args.expect_status is not None:
        return f"HTTP {args.expect_status}"
    if args.bad_signature or args.stale:
        return "4xx (rejected) and no state change"
    return "2xx" + (" on both deliveries; the second must be deduplicated" if args.replay else "")


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass
    args = build_parser().parse_args(argv)
    gateway: str = args.gateway
    event = resolve_event(gateway, args.event)

    if args.stale and gateway != "stripe":
        print(
            "error: --stale applies to Stripe only (Razorpay signatures carry no timestamp)", file=sys.stderr
        )
        return 2
    if args.amount <= 0:
        print("error: --amount must be a positive integer (minor units)", file=sys.stderr)
        return 2
    currency = (args.currency or DEFAULT_CURRENCY[gateway]).strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", currency):
        print(f"error: --currency must be a 3-letter ISO code, got '{args.currency}'", file=sys.stderr)
        return 2
    refund_amount = args.refund_amount if args.refund_amount is not None else args.amount
    total_refunded = args.total_refunded if args.total_refunded is not None else refund_amount
    if refund_amount <= 0 or total_refunded < refund_amount:
        print("error: --refund-amount must be > 0 and --total-refunded >= --refund-amount", file=sys.stderr)
        return 2
    if total_refunded > args.amount:
        print(
            "warning: refunded total exceeds the payment amount; the API should reject this", file=sys.stderr
        )

    generated: list[str] = []
    order_id = args.order_id
    if not order_id:
        order_id = razorpay_id("order") if gateway == "razorpay" else stripe_id("pi")
        generated.append("order id")
    payment_id = args.payment_id
    if not payment_id:
        payment_id = razorpay_id("pay") if gateway == "razorpay" else stripe_id("ch")
        generated.append("payment id")
    refund_id = args.refund_id or (razorpay_id("rfnd") if gateway == "razorpay" else stripe_id("re"))
    if not args.refund_id and event == EVENTS[gateway][2]:
        generated.append("refund id")
    event_id = args.event_id or (_rand(14) if gateway == "razorpay" else stripe_id("evt", lead="1"))

    fee, tax = args.fee, args.tax
    if gateway == "razorpay":
        base_fee = round(args.amount * 0.02)
        if tax is None:
            tax = round(base_fee * 0.18) if fee is None else round(fee * 18 / 118)
        if fee is None:
            fee = base_fee + tax

    scenario = Scenario(
        gateway=gateway,
        event=event,
        event_id=event_id,
        order_id=order_id,
        payment_id=payment_id,
        refund_id=refund_id,
        amount=args.amount,
        currency=currency,
        refund_amount=refund_amount,
        total_refunded=total_refunded,
        created_at=int(time.time()),
        pay_method=args.pay_method,
        email=args.email,
        contact=args.contact,
        description=args.description,
        fee=fee,
        tax=tax,
        base_amount=args.base_amount,
        error_code=args.error_code,
        error_description=args.error_description,
        meta=parse_meta(args.meta),
        generated=generated,
    )
    payload = (build_razorpay_payload if gateway == "razorpay" else build_stripe_payload)(scenario)
    if args.event_name:
        # keep the payload shape of the selected event while advertising another event type
        payload["event" if gateway == "razorpay" else "type"] = args.event_name
    event_label = args.event_name or event

    if gateway == "razorpay":
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    else:
        body = json.dumps(payload, indent=2).encode("utf-8")

    secret, secret_source = resolve_secret(gateway, args.secret, args.env_file)
    if secret is None:
        if args.bad_signature:
            secret = secrets.token_hex(24)
            secret_source = "random key (no secret configured; --bad-signature)"
        else:
            print(f"error: {secret_source}.", file=sys.stderr)
            print(
                f"       Add {SECRET_KEYS[gateway]}=<value> to backend/.env (and '{gateway}' to "
                "PAYMENT_GATEWAYS_ENABLED), restart the API, or pass --secret for a throw-away test secret.",
                file=sys.stderr,
            )
            return 2

    url = build_url(args, gateway)
    now = int(time.time())
    if args.timestamp is not None:
        timestamp = args.timestamp
    elif args.stale:
        timestamp = now - max(args.stale_seconds, STRIPE_TOLERANCE_SECONDS + 1)
    else:
        timestamp = now

    signature_mode = "INVALID (signed with the wrong key)" if args.bad_signature else "valid HMAC-SHA256"
    if gateway == "stripe":
        age = now - timestamp
        beyond = "; beyond the tolerance" if age > STRIPE_TOLERANCE_SECONDS else ""
        signature_mode += f", t={timestamp} ({age} s old{beyond})"
    _safe_print(f"{gateway} webhook '{event_label}' -> POST {url}")
    header_note = "  (X-Razorpay-Event-Id header)" if gateway == "razorpay" else ""
    _safe_print(f"  event id    : {event_id}{header_note}")
    _safe_print(f"  order id    : {order_id}" + ("  (generated)" if "order id" in generated else ""))
    _safe_print(f"  payment id  : {payment_id}" + ("  (generated)" if "payment id" in generated else ""))
    if event == EVENTS[gateway][2]:
        _safe_print(f"  refund id   : {refund_id}" + ("  (generated)" if "refund id" in generated else ""))
        _safe_print(f"  refund      : {refund_amount} {currency} (payment total refunded {total_refunded})")
    _safe_print(f"  amount      : {args.amount} {currency} (minor units)")
    if scenario.meta:
        _safe_print(f"  metadata    : {json.dumps(scenario.meta)}")
    _safe_print(f"  signature   : {signature_mode}; secret from {secret_source}")
    _safe_print(f"  expectation : {_expectation_text(args)}")
    if generated and not (args.bad_signature or args.stale):
        _safe_print(
            f"  note        : {', '.join(generated)} generated - the API has no matching order; pass "
            "--order-id/--payment-id from a real checkout to exercise the full flow"
        )
    if args.show_payload or args.dry_run:
        _safe_print("  payload     :")
        _safe_print(_indent(body.decode("utf-8")))

    deliveries = 2 if args.replay else 1
    all_ok = True
    results: list[Delivery] = []
    for attempt in range(1, deliveries + 1):
        if attempt > 1 and gateway == "stripe" and args.timestamp is None and not args.stale:
            timestamp = int(time.time())  # Stripe re-signs every delivery attempt with a fresh timestamp
        headers = build_headers(scenario, body, secret, bad_signature=args.bad_signature, timestamp=timestamp)
        label = f"delivery {attempt}/{deliveries}" if deliveries > 1 else "response"
        if args.dry_run:
            shown = {
                k: v
                for k, v in headers.items()
                if k.lower()
                in ("x-razorpay-signature", "x-razorpay-event-id", "stripe-signature", "content-type")
            }
            _safe_print(f"[dry-run] {label} headers: {json.dumps(shown)}")
            continue
        try:
            result = deliver(url, body, headers, args.timeout)
        except ConnectionError as exc:
            print(
                f"error: {exc}. Is the API running? (cd backend && .venv/Scripts/python -m uvicorn "
                "app.main:app --port 8000)",
                file=sys.stderr,
            )
            return 2
        results.append(result)
        ok = _expected(result.status, args)
        all_ok = all_ok and ok
        request_id = result.headers.get("x-request-id")
        _safe_print(
            f"{label}: HTTP {result.status} {result.reason} ({result.elapsed_ms:.0f} ms)"
            + (f"  x-request-id={request_id}" if request_id else "")
            + ("" if ok else "   <-- UNEXPECTED")
        )
        _safe_print(_indent(render_body(result.body)))
        hint = explain(gateway, result, attempt, event_id, args.bad_signature or args.stale)
        if hint:
            _safe_print("  " + hint)
        if attempt < deliveries and args.replay_delay > 0:
            time.sleep(args.replay_delay)

    if args.dry_run:
        _safe_print("dry run: nothing was sent")
        return 0
    if args.replay and len(results) == 2:
        second = results[1].body.decode("utf-8", errors="replace").lower()
        if any(word in second for word in ("duplicate", "already", "replay", "ignored")):
            _safe_print("replay: the second delivery was reported as a duplicate")
        else:
            _safe_print(
                "replay: the API did not say 'duplicate' - confirm webhook_events holds ONE row for event id "
                f"{event_id} and that payments/ledger were not applied twice"
            )
    verdict = "OK - matched the expectation" if all_ok else "FAILED - unexpected HTTP status"
    _safe_print("result: " + verdict)
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
