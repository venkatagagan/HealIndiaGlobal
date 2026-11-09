"""Platform settings stored in ``platform_settings`` (key -> JSONB) with code defaults (PLAN 6.3).

    from app.core.settings_store import get_setting
    deposit_pct = await get_setting(db, "deposit_pct")            # 20 unless overridden by an admin
    await set_setting(db, "deposit_pct", 25, actor=user)          # adds row + audit log; caller commits

Reads are cached in-process for 30 s; ``set_setting`` invalidates the cache immediately.
"""

from __future__ import annotations

import copy
import re
import time
from typing import TYPE_CHECKING, Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.errors import BadRequest
from app.core.site_settings import WEBSITE_DEFAULTS, WEBSITE_KEYS, validate_website_setting

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.models.identity import User

CACHE_TTL_SECONDS = 30.0

DEFAULTS: dict[str, Any] = {
    "default_commission_bps": 1500,
    "default_agent_commission_bps": 500,
    "gst_rate_bps": 1800,
    "tds_194o_rate_bps": 10,
    "deposit_pct": 20,
    "settlement_hold_days": 3,
    "settlement_cycle_days": 7,
    "patient_service_fee_bps": 0,
    "fx_rate_max_age_hours": 72,  # 0 disables the staleness check
    "refund_dual_approval_threshold_minor": 5_000_000,  # INR 50,000; 0 = every refund needs a second approver
    # be-finance (docs/PAYMENTS.md 7.3, 9.2, 10.2; implementation keys, not in PLAN 6.3)
    "cancellation_retention_hospital_share_bps": 10_000,  # hospital agreement Schedule A Option A
    "agent_tds_rate_bps": 200,  # TDS on resident agents' commission (s.194H)
    "agent_nonresident_withholding_bps": 0,  # set per CA/DTAA advice
    "platform_gstin": None,  # supplier GSTIN on commission tax invoices ("" = unset)
    "platform_gst_state": None,  # registered state: CGST+SGST for same-state hospitals, IGST otherwise
    "refund_policy": [
        {"days_before": 14, "refund_pct": 100},
        {"days_before": 7, "refund_pct": 50},
        {"days_before": 0, "refund_pct": 0},
    ],
    "bank_transfer_details": {
        "beneficiary_name": "Heal India Global Pvt Ltd",
        "bank_name": "Example Bank",
        "account_number": "000000000000",
        "ifsc": "EXMP0000001",
        "swift": "EXMPINBB",
        "iban": None,
    },
    "supported_currencies": [
        "USD",
        "EUR",
        "GBP",
        "AED",
        "SAR",
        "INR",
        "NGN",
        "KES",
        "BDT",
        "AUD",
        "CAD",
        "OMR",
        "QAR",
        "KWD",
    ],
    # Website & contact (super_admin only; app/core/site_settings.py). Includes ``helplines``.
    **WEBSITE_DEFAULTS,
}

# Keys only a super_admin may change (the public website's contact details, analytics, claims, reviewers).
SUPER_ADMIN_KEYS: frozenset[str] = WEBSITE_KEYS

# Keys only finance (or super_admin) may change.
FINANCE_KEYS: frozenset[str] = frozenset(
    {
        "default_commission_bps",
        "default_agent_commission_bps",
        "gst_rate_bps",
        "tds_194o_rate_bps",
        "deposit_pct",
        "settlement_hold_days",
        "settlement_cycle_days",
        "patient_service_fee_bps",
        "fx_rate_max_age_hours",
        "refund_dual_approval_threshold_minor",
        "cancellation_retention_hospital_share_bps",
        "agent_tds_rate_bps",
        "agent_nonresident_withholding_bps",
        "platform_gstin",
        "platform_gst_state",
        "refund_policy",
        "bank_transfer_details",
    }
)

_INT_RANGES: dict[str, tuple[int, int]] = {
    "default_commission_bps": (0, 10_000),
    "default_agent_commission_bps": (0, 10_000),
    "gst_rate_bps": (0, 10_000),
    "tds_194o_rate_bps": (0, 10_000),
    "deposit_pct": (0, 100),
    "settlement_hold_days": (0, 365),
    "settlement_cycle_days": (1, 365),
    "patient_service_fee_bps": (0, 10_000),
    "fx_rate_max_age_hours": (0, 24 * 30),
    "refund_dual_approval_threshold_minor": (0, 10**12),
    "cancellation_retention_hospital_share_bps": (0, 10_000),
    "agent_tds_rate_bps": (0, 10_000),
    "agent_nonresident_withholding_bps": (0, 10_000),
}

_GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")

_cache: dict[str, Any] | None = None
_cache_expires_at = 0.0


def clear_settings_cache() -> None:
    global _cache, _cache_expires_at
    _cache = None
    _cache_expires_at = 0.0


async def _load(db: AsyncSession) -> dict[str, Any]:
    global _cache, _cache_expires_at
    now = time.monotonic()
    if _cache is not None and now < _cache_expires_at:
        return _cache
    from app.models.catalog import PlatformSetting

    rows = (await db.execute(select(PlatformSetting.key, PlatformSetting.value))).all()
    merged = copy.deepcopy(DEFAULTS)
    for key, value in rows:
        merged[key] = value
    _cache = merged
    _cache_expires_at = now + CACHE_TTL_SECONDS
    return merged


async def get_setting(db: AsyncSession, key: str, default: Any = None) -> Any:
    """Value for ``key`` (DB override, else ``DEFAULTS``, else ``default``). Returns a deep copy."""
    values = await _load(db)
    if key in values:
        return copy.deepcopy(values[key])
    return default


async def get_all_settings(db: AsyncSession) -> dict[str, Any]:
    return copy.deepcopy(await _load(db))


def validate_setting(key: str, value: Any) -> Any:
    """Type/range checks for known keys; unknown keys must be JSON values (accepted as-is)."""
    if key in WEBSITE_KEYS:
        return validate_website_setting(key, value)
    if key in _INT_RANGES:
        if isinstance(value, bool) or not isinstance(value, int):
            raise BadRequest(f"Setting '{key}' must be an integer", code="invalid_setting")
        low, high = _INT_RANGES[key]
        if not low <= value <= high:
            raise BadRequest(f"Setting '{key}' must be between {low} and {high}", code="invalid_setting")
    elif key == "refund_policy":
        if not isinstance(value, list) or not value:
            raise BadRequest("refund_policy must be a non-empty list", code="invalid_setting")
        for tier in value:
            if (
                not isinstance(tier, dict)
                or not isinstance(tier.get("days_before"), int)
                or not isinstance(tier.get("refund_pct"), int)
                or not 0 <= tier["refund_pct"] <= 100
                or tier["days_before"] < 0
            ):
                raise BadRequest(
                    "refund_policy entries need integer days_before >= 0 and refund_pct 0..100",
                    code="invalid_setting",
                )
    elif key == "supported_currencies":
        if not isinstance(value, list) or not all(isinstance(c, str) and len(c) == 3 for c in value):
            raise BadRequest("supported_currencies must be a list of ISO-4217 codes", code="invalid_setting")
        value = [c.upper() for c in value]
    elif key == "bank_transfer_details" and not isinstance(value, dict):
        raise BadRequest(f"Setting '{key}' must be an object", code="invalid_setting")
    elif key == "platform_gstin" and value is not None:
        if not isinstance(value, str):
            raise BadRequest("platform_gstin must be a string", code="invalid_setting")
        value = value.strip().upper()
        if value and not _GSTIN_RE.match(value):
            raise BadRequest("platform_gstin must be a 15-character GSTIN (or empty)", code="invalid_setting")
    elif key == "platform_gst_state" and value is not None:
        if not isinstance(value, str) or len(value.strip()) > 100:
            raise BadRequest("platform_gst_state must be a state name (<= 100 chars)", code="invalid_setting")
        value = value.strip()
    return value


async def set_setting(db: AsyncSession, key: str, value: Any, actor: User | None) -> Any:
    """Upsert a setting and write an audit log entry. The caller commits."""
    from app.core.audit import audit_log
    from app.models.catalog import PlatformSetting

    if not key or len(key) > 100:
        raise BadRequest("Invalid setting key", code="invalid_setting")
    value = validate_setting(key, value)
    before = await get_setting(db, key)
    stmt = pg_insert(PlatformSetting).values(key=key, value=value, updated_by=actor.id if actor else None)
    stmt = stmt.on_conflict_do_update(
        index_elements=[PlatformSetting.key],
        set_={"value": stmt.excluded.value, "updated_by": stmt.excluded.updated_by, "updated_at": _now_sql()},
    )
    await db.execute(stmt)
    await audit_log(
        db,
        actor=actor,
        action="settings.update",
        entity_type="platform_setting",
        entity_id=key,
        before={"value": before},
        after={"value": value},
    )
    clear_settings_cache()
    return value


def _now_sql() -> Any:
    from sqlalchemy import func

    return func.now()
