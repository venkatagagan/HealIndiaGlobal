"""Demo accounts. DEMO-ONLY credentials: every account uses ``DEMO_PASSWORD``; never seed them in production.

All people are fictional. Phone numbers are obviously fake (``+91-90000-4xxxx`` in India, the reserved
``555-01xx`` range in the US, the Ofcom drama range in the UK and zero-filled numbers elsewhere); e-mail
addresses use the reserved ``.example`` domain.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from scripts.seed_data.hospitals import HOSPITALS

__all__ = [
    "AGENTS",
    "CONSENT_KINDS",
    "CONSENT_VERSION",
    "DEMO_EMAIL_DOMAIN",
    "DEMO_PASSWORD",
    "PATIENTS",
    "STAFF_USERS",
    "hospital_users",
]

DEMO_PASSWORD = "HealIndia@2026"  # noqa: S105 - documented demo-only password (dev/test databases only)
DEMO_EMAIL_DOMAIN = "healindia.example"

#: Consents captured for demo patients (PLAN 9.9: required before AI screening / sharing with hospitals).
CONSENT_KINDS: tuple[str, ...] = ("terms", "privacy", "ai_processing", "share_with_hospitals")
CONSENT_VERSION = "2026-10"


def _email(local: str) -> str:
    return f"{local}@{DEMO_EMAIL_DOMAIN}"


STAFF_USERS: list[dict[str, Any]] = [
    {
        "email": _email("superadmin"),
        "full_name": "Meera Kapoor",
        "role": "super_admin",
        "phone": "+91-90000-40001",
        "note": "Super admin - everything, incl. settlement approvals",
    },
    {
        "email": _email("admin"),
        "full_name": "Rohan Verma",
        "role": "admin",
        "phone": "+91-90000-40002",
        "note": "Operations admin - approvals, catalog, users",
    },
    {
        "email": _email("finance1"),
        "full_name": "Kavita Iyer",
        "role": "finance",
        "phone": "+91-90000-40003",
        "note": "Finance (maker) - creates settlement batches",
    },
    {
        "email": _email("finance2"),
        "full_name": "Sandeep Bhatia",
        "role": "finance",
        "phone": "+91-90000-40004",
        "note": "Finance (checker) - approves batches created by finance1",
    },
    {
        "email": _email("support"),
        "full_name": "Fatima Qureshi",
        "role": "support",
        "phone": "+91-90000-40005",
        "note": "Patient coordinator - cases, travel desk, messaging",
    },
]

AGENTS: list[dict[str, Any]] = [
    {
        "email": _email("agent.lagos"),
        "full_name": "Chinedu Okafor",
        "phone": "+234-700-000-0101",
        "country_code": "NG",
        "agency_name": "Lagos MedConnect Travel Ltd",
        "agent_code": "AGTLAGS2",
        "country": "NG",
        "city": "Lagos",
        "website": "https://lagos-medconnect.example",
        "status": "active",
        "kyc_status": "approved",
        "tier": "silver",
        "note": "Active agent (Nigeria) - referred patient.ng",
    },
    {
        "email": _email("agent.dubai"),
        "full_name": "Omar Haddad",
        "phone": "+971-50-000-0102",
        "country_code": "AE",
        "agency_name": "Gulf CareBridge Medical Tourism LLC",
        "agent_code": "AGTDXB42",
        "country": "AE",
        "city": "Dubai",
        "website": "https://gulf-carebridge.example",
        "status": "pending",
        "kyc_status": "pending",
        "tier": "bronze",
        "note": "Pending agent (UAE) - waiting in the admin approval queue",
    },
]

# Coordinator + finance members for the first three hospitals: slug -> (coordinator name, finance name)
_EXTRA_HOSPITAL_STAFF: dict[str, tuple[str, str]] = {
    "sanjeevani-gurugram": ("Ayesha Khan", "Manoj Goyal"),
    "yamuna-valley-noida": ("Pallavi Dubey", "Sunil Jain"),
    "lotus-crest-new-delhi": ("Tenzin Dolma", "Ramesh Iyengar"),
}


def hospital_users() -> list[dict[str, Any]]:
    """``owner.<slug>@`` for every hospital; ``coordinator.<slug>@`` + ``finance.<slug>@`` for the first 3."""
    users: list[dict[str, Any]] = []
    for index, hospital in enumerate(HOSPITALS, start=1):
        slug = hospital["slug"]
        users.append(
            {
                "email": _email(f"owner.{slug}"),
                "full_name": hospital["owner_name"],
                "phone": f"+91-90000-4{index:02d}10",
                "hospital": slug,
                "member_role": "owner",
                "note": f"Hospital owner - {hospital['name']}",
            }
        )
        extra = _EXTRA_HOSPITAL_STAFF.get(slug)
        if extra:
            coordinator, finance = extra
            users.append(
                {
                    "email": _email(f"coordinator.{slug}"),
                    "full_name": coordinator,
                    "phone": f"+91-90000-4{index:02d}20",
                    "hospital": slug,
                    "member_role": "coordinator",
                    "note": f"Hospital coordinator - {hospital['name']}",
                }
            )
            users.append(
                {
                    "email": _email(f"finance.{slug}"),
                    "full_name": finance,
                    "phone": f"+91-90000-4{index:02d}30",
                    "hospital": slug,
                    "member_role": "finance",
                    "note": f"Hospital finance - {hospital['name']}",
                }
            )
    return users


PATIENTS: list[dict[str, Any]] = [
    {
        "email": _email("patient.us"),
        "full_name": "James Whitaker",
        "phone": "+1-202-555-0143",
        "country_code": "US",
        "note": "Patient (USA) - completed knee replacement journey",
        "profile": {
            "first_name": "James",
            "last_name": "Whitaker",
            "date_of_birth": date(1961, 4, 12),
            "gender": "male",
            "nationality": "US",
            "country_of_residence": "US",
            "passport_number": "X10000001",
            "passport_expiry": date(2031, 3, 31),
            "phone": "+1-202-555-0143",
            "whatsapp": "+1-202-555-0143",
            "address": {
                "line1": "1200 Example Avenue",
                "city": "Columbus",
                "state": "OH",
                "postal_code": "43004",
                "country": "US",
            },
            "emergency_contact": {
                "name": "Linda Whitaker",
                "relationship": "Spouse",
                "phone": "+1-202-555-0178",
            },
            "preferred_language": "en",
            "blood_group": "O+",
            "allergies": "Penicillin (rash)",
            "medical_history": (
                "Osteoarthritis of the right knee for 6 years with failed injections and physiotherapy. "
                "Hypertension controlled on amlodipine."
            ),
            "insurance_provider": "Self-pay",
            "insurance_policy_number": None,
            "preferred_currency": "USD",
        },
    },
    {
        "email": _email("patient.uk"),
        "full_name": "Olivia Bennett",
        "phone": "+44-20-7946-0321",
        "country_code": "GB",
        "note": "Patient (UK) - admitted for hip replacement",
        "profile": {
            "first_name": "Olivia",
            "last_name": "Bennett",
            "date_of_birth": date(1958, 9, 3),
            "gender": "female",
            "nationality": "GB",
            "country_of_residence": "GB",
            "passport_number": "X20000002",
            "passport_expiry": date(2030, 7, 14),
            "phone": "+44-20-7946-0321",
            "whatsapp": "+44-20-7946-0321",
            "address": {
                "line1": "14 Sample Street",
                "city": "Leeds",
                "postal_code": "LS1 0AA",
                "country": "GB",
            },
            "emergency_contact": {
                "name": "Thomas Bennett",
                "relationship": "Son",
                "phone": "+44-20-7946-0544",
            },
            "preferred_language": "en",
            "blood_group": "A+",
            "allergies": "None known",
            "medical_history": (
                "Severe osteoarthritis of the left hip; 14 months on the NHS waiting list. Mild asthma "
                "(salbutamol inhaler as needed)."
            ),
            "insurance_provider": None,
            "insurance_policy_number": None,
            "preferred_currency": "GBP",
        },
    },
    {
        "email": _email("patient.ng"),
        "full_name": "Babatunde Adeyemi",
        "phone": "+234-700-000-0201",
        "country_code": "NG",
        "referred_by": "AGTLAGS2",
        "note": "Patient (Nigeria) - referred by agent.lagos, bypass surgery booked",
        "profile": {
            "first_name": "Babatunde",
            "last_name": "Adeyemi",
            "date_of_birth": date(1966, 2, 14),
            "gender": "male",
            "nationality": "NG",
            "country_of_residence": "NG",
            "passport_number": "X30000003",
            "passport_expiry": date(2029, 11, 30),
            "phone": "+234-700-000-0201",
            "whatsapp": "+234-700-000-0201",
            "address": {"line1": "7 Demo Close, Ikeja", "city": "Lagos", "state": "Lagos", "country": "NG"},
            "emergency_contact": {
                "name": "Funmilayo Adeyemi",
                "relationship": "Wife",
                "phone": "+234-700-000-0202",
            },
            "preferred_language": "en",
            "blood_group": "B+",
            "allergies": "None known",
            "medical_history": (
                "Triple-vessel coronary artery disease on angiography (Lagos, 2026). Type 2 diabetes on "
                "metformin; hypertension."
            ),
            "insurance_provider": None,
            "insurance_policy_number": None,
            "preferred_currency": "USD",
        },
    },
    {
        "email": _email("patient.om"),
        "full_name": "Hamed Al-Rawahi",
        "phone": "+968-9000-0301",
        "country_code": "OM",
        "note": "Patient (Oman) - accepted spine quote + open cataract enquiry",
        "profile": {
            "first_name": "Hamed",
            "last_name": "Al-Rawahi",
            "date_of_birth": date(1975, 11, 2),
            "gender": "male",
            "nationality": "OM",
            "country_of_residence": "OM",
            "passport_number": "X40000004",
            "passport_expiry": date(2032, 1, 20),
            "phone": "+968-9000-0301",
            "whatsapp": "+968-9000-0301",
            "address": {"line1": "Building 12, Way 0000, Al Khuwair", "city": "Muscat", "country": "OM"},
            "emergency_contact": {
                "name": "Maryam Al-Rawahi",
                "relationship": "Wife",
                "phone": "+968-9000-0302",
            },
            "preferred_language": "ar",
            "blood_group": "AB+",
            "allergies": "Ibuprofen (gastritis)",
            "medical_history": (
                "L4-L5 spondylolisthesis with leg pain for 2 years despite physiotherapy and epidural "
                "injections. Early cataract in the left eye."
            ),
            "insurance_provider": "Demo Gulf Health Insurance",
            "insurance_policy_number": "DGH-0000-4417",
            "preferred_currency": "OMR",
        },
    },
    {
        "email": _email("patient.bd"),
        "full_name": "Farhana Rahman",
        "phone": "+880-1700-000301",
        "country_code": "BD",
        "note": "Patient (Bangladesh) - kidney transplant quote received",
        "profile": {
            "first_name": "Farhana",
            "last_name": "Rahman",
            "date_of_birth": date(1983, 1, 25),
            "gender": "female",
            "nationality": "BD",
            "country_of_residence": "BD",
            "passport_number": "X50000005",
            "passport_expiry": date(2030, 5, 9),
            "phone": "+880-1700-000301",
            "whatsapp": "+880-1700-000301",
            "address": {"line1": "House 00, Road 0, Dhanmondi", "city": "Dhaka", "country": "BD"},
            "emergency_contact": {
                "name": "Rashed Rahman",
                "relationship": "Brother (prospective donor)",
                "phone": "+880-1700-000302",
            },
            "preferred_language": "bn",
            "blood_group": "B+",
            "allergies": "None known",
            "medical_history": (
                "Chronic kidney disease stage 5 (IgA nephropathy); haemodialysis three times a week since "
                "2025. Brother (blood group B+) willing to donate."
            ),
            "insurance_provider": None,
            "insurance_policy_number": None,
            "preferred_currency": "BDT",
        },
    },
]
