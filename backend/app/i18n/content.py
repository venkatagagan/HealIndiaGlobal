"""Translations of server-supplied CONTENT (catalog names and descriptions, visa notes, tips, wait times ...).

UI strings live in the shipped catalogs (``app/i18n/<lng>.json``); content is data, so it is translated in
three layers, the first one that has a text wins:

1. **admin translations** - ``content_translations`` rows (one entity, one field, one language), edited in the
   admin portal (``app.modules.i18n.content``);
2. **shipped translations** - ``app/i18n/content/<lng>.json``: a flat glossary *English source text ->
   translation* for the seeded content. Keyed by the English text on purpose: when someone edits the English,
   the old translation simply stops matching instead of showing outdated (possibly wrong) medical/visa text;
3. **English** (the source, always present).

Waiting times (``"4–12 weeks (NHS)"``) are structured: they are parsed into numbers + unit + qualifier and
rendered from the ``content.wait.*`` server keys with the language's plural rules
(:func:`localize_wait_text`).

Everything here is pure (no DB); the DB layer is :mod:`app.modules.i18n.content`.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path

from app.i18n import DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, normalize_locale, t

__all__ = [
    "CONTENT_DIR",
    "glossary",
    "glossary_sources_matching",
    "localize_text",
    "localize_wait_text",
    "plural_category",
    "shipped_translation",
]

CONTENT_DIR = Path(__file__).resolve().parent / "content"


@lru_cache(maxsize=16)
def _load(path: str, mtime_ns: int) -> dict[str, str]:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return {str(k): str(v) for k, v in data.items() if isinstance(v, str) and v.strip()}


def glossary(locale: str | None) -> dict[str, str]:
    """Shipped content translations for ``locale`` (English source -> translation); empty for English."""
    code = normalize_locale(locale)
    if code is None or code == DEFAULT_LANGUAGE:
        return {}
    path = CONTENT_DIR / f"{code}.json"
    try:
        mtime = os.stat(path).st_mtime_ns
    except OSError:
        return {}
    return _load(str(path), mtime)


def shipped_translation(text: str | None, locale: str | None) -> str | None:
    if not text:
        return None
    return glossary(locale).get(text) or glossary(locale).get(text.strip())


def glossary_sources_matching(term: str, *, limit: int = 50) -> list[str]:
    """English source texts whose shipped translation (in any language) contains ``term`` (case-insensitive),
    so a patient searching "قلب" or "колено" finds the English-named catalog rows."""
    needle = " ".join(term.split()).casefold()
    if len(needle) < 2:
        return []
    out: list[str] = []
    for code in SUPPORTED_LANGUAGES:
        for source, text in glossary(code).items():
            if len(source) <= 200 and needle in text.casefold() and source not in out:
                out.append(source)
                if len(out) >= limit:
                    return out
    return out


# ------------------------------------------------------------------------------------------ plural rules
def plural_category(n: int, locale: str | None) -> str:
    """CLDR plural category of an integer (``zero``/``one``/``two``/``few``/``many``/``other``)."""
    code = normalize_locale(locale) or DEFAULT_LANGUAGE
    n = abs(int(n))
    if code == "ar":
        if n == 0:
            return "zero"
        if n == 1:
            return "one"
        if n == 2:
            return "two"
        if 3 <= n % 100 <= 10:
            return "few"
        if 11 <= n % 100 <= 99:
            return "many"
        return "other"
    if code == "ru":
        if n % 10 == 1 and n % 100 != 11:
            return "one"
        if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
            return "few"
        return "many"
    if code == "fr":
        return "one" if n in (0, 1) else "other"
    if code == "bn":
        return "other"
    return "one" if n == 1 else "other"


# ------------------------------------------------------------------------------------------- wait times
_WAIT_RE = re.compile(
    r"^\s*(?P<min>\d{1,3})(?:\s*[–—-]\s*(?P<max>\d{1,3}))?\s+(?P<unit>day|week|month|year)s?"
    r"(?:\s*\((?P<qualifier>NHS|private|public)\))?\s*$",
    re.IGNORECASE,
)
_LIMITED = frozenset({"limited local availability"})


def localize_wait_text(text: str | None, locale: str | None) -> str | None:
    """``"6–18 months (NHS)"`` -> ``"6–18 месяцев (NHS)"``. ``None`` when ``text`` is not a structured waiting
    time (free text then goes through the normal translation layers)."""
    if not text:
        return None
    if " ".join(text.split()).casefold() in _LIMITED:
        return t("content.wait.limited", locale)
    m = _WAIT_RE.match(text)
    if m is None:
        return None
    unit_name = m.group("unit").lower()
    lo, hi = int(m.group("min")), m.group("max")

    def unit(n: int) -> str:
        return t(f"content.wait.unit.{unit_name}.{plural_category(n, locale)}", locale)

    if hi is not None:
        rendered = t("content.wait.range", locale, min=lo, max=int(hi), unit=unit(int(hi)))
    else:
        rendered = t("content.wait.single", locale, n=lo, unit=unit(lo))
    qualifier = m.group("qualifier")
    if qualifier:
        rendered = t(
            "content.wait.qualified",
            locale,
            text=rendered,
            qualifier=t(f"content.wait.qualifier.{qualifier.lower()}", locale),
        )
    return rendered


def localize_text(text: str | None, locale: str | None, *, field: str | None = None) -> str | None:
    """Shipped translation of one English content text (no admin rows; see ``app.modules.i18n.content``)."""
    code = normalize_locale(locale) or DEFAULT_LANGUAGE
    if not text or code == DEFAULT_LANGUAGE:
        return text
    if field == "wait_time_text":
        waited = localize_wait_text(text, code)
        if waited is not None:
            return waited
    return shipped_translation(text, code) or text
