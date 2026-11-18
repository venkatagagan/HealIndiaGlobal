"""The ``referral_programme`` platform setting (finance-controlled; docs/REFERRALS.md).

Reward amounts are integer minor units per currency. A patient is rewarded in their preferred currency when it
is listed, else in ``fallback_currency`` (a fixed "USD-equivalent" credit by default); either way the credit is
booked in INR (the ledger base currency) at the day's rate and shown back in the patient's currency.

The defaults are placeholders until the business decides (TODO-BUSINESS): USD 50 for the referrer, USD 25 for
the new patient, at most 10 rewards per referrer per rolling year, credit valid for 365 days, and a referral
must qualify (first booking completed) within 365 days of sign-up.
"""

from __future__ import annotations

import re
from typing import Any

from app.core.errors import BadRequest

REFERRAL_SETTING_KEY = "referral_programme"

REFERRAL_DEFAULTS: dict[str, Any] = {
    "enabled": True,
    "reward_referrer": True,
    "reward_referee": True,
    "referrer_reward": {"USD": 5000},
    "referee_reward": {"USD": 2500},
    "fallback_currency": "USD",
    "max_rewards_per_year": 10,
    "credit_validity_days": 365,
    "qualify_within_days": 365,
}

_BOOL_KEYS = ("enabled", "reward_referrer", "reward_referee")
_INT_KEYS: dict[str, tuple[int, int]] = {
    "max_rewards_per_year": (0, 1000),
    "credit_validity_days": (1, 3650),
    "qualify_within_days": (1, 3650),
}
_MAP_KEYS = ("referrer_reward", "referee_reward")
_CCY_RE = re.compile(r"^[A-Z]{3}$")
MAX_REWARD_MINOR = 100_000_000


def _invalid(message: str) -> BadRequest:
    return BadRequest(message, code="invalid_setting")


def validate_referral_programme(value: Any) -> dict[str, Any]:
    """Strict schema: every key required, no unknown keys, amounts are non-negative integers per ISO code."""
    if not isinstance(value, dict):
        raise _invalid("referral_programme must be an object")
    unknown = sorted(set(value) - set(REFERRAL_DEFAULTS))
    if unknown:
        raise BadRequest(
            "referral_programme has unknown fields", code="invalid_setting", details={"fields": unknown}
        )
    out: dict[str, Any] = {}
    for key in _BOOL_KEYS:
        raw = value.get(key, REFERRAL_DEFAULTS[key])
        if not isinstance(raw, bool):
            raise _invalid(f"referral_programme.{key} must be true or false")
        out[key] = raw
    for key, (low, high) in _INT_KEYS.items():
        raw = value.get(key, REFERRAL_DEFAULTS[key])
        if isinstance(raw, bool) or not isinstance(raw, int) or not low <= raw <= high:
            raise _invalid(f"referral_programme.{key} must be an integer between {low} and {high}")
        out[key] = raw
    for key in _MAP_KEYS:
        raw = value.get(key, REFERRAL_DEFAULTS[key])
        if not isinstance(raw, dict) or not raw:
            raise _invalid(f"referral_programme.{key} must map currency codes to amounts")
        amounts: dict[str, int] = {}
        for ccy, amount in raw.items():
            code = str(ccy).strip().upper()
            if not _CCY_RE.match(code):
                raise _invalid(f"referral_programme.{key} has an invalid currency code")
            if isinstance(amount, bool) or not isinstance(amount, int) or not 0 <= amount <= MAX_REWARD_MINOR:
                raise _invalid(f"referral_programme.{key}.{code} must be a non-negative integer (minor units)")
            amounts[code] = amount
        out[key] = amounts
    fallback = str(value.get("fallback_currency", REFERRAL_DEFAULTS["fallback_currency"]) or "").upper()
    if not _CCY_RE.match(fallback):
        raise _invalid("referral_programme.fallback_currency must be an ISO-4217 code")
    for key in _MAP_KEYS:
        if fallback not in out[key]:
            raise _invalid(f"referral_programme.{key} must include the fallback currency {fallback}")
    out["fallback_currency"] = fallback
    return out
