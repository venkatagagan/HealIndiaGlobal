"""Root API router: ``/api/v1`` + every module router.

Module routers have NO prefix: each route writes its full path in the decorator (e.g. ``"/auth/login"``,
``"/hospital-portal/doctors"``, ``"/finance/settlements/batches"``), because several modules serve multiple
top-level paths.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.admin.router import router as admin_router
from app.modules.admin.site_config import router as site_config_router
from app.modules.agents.router import router as agents_router
from app.modules.auth.router import router as auth_router
from app.modules.cases.router import router as cases_router
from app.modules.catalog.router import router as catalog_router
from app.modules.docai.router import router as docai_router
from app.modules.documents.router import router as documents_router
from app.modules.guests.router import router as guests_router
from app.modules.hospitals.router import router as hospitals_router
from app.modules.ledger.router import router as ledger_router
from app.modules.messaging.router import router as messaging_router
from app.modules.patients.router import router as patients_router
from app.modules.payments.router import router as payments_router
from app.modules.screening.router import router as screening_router
from app.modules.settlements.router import router as settlements_router
from app.modules.travel.router import router as travel_router
from app.modules.voice.router import router as voice_router

api_router = APIRouter(prefix="/api/v1")

for _router in (
    auth_router,
    patients_router,
    docai_router,  # before documents_router: /documents/analyses vs /documents/{document_id}
    documents_router,
    catalog_router,
    site_config_router,
    hospitals_router,
    screening_router,
    cases_router,
    travel_router,
    messaging_router,
    agents_router,
    payments_router,
    ledger_router,
    settlements_router,
    admin_router,
    voice_router,
    guests_router,
):
    api_router.include_router(_router)
