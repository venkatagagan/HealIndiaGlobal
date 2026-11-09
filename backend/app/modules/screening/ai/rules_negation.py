"""Text handling for the rules triage engine: Unicode-safe normalisation, clause splitting, NegEx-style
negation scoping, past/family-history scoping and prompt-injection sentence filtering.

Everything here is deterministic and script-agnostic: Latin, Cyrillic, Arabic, Bengali and Devanagari text
keep their letters (only punctuation and symbols become spaces), so the multilingual lexicons in
``rules_lexicon.py`` can match them.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterator

# --------------------------------------------------------------------------------------------- normalisation
_ARABIC_DIACRITICS = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭـ]")
_CHAR_MAP = str.maketrans(
    {
        "’": "'",  # right single quote
        "‘": "'",
        "ʼ": "'",
        "`": "'",
        "´": "'",
        "ё": "е",  # ё -> е
        "أ": "ا",  # أ -> ا
        "إ": "ا",  # إ -> ا
        "آ": "ا",  # آ -> ا
        "ى": "ي",  # ى -> ي
    }
)


def fold(text: str) -> str:
    """NFKC + casefold + script-specific folding (quotes, ё, Arabic alef forms / diacritics). Keeps
    punctuation, so it is also safe to apply to regex sources (they contain no upper-case escapes by
    convention)."""
    text = unicodedata.normalize("NFKC", text or "").casefold().translate(_CHAR_MAP)
    return _ARABIC_DIACRITICS.sub("", text)


def _strip_punct(text: str) -> str:
    out: list[str] = []
    n = len(text)
    for i, ch in enumerate(text):
        if ch == "'" or ch.isspace():
            out.append(" " if ch.isspace() else ch)
            continue
        cat = unicodedata.category(ch)
        if cat[0] in "PS":
            # keep decimal separators inside numbers ("39.8")
            if ch in ".," and 0 < i < n - 1 and text[i - 1].isdigit() and text[i + 1].isdigit():
                out.append(".")
            else:
                out.append(" ")
        else:
            out.append(ch)
    return "".join(out)


def normalise(text: str | None) -> str:
    """Folded text with punctuation/symbols replaced by spaces and whitespace collapsed (all scripts kept)."""
    return " ".join(_strip_punct(fold(text or "")).split())


# ----------------------------------------------------------------------------------------- sentence handling
_TAG_RE = re.compile(r"<[^<>]{0,120}>")
_SENTENCE_SPLIT = re.compile(r"(?:[.!?;:\n\r।؟؛۔。]+(?!\d))")
_CONTRAST_SPLIT = re.compile(
    r"(?:[\s,]+|^)(?:but|however|although|though|whereas|except|mais|cependant|pero|sin embargo|mas|porém|"
    r"но|однако|lakini|ila|لكن|ولكن|لكنه|لكنها|কিন্তু|তবে|लेकिन|परंतु|मगर)(?=\s|,)"
)


def sentences(raw: str | None) -> list[str]:
    """Folded sentences of ``raw`` (markup tags removed)."""
    text = _TAG_RE.sub(" ", fold(raw or ""))
    return [s.strip() for s in _SENTENCE_SPLIT.split(text) if s and s.strip()]


def clauses(sentence: str) -> list[str]:
    """Normalised clauses of a folded sentence: contrastive conjunctions ("but", "mais", "но", "لكن" …) end
    negation and history scope."""
    return [c for c in (normalise(part) for part in _CONTRAST_SPLIT.split(sentence)) if c]


def iter_clauses(raw: str | None) -> Iterator[str]:
    for sentence in sentences(raw):
        yield from clauses(sentence)


# ------------------------------------------------------------------------------------------------- negation
NEGATORS: frozenset[str] = frozenset(
    {
        # English
        "no", "not", "never", "denies", "denied", "deny", "without", "none", "nor", "neither", "free",
        "nothing", "negative",
        # French / Spanish / Portuguese
        "pas", "jamais", "sans", "aucun", "aucune", "ni", "ne", "nunca", "sin", "ningún", "ninguna", "ningun",
        "tampoco", "não", "nao", "sem", "nenhum", "nenhuma",
        # Russian
        "не", "нет", "без", "никогда",
        # Swahili
        "hakuna", "hana", "sina", "bila", "hapana", "sijawahi", "hajawahi",
        # Arabic (folded)
        "لا", "ليس", "ليست", "لم", "لن", "بدون", "دون", "بلا", "ولا", "ولم", "وليس",
        # Hindi / Bengali (pre-posed forms)
        "बिना", "ছাড়া",
    }
)  # fmt: skip
# Postposed negation (Bengali / Hindi verb-final negation, English "chest pain: none").
POST_NEGATORS: frozenset[str] = frozenset({"না", "নেই", "নাই", "নি", "नहीं", "none", "absent", "denied"})
# Tokens that close a negation scope when met walking backwards from the trigger.
SCOPE_BREAKERS: frozenset[str] = frozenset(
    {
        "but", "now", "today", "suddenly", "currently", "however", "yet", "although", "though", "except",
        "since", "then", "until", "mais", "maintenant", "soudain", "pero", "ahora", "agora", "но", "сейчас",
        "внезапно", "lakini", "sasa", "ghafla", "الان", "فجاة", "এখন", "হঠাৎ", "अब", "अचानक",
    }
)  # fmt: skip
_PSEUDO_NEG_NEXT = {
    "no": {"longer", "doubt", "matter"},
    "not": {"only", "sure", "just"},
    "nothing": {"helps"},
}
NEG_WINDOW = 6


def _is_negator(tok: str) -> bool:
    if tok in NEGATORS:
        return True
    if tok.endswith("n't") and tok not in {"can't", "couldn't"}:  # "can't breathe" is itself a trigger
        return True
    return tok.startswith("n'") and len(tok) > 2  # French "n'ai", "n'a"


def is_negated(clause: str, start: int, end: int, window: int = NEG_WINDOW) -> bool:
    """NegEx-style: a negator up to ``window`` tokens before the trigger (scope ends at breakers), or a
    postposed negator right after it (Bengali/Hindi)."""
    before = clause[:start].split()[-window:] if window > 0 else []
    for idx in range(len(before) - 1, -1, -1):
        tok = before[idx]
        if tok in SCOPE_BREAKERS:
            break
        if _is_negator(tok):
            nxt = before[idx + 1] if idx + 1 < len(before) else ""
            if nxt in _PSEUDO_NEG_NEXT.get(tok, ()):
                continue
            return True
    after = clause[end:].split()[:2]
    return any(tok in POST_NEGATORS for tok in after)


# ---------------------------------------------------------------------------------- past / family history
_HISTORY_RE = re.compile(
    r"(?<!\d)(?:19[4-9]\d|20[0-2]\d)(?!\d)"
    r"|\b(?:\d+|a|few|a few|several|many|two|three|four|five|six|ten|some) (?:years?|months?) (?:ago|back)\b"
    r"|\blast year\b|\bhistory of\b|\bas a (?:child|kid|teenager|teen|baby|boy|girl)\b|\bin the past\b"
    r"|\bpreviously\b|\bused to\b|\bwhen i was (?:young|a child|a kid|little|\d+)\b|\bsince childhood\b"
    r"|\bil y a \d+ ans\b|\bhace \d+ años\b|\bhá \d+ anos\b|\b\d+ (?:лет|года?) назад\b|\bв детстве\b"
    r"|\bв прошлом году\b|\bmiaka (?:[^ ]+ ){0,2}iliyopita\b|منذ (?:\d+ )?(?:سنوات|سنة|عام|اعوام)"
    r"|বছর আগে|साल पहले"
)
_FAMILY_RE = re.compile(
    r"\b(?:father|mother|dad|daddy|mum|mom|mummy|brother|sister|grand(?:father|mother|ma|pa|dad|mum)|uncle|"
    r"aunt|auntie|parents?|cousin|grandparents?|père|mère|frère|sœur|soeur|padre|madre|hermano|hermana|pai|"
    r"mãe|irmão|irmã|отец|отца|мать|матери|мама|мамы|папа|брат|сестра|baba|mama|kaka|dada)\b"
    r"|ابي|والدي|امي|والدتي|اخي|اختي|বাবা|মা|ভাই|বোন|पिता|माँ|मां|भाई|बहन"
)
_FAMILY_PAST_RE = re.compile(
    r"\b(?:had|has had|died|passed away|suffered|history|a eu|est mort|est décédé|tuvo|murió|teve|morreu|"
    r"был|была|умер|умерла|alikuwa|alikufa)\b|\bfamily history\b|توفي|كان لديه|ছিল|মারা|था|थी|मृत्यु"
)
_ACUTE_RE = re.compile(
    r"\b(?:now|today|tonight|right now|currently|just now|yesterday|last night|suddenly|sudden|again|"
    r"this (?:morning|evening|afternoon|week)|since (?:this|last|yesterday|an hour|\d+)|"
    r"(?:an|one|a few|few|\d+|two|three|four|five|ten|twenty|thirty|forty) (?:minutes?|hours?|mins?|hrs?)|"
    r"maintenant|aujourd'hui|soudain\w*|ahora|hoy|de repente|agora|hoje|сейчас|сегодня|внезапно|вдруг|"
    r"sasa|leo|ghafla)\b|الان|اليوم|فجاة|منذ ساعة|এখন|আজ|হঠাৎ|अब|आज|अचानक"
)


def is_historical(clause: str) -> bool:
    """Past or family history with no current-time marker ("I had a heart attack in 2021", "my father had a
    stroke") - a present-tense re-mention ("…and now chest pain again") keeps the clause current."""
    if _ACUTE_RE.search(clause):
        return False
    if _HISTORY_RE.search(clause):
        return True
    return bool(_FAMILY_RE.search(clause) and _FAMILY_PAST_RE.search(clause))


# --------------------------------------------------------------------------------------- prompt injection
_INJECTION_RE = re.compile(
    r"\b(?:ignore|disregard|forget|override|bypass)\b(?: [^ ]+){0,4} (?:instructions?|rules|triage|above|"
    r"previous|prompt|policy|guidelines|everything|symptoms)\b"
    r"|\b(?:system|assistant|developer|admin)\s*:|\bsystem override\b"
    r"|\bnew (?:task|policy|instructions?|role)\b"
    r"|\bclassify (?:this|the|me|my)\b|\b(?:set|mark|change|downgrade|label)\b(?: [^ ]+){0,3} "
    r"(?:urgency|routine|emergency|priority)\b|\bprint (?:your|the)\b|\bsystem prompt\b|\byou are now\b"
    r"|\bpretend\b|\bjailbreak\b|\bwith high confidence\b|\bwrite that\b|\bsay (?:that|it is)\b"
    r"|\brecommend\b(?: [^ ]+){0,6} (?:hospital|clinic|centre|center)\b|\bdo not mention\b"
    r"|[{}\[\]]|\"\w+\"\s*:|ignore[zr]? (?:les|toutes)|\bignora\b|игнорир|инструкци|تجاهل|التعليمات"
)


def is_injection(sentence: str) -> bool:
    """True for a sentence that tries to instruct the engine (it is dropped from specialty/procedure evidence;
    red-flag detection still reads it - safety first)."""
    return bool(_INJECTION_RE.search(sentence))


def evidence_text(raw: str | None) -> str:
    """Normalised free text without instruction-like sentences, for specialty and procedure matching."""
    return " ".join(normalise(s) for s in sentences(raw) if not is_injection(s))
