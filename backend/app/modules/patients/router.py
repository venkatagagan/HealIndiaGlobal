"""HTTP routes for the patients module (PLAN 8.2). Patients only (super_admin passes ``require_roles`` but has
no profile of its own, so it gets an empty/created profile only if it is itself a patient)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Request, Response, status

from app.core.deps import DbSession, require_roles
from app.core.enums import SavedEntityType, UserRole
from app.core.errors import BadRequest
from app.models import User
from app.modules.patients import service
from app.modules.patients.schemas import (
    CompanionIn,
    CompanionOut,
    CompanionUpdate,
    PatientDashboardOut,
    PatientProfileIn,
    PatientProfileOut,
    SavedItemIn,
    SavedItemOut,
)

router = APIRouter(tags=["patients"])

PatientUser = Annotated[User, Depends(require_roles(UserRole.PATIENT))]


# --- profile ---------------------------------------------------------------------------------------------
@router.get("/patient/profile", response_model=PatientProfileOut)
async def get_profile(db: DbSession, user: PatientUser) -> PatientProfileOut:
    profile = await service.get_or_create_profile(db, user)
    return service.profile_out(profile, user)


@router.put("/patient/profile", response_model=PatientProfileOut)
async def put_profile(
    body: PatientProfileIn, request: Request, db: DbSession, user: PatientUser
) -> PatientProfileOut:
    profile = await service.update_profile(db, user, body, request)
    return service.profile_out(profile, user)


@router.get("/patient/dashboard", response_model=PatientDashboardOut)
async def get_dashboard(db: DbSession, user: PatientUser) -> PatientDashboardOut:
    return await service.dashboard(db, user)


# --- companions ------------------------------------------------------------------------------------------
@router.get("/patient/companions", response_model=list[CompanionOut])
async def list_companions(db: DbSession, user: PatientUser) -> list[CompanionOut]:
    profile = await service.get_or_create_profile(db, user)
    return [service.companion_out(c) for c in await service.list_companions(db, profile)]


@router.post("/patient/companions", status_code=status.HTTP_201_CREATED, response_model=CompanionOut)
async def create_companion(body: CompanionIn, db: DbSession, user: PatientUser) -> CompanionOut:
    profile = await service.get_or_create_profile(db, user)
    return service.companion_out(await service.create_companion(db, profile, body))


@router.get("/patient/companions/{companion_id}", response_model=CompanionOut)
async def get_companion(companion_id: uuid.UUID, db: DbSession, user: PatientUser) -> CompanionOut:
    profile = await service.get_or_create_profile(db, user)
    return service.companion_out(await service.get_companion(db, profile, companion_id))


@router.put("/patient/companions/{companion_id}", response_model=CompanionOut)
@router.patch("/patient/companions/{companion_id}", response_model=CompanionOut)
async def update_companion(
    companion_id: uuid.UUID, body: CompanionUpdate, db: DbSession, user: PatientUser
) -> CompanionOut:
    profile = await service.get_or_create_profile(db, user)
    return service.companion_out(await service.update_companion(db, profile, companion_id, body))


@router.delete(
    "/patient/companions/{companion_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response
)
async def delete_companion(companion_id: uuid.UUID, db: DbSession, user: PatientUser) -> Response:
    profile = await service.get_or_create_profile(db, user)
    await service.delete_companion(db, profile, companion_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- saved items -----------------------------------------------------------------------------------------
@router.get("/patient/saved", response_model=list[SavedItemOut])
async def list_saved(
    db: DbSession, user: PatientUser, entity_type: Annotated[SavedEntityType | None, Query()] = None
) -> list[SavedItemOut]:
    return await service.list_saved(db, user, entity_type)


@router.post("/patient/saved", status_code=status.HTTP_201_CREATED, response_model=SavedItemOut)
async def save_item(body: SavedItemIn, db: DbSession, user: PatientUser) -> SavedItemOut:
    return await service.save_item(db, user, body.entity_type, body.entity_id)


@router.delete("/patient/saved", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def unsave_item(
    db: DbSession,
    user: PatientUser,
    entity_type: Annotated[SavedEntityType | None, Query()] = None,
    entity_id: Annotated[uuid.UUID | None, Query()] = None,
    body: Annotated[SavedItemIn | None, Body()] = None,
) -> Response:
    """Remove a saved item, identified by query parameters (``?entity_type=&entity_id=``) or a JSON body."""
    kind = entity_type or (body.entity_type if body else None)
    target = entity_id or (body.entity_id if body else None)
    if kind is None or target is None:
        raise BadRequest("entity_type and entity_id are required", code="missing_saved_item")
    await service.unsave_item(db, user, kind, target)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/patient/saved/{saved_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def unsave_by_id(saved_id: uuid.UUID, db: DbSession, user: PatientUser) -> Response:
    await service.unsave_by_id(db, user, saved_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
