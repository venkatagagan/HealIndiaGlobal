"""Catalog-specific settings (public-website integration), read from the environment and ``backend/.env``.

Kept next to the catalog module instead of ``app.core.config`` because only this module uses them:

* ``WEBSITE_REVALIDATE_URL`` / ``REVALIDATE_SECRET``: on-demand ISR revalidation of the public website (the
  website exposes ``POST /api/revalidate``; the same secret, at least 32 characters, is configured on both
  sides). Revalidation is a no-op while either is empty (or the secret is too short), and always off under
  ``ENV=test`` unless a test enables it explicitly.
* ``WEBSITE_SERVER_IPS``: CIDRs of the website's server(s) (server-side rendering / ISR fetches). They get the
  generous ``CATALOG_RATE_LIMIT_WEBSITE`` budget on the public catalogue; everyone else gets
  ``CATALOG_RATE_LIMIT_PUBLIC`` (requests per minute per client IP).
"""

from __future__ import annotations

import ipaddress
from functools import lru_cache
from typing import Annotated, Any

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app.core.config import ENV_FILE, _split_list

MIN_SECRET_LENGTH = 32


class CatalogSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    ENV: str = "development"
    WEBSITE_REVALIDATE_URL: str = "http://localhost:3000/api/revalidate"
    REVALIDATE_SECRET: str = ""
    REVALIDATE_TIMEOUT_SECONDS: float = 10.0
    WEBSITE_SERVER_IPS: Annotated[list[str], NoDecode] = Field(default_factory=list)
    CATALOG_RATE_LIMIT_PUBLIC: int = 300
    CATALOG_RATE_LIMIT_WEBSITE: int = 6000
    # Honour the CDN/edge country header (``CF-IPCountry`` / ``X-Country``) to pick a visitor's home country
    # for the cost comparison. Only enable it when the edge sets/overwrites that header (clients can send
    # anything); it is also ignored unless the direct peer is one of ``TRUSTED_PROXIES``.
    TRUST_COUNTRY_HEADER: bool = False

    @field_validator("WEBSITE_SERVER_IPS", mode="before")
    @classmethod
    def _parse_networks(cls, value: Any) -> Any:
        parsed = _split_list(value)
        if isinstance(parsed, list):
            for item in parsed:
                try:
                    ipaddress.ip_network(str(item), strict=False)
                except ValueError as exc:
                    raise ValueError(f"invalid IP address or CIDR in WEBSITE_SERVER_IPS: {item!r}") from exc
        return parsed

    @model_validator(mode="after")
    def _test_defaults(self) -> CatalogSettings:
        # The test suite must never call a real website; tests opt in by patching these attributes.
        if self.ENV == "test":
            self.REVALIDATE_SECRET = ""
        return self

    @property
    def revalidation_enabled(self) -> bool:
        # The website refuses secrets shorter than MIN_SECRET_LENGTH, so a short one means "off".
        secret = self.REVALIDATE_SECRET.strip()
        return bool(self.WEBSITE_REVALIDATE_URL.strip()) and len(secret) >= MIN_SECRET_LENGTH


@lru_cache
def get_catalog_settings() -> CatalogSettings:
    return CatalogSettings()


catalog_settings: CatalogSettings = get_catalog_settings()
