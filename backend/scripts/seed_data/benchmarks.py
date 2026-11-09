"""Home-country cost benchmarks for 30 key procedures x 10 countries (300 rows).

Illustrative estimates for self-pay treatment in each country's private sector, derived from a typical US
cash-price range per procedure and per-country price levels for three procedure classes:

* ``complex``  - transplants, TAVI, DBS, brain tumour surgery (often unavailable locally in some markets)
* ``hospital`` - standard inpatient surgery and cancer care
* ``elective`` - outpatient, cosmetic, dental, fertility and eye procedures (prices vary less by country)

Amounts are converted to the local currency with the seed FX table (so savings maths is consistent with the
platform's own rates), rounded to two significant figures, and stored in minor units.
"""

from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from scripts.seed_data.content import FX_RATES, currency_exponent

__all__ = ["BENCHMARK_COUNTRIES", "BENCHMARK_SOURCE", "COST_BENCHMARKS", "build_cost_benchmarks"]

BENCHMARK_SOURCE = "Illustrative estimate - self-pay, private sector (demo data)"
#: Demo figures are estimates, so they are marked low confidence; real rows come from
#: ``scripts/import_benchmarks.py`` with a cited source URL, year and confidence.
BENCHMARK_PRICE_YEAR = 2025
BENCHMARK_CONFIDENCE = "low"
BENCHMARK_WAIT_SOURCE = "Illustrative typical waiting time (demo data)"

#: country -> currency
BENCHMARK_COUNTRIES: dict[str, str] = {
    "US": "USD",
    "GB": "GBP",
    "CA": "CAD",
    "AU": "AUD",
    "AE": "AED",
    "SA": "SAR",
    "NG": "NGN",
    "KE": "KES",
    "BD": "BDT",
    "OM": "OMR",
}

# procedure slug -> (class, typical US cash price min, max) in USD
_US_PRICES_USD: dict[str, tuple[str, int, int]] = {
    "cabg": ("hospital", 70_000, 200_000),
    "angioplasty": ("hospital", 30_000, 60_000),
    "heart-valve-replacement": ("hospital", 80_000, 200_000),
    "pacemaker-implantation": ("hospital", 30_000, 70_000),
    "tavi": ("complex", 70_000, 120_000),
    "total-knee-replacement": ("hospital", 35_000, 55_000),
    "total-hip-replacement": ("hospital", 35_000, 60_000),
    "acl-reconstruction": ("hospital", 20_000, 50_000),
    "spinal-fusion": ("hospital", 80_000, 150_000),
    "disc-replacement": ("hospital", 45_000, 100_000),
    "chemotherapy-cycle": ("hospital", 8_000, 25_000),
    "radiation-therapy": ("hospital", 30_000, 60_000),
    "breast-cancer-surgery": ("hospital", 25_000, 55_000),
    "liver-transplant": ("complex", 450_000, 800_000),
    "kidney-transplant": ("complex", 250_000, 450_000),
    "bone-marrow-transplant": ("complex", 350_000, 900_000),
    "brain-tumor-surgery": ("complex", 90_000, 200_000),
    "deep-brain-stimulation": ("complex", 70_000, 140_000),
    "ivf-cycle": ("elective", 15_000, 30_000),
    "icsi": ("elective", 18_000, 35_000),
    "sleeve-gastrectomy": ("hospital", 18_000, 30_000),
    "gastric-bypass": ("hospital", 22_000, 35_000),
    "lasik": ("elective", 4_000, 6_000),
    "cataract-surgery": ("elective", 3_500, 7_000),
    "rhinoplasty": ("elective", 8_000, 15_000),
    "hair-transplant": ("elective", 8_000, 20_000),
    "liposuction": ("elective", 6_000, 12_000),
    "dental-implants": ("elective", 3_500, 6_000),
    "full-mouth-rehabilitation": ("elective", 40_000, 90_000),
    "robotic-prostatectomy": ("hospital", 35_000, 60_000),
}

# Price level relative to the US for (complex, hospital, elective) procedures.
_PRICE_LEVEL: dict[str, tuple[float, float, float]] = {
    "US": (1.00, 1.00, 1.00),
    "GB": (0.30, 0.33, 0.60),
    "CA": (0.35, 0.38, 0.70),
    "AU": (0.38, 0.42, 0.75),
    "AE": (0.35, 0.38, 0.65),
    "SA": (0.30, 0.33, 0.55),
    "OM": (0.28, 0.30, 0.50),
    "NG": (0.12, 0.22, 0.35),
    "KE": (0.10, 0.18, 0.30),
    "BD": (0.06, 0.08, 0.15),
}
_CLASS_INDEX = {"complex": 0, "hospital": 1, "elective": 2}

_WAIT_TIMES: dict[str, tuple[str, str, str]] = {
    "US": ("4–12 weeks", "2–8 weeks", "1–4 weeks"),
    "GB": ("6–18 months (NHS)", "6–18 months (NHS)", "4–12 weeks (private)"),
    "CA": ("6–12 months", "6–12 months", "1–3 months"),
    "AU": ("3–9 months", "3–12 months (public)", "2–8 weeks"),
    "AE": ("4–8 weeks", "1–4 weeks", "1–2 weeks"),
    "SA": ("3–6 months", "1–3 months", "2–6 weeks"),
    "OM": ("3–9 months", "2–4 months", "1–2 months"),
    "NG": ("Limited local availability", "2–6 months", "1–2 months"),
    "KE": ("Limited local availability", "2–6 months", "1–2 months"),
    "BD": ("Limited local availability", "1–4 months", "2–6 weeks"),
}


def _two_significant(value: Decimal) -> Decimal:
    if value <= 0:
        return Decimal(0)
    step = Decimal(10) ** max(0, int(math.floor(math.log10(float(value)))) - 1)
    return (value / step).quantize(Decimal(1), rounding=ROUND_HALF_UP) * step


def _usd_to_local_minor(usd: Decimal, currency: str) -> int:
    local = usd * FX_RATES["USD"] / FX_RATES[currency]
    return int(_two_significant(local) * (Decimal(10) ** currency_exponent(currency)))


def build_cost_benchmarks() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for slug, (klass, us_min, us_max) in _US_PRICES_USD.items():
        idx = _CLASS_INDEX[klass]
        for country, currency in BENCHMARK_COUNTRIES.items():
            level = Decimal(str(_PRICE_LEVEL[country][idx]))
            low_minor = _usd_to_local_minor(Decimal(us_min) * level, currency)
            high_minor = _usd_to_local_minor(Decimal(us_max) * level, currency)
            if high_minor <= low_minor:  # never collapse a range after rounding
                high_minor = low_minor + max(1, low_minor // 10)
            rows.append(
                {
                    "procedure": slug,
                    "country_code": country,
                    "currency": currency,
                    "cost_min_minor": low_minor,
                    "cost_max_minor": high_minor,
                    "wait_time_text": _WAIT_TIMES[country][idx],
                    "source": BENCHMARK_SOURCE,
                    "source_url": None,
                    "price_year": BENCHMARK_PRICE_YEAR,
                    "confidence": BENCHMARK_CONFIDENCE,
                    "wait_source": BENCHMARK_WAIT_SOURCE,
                }
            )
    return rows


COST_BENCHMARKS: list[dict[str, Any]] = build_cost_benchmarks()
