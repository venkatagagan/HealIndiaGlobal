"""Video-call links for consultations (``VIDEO_PROVIDER``; only ``jitsi`` today, zoom/daily later).

A Jitsi room needs no account: the link is ``JITSI_BASE_URL/<prefix>-<unguessable token>``. The token comes
from ``secrets.token_urlsafe`` (>= 128 bits) so rooms cannot be guessed; the link is only shown to the
consultation's parties.
"""

from __future__ import annotations

import secrets

from app.core.config import settings

ROOM_TOKEN_BYTES = 18  # 144 bits -> 24 url-safe characters


def new_meeting_url(prefix: str = "hig") -> str:
    """A fresh https meeting link for the configured provider."""
    provider = settings.VIDEO_PROVIDER
    if provider != "jitsi":  # pragma: no cover - guarded by the settings Literal
        raise ValueError(f"Unsupported VIDEO_PROVIDER {provider!r}")
    token = secrets.token_urlsafe(ROOM_TOKEN_BYTES).replace("_", "x").replace("-", "y")
    return f"{settings.JITSI_BASE_URL}/{prefix}-{token}"
