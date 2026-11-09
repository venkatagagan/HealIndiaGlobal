"""Country -> currency defaults and "display" money (approximate amounts in the viewer's currency).

All stored prices stay in their original currency (mostly INR). Patients see an extra, clearly approximate
``display`` amount in their own currency next to the original::

    from app.core.currency import currency_for_country, default_currency_for_country, add_display_amounts

    currency_for_country("NG")                         # "NGN"
    await default_currency_for_country(db, "NG")       # "NGN" if NGN is in supported_currencies else "USD"
    data = await add_display_amounts(db, out.model_dump(mode="json"), "USD")
    # every dict with "currency" + a known "*_minor" field gains "display_<name>":
    # {"amount_minor": 4545, "currency": "USD", "fx_rate": "0.01136364", "approximate": true}

Response schemas must declare the ``display_*`` fields (``DisplayMoney | None = None``), otherwise FastAPI's
``response_model`` drops them.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel

from app.core.config import settings
from app.core.money import (
    BASE_CURRENCY,
    FX_QUANT,
    CurrencyError,
    convert_minor,
    get_fx_rate,
    normalize_currency,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = [
    "COUNTRY_CURRENCY",
    "DISPLAY_FIELDS",
    "DisplayMoney",
    "add_display_amounts",
    "currency_for_country",
    "default_currency_for_country",
    "supported_currencies",
]

_EUR = "EUR"
_EURO_COUNTRIES = (
    "AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK AD MC SM VA ME XK"  # euro area + users
).split()

#: ISO 3166-1 alpha-2 -> ISO 4217. Covers the seed countries and the main source markets for medical travel
#: to India (South Asia, Gulf, Central Asia, Africa, the Anglosphere, Russia, the euro area).
COUNTRY_CURRENCY: dict[str, str] = {
    # South Asia & neighbours
    "IN": "INR",
    "BD": "BDT",
    "NP": "NPR",
    "BT": "BTN",
    "LK": "LKR",
    "MV": "MVR",
    "MM": "MMK",
    "AF": "AFN",
    "PK": "PKR",
    # Gulf & Middle East
    "SA": "SAR",
    "AE": "AED",
    "OM": "OMR",
    "KW": "KWD",
    "QA": "QAR",
    "BH": "BHD",
    "YE": "YER",
    "IQ": "IQD",
    "IR": "IRR",
    "JO": "JOD",
    "LB": "LBP",
    "SY": "SYP",
    "EG": "EGP",
    "TR": "TRY",
    "IL": "ILS",
    # Central Asia & CIS
    "UZ": "UZS",
    "KZ": "KZT",
    "TJ": "TJS",
    "KG": "KGS",
    "TM": "TMT",
    "AZ": "AZN",
    "AM": "AMD",
    "GE": "GEL",
    "RU": "RUB",
    "UA": "UAH",
    "BY": "BYN",
    "MN": "MNT",
    # Africa
    "NG": "NGN",
    "GH": "GHS",
    "KE": "KES",
    "TZ": "TZS",
    "UG": "UGX",
    "RW": "RWF",
    "BI": "BIF",
    "ET": "ETB",
    "SO": "SOS",
    "DJ": "DJF",
    "ER": "ERN",
    "SD": "SDG",
    "SS": "SSP",
    "ZM": "ZMW",
    "ZW": "USD",  # the US dollar is the main currency for medical payments in Zimbabwe
    "MZ": "MZN",
    "MW": "MWK",
    "AO": "AOA",
    "CD": "CDF",
    "CG": "XAF",
    "CM": "XAF",
    "GA": "XAF",
    "TD": "XAF",
    "CF": "XAF",
    "GQ": "XAF",
    "CI": "XOF",
    "SN": "XOF",
    "ML": "XOF",
    "BF": "XOF",
    "NE": "XOF",
    "BJ": "XOF",
    "TG": "XOF",
    "GW": "XOF",
    "GN": "GNF",
    "SL": "SLE",
    "LR": "LRD",
    "GM": "GMD",
    "MA": "MAD",
    "DZ": "DZD",
    "TN": "TND",
    "LY": "LYD",
    "ZA": "ZAR",
    "BW": "BWP",
    "NA": "NAD",
    "LS": "LSL",
    "SZ": "SZL",
    "MG": "MGA",
    "MU": "MUR",
    "SC": "SCR",
    "KM": "KMF",
    # East & South-East Asia, Oceania
    "CN": "CNY",
    "JP": "JPY",
    "KR": "KRW",
    "SG": "SGD",
    "MY": "MYR",
    "TH": "THB",
    "ID": "IDR",
    "PH": "PHP",
    "VN": "VND",
    "KH": "KHR",
    "LA": "LAK",
    "AU": "AUD",
    "NZ": "NZD",
    "FJ": "FJD",
    "PG": "PGK",
    # Americas
    "US": "USD",
    "CA": "CAD",
    "MX": "MXN",
    "BR": "BRL",
    "AR": "ARS",
    "CL": "CLP",
    "CO": "COP",
    "PE": "PEN",
    "EC": "USD",
    "PA": "USD",
    "SV": "USD",
    "TT": "TTD",
    "JM": "JMD",
    "GY": "GYD",
    "SR": "SRD",
    # Europe outside the euro area
    "GB": "GBP",
    "CH": "CHF",
    "NO": "NOK",
    "SE": "SEK",
    "DK": "DKK",
    "IS": "ISK",
    "PL": "PLN",
    "CZ": "CZK",
    "HU": "HUF",
    "RO": "RON",
    "BG": "BGN",
    "RS": "RSD",
    "AL": "ALL",
    "MK": "MKD",
    "BA": "BAM",
    "MD": "MDL",
    **dict.fromkeys(_EURO_COUNTRIES, _EUR),
}

#: ``<field>_minor`` -> ``display_<field>``. Only these keys get a display amount.
DISPLAY_FIELDS: dict[str, str] = {
    "starting_price_minor": "display_starting_price",
    "india_price_min_minor": "display_india_price_min",
    "india_price_max_minor": "display_india_price_max",
    "price_min_minor": "display_price_min",
    "price_max_minor": "display_price_max",
    "price_minor": "display_price",
    "original_price_minor": "display_original_price",
    "consultation_fee_minor": "display_consultation_fee",
    "total_minor": "display_total",
    "deposit_minor": "display_deposit",
    "amount_paid_minor": "display_amount_paid",
    "balance_due_minor": "display_balance_due",
}


class DisplayMoney(BaseModel):
    """An amount converted to the viewer's currency for display only (payments use the original amount).

    ``fx_rate`` = units of ``currency`` per 1 unit of the original currency. ``approximate`` is true whenever
    a conversion happened (rates move; the hospital is paid in the original currency)."""

    amount_minor: int
    currency: str
    fx_rate: str
    approximate: bool = True


def currency_for_country(country: str | None) -> str | None:
    """ISO 4217 currency of an ISO 3166-1 alpha-2 country (``None`` when unknown)."""
    code = (country or "").strip().upper()
    return COUNTRY_CURRENCY.get(code) if len(code) == 2 else None


async def supported_currencies(db: AsyncSession) -> list[str]:
    from app.core.settings_store import get_setting

    value = await get_setting(db, "supported_currencies") or []
    return [str(c).upper() for c in value if isinstance(c, str)]


async def default_currency_for_country(db: AsyncSession, country: str | None) -> str:
    """The country's currency when the platform supports it, else ``DEFAULT_PATIENT_CURRENCY`` (USD)."""
    ccy = currency_for_country(country)
    if ccy and ccy in await supported_currencies(db):
        return ccy
    return settings.DEFAULT_PATIENT_CURRENCY


def _source_currencies(data: Any, found: set[str]) -> None:
    if isinstance(data, list):
        for item in data:
            _source_currencies(item, found)
    elif isinstance(data, dict):
        ccy = data.get("currency")
        if isinstance(ccy, str) and any(k in data for k in DISPLAY_FIELDS):
            found.add(ccy.upper())
        for value in data.values():
            if isinstance(value, dict | list):
                _source_currencies(value, found)


def _walk(data: Any, target: str, rates: dict[str, Decimal]) -> None:
    if isinstance(data, list):
        for item in data:
            _walk(item, target, rates)
        return
    if not isinstance(data, dict):
        return
    ccy = data.get("currency")
    src = ccy.upper() if isinstance(ccy, str) else None
    if src is not None and src in rates:
        for key, display_key in DISPLAY_FIELDS.items():
            amount = data.get(key)
            if key not in data or isinstance(amount, bool) or not isinstance(amount, int):
                if key in data:
                    data[display_key] = None
                continue
            data[display_key] = _display(amount, src, target, rates)
        lines = data.get("line_items")
        if isinstance(lines, list):
            for line in lines:
                if isinstance(line, dict) and "currency" not in line:
                    _add_line_display(line, src, target, rates)
    for value in data.values():
        if isinstance(value, dict | list):
            _walk(value, target, rates)


def _add_line_display(line: dict[str, Any], src: str, target: str, rates: dict[str, Decimal]) -> None:
    """Quote line items carry no currency of their own: they use the quote's."""
    amount = line.get("amount_minor")
    if isinstance(amount, bool) or not isinstance(amount, int):
        return
    line["display_amount"] = _display(amount, src, target, rates)


def _display(amount: int, src: str, target: str, rates: dict[str, Decimal]) -> dict[str, Any]:
    if src == target:
        return {"amount_minor": amount, "currency": target, "fx_rate": "1", "approximate": False}
    converted = convert_minor(amount, src, target, rates[src], rates[target])
    fx = (rates[src] / rates[target]).quantize(FX_QUANT, rounding=ROUND_HALF_UP)
    return {
        "amount_minor": converted,
        "currency": target,
        "fx_rate": format(fx.normalize(), "f"),
        "approximate": True,
    }


async def add_display_amounts(db: AsyncSession, data: Any, target: str | None) -> Any:
    """Add ``display_*`` money objects (in ``target``) to every priced dict in a JSON tree, in place.

    ``target=None`` leaves the data unchanged. Amounts whose currency has no FX rate get no display value."""
    if not target or data is None:
        return data
    dst = normalize_currency(target)
    found: set[str] = set()
    _source_currencies(data, found)
    if not found:
        return data
    rates: dict[str, Decimal] = {}
    for code in [*found, dst]:
        if code in rates:
            continue
        try:
            rates[code] = Decimal(1) if code == BASE_CURRENCY else await get_fx_rate(db, code)
        except CurrencyError:
            continue
    if dst not in rates:
        return data
    _walk(data, dst, rates)
    return data
