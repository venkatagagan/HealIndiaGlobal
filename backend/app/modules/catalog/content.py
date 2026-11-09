"""Built-in public content used when the admin-managed tables are still empty."""

from __future__ import annotations

import uuid
from typing import Any, Final

__all__ = ["DEFAULT_CULTURAL_TIPS", "INDIA_WAIT_TIME_TEXT", "ITEMIZED_SPLIT_BPS"]

INDIA_WAIT_TIME_TEXT: Final = "1–2 weeks"

# Default treatment-cost split (basis points, sums to 10 000) when no itemisation data is available.
ITEMIZED_SPLIT_BPS: Final[tuple[tuple[str, int], ...]] = (
    ("surgery", 5500),
    ("hospital_stay", 2000),
    ("medications", 1000),
    ("tests_scans", 1000),
    ("doctor_fees", 500),
)

_NS = uuid.UUID("6f1c2a52-8e1d-4c55-9a43-1f1f3b7c0a10")


def _tip(slug: str, title: str, body: str, category: str, order: int) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid5(_NS, slug)),
        "title": title,
        "body": body,
        "image_url": None,
        "category": category,
        "sort_order": order,
    }


DEFAULT_CULTURAL_TIPS: Final[list[dict[str, Any]]] = [
    _tip(
        "greetings",
        "Greetings",
        "A friendly 'Namaste' with palms pressed together is a respectful greeting. Handshakes are common "
        "in hospitals and business settings.",
        "etiquette",
        10,
    ),
    _tip(
        "dress",
        "Dress comfortably and modestly",
        "Light cotton clothing suits most of the year. Cover shoulders and knees when visiting temples, "
        "mosques or gurdwaras, and remove footwear where asked.",
        "etiquette",
        20,
    ),
    _tip(
        "food-water",
        "Food and water",
        "Drink bottled or filtered water and avoid ice from unknown sources. Follow your care team's "
        "dietary advice before and after treatment; hospital kitchens can prepare halal, vegetarian and "
        "low-spice meals on request.",
        "health",
        30,
    ),
    _tip(
        "money",
        "Money and payments",
        "The currency is the Indian Rupee (INR). UPI and cards are widely accepted in cities, but keep "
        "some cash for taxis and small shops. Exchange money only at authorised counters.",
        "practical",
        40,
    ),
    _tip(
        "traffic",
        "Getting around",
        "Traffic can be heavy, so allow extra time for hospital appointments. Use the airport pickup and "
        "local transport arranged by your coordinator or reputable app-based cabs.",
        "practical",
        50,
    ),
    _tip(
        "sim",
        "Stay connected",
        "You can buy a local SIM card with your passport and visa at the airport or an authorised store. "
        "Share the number with your coordinator so the care team can reach you.",
        "practical",
        60,
    ),
    _tip(
        "registration",
        "Registration with authorities",
        "Keep your passport, e-Medical visa and hospital invitation letter with you. If your stay is long, "
        "your hospital's international desk will guide you on any registration requirements.",
        "documents",
        70,
    ),
    _tip(
        "climate",
        "Climate and recovery",
        "Summers can be very hot and the monsoon is humid. Stay hydrated, rest indoors during the hottest "
        "hours and follow your post-operative care plan carefully.",
        "health",
        80,
    ),
]
