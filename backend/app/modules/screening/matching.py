"""Deterministic doctor/hospital matching (PLAN section 7 "Matching").

Candidates are active doctors at active hospitals whose specialty is one of the triage's suggested specialties
(or the specialty the patient chose). Score 0-100:

    specialty 30 + procedure offered 20 + accreditation (JCI 10 / NABH 7) + rating 10*(rating/5)
    + success rate 10*(pct/100) + language match 5 + doctor-gender preference 5 + budget fit 5
    + availability in the travel window 5

The primary specialty (the patient's choice or the top suggestion) earns the full 30; further suggestions earn
30 scaled by their confidence relative to the top one (at least 12). A preference the patient did not state
(no languages, no gender preference, no budget, no travel window) is treated as satisfied so the score stays
comparable across patients; only stated preferences that are met produce a reason string.

Candidates, hospital procedures (+ packages) and availability are loaded in a handful of queries and
scored in Python.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import DoctorGenderPref, HospitalStatus
from app.core.money import CurrencyError, convert_minor, get_fx_rate, normalize_currency
from app.models import (
    AvailabilitySlot,
    CostBenchmark,
    Doctor,
    Hospital,
    HospitalProcedure,
    PatientProfile,
    Screening,
    ScreeningMatch,
    TreatmentPackage,
)
from app.modules.screening.ai.schema import CatalogSnapshot, TriageResult

TOP_N = 10
MAX_CANDIDATES = 400

W_SPECIALTY = Decimal(30)
W_PROCEDURE = Decimal(20)
W_JCI = Decimal(10)
W_NABH = Decimal(7)
W_RATING = Decimal(10)
W_SUCCESS = Decimal(10)
W_LANGUAGE = Decimal(5)
W_GENDER = Decimal(5)
W_BUDGET = Decimal(5)
W_AVAILABILITY = Decimal(5)

LANGUAGE_CODES: dict[str, str] = {
    "english": "en",
    "hindi": "hi",
    "arabic": "ar",
    "spanish": "es",
    "french": "fr",
    "russian": "ru",
    "bengali": "bn",
    "bangla": "bn",
    "urdu": "ur",
    "swahili": "sw",
    "portuguese": "pt",
    "german": "de",
    "chinese": "zh",
    "mandarin": "zh",
    "tamil": "ta",
    "telugu": "te",
    "malayalam": "ml",
    "kannada": "kn",
    "marathi": "mr",
    "gujarati": "gu",
    "punjabi": "pa",
    "persian": "fa",
    "farsi": "fa",
    "dari": "fa",
    "pashto": "ps",
    "uzbek": "uz",
    "turkish": "tr",
    "nepali": "ne",
    "sinhala": "si",
    "burmese": "my",
    "amharic": "am",
    "somali": "so",
    "hausa": "ha",
    "yoruba": "yo",
    "igbo": "ig",
    "kurdish": "ku",
    "kazakh": "kk",
    "italian": "it",
    "japanese": "ja",
    "korean": "ko",
    "indonesian": "id",
    "malay": "ms",
    "thai": "th",
    "vietnamese": "vi",
}
LANGUAGE_NAMES: dict[str, str] = {}
for _name, _code in LANGUAGE_CODES.items():
    LANGUAGE_NAMES.setdefault(_code, _name.title())


def normalize_language(value: str) -> str:
    v = value.strip().lower()
    if v in LANGUAGE_CODES:
        return LANGUAGE_CODES[v]
    if "-" in v and len(v.split("-")[0]) == 2:  # en-GB -> en
        return v.split("-")[0]
    return v


def language_name(code: str) -> str:
    return LANGUAGE_NAMES.get(code, code.upper() if len(code) == 2 else code.title())


def _parse_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


@dataclass(slots=True)
class MatchPreferences:
    languages: list[str] = field(default_factory=list)  # normalised codes, in the patient's order
    doctor_gender: str | None = None
    budget_max_minor: int | None = None
    currency: str = "USD"
    window_start: date | None = None
    window_end: date | None = None

    @classmethod
    def from_screening(cls, screening: Screening, profile: PatientProfile | None) -> MatchPreferences:
        prefs = dict(screening.preferences or {})
        langs: list[str] = []
        for raw in prefs.get("languages") or []:
            code = normalize_language(str(raw))
            if code and code not in langs:
                langs.append(code)
        gender = prefs.get("doctor_gender")
        if gender == DoctorGenderPref.NO_PREFERENCE.value:
            gender = None
        currency = prefs.get("budget_currency") or (profile.preferred_currency if profile else None) or "USD"
        try:
            currency = normalize_currency(str(currency))
        except CurrencyError:
            currency = "USD"
        budget_max = prefs.get("budget_max_minor")
        return cls(
            languages=langs,
            doctor_gender=str(gender) if gender else None,
            budget_max_minor=int(budget_max) if isinstance(budget_max, int) else None,
            currency=currency,
            window_start=_parse_date(prefs.get("travel_window_start")),
            window_end=_parse_date(prefs.get("travel_window_end")),
        )


class FxCache:
    """INR-per-unit rates fetched once per currency for the whole matching run."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._rates: dict[str, Decimal] = {}

    async def rate(self, ccy: str) -> Decimal:
        code = normalize_currency(ccy)
        if code not in self._rates:
            self._rates[code] = await get_fx_rate(self._db, code)
        return self._rates[code]

    async def convert(self, amount_minor: int, src: str, dst: str) -> int | None:
        try:
            if normalize_currency(src) == normalize_currency(dst):
                return int(amount_minor)
            return convert_minor(amount_minor, src, dst, await self.rate(src), await self.rate(dst))
        except CurrencyError:
            return None


def specialty_weights(
    result: TriageResult, catalog: CatalogSnapshot, chosen_specialty_id: uuid.UUID | None
) -> dict[uuid.UUID, Decimal]:
    by_slug = catalog.specialty_by_slug()
    weights: dict[uuid.UUID, Decimal] = {}
    if chosen_specialty_id is not None:
        weights[chosen_specialty_id] = W_SPECIALTY
    suggestions = [s for s in result.suggested_specialties if s.slug in by_slug]
    top_conf = max((s.confidence for s in suggestions), default=1.0) or 1.0
    for idx, s in enumerate(suggestions):
        sid = uuid.UUID(by_slug[s.slug].id)
        if idx == 0:
            w = W_SPECIALTY
        else:
            ratio = Decimal(str(min(1.0, max(0.4, s.confidence / top_conf))))
            w = (W_SPECIALTY * ratio).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        weights[sid] = max(weights.get(sid, Decimal(0)), w)
    return weights


def _cheapest_package(hp: HospitalProcedure) -> TreatmentPackage | None:
    active = [p for p in hp.packages if p.is_active]
    return min(active, key=lambda p: (p.price_minor, str(p.id))) if active else None


@dataclass(slots=True)
class _Scored:
    score: Decimal
    rating: Decimal
    doctor: Doctor
    hospital: Hospital
    reasons: list[str]
    procedure_id: uuid.UUID | None
    package_id: uuid.UUID | None
    estimated_cost_minor: int | None


async def compute_matches(
    db: AsyncSession,
    screening: Screening,
    result: TriageResult,
    catalog: CatalogSnapshot,
    profile: PatientProfile | None,
    *,
    limit: int = TOP_N,
) -> list[ScreeningMatch]:
    """Score candidates and return the top ``limit`` as unsaved ``ScreeningMatch`` rows."""
    weights = specialty_weights(result, catalog, screening.specialty_id)
    if not weights:
        return []
    prefs = MatchPreferences.from_screening(screening, profile)
    proc_by_slug = catalog.procedure_by_slug()
    procedure_ids = [
        uuid.UUID(proc_by_slug[p.slug].id) for p in result.recommended_procedures if p.slug in proc_by_slug
    ]
    procedure_names = {uuid.UUID(p.id): p.name for p in catalog.procedures}
    specialty_names = {uuid.UUID(s.id): s.name for s in catalog.specialties}

    # 1) candidates
    rows = (
        await db.execute(
            select(Doctor, Hospital)
            .join(Hospital, Hospital.id == Doctor.hospital_id)
            .where(
                Doctor.is_active.is_(True),
                Hospital.status == HospitalStatus.ACTIVE,
                Doctor.specialty_id.in_(list(weights)),
            )
            .order_by(Doctor.rating_avg.desc(), Doctor.id)
            .limit(MAX_CANDIDATES)
        )
    ).all()
    if not rows:
        return []
    hospital_ids = list({h.id for _, h in rows})

    # 2) hospital procedures (+ packages) for the recommended procedures
    offered: dict[tuple[uuid.UUID, uuid.UUID], HospitalProcedure] = {}
    if procedure_ids:
        hps = (
            (
                await db.execute(
                    select(HospitalProcedure)
                    .options(selectinload(HospitalProcedure.packages))
                    .where(
                        HospitalProcedure.hospital_id.in_(hospital_ids),
                        HospitalProcedure.procedure_id.in_(procedure_ids),
                        HospitalProcedure.is_active.is_(True),
                    )
                )
            )
            .scalars()
            .all()
        )
        offered = {(hp.hospital_id, hp.procedure_id): hp for hp in hps}

    # 3) open availability inside the travel window
    available: set[tuple[uuid.UUID, uuid.UUID | None]] = set()
    window_given = prefs.window_start is not None or prefs.window_end is not None
    if window_given:
        stmt = select(AvailabilitySlot.hospital_id, AvailabilitySlot.doctor_id).where(
            AvailabilitySlot.hospital_id.in_(hospital_ids),
            AvailabilitySlot.booked < AvailabilitySlot.capacity,
            AvailabilitySlot.date >= max(prefs.window_start or date.today(), date.today()),
        )
        if prefs.window_end is not None:
            stmt = stmt.where(AvailabilitySlot.date <= prefs.window_end)
        available = {(h, d) for h, d in (await db.execute(stmt.distinct())).all()}

    fx = FxCache(db)
    scored: list[_Scored] = []
    for doctor, hospital in rows:
        reasons: list[str] = []
        score = weights.get(doctor.specialty_id, Decimal(0))
        spec_name = specialty_names.get(doctor.specialty_id)
        if spec_name:
            reasons.append(f"{spec_name} specialist")

        # procedure offered (prefer one where this doctor is a lead doctor)
        hp: HospitalProcedure | None = None
        for pid in procedure_ids:
            cand = offered.get((hospital.id, pid))
            if cand is None:
                continue
            if doctor.id in (cand.doctor_ids or []):
                hp = cand
                break
            if hp is None:
                hp = cand
        if hp is not None:
            score += W_PROCEDURE
            reasons.append(f"Offers {procedure_names.get(hp.procedure_id, 'your procedure')}")

        accreditations = {a.lower() for a in hospital.accreditations or []}
        if "jci" in accreditations:
            score += W_JCI
            reasons.append("JCI accredited")
        elif "nabh" in accreditations:
            score += W_NABH
            reasons.append("NABH accredited")

        rating = Decimal(doctor.rating_avg if doctor.rating_count else hospital.rating_avg or 0)
        rating = min(max(rating, Decimal(0)), Decimal(5))
        score += W_RATING * rating / Decimal(5)
        if rating >= Decimal("4.5"):
            reasons.append(f"Rated {rating:.1f}/5")

        pct = (hp.success_rate_pct if hp is not None else None) or doctor.success_rate_pct
        if pct is not None:
            pct = min(max(Decimal(pct), Decimal(0)), Decimal(100))
            score += W_SUCCESS * pct / Decimal(100)
            if pct >= 90:
                reasons.append(f"{pct:.0f}% success rate")

        if prefs.languages:
            spoken = {
                normalize_language(lang) for lang in [*(doctor.languages or []), *(hospital.languages or [])]
            }
            matched = [code for code in prefs.languages if code in spoken]
            if matched:
                score += W_LANGUAGE
                reasons.append(f"Speaks {language_name(matched[0])}")
        else:
            score += W_LANGUAGE

        if prefs.doctor_gender:
            doc_gender = str(doctor.gender) if doctor.gender is not None else None
            if doc_gender == prefs.doctor_gender:
                score += W_GENDER
                reasons.append(f"{prefs.doctor_gender.title()} doctor, as you prefer")
        else:
            score += W_GENDER

        package: TreatmentPackage | None = _cheapest_package(hp) if hp is not None else None
        estimate: int | None = None
        if package is not None:
            estimate = await fx.convert(package.price_minor, package.currency, prefs.currency)
        elif hp is not None and hp.price_min_minor is not None:
            estimate = await fx.convert(hp.price_min_minor, hp.currency, prefs.currency)
        if prefs.budget_max_minor is None:
            score += W_BUDGET
        elif estimate is not None and estimate <= prefs.budget_max_minor:
            score += W_BUDGET
            reasons.append("Within your budget")

        if not window_given:
            score += W_AVAILABILITY
        elif (hospital.id, doctor.id) in available or (hospital.id, None) in available:
            score += W_AVAILABILITY
            reasons.append("Available in your travel window")

        score = min(max(score, Decimal(0)), Decimal(100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        scored.append(
            _Scored(
                score=score,
                rating=rating,
                doctor=doctor,
                hospital=hospital,
                reasons=reasons,
                procedure_id=hp.procedure_id if hp is not None else None,
                package_id=package.id if package is not None else None,
                estimated_cost_minor=estimate,
            )
        )

    scored.sort(key=lambda s: (-s.score, -s.rating, str(s.doctor.id)))
    return [
        ScreeningMatch(
            screening_id=screening.id,
            rank=idx,
            match_score=s.score,
            reasons=s.reasons,
            hospital_id=s.hospital.id,
            doctor_id=s.doctor.id,
            procedure_id=s.procedure_id,
            package_id=s.package_id,
            estimated_cost_minor=s.estimated_cost_minor,
            currency=prefs.currency if s.estimated_cost_minor is not None else None,
        )
        for idx, s in enumerate(scored[:limit], start=1)
    ]


async def compute_savings(
    db: AsyncSession, matches: list[ScreeningMatch], home_country: str | None
) -> dict[uuid.UUID, dict[str, Any]]:
    """Savings per match id versus the cost benchmark of the patient's home country, converted to the match
    currency. Matches without a procedure, estimate or benchmark get no entry."""
    if not home_country:
        return {}
    country = home_country.upper()
    proc_ids = {m.procedure_id for m in matches if m.procedure_id and m.estimated_cost_minor is not None}
    if not proc_ids:
        return {}
    benchmarks = (
        (
            await db.execute(
                select(CostBenchmark).where(
                    CostBenchmark.procedure_id.in_(proc_ids), CostBenchmark.country_code == country
                )
            )
        )
        .scalars()
        .all()
    )
    by_proc = {b.procedure_id: b for b in benchmarks}
    fx = FxCache(db)
    out: dict[uuid.UUID, dict[str, Any]] = {}
    for m in matches:
        bench = by_proc.get(m.procedure_id) if m.procedure_id else None
        if bench is None or m.estimated_cost_minor is None or not m.currency:
            continue
        home_min = await fx.convert(bench.cost_min_minor, bench.currency, m.currency)
        home_max = await fx.convert(bench.cost_max_minor, bench.currency, m.currency)
        if home_min is None or home_max is None:
            continue
        out[m.id] = {
            "home_country": country,
            "home_min_minor": home_min,
            "home_max_minor": home_max,
            "home_currency": m.currency,
            "pct_min": _saving_pct(home_min, m.estimated_cost_minor),
            "pct_max": _saving_pct(home_max, m.estimated_cost_minor),
        }
    return out


def _saving_pct(home: int, india: int) -> int:
    if home <= 0:
        return 0
    pct = (Decimal(home - india) * 100 / Decimal(home)).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return int(min(max(pct, Decimal(0)), Decimal(100)))
