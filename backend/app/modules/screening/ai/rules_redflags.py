"""Emergency red-flag detection for the rules triage engine.

Signals come from three places:

1. free text (notes, and positive symptom answers that are not in the catalog library) - matched per clause
   with the multilingual patterns of ``rules_lexicon.SIGNALS``; negated mentions ("no chest pain", "I'm not
   suicidal") and past/family history ("I had a heart attack in 2021", "my father had a heart attack") are
   ignored, present-tense re-mentions still count;
2. structured questionnaire answers (``rules_lexicon.SYMPTOM_SIGNALS``), some only when the problem is recent;
3. intake facts: age (young child), very severe pain that started recently, blood pressure readings.

An emergency family fires when all signals of one of its rules are present (``rules_lexicon.FAMILIES``).
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from app.modules.screening.ai.rules_lexicon import (
    DERIVED_LABELS,
    FAMILIES,
    SIGNALS,
    SYMPTOM_SIGNALS,
    Family,
)
from app.modules.screening.ai.rules_negation import (
    fold,
    is_historical,
    is_negated,
    iter_clauses,
    normalise,
    sentences,
)

_MACROS = {
    "@cant": r"(?:can't|cant|cannot|can not|unable to|could not|couldn't|not able to|can no longer)",
    "@blood": r"blood(?! (?:pressure|sugar|tests?|group|transfusions?|count|glucose|work|thinners?))",
}
_GAP_RE = re.compile(r"%(\d)")


def _expand(pattern: str) -> tuple[str, bool]:
    substring = pattern.startswith("~")
    body = pattern.replace("~", "")
    for key, value in _MACROS.items():
        body = body.replace(key, value)
    body = _GAP_RE.sub(lambda m: f"(?:[^ ]+ ){{0,{m.group(1)}}}", body)
    return fold(body), substring


def compile_pattern(pattern: str) -> re.Pattern[str]:
    body, substring = _expand(pattern)
    if substring:
        return re.compile(body)
    return re.compile(rf"(?<![\w'])(?:{body})(?![\w'])")


@lru_cache(maxsize=1)
def _compiled() -> dict[str, tuple[tuple[re.Pattern[str], ...], tuple[re.Pattern[str], ...]]]:
    return {
        sid: (
            tuple(compile_pattern(p) for p in sig.patterns),
            tuple(compile_pattern(p) for p in sig.exclude),
        )
        for sid, sig in SIGNALS.items()
    }


def signal_label(signal_id: str) -> str:
    if signal_id in SIGNALS:
        return SIGNALS[signal_id].label
    return DERIVED_LABELS.get(signal_id, signal_id.replace("_", " ").capitalize())


@dataclass
class Detection:
    signals: dict[str, str] = field(default_factory=dict)  # signal id -> evidence (matched text or answer)
    families: list[tuple[Family, list[tuple[str, ...]]]] = field(default_factory=list)

    @property
    def emergency(self) -> bool:
        return bool(self.families)

    def red_flags(self, limit: int = 8) -> list[str]:
        """Human-readable labels: a single decisive signal is named directly, a combination is named by its
        family with the findings that triggered it."""
        out: list[str] = []
        for family, rules in self.families:
            combined: list[str] = []
            for rule in rules:
                if len(rule) == 1:
                    text = signal_label(rule[0])
                    if text not in out:
                        out.append(text)
                    continue
                combined.extend(s for s in rule if s not in combined)
            if combined:
                findings = ", ".join(signal_label(s).lower() for s in combined[:5])
                text = f"{family.label}: {findings}"
                if text not in out:
                    out.append(text)
        return out[:limit]

    @property
    def specialties(self) -> list[str]:
        return [f.specialty for f, _ in self.families if f.specialty]


# -------------------------------------------------------------------------------------------- text signals
def text_signals(texts: Iterable[str]) -> dict[str, str]:
    compiled = _compiled()
    found: dict[str, str] = {}
    for raw in texts:
        for clause in iter_clauses(raw):
            historical = is_historical(clause)
            for sid, (patterns, excludes) in compiled.items():
                if sid in found:
                    continue
                if historical and not SIGNALS[sid].context:
                    continue
                window = SIGNALS[sid].neg_window
                for rx in patterns:
                    hit = next(
                        (
                            m
                            for m in rx.finditer(clause)
                            if not is_negated(clause, m.start(), m.end(), window)
                        ),
                        None,
                    )
                    if hit is None:
                        continue
                    if any(ex.search(clause) for ex in excludes):
                        break
                    found[sid] = hit.group(0)
                    break
    return found


# ------------------------------------------------------------------------------------------ intake signals
_BP_RE = re.compile(r"(?<!\d)(\d{2,3})\s*/\s*(\d{2,3})(?!\d)")
_BP_WORDS = re.compile(
    r"blood pressure|\bbp\b|pressure|tension|presión|pressão|давлени|ضغط|রক্তচাপ|प्रेशर|रक्तचाप|shinikizo"
)


def _bp_signals(raw: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for sentence in sentences(raw):
        if not _BP_WORDS.search(sentence):
            continue
        for m in _BP_RE.finditer(sentence):
            sys_, dia = int(m.group(1)), int(m.group(2))
            if not (70 <= sys_ <= 300 and 30 <= dia <= 200 and sys_ > dia):
                continue
            if sys_ >= 160 or dia >= 110:
                out.setdefault("bp_severe", m.group(0))
            if sys_ >= 180 or dia >= 120:
                out.setdefault("bp_crisis", m.group(0))
    return out


def _duration_days(intake: dict[str, Any]) -> float | None:
    duration = intake.get("duration")
    value = unit = None
    if isinstance(duration, dict):
        value, unit = duration.get("value"), str(duration.get("unit") or "").lower()
    else:
        value, unit = intake.get("duration_value"), str(intake.get("duration_unit") or "").lower()
    if not isinstance(value, int | float) or not unit:
        return None
    for key, factor in (("hour", 1 / 24), ("day", 1), ("week", 7), ("month", 30), ("year", 365)):
        if key in unit:
            return float(value) * factor
    return None


def is_recent(intake: dict[str, Any]) -> bool:
    """The problem started within about a week (or no duration was given - assume it may be acute)."""
    days = _duration_days(intake)
    return days is None or days <= 7


def patient_age(intake: dict[str, Any]) -> int | None:
    patient = intake.get("patient")
    age = patient.get("age") if isinstance(patient, dict) else intake.get("age")
    return age if isinstance(age, int) and not isinstance(age, bool) else None


def structured_signals(intake: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    recent = is_recent(intake)
    for sym in intake.get("symptoms") or []:
        if not isinstance(sym, dict):
            continue
        name = " ".join(str(sym.get("name") or "").casefold().split())
        answer = str(sym.get("answer") or "").casefold()
        for signal, answers, acute_only in SYMPTOM_SIGNALS.get(name, ()):
            if answer in answers and (recent or not acute_only):
                out.setdefault(signal, f"{sym.get('name')}: {answer}")
    age = patient_age(intake)
    if age is not None and age < 5:
        out["young_child"] = f"age {age}"
    pain = intake.get("pain_intensity")
    days = _duration_days(intake)
    if isinstance(pain, int) and pain >= 9 and days is not None and days <= 2:
        areas = {normalise(str(a)).replace(" ", "_") for a in intake.get("body_areas") or []}
        if areas & {"chest", "heart"}:
            out["pain_severe_acute"] = f"pain {pain}/10"
        if areas & {"abdomen", "stomach", "pelvis"}:
            out["abdo_pain_severe_acute"] = f"pain {pain}/10"
    return out


# ------------------------------------------------------------------------------------------------- detection
def evaluate(signals: dict[str, str]) -> Detection:
    detection = Detection(signals=dict(signals))
    if "young_child_text" in signals:
        detection.signals.setdefault("young_child", signals["young_child_text"])
    present = set(detection.signals)
    for family in FAMILIES:
        fired = [rule for rule in family.rules if set(rule) <= present]
        if fired:
            detection.families.append((family, fired))
    return detection


def unknown_positive_symptoms(intake: dict[str, Any], library_names: set[str]) -> list[str]:
    names: list[str] = []
    for sym in intake.get("symptoms") or []:
        if not isinstance(sym, dict):
            continue
        name = str(sym.get("name") or "")
        key = " ".join(name.casefold().split())
        if str(sym.get("answer") or "").casefold() in ("yes", "maybe") and key and key not in library_names:
            names.append(name)
    return names


def detect(intake: dict[str, Any], library_names: set[str] | None = None) -> Detection:
    """Run every signal source over the intake and evaluate the emergency families."""
    notes = str(intake.get("notes") or "")
    texts = [notes, *unknown_positive_symptoms(intake, library_names or set(SYMPTOM_SIGNALS))]
    signals: dict[str, str] = {}
    signals.update(text_signals(texts))
    for key, value in structured_signals(intake).items():
        signals.setdefault(key, value)
    for key, value in _bp_signals(notes).items():
        signals.setdefault(key, value)
    return evaluate(signals)


def detect_text(texts: Iterable[str]) -> Detection:
    texts = list(texts)
    signals = text_signals(texts)
    for raw in texts:
        for key, value in _bp_signals(raw).items():
            signals.setdefault(key, value)
    return evaluate(signals)
