"""Discharge summary routes: CRUD/finalize for the hospital, view/download/export/share for the patient, and
the public home-doctor share (``/public/discharge-shares/{token}``, no login, noindex, rate-limited)."""

from __future__ import annotations

import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.core.deps import CurrentUser, DbSession, get_client_ip
from app.core.enums import DischargeSummaryStatus
from app.core.rate_limit import hit, rate_limit
from app.modules.discharge import schemas as s
from app.modules.discharge import service
from app.modules.discharge.fhir import FHIR_MEDIA_TYPE
from app.modules.documents.validation import content_disposition

router = APIRouter(tags=["discharge"])

WriteLimit = Annotated[None, Depends(rate_limit("discharge.write", 120, 3600, key="user"))]
ShareLimit = Annotated[None, Depends(rate_limit("discharge.share", 10, 3600, key="user"))]
_public_limit = Depends(rate_limit("discharge.public", 60, 60))

P = "/discharge-summaries"
PUBLIC = "/public/discharge-shares/{token}"
PUBLIC_HEADERS = {
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
}
FILE_HEADERS = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
}


def _fhir_response(
    bundle: dict[str, object], file_name: str, headers: dict[str, str] | None = None
) -> Response:
    return Response(
        content=json.dumps(bundle, ensure_ascii=False, indent=2),
        media_type=FHIR_MEDIA_TYPE,
        headers={
            **(headers or {}),
            "Content-Disposition": content_disposition(file_name),
            "Cache-Control": "private, no-store",
        },
    )


# ------------------------------------------------------------------------------------------- summaries
@router.get(P, response_model=list[s.DischargeSummaryListItem])
async def list_discharge_summaries(
    db: DbSession,
    user: CurrentUser,
    case_id: uuid.UUID | None = None,
    booking_id: uuid.UUID | None = None,
    status_: Annotated[DischargeSummaryStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[s.DischargeSummaryListItem]:
    """Patients and agents see final versions; hospitals and staff also see drafts."""
    return await service.list_summaries(
        db, user, case_id=case_id, booking_id=booking_id, status=status_, limit=limit
    )


@router.get(f"{P}/prefill", response_model=s.DischargePrefillOut)
async def discharge_prefill(
    db: DbSession, user: CurrentUser, case_id: uuid.UUID, booking_id: uuid.UUID | None = None
) -> s.DischargePrefillOut:
    """Hospital: values to start a draft from the case, booking, doctor and the patient's allergies."""
    return await service.prefill(db, user, case_id, booking_id)


@router.post(P, response_model=s.DischargeSummaryOut, status_code=status.HTTP_201_CREATED)
async def create_discharge_summary(
    body: s.DischargeSummaryCreate, request: Request, db: DbSession, user: CurrentUser, _: WriteLimit
) -> s.DischargeSummaryOut:
    summary = await service.create_summary(db, user, body, request)
    return await service.summary_out(db, summary)


@router.get(f"{P}/{{summary_id}}", response_model=s.DischargeSummaryOut)
async def get_discharge_summary(
    summary_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser
) -> s.DischargeSummaryOut:
    summary, _ = await service.get_summary(db, user, summary_id)
    out = await service.summary_out(db, summary)
    await service.audit_read(db, user, summary, request)
    return out


@router.patch(f"{P}/{{summary_id}}", response_model=s.DischargeSummaryOut)
async def update_discharge_summary(
    summary_id: uuid.UUID,
    body: s.DischargeSummaryUpdate,
    request: Request,
    db: DbSession,
    user: CurrentUser,
    _: WriteLimit,
) -> s.DischargeSummaryOut:
    summary = await service.update_summary(db, user, summary_id, body, request)
    return await service.summary_out(db, summary)


@router.delete(f"{P}/{{summary_id}}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def discard_discharge_draft(
    summary_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser
) -> Response:
    await service.discard_draft(db, user, summary_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(f"{P}/{{summary_id}}/finalize", response_model=s.DischargeSummaryOut)
async def finalize_discharge_summary(
    summary_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser, _: WriteLimit
) -> s.DischargeSummaryOut:
    """Lock the summary, store its PDF, create medication reminders and notify the patient."""
    summary = await service.finalize(db, user, summary_id, request)
    return await service.summary_out(db, summary)


@router.post(f"{P}/{{summary_id}}/new-version", response_model=s.DischargeSummaryOut, status_code=201)
async def new_discharge_version(
    summary_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser, _: WriteLimit
) -> s.DischargeSummaryOut:
    """Edit a final summary: a new draft version (copy) - the final one stays unchanged."""
    summary = await service.new_version(db, user, summary_id, request)
    return await service.summary_out(db, summary)


@router.get(
    f"{P}/{{summary_id}}/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}, "description": "The PDF"}},
)
async def discharge_summary_pdf(
    summary_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser
) -> Response:
    summary, _ = await service.get_summary(db, user, summary_id)
    data, file_name = await service.pdf_bytes(db, summary)
    await service.audit_read(db, user, summary, request, action="phi.download")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={**FILE_HEADERS, "Content-Disposition": content_disposition(file_name)},
    )


@router.get(
    f"{P}/{{summary_id}}/fhir",
    response_class=Response,
    responses={200: {"content": {FHIR_MEDIA_TYPE: {}}, "description": "FHIR R4 document Bundle"}},
)
async def discharge_summary_fhir(
    summary_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser
) -> Response:
    """HL7 FHIR R4 ``Bundle`` (type ``document``) with a LOINC 18842-5 Composition."""
    summary, _ = await service.get_summary(db, user, summary_id)
    bundle = await service.fhir_bundle(db, summary)
    await service.audit_read(db, user, summary, request, action="phi.download")
    return _fhir_response(bundle, f"discharge-summary-{summary.id}-v{summary.version}.fhir.json")


# ------------------------------------------------------------------------------------------- shares
@router.get(f"{P}/{{summary_id}}/shares", response_model=list[s.ShareOut])
async def list_discharge_shares(summary_id: uuid.UUID, db: DbSession, user: CurrentUser) -> list[s.ShareOut]:
    return await service.list_shares(db, user, summary_id)


@router.post(f"{P}/{{summary_id}}/shares", response_model=s.ShareCreatedOut, status_code=201)
async def create_discharge_share(
    summary_id: uuid.UUID,
    body: s.ShareCreate,
    request: Request,
    db: DbSession,
    user: CurrentUser,
    _: ShareLimit,
) -> s.ShareCreatedOut:
    """Patient: email a time-limited link (default 14 days) to the home doctor. The link is returned once."""
    return await service.create_share(db, user, summary_id, body, request)


@router.delete(f"{P}/{{summary_id}}/shares/{{share_id}}", response_model=s.ShareOut)
async def revoke_discharge_share(
    summary_id: uuid.UUID, share_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser
) -> s.ShareOut:
    return await service.revoke_share(db, user, summary_id, share_id, request)


# ------------------------------------------------------------------------------------------- reminders
@router.get(f"{P}/{{summary_id}}/medication-reminders", response_model=list[s.MedicationReminderOut])
async def list_medication_reminders(
    summary_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> list[s.MedicationReminderOut]:
    return await service.list_reminders(db, user, summary_id)


@router.put(f"{P}/{{summary_id}}/medication-reminders", response_model=list[s.MedicationReminderOut])
async def set_medication_reminders(
    summary_id: uuid.UUID,
    body: s.MedicationRemindersUpdate,
    request: Request,
    db: DbSession,
    user: CurrentUser,
) -> list[s.MedicationReminderOut]:
    """Patient opt-in: one daily reminder at ``remind_hour`` (local time) while each medicine is due."""
    return await service.set_reminders(db, user, summary_id, body, request)


# ------------------------------------------------------------------------------------------- public share
async def _share(db: DbSession, request: Request, token: str) -> service.ShareContext:
    try:
        return await service.resolve_share(db, token)
    except Exception:
        # Count failed lookups per IP so tokens cannot be guessed (even with RATE_LIMIT_ENABLED off).
        await hit("discharge.public_miss", get_client_ip(request) or "unknown", 30, 3600, force=True)
        raise


@router.get(PUBLIC, response_model=s.PublicShareOut, dependencies=[_public_limit])
async def public_discharge_share(
    token: str, request: Request, response: Response, db: DbSession
) -> s.PublicShareOut:
    """Read-only view for the home doctor (no login). Every view is recorded in the patient's access log."""
    ctx = await _share(db, request, token)
    out = await service.public_view(db, ctx)
    await service.audit_share_access(db, ctx, request, "phi.view")
    response.headers.update(PUBLIC_HEADERS)
    return out


@router.get(f"{PUBLIC}/documents/{{document_id}}", response_class=Response, dependencies=[_public_limit])
async def public_discharge_document(
    token: str, document_id: uuid.UUID, request: Request, db: DbSession
) -> Response:
    ctx = await _share(db, request, token)
    doc, data = await service.public_document(db, ctx, document_id)
    await service.audit_share_access(db, ctx, request, "phi.download", resource_id=doc.id)
    return Response(
        content=data,
        media_type=doc.content_type,
        headers={**PUBLIC_HEADERS, **FILE_HEADERS, "Content-Disposition": content_disposition(doc.file_name)},
    )


@router.get(f"{PUBLIC}/pdf", response_class=Response, dependencies=[_public_limit])
async def public_discharge_pdf(token: str, request: Request, db: DbSession) -> Response:
    ctx = await _share(db, request, token)
    data, file_name = await service.pdf_bytes(db, ctx.summary)
    await service.audit_share_access(db, ctx, request, "phi.download")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={**PUBLIC_HEADERS, **FILE_HEADERS, "Content-Disposition": content_disposition(file_name)},
    )


@router.get(f"{PUBLIC}/fhir", response_class=Response, dependencies=[_public_limit])
async def public_discharge_fhir(token: str, request: Request, db: DbSession) -> Response:
    ctx = await _share(db, request, token)
    bundle = await service.fhir_bundle(db, ctx.summary)
    await service.audit_share_access(db, ctx, request, "phi.download")
    return _fhir_response(bundle, f"discharge-summary-v{ctx.summary.version}.fhir.json", PUBLIC_HEADERS)
