"""Request/response shapes of the i18n API (public languages/overrides + the admin Translations page)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AppName = Literal["website", "patient_web", "admin", "agent", "hospital", "mobile", "server"]
StringStatus = Literal["all", "missing", "overridden", "translated"]


class LanguageOut(BaseModel):
    code: str
    name: str
    native_name: str
    rtl: bool
    enabled: bool


class OverridesOut(BaseModel):
    locale: str
    app: str
    #: epoch milliseconds of the newest change (0 when the app/locale never had an override)
    version: int
    strings: dict[str, str]


class AdminLanguageOut(LanguageOut):
    sort: int
    #: per app: share of the app's English keys with a shipped translation or an override (0-100, 1 dp)
    completeness: dict[str, float]
    completeness_overall: float
    updated_at: datetime | None


class LanguagePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool


class StringItem(BaseModel):
    key: str
    #: English shipped text
    source: str
    #: shipped text in the requested locale (null when the catalog has none)
    shipped: str | None
    override: str | None
    #: override ?? shipped ?? source
    effective: str
    updated_at: datetime | None
    #: display name (or email) of the admin who last changed the override
    updated_by: str | None


class StringCounts(BaseModel):
    total: int
    missing: int
    overridden: int


class StringsPage(BaseModel):
    items: list[StringItem]
    total: int
    page: int
    page_size: int
    pages: int
    counts: StringCounts


class OverrideIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    app: AppName
    locale: str = Field(min_length=2, max_length=10)
    key: str = Field(min_length=1, max_length=300)
    #: plain text; HTML tags and control characters are removed, then 1..5000 characters must remain
    text: str = Field(max_length=20000)


class OverrideOut(BaseModel):
    app: str
    locale: str
    key: str
    text: str
    updated_at: datetime
    updated_by: str | None
