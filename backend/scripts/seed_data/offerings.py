"""Hospital procedure offerings: prices, inclusions/exclusions and the three treatment packages.

Prices are derived deterministically from the procedure's India range, the hospital's price level
(``price_factor``) and a small per-offering variation, so they stay within +/-20% of the catalog range and
are identical on every seed run.
"""

from __future__ import annotations

import hashlib
import math
from typing import Any

from scripts.seed_data.catalog import inr

__all__ = [
    "PACKAGE_TIERS",
    "build_packages",
    "exclusions_for",
    "inclusions_for",
    "offering_price_range",
    "offering_success_rate",
    "round_inr",
    "stable_unit",
]

PACKAGE_TIERS: tuple[str, ...] = ("medical_only", "medical_stay", "all_inclusive")

_STAY_LABELS = {
    "hotel": "partner hotel",
    "service_apartment": "serviced apartment",
    "guest_house": "guest house",
    "hospital_guest_room": "hospital guest room",
}

# Typical success rate by specialty (fertility = clinical pregnancy rate per transfer).
_SUCCESS_BY_SPECIALTY: dict[str, float] = {
    "cardiology": 97.8,
    "orthopedics": 98.0,
    "spine": 96.8,
    "neurology": 95.5,
    "oncology": 92.0,
    "transplant": 94.5,
    "bariatric": 98.8,
    "ophthalmology": 98.6,
    "cosmetic": 98.4,
    "dental": 98.2,
    "urology": 97.4,
    "gastroenterology": 97.6,
    "ent": 97.5,
    "nephrology": 97.0,
    "wellness": 97.0,
    "fertility": 62.0,
}
_SUCCESS_BY_PROCEDURE: dict[str, float] = {
    "iui": 18.0,
    "egg-freezing": 88.0,
    "bone-marrow-transplant": 88.0,
    "liver-transplant": 92.5,
    "whipple-procedure": 93.0,
    "tavi": 96.5,
    "deep-brain-stimulation": 93.5,
    "epilepsy-surgery": 82.0,
    "chemotherapy-cycle": 90.0,
}

_SPECIALTY_INCLUSIONS: dict[str, list[str]] = {
    "cardiology": [
        "Cardiac ICU monitoring as per protocol",
        "Standard stent/valve where the plan requires one",
    ],
    "orthopedics": ["Standard imported implant", "In-hospital physiotherapy and walking aids"],
    "spine": ["Standard screws/rods where required", "Intra-operative neuro-monitoring"],
    "neurology": ["Neuro-ICU stay as per protocol", "Post-operative MRI or CT scan"],
    "oncology": [
        "Tumour-board review of your case",
        "Standard protocol drugs (generic/biosimilar where available)",
    ],
    "transplant": [
        "Recipient and living-donor surgery and ICU stay as per protocol",
        "Initial immunosuppression during the stay",
        "Help with authorisation-committee documentation",
    ],
    "fertility": ["Monitoring scans and hormone tests", "Laboratory and embryology charges"],
    "bariatric": ["Dietitian and psychologist assessment", "Post-operative diet plan for 12 months"],
    "ophthalmology": ["Pre-operative eye scans and measurements", "Post-operative eye-drops kit"],
    "cosmetic": ["Pre-operative photographs and planning", "Compression garment or dressing kit"],
    "dental": ["3D CBCT scan and digital smile planning", "Temporary restorations during your stay"],
    "urology": ["Standard laser or robotic consumables", "Catheter care and uroflowmetry review"],
    "gastroenterology": ["Standard laparoscopic consumables and mesh where needed", "Dietitian consultation"],
    "ent": ["Pre-operative audiology or endoscopy as applicable", "Device activation where applicable"],
    "nephrology": ["Single-use dialyser and dialysis consumables", "Routine dialysis blood tests"],
    "wellness": ["Personalised plan by the doctor", "All listed tests and therapies"],
}

_SPECIALTY_EXCLUSIONS: dict[str, list[str]] = {
    "cardiology": ["Additional stents or devices beyond the plan"],
    "orthopedics": ["Premium implant upgrades on request"],
    "spine": ["Additional implant levels beyond the plan"],
    "neurology": ["Implantable devices not listed in the plan"],
    "oncology": [
        "High-cost biologics or immunotherapy unless listed",
        "PET-CT and genetic tests unless listed",
    ],
    "transplant": ["Donor work-up done outside the hospital", "Immunosuppressant medicines after discharge"],
    "fertility": ["Donor programmes and embryo storage beyond one year", "Additional embryo transfers"],
    "bariatric": ["Revision surgery"],
    "ophthalmology": ["Premium multifocal or toric lens upgrade if not chosen"],
    "cosmetic": ["Revision requested for aesthetic preference"],
    "dental": ["Bone grafting or sinus lift if needed", "Additional implants beyond the plan"],
    "urology": ["Additional procedures for residual stones"],
    "gastroenterology": ["Conversion to open surgery charges"],
    "ent": ["External processor upgrades"],
    "nephrology": ["Erythropoietin and iron injections"],
    "wellness": ["Treatment of conditions found during the check-up"],
}

_COMMON_EXCLUSIONS = [
    "International airfare and visa fees",
    "Treatment of unrelated or pre-existing conditions",
    "Extended ICU stay or care for complications beyond the plan",
]


def stable_unit(key: str) -> float:
    """Deterministic pseudo-random number in [0, 1) derived from ``key``."""
    digest = hashlib.sha256(key.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


def round_inr(paise: float) -> int:
    """Round an INR amount (paise) to a price-list friendly step: Rs 1,000 / 500 / 100."""
    rupees = paise / 100
    step = 1000 if rupees >= 1_00_000 else 500 if rupees >= 10_000 else 100
    return inr(int(math.floor(rupees / step + 0.5)) * step)


def offering_price_range(hospital: dict[str, Any], procedure: dict[str, Any]) -> tuple[int, int]:
    """Hospital price range for a procedure: catalog range x hospital price level x (1 +/- 3%)."""
    jitter = (stable_unit(f"{hospital['slug']}:{procedure['slug']}:price") - 0.5) * 0.06
    factor = max(0.82, min(1.18, float(hospital["price_factor"]) + jitter))
    low = round_inr(procedure["india_price_min_minor"] * factor)
    high = round_inr(procedure["india_price_max_minor"] * factor)
    return low, max(high, low + inr(1000))


def offering_success_rate(hospital_slug: str, procedure: dict[str, Any]) -> str:
    base = _SUCCESS_BY_PROCEDURE.get(
        procedure["slug"], _SUCCESS_BY_SPECIALTY.get(procedure["specialty"], 96.0)
    )
    spread = 4.0 if base < 70 else 1.5
    value = base + (stable_unit(f"{hospital_slug}:{procedure['slug']}:success") - 0.5) * 2 * spread
    return f"{min(99.5, value):.2f}"


def inclusions_for(procedure: dict[str, Any]) -> list[str]:
    stay = int(procedure["hospital_stay_days"] or 0)
    if stay > 0:
        items = [
            "Surgeon, anaesthetist and procedure fees",
            "Operation theatre charges and standard consumables",
            f"{stay}-night stay in a private room" if stay > 1 else "One-night stay in a private room",
            "Nursing care and routine medicines during the stay",
        ]
    else:
        items = [
            "Doctor and procedure fees",
            "Day-care bed / procedure room",
            "Standard consumables and medicines on treatment days",
        ]
    items.extend(_SPECIALTY_INCLUSIONS.get(procedure["specialty"], []))
    items.extend(
        ["Pre-procedure tests listed in the treatment plan", "Review consultation before you fly home"]
    )
    return items


def exclusions_for(procedure: dict[str, Any]) -> list[str]:
    return [
        *_COMMON_EXCLUSIONS,
        "Accommodation outside the hospital (see the Medical + Stay package)",
        *_SPECIALTY_EXCLUSIONS.get(procedure["specialty"], []),
    ]


def build_packages(
    *,
    price_min_minor: int,
    price_max_minor: int,
    procedure: dict[str, Any],
    nightly_rate_minor: int,
    stay_type: str,
) -> list[dict[str, Any]]:
    """Three packages per offering (PLAN 4.5 ``treatment_packages``), all in INR minor units."""
    hospital_days = int(procedure["hospital_stay_days"] or 0)
    total_days = int(procedure["total_stay_days"] or hospital_days)
    nights = max(total_days - hospital_days, 2)
    stay_label = _STAY_LABELS.get(stay_type, "partner hotel")

    medical = round_inr(price_min_minor + 0.3 * (price_max_minor - price_min_minor))
    stay_addons = nights * nightly_rate_minor + inr(5_000)  # nights + airport pickup & drop
    translator_days = max(2, min(total_days, 10))
    extras = (
        translator_days * inr(3_000)  # medical interpreter
        + nights * inr(1_200)  # meals
        + inr(6_000)
        + nights * inr(300)  # local transport
        + 3 * inr(1_500)  # follow-up video consultations
    )
    # Bundle discounts apply to the add-ons only (never to the medical part): 12% / 15%.
    stay_price = round_inr(medical + stay_addons * 0.88)
    stay_original = round_inr(medical + stay_addons)
    all_price = round_inr(medical + (stay_addons + extras) * 0.85)
    all_original = round_inr(medical + stay_addons + extras)

    hospital_text = (
        f"{hospital_days}-night hospital stay"
        if hospital_days > 1
        else "one-night hospital stay"
        if hospital_days == 1
        else "day-care treatment"
    )
    return [
        {
            "tier": "medical_only",
            "name": "Medical Only",
            "price_minor": medical,
            "original_price_minor": None,
            "currency": "INR",
            "description": (
                f"Treatment as per the hospital plan: {hospital_text}, procedure and doctor fees and "
                "standard medicines. Travel and accommodation arranged separately."
            ),
            "includes": {
                "accommodation_nights": 0,
                "airport_pickup": False,
                "translator": False,
                "meals": False,
                "local_transport": False,
                "followup_teleconsults": 0,
            },
        },
        {
            "tier": "medical_stay",
            "name": "Medical + Stay",
            "price_minor": stay_price,
            "original_price_minor": stay_original if stay_original > stay_price else None,
            "currency": "INR",
            "description": (
                f"Everything in Medical Only, plus {nights} nights at a {stay_label} near the hospital and "
                "airport pickup and drop."
            ),
            "includes": {
                "accommodation_nights": nights,
                "airport_pickup": True,
                "translator": False,
                "meals": False,
                "local_transport": False,
                "followup_teleconsults": 0,
            },
        },
        {
            "tier": "all_inclusive",
            "name": "All-Inclusive",
            "price_minor": all_price,
            "original_price_minor": all_original if all_original > all_price else None,
            "currency": "INR",
            "description": (
                "Everything in Medical + Stay, plus a medical interpreter, daily meals, local transport for "
                "appointments and 3 follow-up video consultations after you return home."
            ),
            "includes": {
                "accommodation_nights": nights,
                "airport_pickup": True,
                "translator": True,
                "meals": True,
                "local_transport": True,
                "followup_teleconsults": 3,
            },
        },
    ]
