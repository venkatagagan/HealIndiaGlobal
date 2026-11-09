"""Public content for the demo seed: FX rates and cultural tips."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

__all__ = ["CULTURAL_TIPS", "FX_RATES", "FX_SOURCE", "currency_exponent"]

#: INR per 1 unit of the quote currency. Must match ``app.core.money.DEFAULT_FX_RATES`` (PLAN 6.3).
FX_RATES: dict[str, Decimal] = {
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
FX_SOURCE = "seed-demo"

_THREE_DECIMAL = frozenset({"KWD", "BHD", "OMR", "JOD", "TND", "LYD", "IQD"})
_ZERO_DECIMAL = frozenset({"JPY", "KRW", "VND", "CLP", "ISK", "UGX"})


def currency_exponent(ccy: str) -> int:
    """Minor-unit exponent (PLAN section 3): 0 for JPY/KRW, 3 for KWD/BHD/OMR, else 2."""
    code = ccy.upper()
    if code in _THREE_DECIMAL:
        return 3
    if code in _ZERO_DECIMAL:
        return 0
    return 2


def _tip(category: str, title: str, body: str) -> dict[str, Any]:
    return {"category": category, "title": title, "body": body, "image_url": None}


# Order of this list = ``sort_order``.
CULTURAL_TIPS: list[dict[str, Any]] = [
    _tip(
        "greetings",
        "Namaste: greeting people in India",
        "A warm 'Namaste' with palms pressed together works everywhere and is always polite. Handshakes are "
        "common in hospitals and business settings; some people prefer not to shake hands with the opposite "
        "gender, so let them lead. Using titles such as 'Doctor', 'Sir' or 'Madam' is appreciated.",
    ),
    _tip(
        "dining",
        "Dining etiquette and food safety",
        "Many Indians eat with the right hand; cutlery is always available in hotels and hospitals. "
        "Vegetarian "
        "food is widely available, and halal, Jain and other diets can be arranged. Drink sealed bottled or "
        "filtered water, choose freshly cooked hot food, and follow any diet your care team gives you.",
    ),
    _tip(
        "dress",
        "What to wear",
        "Light, breathable cotton clothing suits most of the year. Modest dress (covered shoulders and "
        "knees) "
        "is respectful at temples, mosques and gurudwaras, where you will also remove your shoes. Pack a "
        "light jacket for air-conditioned hospitals and for North India in December and January.",
    ),
    _tip(
        "tipping",
        "Tipping",
        "Tipping is appreciated but never mandatory. In restaurants, 5-10% is customary if no service charge "
        "is included; small tips for porters, drivers and hotel staff are common. Hospital staff should not "
        "be tipped - use the hospital's feedback form to thank your care team instead.",
    ),
    _tip(
        "festivals",
        "Festivals and public holidays",
        "India celebrates many festivals, such as Diwali (October/November), Holi (March), Eid and "
        "Christmas. "
        "Hospitals stay open, but some outpatient clinics close and traffic, crowds and fireworks increase. "
        "Your coordinator will plan appointments around local holidays.",
    ),
    _tip(
        "safety",
        "Staying safe and comfortable",
        "Keep your passport and visa copies in your phone and with your coordinator, and the originals in "
        "the hotel safe. Use registered taxis or app-based cabs, especially at night. Save the 24x7 helpline "
        "and dial 112 for police, fire or ambulance emergencies anywhere in India.",
    ),
    _tip(
        "connectivity",
        "Getting a local SIM card",
        "International visitors can buy a prepaid SIM at airport counters or official stores with their "
        "passport, visa and a passport photo; activation can take a few hours. eSIMs and international "
        "roaming also work. Hospital Wi-Fi is usually available for messaging and video calls.",
    ),
    _tip(
        "money",
        "Money and payments",
        "The currency is the Indian Rupee (INR, ₹). Cards are accepted at hospitals, hotels and larger "
        "shops; carry some cash for small purchases and auto-rickshaws. Exchange money only at banks or "
        "authorised dealers and keep the receipts. QR-code (UPI) payments are everywhere - ask your "
        "coordinator about options available to international visitors.",
    ),
    _tip(
        "transport",
        "Getting around",
        "App-based cabs are the easiest way to travel in big cities, and many have metro rail too. Agree the "
        "fare before taking an auto-rickshaw without a meter. Traffic can be heavy, so allow extra time for "
        "hospital appointments; your package may include local transport.",
    ),
    _tip(
        "hospital",
        "Hospital etiquette",
        "Carry your passport, visa and previous reports to every appointment. Hospitals usually allow one "
        "attendant with a visitor pass, and visiting hours are limited in ICUs and wards. Keep noise low, "
        "follow infection-control rules and ask your international patient desk for an interpreter at any "
        "time.",
    ),
]
