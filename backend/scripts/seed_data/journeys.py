"""Demo patient journeys (one case per stage of the case state machine) and a few published reviews.

Journeys are driven through the real HTTP API in-process (cases -> quotes -> bookings -> MOCK payments ->
admit/complete), so domain events update the ledger, settlements, checklists and notifications exactly as in
production. They are idempotent: an existing case for the same patient/hospital/procedure is resumed.
"""

from __future__ import annotations

from typing import Any

__all__ = ["JOURNEYS", "REVIEWS", "STAGES"]

#: Stage order; ``admitted`` = booking admitted / case ``in_treatment``.
STAGES: tuple[str, ...] = ("enquiry", "quoted", "accepted", "booked", "admitted", "completed")

_D = "@healindia.example"

JOURNEYS: list[dict[str, Any]] = [
    {
        "key": "completed-us-knee",
        "target": "completed",
        "patient": f"patient.us{_D}",
        "actor": "patient",
        "hospital": "sanjeevani-gurugram",
        "hospital_user": f"coordinator.sanjeevani-gurugram{_D}",
        "procedure": "total-knee-replacement",
        "doctor": "rajiv-sehgal",
        "patient_notes": (
            "Right knee osteoarthritis (Kellgren-Lawrence grade 4). Struggling with stairs and walks under "
            "500 m. Prefer a robotic-assisted replacement and early mobilisation."
        ),
        "quote": {
            "factor": 1.00,
            "treatment_plan": (
                "Robotic-assisted right total knee replacement under spinal anaesthesia, 5 nights in a "
                "private room, daily physiotherapy and a review with Dr. Rajiv Sehgal before discharge."
            ),
            "lines": [
                ("surgery", "Surgeon, anaesthesia and operation theatre (right TKR)", 38),
                ("implants", "Imported cemented knee implant", 30),
                ("hospital_stay", "5 nights private room with nursing care", 16),
                ("medications", "Medicines and consumables during the stay", 6),
                ("tests_scans", "Pre-operative tests, X-rays and ECG", 5),
                ("doctor_fees", "Physiotherapy and specialist visits", 5),
            ],
        },
        "booking": {"payment_option": "full", "pay_currency": "USD", "admission_in_days": 1},
        "assign_coordinator": True,
        "travel": {
            "stay_provider": "Hotel Gulmohar Greens",
            "nights": 16,
            "pickup_from": "DEL",
            "visa_steps": ["applied", "approved"],
            "stay_steps": ["confirmed"],
            "pickup_steps": ["confirmed", "completed"],
        },
    },
    {
        "key": "completed-om-dental",
        "target": "completed",
        "patient": f"patient.om{_D}",
        "actor": "patient",
        "hospital": "pournami-chennai",
        "hospital_user": f"owner.pournami-chennai{_D}",
        "procedure": "dental-implants",
        "doctor": "divya-raghavan",
        "patient_notes": (
            "Two missing lower molars (36, 46) after old extractions. Would like fixed implants rather than "
            "a bridge and can stay about a week."
        ),
        "quote": {
            "factor": 1.00,
            "treatment_plan": (
                "3D CBCT planning, two titanium implants with immediate temporary crowns and a review "
                "after 5 days; permanent crowns on a later visit or by the patient's own dentist."
            ),
            "lines": [
                ("surgery", "Implant surgery (2 implants) under local anaesthesia", 45),
                ("implants", "Two titanium implants with abutments", 35),
                ("tests_scans", "CBCT scan and treatment planning", 10),
                ("medications", "Medicines and temporary crowns", 5),
                ("doctor_fees", "Review consultation", 5),
            ],
        },
        "booking": {"payment_option": "full", "pay_currency": "USD", "admission_in_days": 1},
        "assign_coordinator": False,
    },
    {
        "key": "admitted-uk-hip",
        "target": "admitted",
        "patient": f"patient.uk{_D}",
        "actor": "patient",
        "hospital": "yamuna-valley-noida",
        "hospital_user": f"coordinator.yamuna-valley-noida{_D}",
        "procedure": "total-hip-replacement",
        "doctor": "sameer-chaudhary",
        "patient_notes": (
            "Severe left hip arthritis; 14 months on the NHS waiting list. Would like a ceramic bearing and "
            "a ground-floor room for my daughter who is travelling with me."
        ),
        "quote": {
            "factor": 1.02,
            "treatment_plan": (
                "Left total hip replacement (ceramic-on-polyethylene, uncemented) with 5 nights in hospital, "
                "physiotherapy from day one and a wound check before flying home on day 18."
            ),
            "lines": [
                ("surgery", "Surgeon, anaesthesia and operation theatre (left THR)", 36),
                ("implants", "Uncemented hip implant with ceramic head", 32),
                ("hospital_stay", "5 nights private room with nursing care", 16),
                ("medications", "Medicines, blood thinners and consumables", 6),
                ("tests_scans", "Pre-operative tests, X-rays and ECG", 5),
                ("doctor_fees", "Physiotherapy and specialist visits", 5),
            ],
        },
        "booking": {
            "payment_option": "deposit",
            "pay_currency": "GBP",
            "admission_in_days": 1,
            "pay_balance": True,
        },
        "assign_coordinator": True,
        "travel": {
            "stay_provider": "Neem Tree Service Apartments",
            "nights": 14,
            "pickup_from": "DEL",
            # statuses the support coordinator moves the requests through (she is already in India)
            "visa_steps": ["applied", "approved"],
            "stay_steps": ["confirmed"],
            "pickup_steps": ["confirmed", "completed"],
        },
    },
    {
        "key": "booked-ng-cabg",
        "target": "booked",
        "patient": f"patient.ng{_D}",
        "actor": f"agent.lagos{_D}",
        "hospital": "sanjeevani-gurugram",
        "hospital_user": f"owner.sanjeevani-gurugram{_D}",
        "procedure": "cabg",
        "doctor": "arvind-khanna",
        "patient_notes": (
            "Referred by Lagos MedConnect. Triple-vessel disease on angiography (CD with images attached by "
            "the agent). Diabetic on metformin. Travelling with his wife."
        ),
        "quote": {
            "factor": 1.03,
            "treatment_plan": (
                "Off-pump coronary artery bypass grafting (3 grafts) with 2 days in cardiac ICU and 5 nights "
                "in a private room, followed by supervised cardiac rehabilitation before discharge."
            ),
            "lines": [
                ("surgery", "Cardiac surgery team, anaesthesia and operation theatre", 42),
                ("hospital_stay", "Cardiac ICU (2 days) and private room (5 nights)", 22),
                ("medications", "Medicines and consumables", 10),
                ("tests_scans", "Pre-operative echo, Doppler, labs and imaging", 10),
                ("doctor_fees", "Cardiologist, anaesthetist and rehabilitation", 8),
                ("other", "Blood products and perfusion consumables", 8),
            ],
        },
        "booking": {"payment_option": "deposit", "pay_currency": "USD", "admission_in_days": 21},
        "assign_coordinator": True,
        "travel": {
            "stay_provider": "Sanjeevani Patient & Family Guest Rooms",
            "nights": 14,
            "pickup_from": "DEL",
            "visa_steps": ["applied"],
            "stay_steps": ["confirmed"],
            "pickup_steps": ["confirmed"],
        },
    },
    {
        "key": "accepted-om-spine",
        "target": "accepted",
        "patient": f"patient.om{_D}",
        "actor": "patient",
        "hospital": "yamuna-valley-noida",
        "hospital_user": f"coordinator.yamuna-valley-noida{_D}",
        "procedure": "spinal-fusion",
        "doctor": "ritu-saxena",
        "patient_notes": (
            "L4-L5 spondylolisthesis with right leg pain for two years; physiotherapy and two epidural "
            "injections gave only temporary relief. MRI from Muscat available."
        ),
        "quote": {
            "factor": 1.00,
            "treatment_plan": (
                "Minimally invasive L4-L5 transforaminal lumbar interbody fusion (TLIF) with "
                "neuro-monitoring, "
                "5 nights in hospital and a spine rehabilitation plan."
            ),
            "lines": [
                ("surgery", "Spine surgeon, anaesthesia and operation theatre", 40),
                ("implants", "Pedicle screws, rods and interbody cage", 25),
                ("hospital_stay", "5 nights private room with nursing care", 15),
                ("medications", "Medicines and consumables", 7),
                ("tests_scans", "MRI review, X-rays and intra-operative neuro-monitoring", 8),
                ("doctor_fees", "Physiotherapy and specialist visits", 5),
            ],
        },
    },
    {
        "key": "quoted-bd-kidney",
        "target": "quoted",
        "patient": f"patient.bd{_D}",
        "actor": "patient",
        "hospital": "lotus-crest-new-delhi",
        "hospital_user": f"coordinator.lotus-crest-new-delhi{_D}",
        "procedure": "kidney-transplant",
        "doctor": "farah-siddiqui",
        "patient_notes": (
            "CKD stage 5 (IgA nephropathy) on haemodialysis three times a week. My brother (B+) wants to "
            "donate. Please advise on the documents needed for the authorisation committee."
        ),
        "quote": {
            "factor": 1.00,
            "treatment_plan": (
                "Living-related donor kidney transplant: donor and recipient evaluation, laparoscopic donor "
                "nephrectomy, recipient transplant with 10 nights in hospital, initial immunosuppression and "
                "6 weeks of follow-up in Delhi."
            ),
            "lines": [
                ("surgery", "Recipient transplant and laparoscopic donor nephrectomy", 40),
                ("hospital_stay", "Recipient (10 nights) and donor (5 nights) stay", 20),
                ("medications", "Induction and initial immunosuppression", 18),
                ("tests_scans", "HLA typing, cross-match and donor work-up", 12),
                ("doctor_fees", "Nephrology and transplant team visits", 6),
                ("other", "Authorisation-committee documentation support", 4),
            ],
        },
        "messages": [
            (
                "hospital",
                "Dear Farhana, your quote is ready. Please send your brother's passport copy and "
                "blood report so we can start the authorisation-committee file.",
            ),
            (
                "patient",
                "Thank you! I will upload both documents this week. Can my brother stay in the same "
                "guest wing during his recovery?",
            ),
        ],
    },
    {
        "key": "enquiry-om-cataract",
        "target": "enquiry",
        "patient": f"patient.om{_D}",
        "actor": "patient",
        "hospital": "yamuna-valley-noida",
        "hospital_user": f"coordinator.yamuna-valley-noida{_D}",
        "procedure": "cataract-surgery",
        "doctor": "vivek-arora",
        "patient_notes": (
            "While I am in India for spine surgery, could my left-eye cataract be assessed? Interested in a "
            "toric lens if suitable."
        ),
    },
]

#: Published (and one pending) reviews by demo patients. ``journey`` links the review to that journey's case
#: and its completed booking, which makes it a "verified patient" review once that journey has completed.
REVIEWS: list[dict[str, Any]] = [
    {
        "patient": f"patient.us{_D}",
        "hospital": "sanjeevani-gurugram",
        "doctor": "rajiv-sehgal",
        "journey": "completed-us-knee",
        "rating": 5,
        "title": "Walking without pain again",
        "body": (
            "From the first video consultation to discharge everything was explained clearly. I was walking "
            "the corridor the day after surgery and the physiotherapists were excellent."
        ),
        "status": "published",
    },
    {
        "patient": f"patient.om{_D}",
        "hospital": "pournami-chennai",
        "doctor": "divya-raghavan",
        "journey": "completed-om-dental",
        "rating": 5,
        "title": "Two implants in one trip",
        "body": (
            "Had two dental implants placed last year. The 3D planning on day one meant I could fly home "
            "with temporary crowns after a week. Very professional team."
        ),
        "status": "published",
    },
    {
        "patient": f"patient.bd{_D}",
        "hospital": "hooghly-valley-kolkata",
        "doctor": "debashish-ghosh",
        "journey": None,
        "rating": 4,
        "title": "Good care for my father's angioplasty",
        "body": (
            "We came from Dhaka for my father's angioplasty. The Bengali-speaking coordinator helped with "
            "everything; the only issue was a long wait at billing on discharge day."
        ),
        "status": "published",
    },
    {
        "patient": f"patient.uk{_D}",
        "hospital": "ratnakar-bay-mumbai",
        "doctor": None,
        "journey": None,
        "rating": 4,
        "title": "Smooth executive health check",
        "body": (
            "Booked a check-up during a holiday in Mumbai. Well organised and results were explained the "
            "same day."
        ),
        "status": "pending",
    },
]
