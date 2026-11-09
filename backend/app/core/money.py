"""Money helpers. All amounts are integers in minor units (``*_minor``) + ISO-4217 currency.

FX rates are expressed as **INR per 1 unit** of a currency (INR = 1), matching the ``fx_rates`` table::

    from app.core.money import to_minor, from_minor, convert, convert_minor, get_fx_rate, format_minor

    to_minor("1499.99", "USD")                        # 149999
    amount_usd, rate = await convert(db, 1_250_000_00, "INR", "USD")   # (1420454, Decimal("0.0113636..."))
    format_minor(149999, "USD")                       # "$1,499.99"
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

BASE_CURRENCY = "INR"

CURRENCY_EXPONENTS: dict[str, int] = {
    "JPY": 0,
    "KRW": 0,
    "VND": 0,
    "CLP": 0,
    "ISK": 0,
    "UGX": 0,
    "KWD": 3,
    "BHD": 3,
    "OMR": 3,
    "JOD": 3,
    "TND": 3,
    "LYD": 3,
    "IQD": 3,
}
DEFAULT_EXPONENT = 2

# Illustrative fallback rates (INR per 1 unit). Real rates live in the ``fx_rates`` table (admin-managed).
DEFAULT_FX_RATES: dict[str, Decimal] = {
    "INR": Decimal("1"),
    "USD": Decimal("88"),
    "EUR": Decimal("95"),
    "GBP": Decimal("110"),
    "AED": Decimal("24"),
    "SAR": Decimal("23.5"),
    "AUD": Decimal("57"),
    "CAD": Decimal("63"),
    "NGN": Decimal("0.058"),
    "KES": Decimal("0.68"),
    "BDT": Decimal("0.72"),
    "OMR": Decimal("228"),
    "QAR": Decimal("24.2"),
    "KWD": Decimal("287"),
    "BHD": Decimal("233"),
}

CURRENCY_SYMBOLS: dict[str, str] = {
    "INR": "₹",
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "AUD": "A$",
    "CAD": "C$",
    "NGN": "₦",
    "BDT": "৳",
    "JPY": "¥",
}

FX_QUANT = Decimal("0.00000001")  # NUMERIC(18,8)


class CurrencyError(ValueError):
    pass


def normalize_currency(ccy: str) -> str:
    code = (ccy or "").strip().upper()
    if len(code) != 3 or not code.isalpha():
        raise CurrencyError(f"Invalid currency code: {ccy!r}")
    return code


def exponent(ccy: str) -> int:
    return CURRENCY_EXPONENTS.get(normalize_currency(ccy), DEFAULT_EXPONENT)


def _to_decimal(value: Decimal | str | int | float) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if isinstance(value, float):
        # Floats are accepted only via their shortest repr to avoid binary artefacts.
        value = repr(value)
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError) as exc:
        raise CurrencyError(f"Invalid amount: {value!r}") from exc


def round_half_up(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def to_minor(amount: Decimal | str | int | float, ccy: str) -> int:
    """Major units -> integer minor units (ROUND_HALF_UP)."""
    dec = _to_decimal(amount)
    return round_half_up(dec * (Decimal(10) ** exponent(ccy)))


def from_minor(amount_minor: int, ccy: str) -> Decimal:
    """Integer minor units -> Decimal major units with the currency's exponent."""
    exp = exponent(ccy)
    return (Decimal(int(amount_minor)) / (Decimal(10) ** exp)).quantize(Decimal(1).scaleb(-exp))


def convert_minor(
    amount_minor: int,
    from_ccy: str,
    to_ccy: str,
    rate_from: Decimal | str | int | None = None,
    rate_to: Decimal | str | int | None = None,
) -> int:
    """Convert minor units between currencies using INR-per-unit rates (ROUND_HALF_UP).

    ``rate_from``/``rate_to`` default to ``DEFAULT_FX_RATES``. Same-currency conversion is the identity.
    INR always has rate 1, so when exactly one side is INR a single rate may be passed positionally
    (``convert_minor(x, "INR", "USD", 88)`` and ``convert_minor(x, "USD", "INR", 88)`` both use
    88 INR/USD)."""
    src = normalize_currency(from_ccy)
    dst = normalize_currency(to_ccy)
    if src == dst:
        return int(amount_minor)
    if src == BASE_CURRENCY and rate_to is None and rate_from is not None:
        rate_from, rate_to = None, rate_from
    r_from = (
        Decimal(1)
        if src == BASE_CURRENCY
        else (_to_decimal(rate_from) if rate_from is not None else _default_rate(src))
    )
    r_to = (
        Decimal(1)
        if dst == BASE_CURRENCY
        else (_to_decimal(rate_to) if rate_to is not None else _default_rate(dst))
    )
    if r_from <= 0 or r_to <= 0:
        raise CurrencyError("FX rates must be positive")
    major = Decimal(int(amount_minor)) / (Decimal(10) ** exponent(src))
    inr = major * r_from
    target_major = inr / r_to
    return round_half_up(target_major * (Decimal(10) ** exponent(dst)))


def _default_rate(ccy: str) -> Decimal:
    try:
        return DEFAULT_FX_RATES[ccy]
    except KeyError as exc:
        raise CurrencyError(f"No FX rate for {ccy}") from exc


async def get_fx_rate(db: AsyncSession, ccy: str) -> Decimal:
    """INR per 1 unit of ``ccy`` from ``fx_rates`` (base INR); falls back to ``DEFAULT_FX_RATES``."""
    code = normalize_currency(ccy)
    if code == BASE_CURRENCY:
        return Decimal("1")
    from sqlalchemy import select

    from app.models.catalog import FxRate

    stmt = (
        select(FxRate.rate)
        .where(FxRate.base_currency == BASE_CURRENCY, FxRate.quote_currency == code)
        .limit(1)
    )
    rate = (await db.execute(stmt)).scalar_one_or_none()
    if rate is not None and Decimal(rate) > 0:
        return Decimal(rate)
    return _default_rate(code)


async def convert(db: AsyncSession, amount_minor: int, from_ccy: str, to_ccy: str) -> tuple[int, Decimal]:
    """Convert using current DB rates. Returns ``(amount_minor_in_to_ccy, fx_rate_used)`` where
    ``fx_rate_used`` = units of ``to_ccy`` per 1 unit of ``from_ccy`` (quantised to 8 dp)."""
    src = normalize_currency(from_ccy)
    dst = normalize_currency(to_ccy)
    if src == dst:
        return int(amount_minor), Decimal("1")
    r_from = await get_fx_rate(db, src)
    r_to = await get_fx_rate(db, dst)
    converted = convert_minor(amount_minor, src, dst, r_from, r_to)
    fx = (r_from / r_to).quantize(FX_QUANT, rounding=ROUND_HALF_UP)
    return converted, fx


def to_base(amount_minor: int, ccy: str, rate_inr_per_unit: Decimal | str | int) -> int:
    """Convert to INR minor units with a known INR-per-unit rate (e.g. a payment's FX snapshot)."""
    return convert_minor(amount_minor, ccy, BASE_CURRENCY, rate_inr_per_unit, Decimal("1"))


#: SEC-044: business cap for any commission rate (hospital, agent, rule or default). Above roughly 8,470 bps
#: the hospital net (after commission, GST on commission and TDS) turns negative and breaks the postings.
MAX_COMMISSION_BPS = 3000


def apply_bps(amount_minor: int, bps: int) -> int:
    """``amount * bps / 10000`` rounded half-up (1500 bps = 15%)."""
    return round_half_up(Decimal(int(amount_minor)) * Decimal(int(bps)) / Decimal(10_000))


def apply_pct(amount_minor: int, pct: int | Decimal | str) -> int:
    return round_half_up(Decimal(int(amount_minor)) * _to_decimal(pct) / Decimal(100))


def format_minor(amount_minor: int, ccy: str) -> str:
    """Human formatting: ``"$1,499.99"``, ``"₹12,50,000.00"`` (Indian grouping for INR)."""
    code = normalize_currency(ccy)
    value = from_minor(amount_minor, code)
    exp = exponent(code)
    negative = value < 0
    value = abs(value)
    integer_part, _, frac = f"{value:.{exp}f}".partition(".")
    if code == "INR":
        grouped = _indian_grouping(integer_part)
    else:
        grouped = f"{int(integer_part):,}"
    number = grouped + (f".{frac}" if exp else "")
    symbol = CURRENCY_SYMBOLS.get(code)
    text = f"{symbol}{number}" if symbol else f"{code} {number}"
    return f"-{text}" if negative else text


def _indian_grouping(digits: str) -> str:
    if len(digits) <= 3:
        return digits
    head, tail = digits[:-3], digits[-3:]
    groups: list[str] = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return ",".join(groups) + "," + tail


def default_patient_currency() -> str:
    return settings.DEFAULT_PATIENT_CURRENCY
