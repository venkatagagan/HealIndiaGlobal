"""Medical registration councils in India (INTEGRATION_BACKLOG #10).

A doctor's registration is held either in the National Medical Commission's Indian Medical Register (``nmc``)
or with a State Medical Council. ``Doctor.registration_council`` stores one of these codes; the list is the
single source of truth for validation and display (exposed at ``GET /content/medical-councils``).
"""

from __future__ import annotations

import re

__all__ = [
    "MEDICAL_COUNCILS",
    "REGISTRATION_NUMBER_RE",
    "council_name",
    "is_valid_council",
    "normalize_registration_number",
]

MEDICAL_COUNCILS: dict[str, str] = {
    "nmc": "National Medical Commission (Indian Medical Register)",
    "andhra_pradesh": "Andhra Pradesh Medical Council",
    "arunachal_pradesh": "Arunachal Pradesh Medical Council",
    "assam": "Assam Medical Council",
    "bihar": "Bihar Medical Council",
    "chhattisgarh": "Chhattisgarh Medical Council",
    "delhi": "Delhi Medical Council",
    "goa": "Goa Medical Council",
    "gujarat": "Gujarat Medical Council",
    "haryana": "Haryana Medical Council",
    "himachal_pradesh": "Himachal Pradesh Medical Council",
    "jammu_kashmir": "Jammu & Kashmir Medical Council",
    "jharkhand": "Jharkhand Medical Council",
    "karnataka": "Karnataka Medical Council",
    "kerala": "Travancore-Cochin Medical Council (Kerala)",
    "madhya_pradesh": "Madhya Pradesh Medical Council",
    "maharashtra": "Maharashtra Medical Council",
    "manipur": "Manipur Medical Council",
    "meghalaya": "Meghalaya Medical Council",
    "mizoram": "Mizoram Medical Council",
    "nagaland": "Nagaland Medical Council",
    "odisha": "Odisha Council of Medical Registration",
    "punjab": "Punjab Medical Council",
    "rajasthan": "Rajasthan Medical Council",
    "sikkim": "Sikkim Medical Council",
    "tamil_nadu": "Tamil Nadu Medical Council",
    "telangana": "Telangana State Medical Council",
    "tripura": "Tripura State Medical Council",
    "uttar_pradesh": "Uttar Pradesh Medical Council",
    "uttarakhand": "Uttarakhand Medical Council",
    "west_bengal": "West Bengal Medical Council",
}

# Registration numbers vary by council (e.g. "12345", "MMC/2009/04512", "KMC 98765"): letters, digits and the
# separators "/", "-", "." and single spaces, starting with a letter or digit.
REGISTRATION_NUMBER_RE = re.compile(r"^[A-Z0-9][A-Z0-9/. \-]*$")


def is_valid_council(code: str | None) -> bool:
    return code is not None and code in MEDICAL_COUNCILS


def council_name(code: str | None) -> str | None:
    return MEDICAL_COUNCILS.get(code) if code else None


def normalize_registration_number(value: str) -> str:
    """Upper-case and collapse whitespace; raise ``ValueError`` when the format is not plausible."""
    v = " ".join(value.split()).upper()
    if not 3 <= len(v) <= 40 or not REGISTRATION_NUMBER_RE.match(v):
        raise ValueError("invalid registration number")
    return v
