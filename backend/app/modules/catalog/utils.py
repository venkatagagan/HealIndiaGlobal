"""Small helpers shared by the catalog and hospital-portal modules."""

from __future__ import annotations

import hashlib
import re
import unicodedata
import uuid
from collections.abc import Iterable
from typing import Any

__all__ = [
    "LANGUAGE_ALIASES",
    "cache_key",
    "like_pattern",
    "language_variants",
    "normalize_tags",
    "parse_uuid",
    "slugify",
]

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")

# Common language names -> ISO-639-1 codes, so filters accept either "ar" or "Arabic".
LANGUAGE_ALIASES: dict[str, str] = {
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
    "persian": "fa",
    "farsi": "fa",
    "pashto": "ps",
    "dari": "prs",
    "uzbek": "uz",
    "turkish": "tr",
    "somali": "so",
    "amharic": "am",
    "hausa": "ha",
    "yoruba": "yo",
    "igbo": "ig",
    "tamil": "ta",
    "telugu": "te",
    "malayalam": "ml",
    "kannada": "kn",
    "marathi": "mr",
    "gujarati": "gu",
    "punjabi": "pa",
    "nepali": "ne",
    "sinhala": "si",
    "burmese": "my",
    "chinese": "zh",
    "mandarin": "zh",
    "indonesian": "id",
    "malay": "ms",
    "thai": "th",
    "kazakh": "kk",
    "kyrgyz": "ky",
    "tajik": "tg",
    "turkmen": "tk",
    "azerbaijani": "az",
}
_CODE_TO_NAME = {code: name for name, code in reversed(list(LANGUAGE_ALIASES.items()))}


def slugify(value: str, max_length: int = 150) -> str:
    """ASCII, lowercase, hyphen-separated slug (``"Dr. Ánil Sharma"`` -> ``"dr-anil-sharma"``)."""
    normalized = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii")
    slug = _SLUG_STRIP.sub("-", normalized.lower()).strip("-")
    slug = slug[:max_length].strip("-")
    return slug or "item"


def like_pattern(term: str) -> str:
    """``%term%`` with LIKE wildcards escaped (use with ``escape="\\\\"``)."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def language_variants(value: str) -> list[str]:
    """Values to match in a ``languages TEXT[]`` column for a user-supplied language (code or name)."""
    raw = (value or "").strip().lower()
    if not raw:
        return []
    variants = {raw}
    code = LANGUAGE_ALIASES.get(raw)
    if code:
        variants.add(code)
    name = _CODE_TO_NAME.get(raw)
    if name:
        variants.add(name)
    # Stored values may be capitalised names ("Arabic").
    variants |= {v.capitalize() for v in list(variants)}
    return sorted(variants)


def normalize_tags(values: Iterable[str] | None, *, lower: bool = True, max_items: int = 50) -> list[str]:
    """Strip, drop empties, de-duplicate (order kept) and optionally lowercase a list of short strings."""
    out: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        item = (value or "").strip()
        if lower:
            item = item.lower()
        if not item or item in seen:
            continue
        seen.add(item)
        out.append(item)
        if len(out) >= max_items:
            break
    return out


def parse_uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


def cache_key(namespace: str, **params: Any) -> str:
    """Deterministic cache key ``catalog:<namespace>:<sha1 of sorted params>``."""
    parts = [f"{k}={'' if v is None else str(v).strip().lower()}" for k, v in sorted(params.items())]
    digest = hashlib.sha1("&".join(parts).encode("utf-8"), usedforsecurity=False).hexdigest()[:20]
    return f"catalog:{namespace}:{digest}"
