"""HTTP routes for document intelligence (PLAN 7.1). Paths are written in full (the router has no prefix).

This router must be included BEFORE the documents router: ``/documents/analyses`` would otherwise be captured
by ``/documents/{document_id}``."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.core.ai_quota import ai_daily_quota
from app.core.deps import CurrentUser, DbSession, PageParams
from app.core.pagination import Page
from app.core.rate_limit import rate_limit
from app.models.docai import AnalysisReviewStatus, DocumentAnalysisStatus
from app.modules.docai import service
from app.modules.docai.schemas import AnalysisConfirm, AnalysisCreate, AnalysisPatch, DocumentAnalysisOut

router = APIRouter(tags=["docai"])

_limit = Depends(rate_limit("docai.request", 10, 60, key="user"))
_ai_quota = Depends(ai_daily_quota("docai"))  # SEC-021: per-user daily quota + platform budget


@router.post(
    "/documents/analyses",
    status_code=202,
    response_model=DocumentAnalysisOut,
    dependencies=[_limit, _ai_quota],
)
async def create_analysis(
    body: AnalysisCreate, db: DbSession, user: CurrentUser, request: Request
) -> DocumentAnalysisOut:
    """Read 1..DOCAI_MAX_PAGES pages of ONE report with AI (needs ``consent_ai: true``); then poll."""
    return await service.create_analysis(db, user, body, request)


@router.get("/documents/analyses", response_model=Page[DocumentAnalysisOut])
async def list_analyses(
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    patient_id: Annotated[uuid.UUID | None, Query()] = None,
    case_id: Annotated[uuid.UUID | None, Query()] = None,
    status: Annotated[DocumentAnalysisStatus | None, Query()] = None,
    review_status: Annotated[AnalysisReviewStatus | None, Query()] = None,
) -> Page[DocumentAnalysisOut]:
    return await service.list_analyses(
        db, user, params, patient_id=patient_id, case_id=case_id, status=status, review_status=review_status
    )


@router.get("/documents/analyses/{analysis_id}", response_model=DocumentAnalysisOut)
async def get_analysis(analysis_id: uuid.UUID, db: DbSession, user: CurrentUser) -> DocumentAnalysisOut:
    return await service.get_analysis(db, user, analysis_id)


@router.patch("/documents/analyses/{analysis_id}", response_model=DocumentAnalysisOut)
async def update_analysis(
    analysis_id: uuid.UUID, body: AnalysisPatch, db: DbSession, user: CurrentUser, request: Request
) -> DocumentAnalysisOut:
    """Edit the AI draft (only while ``review_status=pending_review``)."""
    return await service.update_draft(db, user, analysis_id, body, request)


@router.post("/documents/analyses/{analysis_id}/confirm", response_model=DocumentAnalysisOut)
async def confirm_analysis(
    analysis_id: uuid.UUID, body: AnalysisConfirm, db: DbSession, user: CurrentUser, request: Request
) -> DocumentAnalysisOut:
    """Confirm the final reviewed data (omitted fields keep the draft). Only confirmed data is used."""
    return await service.confirm_analysis(db, user, analysis_id, body, request)


@router.post("/documents/analyses/{analysis_id}/reject", response_model=DocumentAnalysisOut)
async def reject_analysis(
    analysis_id: uuid.UUID, db: DbSession, user: CurrentUser, request: Request
) -> DocumentAnalysisOut:
    return await service.reject_analysis(db, user, analysis_id, request)


@router.post(
    "/documents/analyses/{analysis_id}/retry",
    status_code=202,
    response_model=DocumentAnalysisOut,
    dependencies=[_limit, _ai_quota],
)
async def retry_analysis(
    analysis_id: uuid.UUID, db: DbSession, user: CurrentUser, request: Request
) -> DocumentAnalysisOut:
    return await service.retry_analysis(db, user, analysis_id, request)


@router.get("/documents/{document_id}/analysis", response_model=DocumentAnalysisOut)
async def get_document_analysis(
    document_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> DocumentAnalysisOut:
    """Latest analysis (visible to the caller) containing this page."""
    return await service.get_for_document(db, user, document_id)
