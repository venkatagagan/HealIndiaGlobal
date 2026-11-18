"""Agent portal "Leads" routes (docs/AGENT_CRM.md). Agent role only; scoped to the caller's agency."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile, status

from app.core.deps import DbSession, PageParams, require_roles
from app.core.enums import UserRole
from app.core.pagination import Page
from app.core.rate_limit import rate_limit
from app.models import User
from app.models.crm import LeadSource, LeadStatus
from app.modules.crm import service
from app.modules.crm.schemas import (
    ActivityIn,
    ImportResultOut,
    LeadConvertIn,
    LeadConvertOut,
    LeadCreate,
    LeadDetailOut,
    LeadOut,
    LeadUpdate,
    PipelineOut,
)

router = APIRouter(tags=["agent-crm"])

AgentUser = Annotated[User, Depends(require_roles(UserRole.AGENT))]


def lead_filters(
    status: Annotated[list[LeadStatus] | None, Query(description="pipeline stage (repeatable)")] = None,
    source: Annotated[list[LeadSource] | None, Query(description="lead source (repeatable)")] = None,
    q: Annotated[str | None, Query(max_length=100, description="name or interest; exact email/phone")] = None,
    tag: Annotated[str | None, Query(max_length=40)] = None,
    owner_user_id: uuid.UUID | None = None,
    follow_up: Annotated[str | None, Query(pattern=r"^(due|overdue|none)$")] = None,
    country: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
) -> service.LeadFilters:
    return service.LeadFilters(
        status=tuple(status or ()),
        source=tuple(source or ()),
        q=q,
        tag=tag,
        owner_user_id=owner_user_id,
        follow_up=follow_up,
        country=country,
    )


Filters = Annotated[service.LeadFilters, Depends(lead_filters)]


@router.get("/agent-portal/leads", response_model=Page[LeadOut])
async def list_leads(
    db: DbSession,
    user: AgentUser,
    params: PageParams,
    filters: Filters,
    sort: Annotated[str | None, Query(pattern=service.LEAD_SORT_PATTERN)] = None,
) -> Page[LeadOut]:
    return await service.list_leads(db, user, params, filters, sort)


@router.get("/agent-portal/leads/pipeline", response_model=PipelineOut)
async def pipeline(db: DbSession, user: AgentUser, filters: Filters) -> PipelineOut:
    """Leads per stage and per source, conversion rates and follow-ups due (``status`` filter ignored)."""
    return await service.pipeline(db, user, filters)


@router.get(
    "/agent-portal/leads/export",
    response_class=Response,
    dependencies=[Depends(rate_limit("crm.export", 20, 3600, key="user"))],
)
async def export_leads(
    request: Request,
    db: DbSession,
    user: AgentUser,
    filters: Filters,
) -> Response:
    content = await service.export_csv(db, user, filters, request)
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="leads.csv"', "Cache-Control": "no-store"},
    )


@router.post(
    "/agent-portal/leads/import",
    response_model=ImportResultOut,
    dependencies=[Depends(rate_limit("crm.import", 10, 3600, key="user"))],
)
async def import_leads(
    request: Request,
    db: DbSession,
    user: AgentUser,
    file: Annotated[UploadFile, File(description="UTF-8 CSV, header row, max 1000 rows / 1 MB")],
    dry_run: bool = False,
) -> ImportResultOut:
    content = await file.read(service.MAX_IMPORT_BYTES + 1)
    return await service.import_csv(db, user, content, dry_run=dry_run, request=request)


@router.post("/agent-portal/leads", response_model=LeadDetailOut, status_code=status.HTTP_201_CREATED)
async def create_lead(body: LeadCreate, request: Request, db: DbSession, user: AgentUser) -> LeadDetailOut:
    return await service.create_lead(db, user, body, request)


@router.get("/agent-portal/leads/{lead_id}", response_model=LeadDetailOut)
async def get_lead(lead_id: uuid.UUID, db: DbSession, user: AgentUser) -> LeadDetailOut:
    return await service.get_lead(db, user, lead_id)


@router.patch("/agent-portal/leads/{lead_id}", response_model=LeadDetailOut)
async def update_lead(
    lead_id: uuid.UUID, body: LeadUpdate, request: Request, db: DbSession, user: AgentUser
) -> LeadDetailOut:
    return await service.update_lead(db, user, lead_id, body, request)


@router.delete(
    "/agent-portal/leads/{lead_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response
)
async def delete_lead(lead_id: uuid.UUID, request: Request, db: DbSession, user: AgentUser) -> Response:
    await service.delete_lead(db, user, lead_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/agent-portal/leads/{lead_id}/activities", response_model=LeadDetailOut, status_code=201)
async def add_activity(
    lead_id: uuid.UUID, body: ActivityIn, request: Request, db: DbSession, user: AgentUser
) -> LeadDetailOut:
    return await service.add_activity(db, user, lead_id, body, request)


@router.post("/agent-portal/leads/{lead_id}/convert", response_model=LeadConvertOut, status_code=201)
async def convert_lead(
    lead_id: uuid.UUID, body: LeadConvertIn, request: Request, db: DbSession, user: AgentUser
) -> LeadConvertOut:
    """Create the managed patient (consent attestation required, like ``POST /agent-portal/patients``) and
    mark the lead won."""
    return await service.convert_lead(db, user, lead_id, body, request)
