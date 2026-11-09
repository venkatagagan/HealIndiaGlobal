"""Fictional demo data for ``python -m scripts.seed`` (pure data - no application imports).

``validate_all()`` checks cross-references (slugs, e-mails, specialties offered by hospitals, ...) so a typo
is
caught before anything touches the database.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from scripts.seed_data.availability import AVAILABILITY_DAYS
from scripts.seed_data.benchmarks import BENCHMARK_COUNTRIES, COST_BENCHMARKS
from scripts.seed_data.catalog import BODY_AREAS, PROCEDURES, SPECIALTIES
from scripts.seed_data.content import CULTURAL_TIPS, FX_RATES
from scripts.seed_data.doctors import DOCTORS
from scripts.seed_data.finance import COMMISSION_RULES, PAYOUT_ACCOUNTS
from scripts.seed_data.hospitals import HOSPITALS
from scripts.seed_data.journeys import JOURNEYS, REVIEWS, STAGES
from scripts.seed_data.travel import ACCOMMODATIONS, SERVICE_PROVIDERS
from scripts.seed_data.users import AGENTS, PATIENTS, STAFF_USERS, hospital_users

__all__ = ["REQUIRED_TRANSLATOR_LANGUAGES", "summary_counts", "validate_all"]

REQUIRED_TRANSLATOR_LANGUAGES = frozenset(
    {"Arabic", "French", "Russian", "Swahili", "Amharic", "Bengali", "Dari", "Uzbek", "Portuguese", "Spanish"}
)


def _dupes(values: list[Any]) -> list[Any]:
    return [value for value, count in Counter(values).items() if count > 1]


def validate_all() -> list[str]:  # noqa: C901 - a flat list of independent checks reads best here
    """Return a list of problems (empty when the data set is consistent)."""
    errors: list[str] = []

    specialty_slugs = [s["slug"] for s in SPECIALTIES]
    procedures = {p["slug"]: p for p in PROCEDURES}
    hospitals = {h["slug"]: h for h in HOSPITALS}
    doctors = {d["slug"]: d for d in DOCTORS}

    for label, values in (
        ("specialty slug", specialty_slugs),
        ("procedure slug", [p["slug"] for p in PROCEDURES]),
        ("hospital slug", [h["slug"] for h in HOSPITALS]),
        ("doctor slug", [d["slug"] for d in DOCTORS]),
        ("accommodation name", [a["name"] for a in ACCOMMODATIONS]),
        ("service provider name", [s["name"] for s in SERVICE_PROVIDERS]),
        ("cultural tip title", [t["title"] for t in CULTURAL_TIPS]),
    ):
        for dup in _dupes(values):
            errors.append(f"duplicate {label}: {dup}")

    for proc in PROCEDURES:
        if proc["specialty"] not in specialty_slugs:
            errors.append(f"procedure {proc['slug']}: unknown specialty {proc['specialty']}")
        if not set(proc["body_areas"]) <= BODY_AREAS:
            errors.append(f"procedure {proc['slug']}: invalid body areas {proc['body_areas']}")
        if not 0 < proc["india_price_min_minor"] < proc["india_price_max_minor"]:
            errors.append(f"procedure {proc['slug']}: invalid price range")
        if proc["total_stay_days"] < proc["hospital_stay_days"]:
            errors.append(f"procedure {proc['slug']}: total stay shorter than hospital stay")

    seen_pairs = set()
    for row in COST_BENCHMARKS:
        if row["procedure"] not in procedures:
            errors.append(f"benchmark: unknown procedure {row['procedure']}")
        pair = (row["procedure"], row["country_code"])
        if pair in seen_pairs:
            errors.append(f"benchmark: duplicate {pair}")
        seen_pairs.add(pair)
        if not 0 < row["cost_min_minor"] < row["cost_max_minor"]:
            errors.append(f"benchmark {pair}: invalid range")
        if BENCHMARK_COUNTRIES.get(row["country_code"]) != row["currency"]:
            errors.append(f"benchmark {pair}: currency mismatch")

    doctor_specialties: dict[str, set[str]] = {}
    for doc in DOCTORS:
        hospital = hospitals.get(doc["hospital"])
        if hospital is None:
            errors.append(f"doctor {doc['slug']}: unknown hospital {doc['hospital']}")
            continue
        if doc["specialty"] not in hospital["specialties"]:
            errors.append(
                f"doctor {doc['slug']}: specialty {doc['specialty']} not offered by {doc['hospital']}"
            )
        doctor_specialties.setdefault(doc["hospital"], set()).add(doc["specialty"])

    for slug, hospital in hospitals.items():
        for spec in hospital["specialties"]:
            if spec not in specialty_slugs:
                errors.append(f"hospital {slug}: unknown specialty {spec}")
            elif spec not in doctor_specialties.get(slug, set()):
                errors.append(f"hospital {slug}: no doctor for specialty {spec}")
        if not 8 <= len(hospital["offerings"]) <= 15:
            errors.append(f"hospital {slug}: {len(hospital['offerings'])} offerings (expected 8-15)")
        for dup in _dupes(hospital["offerings"]):
            errors.append(f"hospital {slug}: duplicate offering {dup}")
        for offering in hospital["offerings"]:
            proc = procedures.get(offering)
            if proc is None:
                errors.append(f"hospital {slug}: unknown procedure {offering}")
            elif proc["specialty"] not in hospital["specialties"]:
                errors.append(f"hospital {slug}: offers {offering} outside its specialties")
        if not 0.82 <= float(hospital["price_factor"]) <= 1.15:
            errors.append(f"hospital {slug}: price_factor out of range")

    stays_per_hospital: Counter[str] = Counter()
    for acc in ACCOMMODATIONS:
        for hospital_slug, _distance in acc["links"]:
            if hospital_slug not in hospitals:
                errors.append(f"accommodation {acc['name']}: unknown hospital {hospital_slug}")
            stays_per_hospital[hospital_slug] += 1
    for slug in hospitals:
        if stays_per_hospital[slug] < 2:
            errors.append(f"hospital {slug}: fewer than 2 nearby accommodations")

    translator_languages = {
        lang for s in SERVICE_PROVIDERS if s["kind"] == "translator" for lang in s["languages"]
    }
    missing = REQUIRED_TRANSLATOR_LANGUAGES - translator_languages
    if missing:
        errors.append(f"translators missing languages: {sorted(missing)}")
    kinds = {s["kind"] for s in SERVICE_PROVIDERS}
    if kinds != {"translator", "local_guide", "transport", "travel_agent", "insurance"}:
        errors.append(f"service provider kinds incomplete: {sorted(kinds)}")

    all_users = [*STAFF_USERS, *AGENTS, *hospital_users(), *PATIENTS]
    for dup in _dupes([u["email"].lower() for u in all_users]):
        errors.append(f"duplicate user e-mail: {dup}")
    agent_codes = {a["agent_code"] for a in AGENTS}
    patient_emails = {p["email"] for p in PATIENTS}
    hospital_user_emails = {u["email"] for u in hospital_users()}
    for patient in PATIENTS:
        if patient.get("referred_by") and patient["referred_by"] not in agent_codes:
            errors.append(f"patient {patient['email']}: unknown agent {patient['referred_by']}")
    for agent in AGENTS:
        if len(agent["agent_code"]) != 8:
            errors.append(f"agent {agent['email']}: agent_code must have 8 characters")

    journey_keys = {j["key"] for j in JOURNEYS}
    for journey in JOURNEYS:
        key = journey["key"]
        if journey["target"] not in STAGES:
            errors.append(f"journey {key}: unknown target {journey['target']}")
        if journey["patient"] not in patient_emails:
            errors.append(f"journey {key}: unknown patient {journey['patient']}")
        if journey["actor"] != "patient" and journey["actor"] not in {a["email"] for a in AGENTS}:
            errors.append(f"journey {key}: unknown actor {journey['actor']}")
        if journey["hospital_user"] not in hospital_user_emails:
            errors.append(f"journey {key}: unknown hospital user {journey['hospital_user']}")
        hospital = hospitals.get(journey["hospital"])
        if hospital is None or journey["procedure"] not in hospital["offerings"]:
            errors.append(f"journey {key}: {journey['procedure']} not offered by {journey['hospital']}")
        doctor = doctors.get(journey["doctor"])
        if doctor is None or doctor["hospital"] != journey["hospital"]:
            errors.append(f"journey {key}: doctor {journey['doctor']} not at {journey['hospital']}")
        quote = journey.get("quote")
        needs_quote = STAGES.index(journey["target"]) >= STAGES.index("quoted")
        if needs_quote and not quote:
            errors.append(f"journey {key}: target {journey['target']} needs a quote definition")
        if quote and sum(share for _cat, _desc, share in quote["lines"]) != 100:
            errors.append(f"journey {key}: quote line shares must sum to 100")
        needs_booking = STAGES.index(journey["target"]) >= STAGES.index("booked")
        if needs_booking and not journey.get("booking"):
            errors.append(f"journey {key}: target {journey['target']} needs a booking definition")
        travel = journey.get("travel")
        if travel and travel["stay_provider"] not in {a["name"] for a in ACCOMMODATIONS}:
            errors.append(f"journey {key}: unknown stay provider {travel['stay_provider']}")
        if travel:
            visa_ok = {"documents_pending", "invitation_issued", "applied", "approved", "rejected"}
            service_ok = {"quoted", "confirmed", "completed", "cancelled"}
            if not set(travel.get("visa_steps", [])) <= visa_ok:
                errors.append(f"journey {key}: invalid visa_steps")
            for name in ("stay_steps", "pickup_steps"):
                if not set(travel.get(name, [])) <= service_ok:
                    errors.append(f"journey {key}: invalid {name}")

    for review in REVIEWS:
        if review["patient"] not in patient_emails:
            errors.append(f"review: unknown patient {review['patient']}")
        if review["hospital"] not in hospitals:
            errors.append(f"review: unknown hospital {review['hospital']}")
        if review["doctor"] and doctors.get(review["doctor"], {}).get("hospital") != review["hospital"]:
            errors.append(f"review: doctor {review['doctor']} not at {review['hospital']}")
        if review["journey"] and review["journey"] not in journey_keys:
            errors.append(f"review: unknown journey {review['journey']}")

    for rule in COMMISSION_RULES:
        target = rule["target"]
        valid = {
            "global": target is None,
            "specialty": target in specialty_slugs,
            "hospital": target in hospitals,
            "agent": target in agent_codes,
            "procedure": target in procedures,
        }.get(rule["scope"], False)
        if not valid:
            errors.append(f"commission rule {rule['scope']}:{target} has an unknown target")
    for account in PAYOUT_ACCOUNTS:
        owners = hospitals if account["owner_type"] == "hospital" else agent_codes
        if account["owner"] not in owners:
            errors.append(f"payout account: unknown owner {account['owner']}")

    if "INR" not in FX_RATES or FX_RATES["INR"] != 1:
        errors.append("FX rates must include INR = 1")
    if AVAILABILITY_DAYS < 1:
        errors.append("AVAILABILITY_DAYS must be positive")
    return errors


def summary_counts() -> dict[str, int]:
    offerings = sum(len(h["offerings"]) for h in HOSPITALS)
    return {
        "specialties": len(SPECIALTIES),
        "procedures": len(PROCEDURES),
        "cost_benchmarks": len(COST_BENCHMARKS),
        "hospitals": len(HOSPITALS),
        "doctors": len(DOCTORS),
        "hospital_procedures": offerings,
        "treatment_packages": offerings * 3,
        "accommodation_providers": len(ACCOMMODATIONS),
        "service_providers": len(SERVICE_PROVIDERS),
        "cultural_tips": len(CULTURAL_TIPS),
        "fx_rates": len(FX_RATES),
        "users": len(STAFF_USERS) + len(AGENTS) + len(hospital_users()) + len(PATIENTS),
        "journeys": len(JOURNEYS),
    }
