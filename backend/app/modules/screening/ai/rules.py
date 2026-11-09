"""Deterministic rules triage engine (PLAN section 7 "Rules fallback").

Used when AI is disabled / unconfigured, when the patient turned AI off (``preferences.use_ai = false``),
when consent is missing, and whenever the Claude call fails or is refused. Output has the same
``TriageResult`` shape with ``engine="rules"``.

* Emergencies (``rules_redflags``): multilingual red-flag families with negation and history scoping, the
  catalog's red-flag questionnaire answers and intake facts (age, recent severe pain, blood pressure). Any
  emergency -> ``urgency="emergency"``, human-readable ``red_flags`` and advice to seek local emergency care
  now instead of travelling. Safety first: a missed emergency is worse than a false alarm.
* Specialties: the patient's chosen specialty, catalog symptoms (weighted above body areas), body-map areas,
  curated free-text hints and the specialty of any emergency family.
* Procedures: only from the ranked specialties and structured / curated evidence. Free text can never turn
  arbitrary words into a recommendation, and instruction-like sentences in the notes are ignored.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from functools import lru_cache
from typing import Any

from app.core.enums import AIEngine, Urgency
from app.modules.screening.ai import rules_redflags
from app.modules.screening.ai.rules_lexicon import SPECIALTY_KEYWORDS, SYMPTOM_SIGNALS
from app.modules.screening.ai.rules_negation import (
    clauses as split_clauses,
)
from app.modules.screening.ai.rules_negation import (
    evidence_text,
    is_injection,
    is_negated,
    normalise,
    sentences,
)
from app.modules.screening.ai.schema import (
    DISCLAIMER,
    CatalogSnapshot,
    PossibleCondition,
    RecommendedProcedure,
    SuggestedSpecialty,
    TriageResult,
)

__all__ = [
    "BODY_AREA_SPECIALTIES",
    "EMERGENCY_ADVICE",
    "FALLBACK_SYMPTOMS",
    "SPECIALTY_ALIASES",
    "detect_red_flags",
    "load_symptom_library",
    "normalise",
    "rules_triage",
]

# Canonical specialty key -> words that identify the catalog specialty (slug or name). Matching against the
# catalog is fuzzy so the engine works with any seeded slugs.
SPECIALTY_ALIASES: dict[str, tuple[str, ...]] = {
    "orthopedics": ("orthopedic", "orthopaedic", "ortho", "bone", "joint"),
    "cardiology": ("cardio", "cardiac", "heart"),
    "neurology": ("neuro", "brain", "nerve"),
    "oncology": ("oncology", "cancer", "tumour", "tumor"),
    "spine": ("spine", "spinal"),
    "gastroenterology": ("gastro", "digestive", "liver", "hepat"),
    "urology": ("urology",),
    "nephrology": ("nephro", "kidney", "renal", "dialysis"),
    "ophthalmology": ("ophthalm", "eye", "vision"),
    "ent": ("ent", "ear", "nose", "throat", "otolaryng"),
    "fertility": ("fertility", "ivf", "reproductive"),
    "cosmetic": ("cosmetic", "plastic", "aesthetic"),
    "dental": ("dental", "dentist", "tooth", "teeth"),
    "transplant": ("transplant",),
    "bariatric": ("bariatric", "weight loss", "obesity"),
    "gynecology": ("gynec", "gynaec", "obstetric", "women"),
    "pulmonology": ("pulmo", "lung", "respiratory"),
    "endocrinology": ("endocrin", "diabet", "thyroid", "hormone"),
    "dermatology": ("dermat", "skin"),
    "psychiatry": ("psychiat", "mental health"),
    "general-surgery": ("general surgery", "general-surgery", "hernia"),
    "pediatrics": ("pediatric", "paediatric", "child"),
    "wellness": ("wellness", "preventive"),
}

# Body area (body-map ids plus legacy names) -> (canonical specialty key, weight). Areas are weak evidence:
# symptoms and the chosen specialty outweigh them.
BODY_AREA_SPECIALTIES: dict[str, tuple[tuple[str, float], ...]] = {
    "head": (("neurology", 0.6), ("ent", 0.4), ("ophthalmology", 0.4), ("dental", 0.3), ("cosmetic", 0.3)),
    "face": (("cosmetic", 1.0), ("ent", 0.5), ("dental", 0.5)),
    "eyes": (("ophthalmology", 1.0),),
    "eye": (("ophthalmology", 1.0),),
    "ears": (("ent", 1.0),),
    "nose": (("ent", 1.0),),
    "throat": (("ent", 1.0),),
    "mouth": (("dental", 1.0), ("ent", 0.5)),
    "teeth": (("dental", 1.0),),
    "neck": (("spine", 0.6), ("ent", 0.5), ("orthopedics", 0.3)),
    "chest": (("cardiology", 0.8), ("oncology", 0.3), ("pulmonology", 0.5)),
    "heart": (("cardiology", 1.0),),
    "lungs": (("pulmonology", 1.0),),
    "breast": (("oncology", 1.0), ("cosmetic", 0.8)),
    "abdomen": (("gastroenterology", 0.8), ("general-surgery", 0.5), ("bariatric", 0.2)),
    "stomach": (("gastroenterology", 1.0),),
    "pelvis": (("urology", 0.6), ("fertility", 0.5), ("gynecology", 0.5), ("orthopedics", 0.2)),
    "back": (("spine", 0.8), ("orthopedics", 0.3)),
    "upper_back": (("spine", 0.8), ("orthopedics", 0.3)),
    "lower_back": (("spine", 0.8), ("orthopedics", 0.3)),
    "spine": (("spine", 1.0),),
    "shoulder": (("orthopedics", 1.0),),
    "shoulders": (("orthopedics", 1.0),),
    "arm": (("orthopedics", 0.8),),
    "arms": (("orthopedics", 0.8),),
    "left_arm": (("orthopedics", 0.6), ("neurology", 0.2)),
    "right_arm": (("orthopedics", 0.6), ("neurology", 0.2)),
    "elbow": (("orthopedics", 1.0),),
    "wrist": (("orthopedics", 1.0),),
    "hand": (("orthopedics", 1.0),),
    "hands": (("orthopedics", 1.0),),
    "hip": (("orthopedics", 1.0),),
    "hips": (("orthopedics", 1.0),),
    "thigh": (("orthopedics", 1.0),),
    "leg": (("orthopedics", 0.8),),
    "legs": (("orthopedics", 0.8),),
    "left_leg": (("orthopedics", 0.6), ("spine", 0.2)),
    "right_leg": (("orthopedics", 0.6), ("spine", 0.2)),
    "knee": (("orthopedics", 1.0),),
    "knees": (("orthopedics", 1.0),),
    "ankle": (("orthopedics", 1.0),),
    "foot": (("orthopedics", 1.0),),
    "feet": (("orthopedics", 1.0),),
    "skin": (("dermatology", 0.6), ("cosmetic", 0.5)),
    "general": (("wellness", 0.3),),
}

# Fallback symptom library used when ``app.modules.catalog.symptoms`` is not available. Shape matches the
# catalog's static library: {name, specialty_slugs[], body_areas[]}.
FALLBACK_SYMPTOMS: tuple[dict[str, Any], ...] = (
    {"name": "Joint pain", "specialty_slugs": ["orthopedics"], "body_areas": ["knee", "hip", "shoulder"]},
    {"name": "Joint stiffness", "specialty_slugs": ["orthopedics"], "body_areas": ["knee", "hip"]},
    {"name": "Back pain", "specialty_slugs": ["spine", "orthopedics"], "body_areas": ["back", "lower_back"]},
    {"name": "Chest pain on exertion", "specialty_slugs": ["cardiology"], "body_areas": ["chest"]},
    {"name": "Headaches", "specialty_slugs": ["neurology"], "body_areas": ["head"]},
    {"name": "Abdominal pain", "specialty_slugs": ["gastroenterology"], "body_areas": ["abdomen"]},
    {"name": "Blurred vision", "specialty_slugs": ["ophthalmology"], "body_areas": ["eyes"]},
    {"name": "Hearing loss", "specialty_slugs": ["ent"], "body_areas": ["ears"]},
    {"name": "Kidney stones", "specialty_slugs": ["urology"], "body_areas": ["abdomen", "back"]},
    {"name": "Tooth pain", "specialty_slugs": ["dental"], "body_areas": ["teeth", "mouth"]},
)

# Answers that justify seeing a doctor soon even without red flags (urgency floor "soon").
SOON_SYMPTOMS: frozenset[str] = frozenset(
    {
        "lump or swelling",
        "diagnosed cancer seeking treatment",
        "blood in urine",
        "blood in stool",
        "reduced kidney function",
        "end-stage kidney disease",
        "end-stage liver disease",
        "unexplained weight loss",
        "foamy urine or puffiness around the eyes",
        "floaters or flashes of light",
        "persistent cough or coughing blood",
        "abnormal bleeding",
        "yellowing of skin or eyes (jaundice)",
        "shortness of breath",
    }
)
_SOON_TEXT = rules_redflags.compile_pattern(
    r"cancer\w*|tumou?rs?|carcinoma|malignan\w*|biopsy|ckd|egfr|dialysis|pregnant|hole in the heart|vsd|"
    r"stenosis|retinopathy|macular|blood in %2urine|bloody discharge|losing %2vision"
)

EMERGENCY_ADVICE = (
    "Your answers include warning signs that may need urgent medical attention. Do not travel for treatment "
    "now - please contact your local emergency services or go to the nearest emergency department "
    "immediately."
)

# Weights.
W_CHOSEN = 6.0
W_SYMPTOM_PRIMARY = {"yes": 3.0, "maybe": 1.5}
W_SYMPTOM_SECONDARY = {"yes": 2.0, "maybe": 1.0}
W_TEXT_HINT = 2.0
MAX_TEXT_HINTS = 3
W_PROCEDURE_TEXT = 1.0
MAX_PROCEDURE_BONUS = 2.0
W_EMERGENCY_FAMILY = 8.0


def load_symptom_library() -> tuple[dict[str, Any], ...]:
    """The catalog's static symptom library when importable, else ``FALLBACK_SYMPTOMS``."""
    try:
        from app.modules.catalog.symptoms import SYMPTOMS  # type: ignore[import-not-found,unused-ignore]
    except Exception:  # module not built yet / renamed: use our own table
        return FALLBACK_SYMPTOMS
    try:
        items = tuple(dict(s) for s in SYMPTOMS)
    except Exception:
        return FALLBACK_SYMPTOMS
    return items or FALLBACK_SYMPTOMS


@lru_cache(maxsize=1)
def _library_index() -> dict[str, dict[str, Any]]:
    index = {" ".join(str(s.get("name") or "").casefold().split()): s for s in load_symptom_library()}
    index.pop("", None)
    return index


def detect_red_flags(texts: Iterable[str]) -> list[str]:
    """Emergency red flags found in free text alone (negation- and history-aware)."""
    return rules_redflags.detect_text(t for t in texts if t).red_flags()


# --------------------------------------------------------------------------------------- specialty helpers
def _resolve_specialty_slugs(catalog: CatalogSnapshot, key: str) -> list[str]:
    """Catalog slugs matching a canonical key (exact slug first, then alias match on slug/name)."""
    key = key.strip().lower()
    by_slug = catalog.specialty_by_slug()
    if key in by_slug:
        return [key]
    aliases = SPECIALTY_ALIASES.get(key)
    if not aliases:
        return []
    found: list[str] = []
    for spec in catalog.specialties:
        hay = f"{spec.slug.replace('-', ' ')} {spec.name.lower()}"
        words = set(normalise(hay).split())
        for alias in aliases:
            hit = alias in words if len(alias) <= 3 else alias in hay
            if hit:
                found.append(spec.slug)
                break
    return found


@lru_cache(maxsize=1)
def _specialty_patterns() -> dict[str, tuple[Any, ...]]:
    return {
        slug: tuple(rules_redflags.compile_pattern(p) for p in patterns)
        for slug, patterns in SPECIALTY_KEYWORDS.items()
    }


def _text_hints(clauses: list[str]) -> dict[str, int]:
    """Specialty key -> number of distinct hint terms found (non-negated) in the clauses."""
    hits: dict[str, int] = {}
    for slug, patterns in _specialty_patterns().items():
        terms = {
            m.group(0)
            for rx in patterns
            for clause in clauses
            for m in rx.finditer(clause)
            if not is_negated(clause, m.start(), m.end())
        }
        if terms:
            hits[slug] = len(terms)
    return hits


def _clean_clauses(notes: str) -> list[str]:
    out: list[str] = []
    for sentence in sentences(notes):
        if not is_injection(sentence):
            out.extend(split_clauses(sentence))
    return out


def _base_urgency(intake: dict[str, Any]) -> Urgency:
    pain = intake.get("pain_intensity")
    severity = intake.get("severity") or {}
    levels = {str(v) for v in severity.values() if v}
    if (isinstance(pain, int) and pain >= 8) or "severe" in levels:
        return Urgency.URGENT
    if (isinstance(pain, int) and pain >= 5) or "moderate" in levels:
        return Urgency.SOON
    return Urgency.ROUTINE


_URGENCY_RANK = {Urgency.ROUTINE: 0, Urgency.SOON: 1, Urgency.URGENT: 2, Urgency.EMERGENCY: 3}


def _max_urgency(a: Urgency, b: Urgency) -> Urgency:
    return a if _URGENCY_RANK[a] >= _URGENCY_RANK[b] else b


# ------------------------------------------------------------------------------------------------- engine
def rules_triage(intake: dict[str, Any], catalog: CatalogSnapshot) -> TriageResult:
    """Score catalog specialties/procedures from the intake and detect emergencies. ``intake`` is the dict
    built by ``prompts.build_intake`` (keys: specialty_slug, body_areas, pain_intensity, symptoms, duration,
    severity, notes, patient)."""
    spec_by_slug = catalog.specialty_by_slug()
    proc_by_slug = catalog.procedure_by_slug()
    library = _library_index()

    spec_scores: dict[str, float] = defaultdict(float)
    spec_reasons: dict[str, list[str]] = defaultdict(list)

    def add_spec(key: str, weight: float, reason: str) -> None:
        for slug in _resolve_specialty_slugs(catalog, key):
            spec_scores[slug] += weight
            if reason not in spec_reasons[slug]:
                spec_reasons[slug].append(reason)

    # --- emergencies first (they also steer the specialty)
    detection = rules_redflags.detect(intake, set(library) | set(SYMPTOM_SIGNALS))

    # --- chosen specialty
    chosen = (intake.get("specialty_slug") or "").strip().lower()
    if chosen and chosen in spec_by_slug:
        spec_scores[chosen] += W_CHOSEN
        spec_reasons[chosen].append("You selected this specialty")
    else:
        chosen = ""

    # --- body areas (weak evidence)
    body_areas = [normalise(str(a)).replace(" ", "_") for a in intake.get("body_areas") or [] if a]
    body_set = set(body_areas) | {a.replace("_", " ") for a in body_areas}
    for area in body_areas:
        for key, weight in BODY_AREA_SPECIALTIES.get(area, ()):
            add_spec(key, weight, f"Treats the {area.replace('_', ' ')} area")

    # --- symptoms answered yes/maybe
    positive_names: list[str] = []
    unknown_names: list[str] = []
    for sym in intake.get("symptoms") or []:
        if not isinstance(sym, dict):
            continue
        answer = str(sym.get("answer") or "").casefold()
        name = str(sym.get("name") or "")
        if answer not in W_SYMPTOM_PRIMARY or not name:
            continue
        positive_names.append(name)
        entry = library.get(" ".join(name.casefold().split()))
        if not entry:
            unknown_names.append(name)
            continue
        for idx, key in enumerate(entry.get("specialty_slugs") or []):
            weight = (W_SYMPTOM_PRIMARY if idx == 0 else W_SYMPTOM_SECONDARY)[answer]
            add_spec(str(key), weight, f"Matches your symptom: {name}")

    # --- curated free-text hints (instruction-like sentences dropped)
    notes = str(intake.get("notes") or "")
    clean_clauses = _clean_clauses(notes)
    for key, count in _text_hints(clean_clauses).items():
        add_spec(key, W_TEXT_HINT * min(count, MAX_TEXT_HINTS), "Mentioned in your description")
    for key, count in _text_hints([normalise(n) for n in unknown_names]).items():
        add_spec(key, W_TEXT_HINT * min(count, 1), "Matches your symptoms")

    # --- emergency families point to the specialty that handles them
    for family, _rules in detection.families:
        if family.specialty:
            add_spec(family.specialty, W_EMERGENCY_FAMILY, f"Warning signs: {family.label.lower()}")

    # --- procedure evidence: curated text (no injection sentences) + symptom names + body areas
    evidence = evidence_text(notes)
    evidence_words = set(evidence.split())
    symptom_text = normalise(" ".join(positive_names))
    proc_scores: dict[str, float] = defaultdict(float)
    proc_reasons: dict[str, list[str]] = defaultdict(list)
    proc_strong: set[str] = set()
    for proc in catalog.procedures:
        areas = {a.lower() for a in proc.body_areas}
        if areas & body_set:
            proc_scores[proc.slug] += 1
            proc_reasons[proc.slug].append(f"Treats the {sorted(areas & body_set)[0].replace('_', ' ')}")
        terms = [proc.name, *proc.keywords]
        for term in terms:
            nterm = normalise(term)
            if not nterm:
                continue
            in_text = (nterm in evidence_words) if len(nterm) <= 4 else (f" {nterm} " in f" {evidence} ")
            in_symptoms = len(nterm) > 4 and f" {nterm} " in f" {symptom_text} "
            if in_text or in_symptoms:
                proc_scores[proc.slug] += 3 if term == proc.name else 2
                proc_reasons[proc.slug].append(
                    "Mentioned in your description" if term == proc.name else f"Matches '{term}'"
                )
                proc_strong.add(proc.slug)
                break
    per_spec_bonus: dict[str, float] = defaultdict(float)
    for slug in proc_strong:
        spec = proc_by_slug[slug].specialty_slug
        if spec and per_spec_bonus[spec] < MAX_PROCEDURE_BONUS:
            per_spec_bonus[spec] += W_PROCEDURE_TEXT
            spec_scores[spec] += W_PROCEDURE_TEXT
            if "Performs a matching procedure" not in spec_reasons[spec]:
                spec_reasons[spec].append("Performs a matching procedure")

    # --- rank specialties
    ranked_specs = sorted((s for s in spec_scores if s in spec_by_slug), key=lambda s: (-spec_scores[s], s))[
        :5
    ]
    top = spec_scores[ranked_specs[0]] if ranked_specs else 1.0
    suggested = [
        SuggestedSpecialty(
            slug=slug,
            name=spec_by_slug[slug].name,
            confidence=round(min(0.95, max(0.2, 0.9 * spec_scores[slug] / top)), 2),
            rationale="; ".join(spec_reasons[slug][:3]) or "Matched by keyword rules",
        )
        for slug in ranked_specs
    ]

    # --- procedures: top specialty (or the chosen one) on any evidence; other ranked specialties only with
    # curated text/symptom evidence that also fits the body areas given.
    primary = {ranked_specs[0]} if ranked_specs else set()
    if chosen:
        primary.add(chosen)
    allowed = set(ranked_specs[:3])

    def eligible(slug: str) -> bool:
        proc = proc_by_slug.get(slug)
        if proc is None or not ranked_specs:
            return False
        if proc.specialty_slug in primary:
            return True
        if proc.specialty_slug not in allowed or slug not in proc_strong:
            return False
        areas = {a.lower() for a in proc.body_areas}
        return not body_set or not areas or bool(areas & body_set)

    ranked_procs = sorted(
        (p for p in proc_scores if eligible(p)),
        key=lambda p: (-(proc_scores[p] + (1 if proc_by_slug[p].specialty_slug in primary else 0)), p),
    )[:5]
    procedures = [
        RecommendedProcedure(
            slug=slug,
            name=proc_by_slug[slug].name,
            rationale="; ".join(proc_reasons[slug][:2]) or "Matched by keyword rules",
        )
        for slug in ranked_procs
    ]

    # --- urgency
    red_flags = detection.red_flags()
    if detection.emergency:
        urgency = Urgency.EMERGENCY
    else:
        urgency = _base_urgency(intake)
        soon = any(" ".join(n.casefold().split()) in SOON_SYMPTOMS for n in positive_names)
        soon = soon or bool(_SOON_TEXT.search(normalise(notes)))
        age = rules_redflags.patient_age(intake)
        soon = soon or (age is not None and age < 2)
        if soon:
            urgency = _max_urgency(urgency, Urgency.SOON)
        partial = {"chest_pain", "haemoptysis", "fainting", "sx_high_bp", "melaena", "severe_headache"}
        if partial & set(detection.signals):
            urgency = _max_urgency(urgency, Urgency.URGENT)

    if suggested:
        names = ", ".join(s.name for s in suggested[:3])
        summary = f"Based on your answers, the most relevant specialties are: {names}."
    else:
        summary = "We could not map your answers to a specific specialty; a coordinator will review them."
    if urgency == Urgency.EMERGENCY:
        summary = f"{EMERGENCY_ADVICE} {summary}"
        travel_advice = EMERGENCY_ADVICE
    elif urgency == Urgency.URGENT:
        travel_advice = (
            "Your symptoms sound significant. Have a local doctor assess you before travelling, and share "
            "their findings with the hospital."
        )
    else:
        travel_advice = (
            "Bring recent reports, imaging and a list of current medicines. Plan time for recovery in India "
            "before the return flight, as advised by your treating doctor."
        )

    conditions = [
        PossibleCondition(
            name=f"Condition related to {p.name}",
            likelihood="low",
            notes="Keyword-based estimate; not a diagnosis.",
        )
        for p in procedures[:2]
    ]
    return TriageResult(
        summary=summary,
        suggested_specialties=suggested,
        possible_conditions=conditions,
        recommended_procedures=procedures,
        urgency=urgency,
        red_flags=red_flags,
        recommended_tests=[],
        questions_for_doctor=[
            "What are my treatment options and their success rates?",
            "How long will I need to stay in India after the procedure?",
            "What follow-up care will I need at home?",
        ],
        travel_advice=travel_advice,
        disclaimer=DISCLAIMER,
        engine=AIEngine.RULES,
    )
