"""TriageResult (PLAN section 7): the pydantic model the server validates against and the JSON schema sent to
Claude as the structured-output format.

The JSON schema intentionally sticks to the subset structured outputs accept (types, ``enum``, ``required``,
``additionalProperties: false``); numeric ranges and lengths are enforced afterwards by pydantic.
``engine`` is not part of the model's output - the server sets it.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import AIEngine, Urgency

Likelihood = Literal["low", "medium", "high"]

MAX_TEXT = 4000
MAX_ITEMS = 10

DISCLAIMER = (
    "This screening is an automated triage aid, not a medical diagnosis. A qualified doctor will review your "
    "case before any treatment is recommended. If your symptoms are severe or worsening, seek local medical "
    "care immediately."
)


def _clip(value: Any, limit: int) -> Any:
    if isinstance(value, str):
        return value.strip()[:limit]
    return value


class SuggestedSpecialty(BaseModel):
    model_config = ConfigDict(extra="ignore")

    slug: str = Field(max_length=120)
    name: str = Field(default="", max_length=200)
    confidence: float = Field(default=0.5, ge=0, le=1)
    rationale: str = ""

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp_confidence(cls, v: Any) -> Any:
        if isinstance(v, int | float):
            return min(max(float(v), 0.0), 1.0)
        return v

    @field_validator("rationale", "name", mode="before")
    @classmethod
    def _clip_text(cls, v: Any) -> Any:
        return _clip(v, 1000)


class PossibleCondition(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(max_length=300)
    likelihood: Likelihood = "low"
    notes: str = ""

    @field_validator("name", "notes", mode="before")
    @classmethod
    def _clip_text(cls, v: Any) -> Any:
        return _clip(v, 1000)


class RecommendedProcedure(BaseModel):
    model_config = ConfigDict(extra="ignore")

    slug: str = Field(max_length=160)
    name: str = Field(default="", max_length=200)
    rationale: str = ""

    @field_validator("rationale", "name", mode="before")
    @classmethod
    def _clip_text(cls, v: Any) -> Any:
        return _clip(v, 1000)


class TriageResult(BaseModel):
    """Stored in ``screenings.ai_result`` and returned in ``ScreeningOut.ai_result``."""

    model_config = ConfigDict(extra="ignore")

    summary: str = ""
    suggested_specialties: list[SuggestedSpecialty] = Field(default_factory=list)
    possible_conditions: list[PossibleCondition] = Field(default_factory=list)
    recommended_procedures: list[RecommendedProcedure] = Field(default_factory=list)
    urgency: Urgency = Urgency.ROUTINE
    red_flags: list[str] = Field(default_factory=list)
    recommended_tests: list[str] = Field(default_factory=list)
    questions_for_doctor: list[str] = Field(default_factory=list)
    travel_advice: str = ""
    disclaimer: str = DISCLAIMER
    engine: AIEngine = AIEngine.RULES

    @field_validator("summary", "travel_advice", "disclaimer", mode="before")
    @classmethod
    def _clip_long(cls, v: Any) -> Any:
        return _clip(v, MAX_TEXT)

    @field_validator("red_flags", "recommended_tests", "questions_for_doctor", mode="before")
    @classmethod
    def _clip_list(cls, v: Any) -> Any:
        if isinstance(v, list):
            return [str(x).strip()[:300] for x in v if str(x).strip()][:MAX_ITEMS]
        return v

    @field_validator("suggested_specialties", "possible_conditions", "recommended_procedures", mode="after")
    @classmethod
    def _limit(cls, v: list[Any]) -> list[Any]:
        return v[:MAX_ITEMS]


def _str_array() -> dict[str, Any]:
    return {"type": "array", "items": {"type": "string"}}


TRIAGE_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "summary",
        "suggested_specialties",
        "possible_conditions",
        "recommended_procedures",
        "urgency",
        "red_flags",
        "recommended_tests",
        "questions_for_doctor",
        "travel_advice",
        "disclaimer",
    ],
    "properties": {
        "summary": {"type": "string"},
        "suggested_specialties": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["slug", "name", "confidence", "rationale"],
                "properties": {
                    "slug": {"type": "string"},
                    "name": {"type": "string"},
                    "confidence": {"type": "number"},
                    "rationale": {"type": "string"},
                },
            },
        },
        "possible_conditions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "likelihood", "notes"],
                "properties": {
                    "name": {"type": "string"},
                    "likelihood": {"type": "string", "enum": ["low", "medium", "high"]},
                    "notes": {"type": "string"},
                },
            },
        },
        "recommended_procedures": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["slug", "name", "rationale"],
                "properties": {
                    "slug": {"type": "string"},
                    "name": {"type": "string"},
                    "rationale": {"type": "string"},
                },
            },
        },
        "urgency": {"type": "string", "enum": [u.value for u in Urgency]},
        "red_flags": _str_array(),
        "recommended_tests": _str_array(),
        "questions_for_doctor": _str_array(),
        "travel_advice": {"type": "string"},
        "disclaimer": {"type": "string"},
    },
}


# ------------------------------------------------------------------------------------ catalog snapshot
class CatalogSpecialty(BaseModel):
    """Active specialty as seen by the triage engines (no DB objects cross the AI boundary)."""

    model_config = ConfigDict(frozen=True)

    id: str
    slug: str
    name: str


class CatalogProcedure(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    slug: str
    name: str
    specialty_slug: str
    keywords: tuple[str, ...] = ()
    body_areas: tuple[str, ...] = ()


class CatalogSnapshot(BaseModel):
    """Active specialties and procedures, sorted by slug so the system prompt is byte-stable (cacheable)."""

    model_config = ConfigDict(frozen=True)

    specialties: tuple[CatalogSpecialty, ...] = ()
    procedures: tuple[CatalogProcedure, ...] = ()

    def specialty_by_slug(self) -> dict[str, CatalogSpecialty]:
        return {s.slug: s for s in self.specialties}

    def procedure_by_slug(self) -> dict[str, CatalogProcedure]:
        return {p.slug: p for p in self.procedures}


def sanitize_result(result: TriageResult, catalog: CatalogSnapshot) -> TriageResult:
    """Drop specialty/procedure slugs that are not in the active catalog, de-duplicate them and replace the
    names with the catalog's canonical names. A procedure's specialty is added to the suggestions when the
    model recommended the procedure but not its specialty."""
    specs = catalog.specialty_by_slug()
    procs = catalog.procedure_by_slug()

    suggested: list[SuggestedSpecialty] = []
    seen: set[str] = set()
    for s in result.suggested_specialties:
        slug = s.slug.strip().lower()
        if slug in specs and slug not in seen:
            seen.add(slug)
            suggested.append(s.model_copy(update={"slug": slug, "name": specs[slug].name}))

    procedures: list[RecommendedProcedure] = []
    seen_p: set[str] = set()
    for p in result.recommended_procedures:
        slug = p.slug.strip().lower()
        if slug in procs and slug not in seen_p:
            seen_p.add(slug)
            procedures.append(p.model_copy(update={"slug": slug, "name": procs[slug].name}))
            spec_slug = procs[slug].specialty_slug
            if spec_slug in specs and spec_slug not in seen:
                seen.add(spec_slug)
                suggested.append(
                    SuggestedSpecialty(
                        slug=spec_slug,
                        name=specs[spec_slug].name,
                        confidence=0.5,
                        rationale=f"Specialty that performs {procs[slug].name}.",
                    )
                )

    suggested.sort(key=lambda s: -s.confidence)
    return result.model_copy(
        update={
            "suggested_specialties": suggested[:MAX_ITEMS],
            "recommended_procedures": procedures[:MAX_ITEMS],
        }
    )
