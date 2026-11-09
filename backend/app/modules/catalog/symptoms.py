"""Static symptom library used by the screening questionnaire and the rules-based triage fallback.

Public API (imported by be-screening)::

    from app.modules.catalog.symptoms import SYMPTOMS, BODY_AREAS, SPECIALTY_SLUGS, RED_FLAG_SYMPTOMS
    from app.modules.catalog.symptoms import filter_symptoms

``SYMPTOMS`` is a list of ``{"name", "specialty_slugs", "body_areas"}`` dicts (served by
``GET /content/symptoms``). Names are unique, specialty slugs are a subset of ``SPECIALTY_SLUGS`` and body
areas a subset of ``BODY_AREAS``. ``RED_FLAG_SYMPTOMS`` names the entries that warrant urgent local care.
"""

from __future__ import annotations

from typing import Final, TypedDict

__all__ = [
    "BODY_AREAS",
    "RED_FLAG_SYMPTOMS",
    "SPECIALTY_SLUGS",
    "SYMPTOMS",
    "Symptom",
    "filter_symptoms",
]


class Symptom(TypedDict):
    name: str
    specialty_slugs: list[str]
    body_areas: list[str]


BODY_AREAS: Final[tuple[str, ...]] = (
    "head",
    "neck",
    "chest",
    "abdomen",
    "pelvis",
    "back",
    "left_arm",
    "right_arm",
    "left_leg",
    "right_leg",
    "skin",
    "general",
)

SPECIALTY_SLUGS: Final[tuple[str, ...]] = (
    "cardiology",
    "orthopedics",
    "cosmetic",
    "dental",
    "oncology",
    "neurology",
    "fertility",
    "transplant",
    "bariatric",
    "ophthalmology",
    "spine",
    "urology",
    "gastroenterology",
    "ent",
    "nephrology",
    "wellness",
)

_ARMS = ["left_arm", "right_arm"]
_LEGS = ["left_leg", "right_leg"]
_LIMBS = _ARMS + _LEGS


def _s(name: str, specialties: list[str], areas: list[str]) -> Symptom:
    return {"name": name, "specialty_slugs": specialties, "body_areas": areas}


SYMPTOMS: Final[list[Symptom]] = [
    # --- cardiology --------------------------------------------------------------------------------------
    _s("Chest pain or pressure", ["cardiology"], ["chest"]),
    _s("Chest pain on exertion", ["cardiology"], ["chest"]),
    _s("Shortness of breath", ["cardiology", "wellness"], ["chest", "general"]),
    _s("Shortness of breath when lying flat", ["cardiology"], ["chest"]),
    _s("Palpitations or irregular heartbeat", ["cardiology"], ["chest"]),
    _s("Swelling in the ankles or legs", ["cardiology", "nephrology"], _LEGS),
    _s("Fainting or near-fainting", ["cardiology", "neurology"], ["head", "general"]),
    _s("Pain radiating to the left arm or jaw", ["cardiology"], ["chest", "left_arm", "neck"]),
    _s("High blood pressure", ["cardiology", "nephrology"], ["general"]),
    _s("Leg pain when walking", ["cardiology"], _LEGS),
    # --- orthopedics -------------------------------------------------------------------------------------
    _s("Knee pain", ["orthopedics"], _LEGS),
    _s("Knee swelling or stiffness", ["orthopedics"], _LEGS),
    _s("Hip pain", ["orthopedics"], ["pelvis", *_LEGS]),
    _s("Difficulty walking or climbing stairs", ["orthopedics", "spine"], _LEGS),
    _s("Shoulder pain", ["orthopedics"], _ARMS),
    _s("Limited shoulder movement", ["orthopedics"], _ARMS),
    _s("Joint pain in multiple joints", ["orthopedics", "wellness"], [*_LIMBS, "general"]),
    _s("Clicking or locking of a joint", ["orthopedics"], _LIMBS),
    _s("Sports injury", ["orthopedics"], _LIMBS),
    _s("Wrist or hand pain", ["orthopedics", "neurology"], _ARMS),
    _s("Ankle or foot pain", ["orthopedics"], _LEGS),
    _s("Bone fracture that has not healed", ["orthopedics"], _LIMBS),
    # --- spine --------------------------------------------------------------------------------------------
    _s("Lower back pain", ["spine", "orthopedics"], ["back"]),
    _s("Upper back pain", ["spine"], ["back"]),
    _s("Neck pain", ["spine", "orthopedics"], ["neck"]),
    _s("Pain shooting down the leg (sciatica)", ["spine", "neurology"], ["back", *_LEGS]),
    _s("Pain radiating into the arm", ["spine", "neurology"], ["neck", *_ARMS]),
    _s("Numbness or tingling in the legs", ["spine", "neurology"], _LEGS),
    _s("Curvature of the spine", ["spine"], ["back"]),
    # --- neurology ----------------------------------------------------------------------------------------
    _s("Frequent headaches or migraines", ["neurology"], ["head"]),
    _s("Seizures", ["neurology"], ["head", "general"]),
    _s("Tremors or shaking", ["neurology"], [*_ARMS, "general"]),
    _s("Memory loss or confusion", ["neurology"], ["head"]),
    _s("Weakness on one side of the body", ["neurology"], ["general", *_LIMBS]),
    _s("Sudden difficulty speaking", ["neurology"], ["head"]),
    _s("Dizziness or vertigo", ["neurology", "ent"], ["head"]),
    _s("Numbness or tingling in the hands", ["neurology", "spine"], _ARMS),
    # --- oncology -----------------------------------------------------------------------------------------
    _s("Lump or swelling", ["oncology"], ["neck", "chest", "abdomen", "skin", "general"]),
    _s("Unexplained weight loss", ["oncology", "gastroenterology"], ["general"]),
    _s("Persistent fatigue", ["oncology", "wellness"], ["general"]),
    _s("Abnormal bleeding", ["oncology"], ["pelvis", "general"]),
    _s("Changing mole or skin lesion", ["oncology", "cosmetic"], ["skin"]),
    _s("Persistent cough or coughing blood", ["oncology"], ["chest"]),
    _s("Diagnosed cancer seeking treatment", ["oncology"], ["general"]),
    # --- gastroenterology ---------------------------------------------------------------------------------
    _s("Abdominal pain", ["gastroenterology"], ["abdomen"]),
    _s("Acid reflux or heartburn", ["gastroenterology"], ["chest", "abdomen"]),
    _s("Difficulty swallowing", ["gastroenterology", "ent"], ["neck", "chest"]),
    _s("Blood in stool", ["gastroenterology", "oncology"], ["abdomen", "pelvis"]),
    _s("Chronic constipation or diarrhoea", ["gastroenterology"], ["abdomen"]),
    _s("Bloating", ["gastroenterology"], ["abdomen"]),
    _s("Yellowing of skin or eyes (jaundice)", ["gastroenterology", "transplant"], ["skin", "abdomen"]),
    _s("Gallstones", ["gastroenterology"], ["abdomen"]),
    # --- urology & nephrology -----------------------------------------------------------------------------
    _s("Painful or frequent urination", ["urology"], ["pelvis"]),
    _s("Blood in urine", ["urology", "nephrology"], ["pelvis"]),
    _s("Kidney stones or flank pain", ["urology", "nephrology"], ["back", "abdomen"]),
    _s("Weak urine flow", ["urology"], ["pelvis"]),
    _s("Erectile dysfunction", ["urology"], ["pelvis"]),
    _s("Reduced kidney function", ["nephrology", "transplant"], ["abdomen", "general"]),
    _s("On dialysis", ["nephrology", "transplant"], ["general"]),
    _s("Foamy urine or puffiness around the eyes", ["nephrology"], ["head", "general"]),
    # --- transplant ---------------------------------------------------------------------------------------
    _s("End-stage liver disease", ["transplant", "gastroenterology"], ["abdomen"]),
    _s("End-stage kidney disease", ["transplant", "nephrology"], ["abdomen", "general"]),
    _s("Fluid build-up in the abdomen", ["transplant", "gastroenterology"], ["abdomen"]),
    # --- fertility ----------------------------------------------------------------------------------------
    _s("Difficulty conceiving", ["fertility"], ["pelvis"]),
    _s("Irregular menstrual cycles", ["fertility"], ["pelvis"]),
    _s("Recurrent miscarriage", ["fertility"], ["pelvis"]),
    _s("Pelvic pain", ["fertility", "urology"], ["pelvis"]),
    _s("Low sperm count", ["fertility", "urology"], ["pelvis"]),
    # --- bariatric & wellness -----------------------------------------------------------------------------
    _s("Obesity (BMI over 35)", ["bariatric", "wellness"], ["general", "abdomen"]),
    _s("Type 2 diabetes with excess weight", ["bariatric", "wellness"], ["general"]),
    _s("Sleep apnoea or snoring", ["bariatric", "ent"], ["neck", "head"]),
    _s("Chronic stress or poor sleep", ["wellness"], ["general"]),
    _s("General health check-up", ["wellness"], ["general"]),
    # --- ophthalmology ------------------------------------------------------------------------------------
    _s("Blurred or cloudy vision", ["ophthalmology"], ["head"]),
    _s("Difficulty seeing at night", ["ophthalmology"], ["head"]),
    _s("Eye pain or redness", ["ophthalmology"], ["head"]),
    _s("Floaters or flashes of light", ["ophthalmology"], ["head"]),
    _s("Need for glasses or contact lenses", ["ophthalmology"], ["head"]),
    # --- ENT ----------------------------------------------------------------------------------------------
    _s("Hearing loss", ["ent"], ["head"]),
    _s("Ringing in the ears", ["ent"], ["head"]),
    _s("Chronic sinus congestion", ["ent"], ["head"]),
    _s("Frequent sore throat or tonsillitis", ["ent"], ["neck"]),
    _s("Hoarse voice", ["ent", "oncology"], ["neck"]),
    # --- dental -------------------------------------------------------------------------------------------
    _s("Toothache", ["dental"], ["head"]),
    _s("Missing teeth", ["dental"], ["head"]),
    _s("Bleeding gums", ["dental"], ["head"]),
    _s("Misaligned teeth", ["dental", "cosmetic"], ["head"]),
    _s("Jaw pain or clicking", ["dental", "ent"], ["head"]),
    # --- cosmetic -----------------------------------------------------------------------------------------
    _s("Hair loss", ["cosmetic"], ["head", "skin"]),
    _s("Excess skin after weight loss", ["cosmetic", "bariatric"], ["abdomen", "skin"]),
    _s("Scars or burns", ["cosmetic"], ["skin"]),
    _s("Wish to change nose shape", ["cosmetic", "ent"], ["head"]),
    _s("Skin ageing or wrinkles", ["cosmetic"], ["skin", "head"]),
    _s("Persistent rash or itching", ["cosmetic", "wellness"], ["skin"]),
    # --- general ------------------------------------------------------------------------------------------
    _s("Fever lasting more than a week", ["wellness", "oncology"], ["general"]),
    _s("Severe bleeding", ["wellness"], ["general"]),
    _s("Thoughts of self-harm", ["wellness"], ["general"]),
]

# Symptoms that should prompt immediate local emergency care rather than medical travel.
RED_FLAG_SYMPTOMS: Final[frozenset[str]] = frozenset(
    {
        "Chest pain or pressure",
        "Pain radiating to the left arm or jaw",
        "Weakness on one side of the body",
        "Sudden difficulty speaking",
        "Seizures",
        "Severe bleeding",
        "Thoughts of self-harm",
        "Persistent cough or coughing blood",
        "Fainting or near-fainting",
    }
)


def filter_symptoms(specialty: str | None = None, body_area: str | None = None) -> list[Symptom]:
    """Symptoms matching both filters (each optional, case-insensitive); returns copies."""
    spec = (specialty or "").strip().lower() or None
    area = (body_area or "").strip().lower() or None
    out: list[Symptom] = []
    for item in SYMPTOMS:
        if spec is not None and spec not in item["specialty_slugs"]:
            continue
        if area is not None and area not in item["body_areas"]:
            continue
        out.append(
            {
                "name": item["name"],
                "specialty_slugs": list(item["specialty_slugs"]),
                "body_areas": list(item["body_areas"]),
            }
        )
    return out
