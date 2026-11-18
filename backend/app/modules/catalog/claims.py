"""The legal price-claim rule (consumer-protection / misleading-advertising guard).

A saving versus the patient's home country may be PRESENTED AS A CLAIM ("save up to 70%") only when:

* the home-country benchmark has ``medium`` or ``high`` confidence,
* the benchmark names a source (``source`` or ``source_url``), and
* India is cheaper at BOTH ends of the range: India's low price below the home low price and India's high
  price below the home high price.

The API still returns the computed savings; ``claim_allowed`` tells clients whether they may show them as a
saving/claim. When it is false, clients show both price ranges side by side (with the source) and no
"save X" wording, no percentage badge and no sorting/marketing on the saving.
"""

from __future__ import annotations

CLAIM_CONFIDENCE = frozenset({"medium", "high"})


def price_claim_allowed(
    *,
    confidence: str | None,
    source: str | None,
    source_url: str | None,
    home_min: int,
    home_max: int,
    india_min: int,
    india_max: int,
) -> bool:
    """True when a saving may be advertised (see the module docstring). Amounts in one currency."""
    if str(confidence or "").strip().lower() not in CLAIM_CONFIDENCE:
        return False
    if not (str(source or "").strip() or str(source_url or "").strip()):
        return False
    low, high = min(home_min, home_max), max(home_min, home_max)
    i_low, i_high = min(india_min, india_max), max(india_min, india_max)
    return i_low < low and i_high < high
