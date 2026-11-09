"""Default visa rules for medical travel to India (seed data for ``visa_country_rules`` and
``visa_checklist_items``; admins edit the tables afterwards).

Provenance (research on 2026-11-09)
-----------------------------------
* The official e-Visa portal https://indianvisaonline.gov.in/evisa/ refused automated connections on
  2026-11-09, so it could NOT be read directly. TODO: re-check every list below on the portal by hand.
* e-Visa eligible nationalities: Ministry of Tourism, https://incredibleindia.gov.in/en/plan-your-trip/visa
  (read 2026-11-09; the page has no "as of" date). 168 nationalities list "eMedical, eMedical Attendant".
* e-Medical rules, read 2026-11-09 on Indian mission pages (not on the portal itself):
  - 60 days from first arrival, triple entry: https://hcililongwe.gov.in/page/faqs-on-e-visa (Q9),
    https://eoibratislava.gov.in/e-visa
  - 2 e-Medical Attendant visas per patient: hcililongwe FAQ Q34
  - apply at least 4 days and at most 120 days before arrival: hcililongwe Q5, eoibratislava,
    https://cgivladi.gov.in/page/advisory-for-e-visa-applicants, https://eoilisbon.gov.in/pages/NQ,,
  - passport valid 6 months with 2 blank pages: hcililongwe Q1, https://indianembassyusa.gov.in/home?id=4
  - processing "72 hours or more": hcililongwe Q7; "cleared in 72 hours": cgivladi
  - at most twice per calendar year (general e-Visa rule): eoibratislava, cgivladi, eoilisbon
  - TODO (unverified): whether e-Medical may be used three times a year; e-Medical Attendant "blood
    relative" rule; current number of designated airports/seaports; fees.
* Pakistan nationals / Pakistani origin must apply for a regular visa: hcililongwe FAQ Q1, cgivladi,
  eoilisbon (verified 2026-11-09).
* Nepal and Bhutan nationals need no visa (passport needed when arriving from China, Macau, Hong Kong or
  Pakistan): incredibleindia.gov.in visa page (verified 2026-11-09).
* Regular Medical visa: invitation letter from a recognised Indian hospital, local medical referral, proof
  of funds; Medical Attendant visa for spouse, children or blood relatives (non-blood relative needs the
  patient's undertaking); stays over 180 days register with the FRRO within 14 days:
  https://www.indianembassysantiago.gov.in/pdf/Medical%20Visa-24-05-2026.pdf (verified 2026-11-09).
  TODO (unverified): maximum number of Medical Attendant visas on a regular visa (2 assumed below) and
  typical embassy processing time (left empty).
"""

from __future__ import annotations

from typing import Any

from app.modules.travel.countries import country_name

SOURCE_DATE = "2026-11-09"
EVISA_URL = "https://indianvisaonline.gov.in/evisa/"
REGULAR_VISA_URL = "https://indianvisaonline.gov.in/visa/"
NO_VISA_URL = "https://incredibleindia.gov.in/en/plan-your-trip/visa"
EVISA_LIST_SOURCE = (
    f"e-Visa eligible list: https://incredibleindia.gov.in/en/plan-your-trip/visa (read {SOURCE_DATE}). "
    "TODO: confirm on https://indianvisaonline.gov.in/evisa/ (unreachable from our servers that day)."
)

#: Nationalities listed as eligible for e-Medical / e-Medical Attendant visas (ISO 3166-1 alpha-2).
EVISA_NATIONALITIES: tuple[str, ...] = tuple(
    """AL AD AO AI AG AR AM AW AU AT AZ BS BB BY BE BZ BJ BO BA BW BR BN BG BI KH CM CV KY CL CO KM CK CR
    CI HR CU CY CZ DK DJ DM DO TL EC SV GQ ER EE FJ FI FR GA GM GE DE GH GR GD GT GN GY HT HN HU IS ID IE IL
    IT JM JP JO KZ KE KI KG LA LV LS LR LI LT LU MK MG MW MY ML MT MH MU MX FM MD MC MN ME MS MZ MM NA NR NL
    NZ NI NE NU NO OM PW PS PA PG PY PE PH PL PT KR RO RU RW KN LC VC WS SM SA SN SR SC SL SG SK SI SB ZA ES
    LK SZ SE CH TW TJ TZ TH TG TO TT TC TV AE UG UA GB UY US UZ VU VA VE VN ZM ZW""".split()
)

#: Nationalities that need no visa for India.
NO_VISA_NATIONALITIES: tuple[str, ...] = ("NP", "BT")

#: Explicit regular-visa rows (any nationality without a row also gets the regular visa route).
REGULAR_VISA_NOTES: dict[str, str] = {
    "PK": (
        "Pakistani nationals and people of Pakistani origin cannot use the e-Visa and must apply for a "
        "regular Medical visa at an Indian mission."
    ),
    "AF": (
        "Apply for a regular Medical visa at an Indian mission. TODO: Afghanistan appears on the Ministry of "
        "Tourism e-Visa list but not on the older MHA list; verify on the e-Visa portal before changing."
    ),
    "CA": (
        "Apply for a regular Medical visa at an Indian mission. TODO: Canada is missing from the Ministry of "
        "Tourism e-Visa list (read 2026-11-09); check the e-Visa portal manually."
    ),
    "MV": (
        "Maldivian citizens may visit India visa-free for up to 90 days for tourism; for treatment apply for "
        "a Medical visa. TODO: verify whether medical stays are covered by the visa exemption."
    ),
    "BD": "Not on the e-Visa list (read 2026-11-09): apply for a regular Medical visa at an Indian mission.",
    "CN": "Not on the e-Visa list (read 2026-11-09): apply for a regular Medical visa at an Indian mission.",
    "HK": "Not on the e-Visa list (read 2026-11-09): apply for a regular Medical visa at an Indian mission.",
    "IR": "Not on the e-Visa list (read 2026-11-09): apply for a regular Medical visa at an Indian mission.",
    "IQ": "Not on the e-Visa list (read 2026-11-09): apply for a regular Medical visa at an Indian mission.",
    "EG": "Not on the e-Visa list (read 2026-11-09): apply for a regular Medical visa at an Indian mission.",
    "ET": "Not on the e-Visa list (read 2026-11-09): apply for a regular Medical visa at an Indian mission.",
    "NG": "Not on the e-Visa list (read 2026-11-09): apply for a regular Medical visa at an Indian mission.",
    "SD": "Not on the e-Visa list (read 2026-11-09): apply for a regular Medical visa at an Indian mission.",
    "SO": "Not on the e-Visa list (read 2026-11-09): apply for a regular Medical visa at an Indian mission.",
    "YE": "Not on the e-Visa list (read 2026-11-09): apply for a regular Medical visa at an Indian mission.",
    "TR": "Not on the e-Visa list (read 2026-11-09): apply for a regular Medical visa at an Indian mission.",
}

EVISA_NOTE = (
    "Apply online for an e-Medical visa at least 4 days (and at most 120 days) before arrival. It is valid "
    "for 60 days from first arrival with triple entry. Up to 2 attendants apply for e-Medical Attendant "
    "visas. Decisions usually take about 72 hours."
)
NO_VISA_NOTE = (
    "Nationals of Nepal and Bhutan do not need a visa for India. A passport is needed when arriving from "
    "China, Macau, Hong Kong or Pakistan."
)
REGULAR_ATTENDANTS_TODO = "TODO: the maximum number of Medical Attendant visas (2 assumed) is not verified."


def default_rules() -> list[dict[str, Any]]:
    """Rows for ``visa_country_rules``."""
    rows: list[dict[str, Any]] = []
    for code in EVISA_NATIONALITIES:
        rows.append(
            {
                "nationality": code,
                "visa_route": "e_visa",
                "max_attendants": 2,
                "typical_processing_days": 3,
                "notes": EVISA_NOTE,
                "official_url": EVISA_URL,
                "source": EVISA_LIST_SOURCE,
            }
        )
    for code in NO_VISA_NATIONALITIES:
        rows.append(
            {
                "nationality": code,
                "visa_route": "not_required",
                "max_attendants": 2,
                "typical_processing_days": 0,
                "notes": NO_VISA_NOTE,
                "official_url": NO_VISA_URL,
                "source": f"{NO_VISA_URL} (read {SOURCE_DATE})",
            }
        )
    for code, note in REGULAR_VISA_NOTES.items():
        rows.append(
            {
                "nationality": code,
                "visa_route": "regular_visa",
                "max_attendants": 2,
                "typical_processing_days": None,
                "notes": note,
                "official_url": REGULAR_VISA_URL,
                "source": (
                    f"{EVISA_LIST_SOURCE} {REGULAR_ATTENDANTS_TODO} "
                    "TODO: typical embassy processing time not published."
                ),
            }
        )
    for row in rows:
        row["country_name"] = country_name(row["nationality"])
    return rows


def default_checklist() -> list[dict[str, Any]]:
    """Rows for ``visa_checklist_items`` (``nationality`` None = every nationality on the route)."""
    items: list[tuple[str, str, str, str, bool]] = [
        # route, key, title, description, required
        (
            "e_visa",
            "passport",
            "Passport valid for 6 months",
            "Your passport must be valid for at least 6 months from arrival and have 2 blank pages.",
            True,
        ),
        (
            "e_visa",
            "apply_online",
            "Apply online 4 to 120 days before arrival",
            "Apply for the e-Medical visa on the official Indian e-Visa website at least 4 days before you "
            "travel. Decisions usually take about 72 hours.",
            True,
        ),
        (
            "e_visa",
            "photo_and_passport_scan",
            "Photo and passport page",
            "Upload a recent photo and a scan of your passport's photo page with the application.",
            True,
        ),
        (
            "e_visa",
            "invitation_letter",
            "Hospital invitation letter",
            "Your Indian hospital's letter on its letterhead. We prepare it for you once your treatment is "
            "booked.",
            True,
        ),
        (
            "e_visa",
            "attendants",
            "Attendants (up to 2)",
            "Up to 2 family members can travel with you on e-Medical Attendant visas linked to your visa.",
            False,
        ),
        (
            "e_visa",
            "validity",
            "60 days, triple entry",
            "The e-Medical visa is valid for 60 days from your first arrival and allows three entries.",
            False,
        ),
        (
            "regular_visa",
            "passport",
            "Passport valid for 6 months",
            "Your passport must be valid for at least 6 months.",
            True,
        ),
        (
            "regular_visa",
            "application",
            "Medical visa application at the Indian mission",
            "Fill in the regular visa form online and submit it at the Indian embassy, consulate or its visa "
            "centre in your country.",
            True,
        ),
        (
            "regular_visa",
            "invitation_letter",
            "Hospital invitation letter",
            "A letter from a recognised Indian hospital. We prepare it for you once your treatment is "
            "booked.",
            True,
        ),
        (
            "regular_visa",
            "local_referral",
            "Referral from your doctor",
            "A medical referral or report from your doctor at home recommending treatment in India.",
            True,
        ),
        (
            "regular_visa",
            "proof_of_funds",
            "Proof of funds",
            "Bank statements or a sponsor letter showing you can pay for treatment and stay.",
            True,
        ),
        (
            "regular_visa",
            "attendants",
            "Medical Attendant visas",
            "Your spouse, children or blood relatives can apply for Medical Attendant visas. Anyone else "
            "needs a signed undertaking from you.",
            False,
        ),
        (
            "regular_visa",
            "frro_registration",
            "Registration for long stays",
            "If your visa is for more than 180 days, register with the FRRO within 14 days of arrival.",
            False,
        ),
        (
            "not_required",
            "identity_document",
            "Passport or identity document",
            "No visa is needed. Carry your passport; it is required when you arrive from China, Macau, Hong "
            "Kong or Pakistan.",
            True,
        ),
        (
            "not_required",
            "invitation_letter",
            "Hospital letter",
            "Carry your hospital's letter and appointment details for the border and the hospital.",
            False,
        ),
    ]
    rows: list[dict[str, Any]] = []
    for order, (route, key, title, description, required) in enumerate(items, start=1):
        rows.append(
            {
                "visa_route": route,
                "nationality": None,
                "item_key": key,
                "title": title,
                "description": description,
                "required": required,
                "sort_order": order,
            }
        )
    rows.append(
        {
            "visa_route": "regular_visa",
            "nationality": "PK",
            "item_key": "pakistan_origin",
            "title": "Regular visa only",
            "description": "Pakistani nationals and people of Pakistani origin must apply for a regular "
            "visa; the e-Visa is not available.",
            "required": True,
            "sort_order": 0,
        }
    )
    return rows


#: Rule used when a nationality has no row (unknown or not on the e-Visa list): the regular Medical visa.
FALLBACK_RULE: dict[str, Any] = {
    "visa_route": "regular_visa",
    "max_attendants": 2,
    "typical_processing_days": None,
    "notes": "Apply for a regular Medical visa at the Indian embassy or consulate in your country. Our team "
    "will help you with the documents.",
    "official_url": REGULAR_VISA_URL,
}
