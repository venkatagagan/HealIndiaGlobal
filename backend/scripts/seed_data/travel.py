"""Accommodation providers (linked to nearby hospitals) and in-country service providers.

All businesses are fictional. Phone numbers use the obviously fake ``+91-90000-1xxxx`` (services) and
``+91-90000-3xxxx`` (stays) ranges and e-mail domains end in ``.example``. Rates are INR minor units.
"""

from __future__ import annotations

import math
import re
from typing import Any

from scripts.seed_data.catalog import inr
from scripts.seed_data.hospitals import HOSPITALS

__all__ = ["ACCOMMODATIONS", "SERVICE_PROVIDERS"]

_HOSPITAL_COORDS = {h["slug"]: (h["lat"], h["lng"]) for h in HOSPITALS}


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _offset(lat: float, lng: float, north_km: float, east_km: float) -> tuple[float, float]:
    d_lat = north_km / 111.0
    d_lng = east_km / (111.0 * math.cos(math.radians(lat)))
    return round(lat + d_lat, 6), round(lng + d_lng, 6)


_GUEST_ROOM = [
    "Free Wi-Fi",
    "Inside the hospital campus",
    "Nurse on call",
    "Wheelchair accessible",
    "24x7 front desk",
]
_HOTEL = [
    "Free Wi-Fi",
    "Breakfast included",
    "Hospital shuttle",
    "Airport transfers on request",
    "Room service",
]
_APARTMENT = ["Kitchenette", "Washing machine", "Free Wi-Fi", "Daily housekeeping", "Lift"]
_GUEST_HOUSE = ["Free Wi-Fi", "Home-style meals", "Laundry service", "Family rooms"]


def _stay(
    index: int,
    name: str,
    kind: str,
    city: str,
    address: str,
    nightly_rupees: int,
    amenities: list[str],
    links: list[tuple[str, float]],
    offset_km: tuple[float, float],
    *,
    stars: int | None = None,
) -> dict[str, Any]:
    base_lat, base_lng = _HOSPITAL_COORDS[links[0][0]]
    lat, lng = _offset(base_lat, base_lng, *offset_km)
    return {
        "name": name,
        "type": kind,
        "city": city,
        "address": address,
        "lat": lat,
        "lng": lng,
        "star_rating": stars,
        "amenities": amenities,
        "nightly_rate_minor": inr(nightly_rupees),
        "currency": "INR",
        "photos": [],
        "phone": f"+91-90000-3{index:04d}",
        "email": f"stay@{_slugify(name)}.example",
        # not a column - (hospital slug, distance km) links
        "links": links,
    }


# fmt: off
ACCOMMODATIONS: list[dict[str, Any]] = [
    # Gurugram
    _stay(1, "Sanjeevani Patient & Family Guest Rooms", "hospital_guest_room", "Gurugram",
          "Tower C, Sanjeevani campus, Sector 44, Gurugram", 2200,
          [*_GUEST_ROOM, "Vegetarian & halal meals"], [("sanjeevani-gurugram", 0.1)], (0.05, 0.05)),
    _stay(2, "Hotel Gulmohar Greens", "hotel", "Gurugram",
          "Sector 45, near Golf Course Road, Gurugram", 6800,
          [*_HOTEL, "Halal food available"], [("sanjeevani-gurugram", 2.4)], (-1.2, 1.4), stars=4),
    _stay(3, "Amaltas Serviced Apartments", "service_apartment", "Gurugram",
          "Sector 43, Gurugram", 4200,
          [*_APARTMENT, "Hospital shuttle"], [("sanjeevani-gurugram", 1.6)], (0.9, -0.8)),
    # Noida
    _stay(4, "Yamuna Valley Attendant Guest House", "hospital_guest_room", "Noida",
          "Block C, Sector 62, Noida", 1800,
          _GUEST_ROOM, [("yamuna-valley-noida", 0.2)], (0.1, 0.1)),
    _stay(5, "Kesar Suites Noida", "hotel", "Noida",
          "Sector 63, Noida", 4200,
          _HOTEL, [("yamuna-valley-noida", 2.0)], (1.1, 0.9), stars=3),
    _stay(6, "Neem Tree Service Apartments", "service_apartment", "Noida",
          "Sector 61, Noida", 3600,
          [*_APARTMENT, "Wheelchair accessible"], [("yamuna-valley-noida", 1.2)], (-0.6, -0.7)),
    # New Delhi
    _stay(7, "Lotus Crest International Patient Guest Wing", "hospital_guest_room", "New Delhi",
          "Block B annexe, Press Enclave Marg, Saket, New Delhi", 2500,
          [*_GUEST_ROOM, "Halal & vegetarian kitchen"], [("lotus-crest-new-delhi", 0.1)], (0.05, -0.05)),
    _stay(8, "Hotel Champa Grand", "hotel", "New Delhi",
          "District Centre, Saket, New Delhi", 7500,
          [*_HOTEL, "Halal food available", "Wheelchair accessible"],
          [("lotus-crest-new-delhi", 1.8)], (0.9, 1.0), stars=4),
    _stay(9, "Tulsi Home Stay & Guest House", "guest_house", "New Delhi",
          "Malviya Nagar, New Delhi", 2400,
          [*_GUEST_HOUSE, "Prayer room"], [("lotus-crest-new-delhi", 1.1)], (-0.7, 0.5)),
    # Mumbai
    _stay(10, "Bayside Pearl Hotel", "hotel", "Mumbai",
          "Hill Road, Bandra West, Mumbai", 9000,
          [*_HOTEL, "Sea view rooms", "Halal food available"], [("ratnakar-bay-mumbai", 1.5)], (0.8, 0.9),
          stars=4),
    _stay(11, "Sea Breeze Serviced Residences", "service_apartment", "Mumbai",
          "Pali Hill, Bandra West, Mumbai", 6200,
          [*_APARTMENT, "Hospital shuttle"], [("ratnakar-bay-mumbai", 2.2)], (1.6, 0.6)),
    _stay(12, "Koliwada Guest House", "guest_house", "Mumbai",
          "Chimbai Road, Bandra West, Mumbai", 3200,
          _GUEST_HOUSE, [("ratnakar-bay-mumbai", 2.8)], (-1.9, 0.4)),
    # Chennai (shared by both Chennai hospitals)
    _stay(13, "Coromandel Family Guest Rooms", "hospital_guest_room", "Chennai",
          "Staff Quarters Road, Guindy, Chennai", 1600,
          _GUEST_ROOM, [("coromandel-chennai", 0.1)], (0.05, 0.05)),
    _stay(14, "Hotel Marigold Grand", "hotel", "Chennai",
          "Anna Salai, Guindy, Chennai", 6000,
          [*_HOTEL, "Halal food available"],
          [("coromandel-chennai", 1.4), ("pournami-chennai", 7.5)], (0.9, 0.6), stars=4),
    _stay(15, "Mylapore Heritage Guest House", "guest_house", "Chennai",
          "Kutchery Road, Mylapore, Chennai", 2600,
          [*_GUEST_HOUSE, "Vegetarian kitchen"],
          [("pournami-chennai", 0.8), ("coromandel-chennai", 6.8)], (0.4, -0.5)),
    _stay(16, "Sandalwood Serviced Apartments", "service_apartment", "Chennai",
          "TTK Road, Alwarpet, Chennai", 3800,
          [*_APARTMENT, "Hospital shuttle"],
          [("pournami-chennai", 1.9), ("coromandel-chennai", 6.0)], (-1.2, -0.9)),
    # Bengaluru
    _stay(17, "Hotel Silver Oak Koramangala", "hotel", "Bengaluru",
          "5th Block, Koramangala, Bengaluru", 4800,
          _HOTEL, [("nandi-valley-bengaluru", 1.0)], (0.5, -0.6), stars=3),
    _stay(18, "Jacaranda Serviced Apartments", "service_apartment", "Bengaluru",
          "HSR Layout Sector 7, Bengaluru", 4000,
          [*_APARTMENT, "Hospital shuttle"], [("nandi-valley-bengaluru", 1.7)], (-1.3, 0.6)),
    _stay(19, "Nandi Valley Patient Guest House", "hospital_guest_room", "Bengaluru",
          "Rear block, 80 Feet Road, Koramangala, Bengaluru", 1900,
          _GUEST_ROOM, [("nandi-valley-bengaluru", 0.2)], (0.1, 0.1)),
    # Hyderabad
    _stay(20, "Hotel Pearl Crescent", "hotel", "Hyderabad",
          "Road No. 12, Banjara Hills, Hyderabad", 6500,
          [*_HOTEL, "Halal food available", "Prayer room"], [("vasundhara-hyderabad", 1.2)], (0.7, -0.8),
          stars=4),
    _stay(21, "Deccan Nest Serviced Apartments", "service_apartment", "Hyderabad",
          "Jubilee Hills Road No. 36, Hyderabad", 3900,
          _APARTMENT, [("vasundhara-hyderabad", 2.0)], (1.1, -1.4)),
    _stay(22, "Vasundhara Attendant Rest House", "hospital_guest_room", "Hyderabad",
          "Annexe, Road No. 10, Banjara Hills, Hyderabad", 1500,
          [*_GUEST_ROOM, "Halal meals"], [("vasundhara-hyderabad", 0.1)], (0.05, 0.05)),
    # Kolkata
    _stay(23, "Hotel Shiuli Inn", "hotel", "Kolkata",
          "E.M. Bypass, Kasba, Kolkata", 3800,
          _HOTEL, [("hooghly-valley-kolkata", 1.3)], (0.9, -0.5), stars=3),
    _stay(24, "Kadamba Guest House", "guest_house", "Kolkata",
          "Mukundapur Main Road, Kolkata", 2000,
          [*_GUEST_HOUSE, "Bengali & halal meals"], [("hooghly-valley-kolkata", 0.9)], (-0.5, 0.4)),
    # Kochi
    _stay(25, "Kayal Breeze Hotel", "hotel", "Kochi",
          "Edappally Junction, Kochi", 4200,
          _HOTEL, [("vembanad-kochi", 1.5)], (0.8, -0.9), stars=3),
    _stay(26, "Coconut Grove Serviced Homes", "service_apartment", "Kochi",
          "Kakkanad Road, Kochi", 3500,
          [*_APARTMENT, "Garden"], [("vembanad-kochi", 2.3)], (-0.9, 1.8)),
    _stay(27, "Vembanad Wellness Guest Cottages", "hospital_guest_room", "Kochi",
          "Wellness wing, NH 66 Bypass, Edappally, Kochi", 2800,
          [*_GUEST_ROOM, "Ayurvedic diet kitchen", "Yoga deck"], [("vembanad-kochi", 0.3)], (0.2, 0.1)),
    # Ahmedabad
    _stay(28, "Hotel Saffron Courtyard", "hotel", "Ahmedabad",
          "Judges Bungalow Road, Bodakdev, Ahmedabad", 5200,
          [*_HOTEL, "Jain & vegetarian kitchen"], [("shubh-arogya-ahmedabad", 1.1)], (0.6, 0.7), stars=4),
    _stay(29, "Sabar Serviced Apartments", "service_apartment", "Ahmedabad",
          "Vastrapur, Ahmedabad", 3300,
          _APARTMENT, [("shubh-arogya-ahmedabad", 1.8)], (-0.9, 1.3)),
    # Pune
    _stay(30, "Hotel Plumeria Koregaon Park", "hotel", "Pune",
          "Lane 5, Koregaon Park, Pune", 6200,
          [*_HOTEL, "Halal food available"], [("deccan-crest-pune", 0.8)], (0.4, 0.5), stars=4),
    _stay(31, "Banyan Court Serviced Apartments", "service_apartment", "Pune",
          "Kalyani Nagar, Pune", 3800,
          [*_APARTMENT, "Hospital shuttle"], [("deccan-crest-pune", 1.5)], (0.9, 1.0)),
    _stay(32, "Deccan Crest Family Guest Rooms", "hospital_guest_room", "Pune",
          "Annexe, North Main Road, Koregaon Park, Pune", 1700,
          _GUEST_ROOM, [("deccan-crest-pune", 0.1)], (0.05, 0.05)),
    # Jaipur
    _stay(33, "Haveli Gulabi Guest House", "guest_house", "Jaipur",
          "Sector 3, Malviya Nagar, Jaipur", 2600,
          [*_GUEST_HOUSE, "Rooftop terrace"], [("aravali-heights-jaipur", 2.4)], (1.5, -1.2)),
    _stay(34, "Hotel Jharokha Suites", "hotel", "Jaipur",
          "Tonk Road, Malviya Nagar, Jaipur", 4000,
          _HOTEL, [("aravali-heights-jaipur", 1.2)], (0.6, -0.8), stars=3),
    # Chandigarh
    _stay(35, "Hotel Pine Crest", "hotel", "Chandigarh",
          "Sector 35-C, Chandigarh", 4200,
          _HOTEL, [("shivalik-chandigarh", 1.0)], (0.4, -0.7), stars=3),
    _stay(36, "Rose Garden Service Apartments", "service_apartment", "Chandigarh",
          "Sector 16, Chandigarh", 3200,
          [*_APARTMENT, "Hospital shuttle"], [("shivalik-chandigarh", 1.6)], (1.2, 0.8)),
]
# fmt: on


def _service(
    index: int,
    kind: str,
    name: str,
    city: str,
    languages: list[str],
    rate_rupees: int,
    rate_unit: str,
    rating: str,
) -> dict[str, Any]:
    return {
        "kind": kind,
        "name": name,
        "city": city,
        "languages": languages,
        "phone": f"+91-90000-1{index:04d}",
        "email": f"hello@{_slugify(name)}.example",
        "rate_minor": inr(rate_rupees),
        "rate_unit": rate_unit,
        "currency": "INR",
        "rating_avg": rating,
    }


# fmt: off
SERVICE_PROVIDERS: list[dict[str, Any]] = [
    # Medical interpreters (rates per day)
    _service(1, "translator", "Al-Bayan Medical Interpreters", "New Delhi", ["Arabic", "English", "Hindi"],
             4500, "day", "4.8"),
    _service(2, "translator", "Noor Language Services", "Hyderabad", ["Arabic", "Urdu", "English"],
             3800, "day", "4.7"),
    _service(3, "translator", "Marhaba Care Interpreters", "Kochi", ["Arabic", "Malayalam", "English"],
             3500, "day", "4.6"),
    _service(4, "translator", "Gateway Arabic Interpreters", "Mumbai", ["Arabic", "English", "Hindi"],
             4800, "day", "4.7"),
    _service(5, "translator", "Parole Medical Interpreters", "Chennai", ["French", "English", "Tamil"],
             4200, "day", "4.8"),
    _service(6, "translator", "Bonjour Sante Language Desk", "Gurugram", ["French", "English", "Hindi"],
             4600, "day", "4.6"),
    _service(7, "translator", "Druzhba Medical Translators", "Gurugram", ["Russian", "Uzbek", "English"],
             4600, "day", "4.7"),
    _service(8, "translator", "Samarkand Link Translators", "New Delhi",
             ["Uzbek", "Russian", "Tajik", "English"],
             4200, "day", "4.6"),
    _service(9, "translator", "Jambo Health Interpreters", "Mumbai", ["Swahili", "English", "Gujarati"],
             3800, "day", "4.7"),
    _service(10, "translator", "Karibu Care Language Services", "Hyderabad", ["Swahili", "English", "Hindi"],
             3600, "day", "4.5"),
    _service(11, "translator", "Selam Medical Interpreting", "New Delhi", ["Amharic", "Tigrinya", "English"],
             4000, "day", "4.6"),
    _service(12, "translator", "Bandhu Language Desk", "Kolkata", ["Bengali", "English", "Hindi"],
             2500, "day", "4.8"),
    _service(13, "translator", "Setu Bengali Interpreters", "Chennai", ["Bengali", "English", "Tamil"],
             2800, "day", "4.6"),
    _service(14, "translator", "Dari & Pashto Care Interpreters", "New Delhi", ["Dari", "Pashto", "English"],
             3800, "day", "4.7"),
    _service(15, "translator", "Ponte Medical Interpreters", "Mumbai", ["Portuguese", "English", "Hindi"],
             4400, "day", "4.5"),
    _service(16, "translator", "Puente Salud Interpreters", "Bengaluru", ["Spanish", "English", "Kannada"],
             4400, "day", "4.6"),
    # Local guides / care companions (per day)
    _service(17, "local_guide", "Delhi Darshan Care Companions", "New Delhi", ["English", "Hindi", "Arabic"],
             3000, "day", "4.7"),
    _service(18, "local_guide", "Mumbai Saathi Local Guides", "Mumbai",
             ["English", "Hindi", "Marathi", "Swahili"],
             3200, "day", "4.6"),
    _service(19, "local_guide", "Chennai Nanban Guides", "Chennai", ["English", "Tamil", "Bengali"],
             2800, "day", "4.8"),
    _service(20, "local_guide", "Namma Bengaluru City Companions", "Bengaluru",
             ["English", "Kannada", "Hindi"],
             2800, "day", "4.5"),
    _service(21, "local_guide", "Pink City Patient Guides", "Jaipur", ["English", "Hindi", "French"],
             2500, "day", "4.7"),
    _service(22, "local_guide", "Kochi Backwater Companions", "Kochi", ["English", "Malayalam", "Arabic"],
             2500, "day", "4.6"),
    # Transport (per trip)
    _service(23, "transport", "MediRide NCR Airport Transfers", "Gurugram", ["English", "Hindi"],
             1800, "trip", "4.7"),
    _service(24, "transport", "CareWheels Accessible Cabs", "New Delhi", ["English", "Hindi"],
             2200, "trip", "4.8"),
    _service(25, "transport", "Bay City Patient Transfers", "Mumbai", ["English", "Hindi", "Marathi"],
             2000, "trip", "4.6"),
    _service(26, "transport", "Marina MedTransit", "Chennai", ["English", "Tamil"],
             1500, "trip", "4.6"),
    _service(27, "transport", "Pearl City Medical Cabs", "Hyderabad", ["English", "Telugu", "Urdu"],
             1600, "trip", "4.5"),
    _service(28, "transport", "Silicon Route Patient Transport", "Bengaluru", ["English", "Kannada"],
             2000, "trip", "4.5"),
    _service(29, "transport", "Kolkata CareCabs", "Kolkata", ["English", "Bengali", "Hindi"],
             1400, "trip", "4.6"),
    # Travel agents (fixed service fee: visa & flight assistance)
    _service(30, "travel_agent", "Blue Lotus Medical Travel Desk", "New Delhi",
             ["English", "Hindi", "Arabic", "French"], 2500, "fixed", "4.7"),
    _service(31, "travel_agent", "Saffron Wings Travel Services", "Mumbai",
             ["English", "Hindi", "Swahili", "Portuguese"], 3000, "fixed", "4.6"),
    _service(32, "travel_agent", "Southern Star Tours & Visa Help", "Chennai",
             ["English", "Tamil", "Bengali"], 2000, "fixed", "4.5"),
    # Travel health insurance brokers (fixed: premium from)
    _service(33, "insurance", "Aashray Travel Health Brokers", "Mumbai", ["English", "Hindi"],
             4500, "fixed", "4.4"),
    _service(34, "insurance", "Suvidha Medical Travel Cover Advisors", "New Delhi",
             ["English", "Hindi", "Arabic"],
             3800, "fixed", "4.5"),
]
# fmt: on
