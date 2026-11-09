"""Finance set-up for the demo: commission rules and payout accounts (fictional bank details).

Account numbers are obviously fake and IFSC/SWIFT codes use the non-existent ``DEMO`` bank prefix.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from scripts.seed_data.hospitals import HOSPITALS

__all__ = ["COMMISSION_RULES", "PAYOUT_ACCOUNTS"]

_EFFECTIVE_FROM = date(2026, 4, 1)

#: ``target`` is a specialty slug, hospital slug or agent code depending on ``scope``.
COMMISSION_RULES: list[dict[str, Any]] = [
    {"scope": "global", "target": None, "rate_bps": 1500, "effective_from": _EFFECTIVE_FROM},
    {"scope": "specialty", "target": "cosmetic", "rate_bps": 1800, "effective_from": _EFFECTIVE_FROM},
    {"scope": "specialty", "target": "dental", "rate_bps": 1800, "effective_from": _EFFECTIVE_FROM},
    {"scope": "hospital", "target": "pournami-chennai", "rate_bps": 1200, "effective_from": _EFFECTIVE_FROM},
    {"scope": "agent", "target": "AGTLAGS2", "rate_bps": 600, "effective_from": _EFFECTIVE_FROM},
]

_UNVERIFIED_HOSPITALS = {"aravali-heights-jaipur", "shivalik-chandigarh"}


def _hospital_account(index: int, hospital: dict[str, Any]) -> dict[str, Any]:
    number = f"5000{index:08d}"
    return {
        "owner_type": "hospital",
        "owner": hospital["slug"],
        "account_holder_name": hospital["legal_name"],
        "account_number": number,
        "account_number_last4": number[-4:],
        "ifsc": f"DEMO0{index:06d}",
        "bank_name": "Demo National Bank",
        "swift": None,
        "razorpay_linked_account_id": None,
        "is_verified": hospital["slug"] not in _UNVERIFIED_HOSPITALS,
        "is_primary": True,
        "status": "active",
    }


PAYOUT_ACCOUNTS: list[dict[str, Any]] = [
    *(_hospital_account(i, h) for i, h in enumerate(HOSPITALS, start=1)),
    {
        "owner_type": "agent",
        "owner": "AGTLAGS2",
        "account_holder_name": "Lagos MedConnect Travel Ltd",
        "account_number": "0000000101",
        "account_number_last4": "0101",
        "ifsc": None,
        "bank_name": "Demo Commercial Bank (Lagos)",
        "swift": "DEMONGLA",
        "razorpay_linked_account_id": None,
        "is_verified": True,
        "is_primary": True,
        "status": "active",
    },
]
