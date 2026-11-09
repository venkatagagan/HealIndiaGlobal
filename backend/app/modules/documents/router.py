"""HTTP routes for the documents module (PLAN 8.3)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Header, Query, Request, Response, UploadFile, status

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.enums import DocumentKind, DocumentStatus
from app.core.rate_limit import rate_limit
from app.modules.documents import service
from app.modules.documents.schemas import DocumentOut, DocumentVerifyIn
from app.modules.documents.validation import content_disposition

router = APIRouter(tags=["documents"])

_MULTIPART_OVERHEAD = 64 * 1024


async def _reject_oversized(request: Request) -> None:
    """Fail fast on a declared Content-Length well above the limit (the body is still checked as read)."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > settings.max_upload_bytes + _MULTIPART_OVERHEAD:
        raise service._too_large()


@router.post(
    "/documents",
    status_code=status.HTTP_201_CREATED,
    response_model=DocumentOut,
    dependencies=[Depends(_reject_oversized), Depends(rate_limit("documents.upload", 30, 60, key="user"))],
)
async def upload_document(
    request: Request,
    db: DbSession,
    user: CurrentUser,
    file: Annotated[UploadFile, File(description="PDF, JPEG, PNG, WebP, HEIC or DICOM")],
    kind: Annotated[DocumentKind, Form()],
    case_id: Annotated[uuid.UUID | None, Form()] = None,
    patient_id: Annotated[uuid.UUID | None, Form()] = None,
    hospital_id: Annotated[uuid.UUID | None, Form()] = None,
    x_hospital_id: Annotated[uuid.UUID | None, Header(alias="X-Hospital-Id")] = None,
) -> DocumentOut:
    try:
        return await service.upload(
            db,
            user,
            request,
            file=file,
            kind=kind,
            case_id=case_id,
            patient_id=patient_id,
            hospital_id=hospital_id,
            header_hospital_id=x_hospital_id,
        )
    finally:
        await file.close()


@router.get("/documents", response_model=list[DocumentOut])
async def list_documents(
    db: DbSession,
    user: CurrentUser,
    case_id: Annotated[uuid.UUID | None, Query()] = None,
    kind: Annotated[DocumentKind | None, Query()] = None,
    patient_id: Annotated[uuid.UUID | None, Query()] = None,
    hospital_id: Annotated[uuid.UUID | None, Query()] = None,
    status_: Annotated[DocumentStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=service.MAX_LIST)] = 100,
) -> list[DocumentOut]:
    return await service.list_documents(
        db,
        user,
        case_id=case_id,
        kind=kind,
        patient_id=patient_id,
        hospital_id=hospital_id,
        status=status_,
        limit=limit,
    )


@router.get("/documents/{document_id}", response_model=DocumentOut)
async def get_document(document_id: uuid.UUID, db: DbSession, user: CurrentUser) -> DocumentOut:
    document, _ = await service.get_visible(db, user, document_id)
    return await service.to_out(db, document)


@router.get(
    "/documents/{document_id}/download",
    response_class=Response,
    responses={200: {"content": {"application/octet-stream": {}}, "description": "The file"}},
)
async def download_document(document_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Response:
    document, data = await service.read_content(db, user, document_id)
    return Response(
        content=data,
        media_type=document.content_type,
        headers={
            "Content-Disposition": content_disposition(document.file_name),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
        },
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_document(
    document_id: uuid.UUID, request: Request, db: DbSession, user: CurrentUser
) -> Response:
    await service.soft_delete(db, user, document_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/documents/{document_id}/verify", response_model=DocumentOut)
async def verify_document(
    document_id: uuid.UUID, body: DocumentVerifyIn, request: Request, db: DbSession, user: CurrentUser
) -> DocumentOut:
    return await service.verify(db, user, document_id, body.status, body.note, request)
