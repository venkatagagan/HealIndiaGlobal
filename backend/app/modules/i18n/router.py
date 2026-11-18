"""i18n API.

Public (no auth, short shared cache):
* ``GET /i18n/languages`` - enabled languages in display order.
* ``GET /i18n/overrides?locale=&app=`` - the full set of admin overrides of one app's strings in one language,
  with a ``version`` (epoch ms of the newest change), ``ETag: W/"<app>-<locale>-<version>"`` and 304 on
  ``If-None-Match``.

Admin (admin / super_admin, every change audited):
* ``GET /admin/i18n/languages``, ``PATCH /admin/i18n/languages/{code}`` (English cannot be disabled)
* ``GET /admin/i18n/strings``, ``PUT /admin/i18n/overrides``, ``DELETE /admin/i18n/overrides``
* ``GET/PUT /admin/content-translations/{entity_type}/{entity_id}`` - translations of server-supplied content
  (catalog names/descriptions, bios, visa notes and checklist items, tips, benchmark wait texts); see
  ``app.modules.i18n.content``
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response
from fastapi.responses import JSONResponse

from app.core.deps import DbSession, require_roles
from app.core.enums import UserRole
from app.models import User
from app.modules.i18n import content, service
from app.modules.i18n.schemas import (
    AdminLanguageOut,
    AppName,
    LanguageOut,
    LanguagePatch,
    OverrideIn,
    OverrideOut,
    OverridesOut,
    StringsPage,
    StringStatus,
)

router = APIRouter(tags=["i18n"])

PUBLIC_CACHE = "public, max-age=60"
AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMIN))]


@router.get("/i18n/languages", response_model=list[LanguageOut])
async def list_languages(response: Response) -> list[LanguageOut]:
    response.headers["Cache-Control"] = PUBLIC_CACHE
    return await service.public_languages()


def _etag_matches(header: str | None, etag: str) -> bool:
    if not header:
        return False
    if header.strip() == "*":
        return True
    bare = etag.removeprefix("W/")
    return any(tag.strip().removeprefix("W/") == bare for tag in header.split(","))


@router.get("/i18n/overrides", response_model=OverridesOut, responses={304: {"description": "Not modified"}})
async def list_overrides(
    request: Request,
    db: DbSession,
    locale: Annotated[str, Query(min_length=2, max_length=10)],
    app: Annotated[AppName, Query()],
) -> Response:
    out = await service.public_overrides(db, locale, app)
    etag = f'W/"{out.app}-{out.locale}-{out.version}"'
    headers = {"ETag": etag, "Cache-Control": PUBLIC_CACHE}
    if _etag_matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=headers)
    return JSONResponse(out.model_dump(mode="json"), headers=headers)


# ------------------------------------------------------------------------------------------- admin
@router.get("/admin/i18n/languages", response_model=list[AdminLanguageOut])
async def admin_list_languages(db: DbSession, user: AdminUser) -> list[AdminLanguageOut]:
    return await service.admin_languages(db)


@router.patch("/admin/i18n/languages/{code}", response_model=AdminLanguageOut)
async def admin_patch_language(
    code: str, body: LanguagePatch, db: DbSession, user: AdminUser, request: Request
) -> AdminLanguageOut:
    return await service.set_language_enabled(db, user, code, body.enabled, request)


@router.get("/admin/i18n/strings", response_model=StringsPage)
async def admin_list_strings(
    db: DbSession,
    user: AdminUser,
    app: Annotated[AppName, Query()],
    locale: Annotated[str, Query(min_length=2, max_length=10)],
    q: Annotated[str | None, Query(max_length=200)] = None,
    status: Annotated[StringStatus, Query()] = "all",
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> StringsPage:
    return await service.list_strings(
        db, app=app, locale=locale, q=q, status=status, page=page, page_size=page_size
    )


@router.put("/admin/i18n/overrides", response_model=OverrideOut)
async def admin_put_override(
    body: OverrideIn, db: DbSession, user: AdminUser, request: Request
) -> OverrideOut:
    return await service.put_override(db, user, body, request)


@router.delete("/admin/i18n/overrides", status_code=204)
async def admin_delete_override(
    db: DbSession,
    user: AdminUser,
    request: Request,
    app: Annotated[AppName, Query()],
    locale: Annotated[str, Query(min_length=2, max_length=10)],
    key: Annotated[str, Query(min_length=1, max_length=300)],
) -> Response:
    await service.delete_override(db, user, app=app, locale=locale, key=key, request=request)
    return Response(status_code=204)


# ------------------------------------------------------------------------------- content translations
ContentType = Annotated[str, Path(min_length=2, max_length=40, pattern=r"^[a-z_]+$")]
ContentId = Annotated[str, Path(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_:*-]+$")]


@router.get(
    "/admin/content-translations/{entity_type}/{entity_id}", response_model=content.ContentTranslationsOut
)
async def admin_get_content_translations(
    entity_type: ContentType, entity_id: ContentId, db: DbSession, user: AdminUser
) -> content.ContentTranslationsOut:
    """English source + admin / shipped / effective text per language for every translatable field."""
    return await content.entity_translations(db, entity_type, entity_id)


@router.put(
    "/admin/content-translations/{entity_type}/{entity_id}", response_model=content.ContentTranslationsOut
)
async def admin_put_content_translations(
    entity_type: ContentType,
    entity_id: ContentId,
    body: content.ContentTranslationsPut,
    db: DbSession,
    user: AdminUser,
    request: Request,
) -> content.ContentTranslationsOut:
    """Save (or, with an empty text, remove) translations of one entity; audited; clears the catalog cache."""
    return await content.put_entity_translations(db, user, entity_type, entity_id, body, request)
