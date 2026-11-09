"""Documents business logic (PLAN 8.3): validated uploads into object storage, scoped reads/downloads,
soft delete and verification."""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

import structlog
from fastapi import Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.enums import DocumentKind, DocumentStatus, UserRole
from app.core.errors import AppError, BadRequest, Forbidden, NotFound
from app.core.events import publish
from app.core.storage import ObjectNotFound, get_storage, make_key
from app.models import Case, Document, User
from app.modules.documents.policies import (
    Principal,
    can_access_case,
    can_access_patient,
    can_verify,
    load_principal,
    visibility_clause,
)
from app.modules.documents.schemas import DocumentOut
from app.modules.documents.validation import detect_type, safe_file_name

logger = structlog.get_logger(__name__)

READ_CHUNK = 1024 * 1024
MAX_LIST = 500


class FileTooLarge(AppError):
    status_code = 413
    code = "file_too_large"
    default_message = "The file is too large"


def _too_large() -> FileTooLarge:
    return FileTooLarge(
        f"Files can be at most {settings.MAX_UPLOAD_MB} MB",
        details={"max_bytes": settings.max_upload_bytes},
    )


async def read_upload(file: UploadFile) -> bytes:
    """Read the upload enforcing ``MAX_UPLOAD_MB`` without trusting declared sizes."""
    limit = settings.max_upload_bytes
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(READ_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise _too_large()
        chunks.append(chunk)
    if total == 0:
        raise BadRequest("The file is empty", code="empty_file")
    return b"".join(chunks)


def document_out(document: Document, uploaded_by_name: str | None) -> DocumentOut:
    return DocumentOut(
        id=document.id,
        kind=document.kind,
        file_name=document.file_name,
        content_type=document.content_type,
        size_bytes=document.size_bytes,
        status=document.status,
        case_id=document.case_id,
        patient_id=document.patient_id,
        hospital_id=document.hospital_id,
        agent_id=document.agent_id,
        owner_user_id=document.owner_user_id,
        uploaded_by_name=uploaded_by_name,
        verified_at=document.verified_at,
        created_at=document.created_at,
    )


async def _uploader_names(db: AsyncSession, documents: Sequence[Document]) -> dict[uuid.UUID, str]:
    ids = {d.owner_user_id for d in documents}
    if not ids:
        return {}
    rows = await db.execute(select(User.id, User.full_name).where(User.id.in_(ids)))
    return {uid: name for uid, name in rows.all()}


async def to_out(db: AsyncSession, document: Document) -> DocumentOut:
    names = await _uploader_names(db, [document])
    return document_out(document, names.get(document.owner_user_id))


async def to_out_many(db: AsyncSession, documents: Sequence[Document]) -> list[DocumentOut]:
    names = await _uploader_names(db, documents)
    return [document_out(d, names.get(d.owner_user_id)) for d in documents]


# --- upload ----------------------------------------------------------------------------------------------
async def _resolve_links(
    db: AsyncSession,
    p: Principal,
    *,
    case_id: uuid.UUID | None,
    patient_id: uuid.UUID | None,
    hospital_id: uuid.UUID | None,
    header_hospital_id: uuid.UUID | None,
) -> tuple[uuid.UUID | None, uuid.UUID | None, uuid.UUID | None, uuid.UUID | None]:
    """Validate the requested links and fill defaults.

    Returns ``(case_id, patient_id, hospital_id, agent_id)``.

    Links the user may not access raise 404 (no existence oracle)."""
    agent_id: uuid.UUID | None = None
    if case_id is not None:
        case = await db.get(Case, case_id)
        if case is None or not await can_access_case(db, p, case):
            raise NotFound("Case not found")
        if patient_id is not None and patient_id != case.patient_id:
            raise BadRequest("patient_id does not match the case", code="patient_mismatch")
        if hospital_id is not None and hospital_id != case.hospital_id:
            raise BadRequest("hospital_id does not match the case", code="hospital_mismatch")
        patient_id = case.patient_id
    elif patient_id is not None:
        if not await can_access_patient(db, p, patient_id):
            raise NotFound("Patient not found")
    elif p.role == UserRole.PATIENT:
        patient_id = p.patient_id

    if hospital_id is not None and case_id is None:
        if not (p.staff or hospital_id in p.hospital_ids):
            raise NotFound("Hospital not found")
    if p.role == UserRole.HOSPITAL and case_id is None and patient_id is None and hospital_id is None:
        if header_hospital_id is not None and header_hospital_id in p.hospital_ids:
            hospital_id = header_hospital_id
        elif p.hospital_ids:
            hospital_id = p.hospital_ids[0]
        else:
            raise BadRequest("Your account is not linked to a hospital", code="no_hospital")
    if p.role == UserRole.AGENT and case_id is None and patient_id is None:
        agent_id = p.agent_id
    return case_id, patient_id, hospital_id, agent_id


async def upload(
    db: AsyncSession,
    user: User,
    request: Request,
    *,
    file: UploadFile,
    kind: DocumentKind,
    case_id: uuid.UUID | None,
    patient_id: uuid.UUID | None,
    hospital_id: uuid.UUID | None,
    header_hospital_id: uuid.UUID | None,
) -> DocumentOut:
    p = await load_principal(db, user)
    case_id, patient_id, hospital_id, agent_id = await _resolve_links(
        db,
        p,
        case_id=case_id,
        patient_id=patient_id,
        hospital_id=hospital_id,
        header_hospital_id=header_hospital_id,
    )
    data = await read_upload(file)
    detected = detect_type(data)
    if detected is None:
        raise BadRequest(
            "Unsupported file type. Upload a PDF, JPEG, PNG, WebP, HEIC or DICOM file.",
            code="unsupported_file_type",
        )
    mime, ext = detected
    digest = hashlib.sha256(data).hexdigest()
    key = make_key("documents", ext)
    storage = get_storage()
    await storage.save(key, data, mime)
    try:
        document = Document(
            owner_user_id=user.id,
            patient_id=patient_id,
            case_id=case_id,
            hospital_id=hospital_id,
            agent_id=agent_id,
            kind=kind,
            file_name=safe_file_name(file.filename, ext),
            content_type=mime,
            size_bytes=len(data),
            storage_key=key,
            sha256=digest,
            status=DocumentStatus.UPLOADED,
        )
        db.add(document)
        await db.flush()
        await publish(
            db,
            "document.uploaded",
            {
                "document_id": str(document.id),
                "kind": str(kind),
                "case_id": str(case_id) if case_id else None,
                "patient_id": str(patient_id) if patient_id else None,
                "hospital_id": str(hospital_id) if hospital_id else None,
                "agent_id": str(agent_id) if agent_id else None,
                "owner_user_id": str(user.id),
            },
        )
        await audit_log(
            db,
            actor=user,
            action="document.upload",
            entity_type="document",
            entity_id=document.id,
            after={"kind": str(kind), "case_id": case_id, "patient_id": patient_id, "size_bytes": len(data)},
            request=request,
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        try:
            await storage.delete(key)
        except Exception:  # pragma: no cover - best effort cleanup
            logger.warning("documents.cleanup_failed", storage_key=key)
        raise
    return document_out(document, user.full_name)


# --- reads -----------------------------------------------------------------------------------------------
async def get_visible(db: AsyncSession, user: User, document_id: uuid.UUID) -> tuple[Document, Principal]:
    p = await load_principal(db, user)
    document = (
        await db.execute(select(Document).where(Document.id == document_id, visibility_clause(p)))
    ).scalar_one_or_none()
    if document is None:
        raise NotFound("Document not found")
    return document, p


async def list_documents(
    db: AsyncSession,
    user: User,
    *,
    case_id: uuid.UUID | None,
    kind: DocumentKind | None,
    patient_id: uuid.UUID | None,
    hospital_id: uuid.UUID | None,
    status: DocumentStatus | None,
    limit: int,
) -> list[DocumentOut]:
    p = await load_principal(db, user)
    stmt = select(Document).where(visibility_clause(p))
    if case_id is not None:
        stmt = stmt.where(Document.case_id == case_id)
    if kind is not None:
        stmt = stmt.where(Document.kind == kind)
    if patient_id is not None:
        stmt = stmt.where(Document.patient_id == patient_id)
    if hospital_id is not None:
        stmt = stmt.where(Document.hospital_id == hospital_id)
    if status is not None:
        stmt = stmt.where(Document.status == status)
    stmt = stmt.order_by(Document.created_at.desc(), Document.id.desc()).limit(min(max(limit, 1), MAX_LIST))
    documents = list((await db.execute(stmt)).scalars().all())
    names = await _uploader_names(db, documents)
    return [document_out(d, names.get(d.owner_user_id)) for d in documents]


async def read_content(db: AsyncSession, user: User, document_id: uuid.UUID) -> tuple[Document, bytes]:
    document, _ = await get_visible(db, user, document_id)
    try:
        data = await get_storage().open(document.storage_key)
    except (ObjectNotFound, FileNotFoundError) as exc:
        logger.error("documents.object_missing", document_id=str(document.id))
        raise NotFound("Document file not found") from exc
    return document, data


# --- writes ----------------------------------------------------------------------------------------------
async def soft_delete(db: AsyncSession, user: User, document_id: uuid.UUID, request: Request) -> None:
    document, _ = await get_visible(db, user, document_id)
    if document.owner_user_id != user.id:
        raise Forbidden("Only the person who uploaded this document can delete it")
    document.deleted_at = datetime.now(UTC)
    await audit_log(
        db,
        actor=user,
        action="document.delete",
        entity_type="document",
        entity_id=document.id,
        before={"kind": str(document.kind), "status": str(document.status)},
        request=request,
    )
    await db.commit()


async def verify(
    db: AsyncSession, user: User, document_id: uuid.UUID, status: str, note: str | None, request: Request
) -> DocumentOut:
    document, p = await get_visible(db, user, document_id)
    if not await can_verify(db, p, document):
        raise Forbidden("You cannot verify this document")
    before = {"status": str(document.status)}
    document.status = DocumentStatus(status)
    document.verified_by = user.id
    document.verified_at = datetime.now(UTC)
    await audit_log(
        db,
        actor=user,
        action="document.verify",
        entity_type="document",
        entity_id=document.id,
        before=before,
        after={"status": status, "note": note},
        request=request,
    )
    await db.commit()
    return await to_out(db, document)
