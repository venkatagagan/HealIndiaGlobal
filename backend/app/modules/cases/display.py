"""Approximate amounts in the viewer's currency for case / quote / booking responses.

Quotes and bookings are priced (and paid) in their own currency, usually INR. Patients also get
``display_*`` money objects in their preferred currency (or ``?currency=``) next to the original amounts.
Hospitals, agents and staff get them only when they pass ``?currency=``.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency import add_display_amounts
from app.core.enums import UserRole
from app.core.errors import BadRequest
from app.core.money import BASE_CURRENCY, DEFAULT_FX_RATES, CurrencyError, normalize_currency
from app.models import FxRate, PatientProfile, User

DisplayCurrency = Annotated[
    str | None,
    Query(
        min_length=3,
        max_length=3,
        description="Add approximate display_* amounts in this currency (default for patients: their "
        "preferred currency). Original amounts are unchanged.",
    ),
]


async def _validated(db: AsyncSession, value: str) -> str:
    try:
        code = normalize_currency(value)
    except CurrencyError as exc:
        raise BadRequest(f"Invalid currency: {value!r}", code="unsupported_currency") from exc
    if code == BASE_CURRENCY or code in DEFAULT_FX_RATES:
        return code
    has_rate = (
        await db.execute(select(FxRate.id).where(FxRate.quote_currency == code).limit(1))
    ).scalar_one_or_none()
    if has_rate is None:
        raise BadRequest(f"Currency {code} is not supported", code="unsupported_currency")
    return code


async def viewer_currency(db: AsyncSession, user: User, currency: str | None) -> str | None:
    if currency:
        return await _validated(db, currency)
    if str(getattr(user.role, "value", user.role)) != UserRole.PATIENT.value:
        return None
    preferred = (
        await db.execute(select(PatientProfile.preferred_currency).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()
    if not preferred:
        return None
    try:
        return await _validated(db, preferred)
    except BadRequest:
        return None


async def with_display(db: AsyncSession, out: BaseModel, user: User, currency: str | None) -> Any:
    """``out`` as JSON with ``display_*`` amounts added (or the plain model when there is no currency)."""
    target = await viewer_currency(db, user, currency)
    if target is None:
        return out
    return await add_display_amounts(db, out.model_dump(mode="json"), target)
