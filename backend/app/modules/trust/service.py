"""Verified reviews and structured accreditations.

Reviews: a patient may review a hospital (optionally one of its doctors) once per *completed* booking of
their own. New and edited reviews are ``pending`` until staff publish (or hide) them; only published reviews
are public and count towards ``rating_avg`` / ``rating_count`` (recomputed for the hospital and its doctors
on every moderation). Publishes ``review.submitted`` and ``review.moderated``.

Accreditations: hospitals (or staff) record JCI/NABH/NABL... certificates; a platform admin verifies them.
Public catalogue APIs expose only verified, unexpired ones (``accreditations_verified``). Any change to
body, certificate number, validity or document resets the verification.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.enums import BookingStatus, ReviewStatus
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.events import publish
from app.core.pagination import Page, paginate
from app.models import (
    Booking,
    Doctor,
    Document,
    Hospital,
    HospitalAccreditation,
    PatientProfile,
    Procedure,
    Review,
    User,
)
from app.modules.catalog import service as catalog
from app.modules.catalog.schemas import IdSlugName
from app.modules.hospitals.service import recompute_ratings
from app.modules.trust.schemas import (
    AccreditationIn,
    AccreditationOut,
    AccreditationPatch,
    AdminReviewOut,
    NameRef,
    PatientReviewOut,
    ReviewableBookingOut,
    ReviewCreateIn,
    ReviewModerateIn,
    ReviewUpdateIn,
)

__all__ = [
    "accreditation_out",
    "create_accreditation",
    "create_review",
    "delete_accreditation",
    "delete_my_review",
    "list_accreditations",
    "list_admin_reviews",
    "list_my_reviews",
    "moderate_review",
    "reviewable_bookings",
    "set_accreditation_verified",
    "update_accreditation",
    "update_my_review",
]


def _now() -> datetime:
    return datetime.now(UTC)


# ----------------------------------------------------------------------------- reviews: patient
async def _patient_profile(db: AsyncSession, user: User) -> PatientProfile:
    if user.is_guest:
        raise Forbidden(
            "Create a full account to continue", code="guest_upgrade_required", details={"is_guest": True}
        )
    profile = (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()
    if profile is None:
        raise NotFound("Patient profile not found", code="profile_not_found")
    return profile


async def _check_doctor(db: AsyncSession, doctor_id: uuid.UUID | None, hospital_id: uuid.UUID) -> None:
    if doctor_id is None:
        return
    doctor = await db.get(Doctor, doctor_id)
    if doctor is None or doctor.hospital_id != hospital_id:
        raise BadRequest("This doctor does not work at this hospital", code="doctor_mismatch")


async def _patient_review_outs(db: AsyncSession, reviews: list[Review]) -> list[PatientReviewOut]:
    base = await catalog.review_outs(db, reviews)
    return [
        PatientReviewOut(
            **out.model_dump(),
            booking_id=r.booking_id,
            moderation_reason=r.moderation_reason if r.status == ReviewStatus.HIDDEN else None,
            updated_at=r.updated_at,
            editable=r.status == ReviewStatus.PENDING,
        )
        for r, out in zip(reviews, base, strict=True)
    ]


async def create_review(
    db: AsyncSession, user: User, body: ReviewCreateIn, request: Request
) -> PatientReviewOut:
    profile = await _patient_profile(db, user)
    booking = await db.get(Booking, body.booking_id)
    if booking is None or booking.patient_id != profile.id:
        raise NotFound("Booking not found")
    if booking.hospital_id != body.hospital_id:
        raise BadRequest("This booking is with a different hospital", code="hospital_mismatch")
    if booking.status != BookingStatus.COMPLETED:
        raise Conflict(
            "You can review your hospital once you have been discharged", code="booking_not_completed"
        )
    await _check_doctor(db, body.doctor_id, booking.hospital_id)
    existing = (
        await db.execute(select(Review.id).where(Review.booking_id == booking.id))
    ).scalar_one_or_none()
    if existing is not None:
        raise Conflict("You have already reviewed this booking", code="review_exists")
    review = Review(
        hospital_id=booking.hospital_id,
        doctor_id=body.doctor_id,
        patient_id=profile.id,
        case_id=booking.case_id,
        booking_id=booking.id,
        procedure_id=booking.procedure_id,
        rating=body.rating,
        title=body.title,
        body=body.body,
        status=ReviewStatus.PENDING,
    )
    db.add(review)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise Conflict("You have already reviewed this booking", code="review_exists") from exc
    await audit_log(
        db,
        actor=user,
        action="review.submit",
        entity_type="review",
        entity_id=review.id,
        after={"booking_id": booking.id, "hospital_id": booking.hospital_id, "rating": body.rating},
        request=request,
    )
    await publish(
        db,
        "review.submitted",
        {
            "review_id": str(review.id),
            "hospital_id": str(review.hospital_id),
            "doctor_id": str(review.doctor_id) if review.doctor_id else None,
            "patient_id": str(profile.id),
            "patient_user_id": str(user.id),
            "booking_id": str(booking.id),
            "rating": review.rating,
        },
    )
    await db.commit()
    await db.refresh(review)
    return (await _patient_review_outs(db, [review]))[0]


async def list_my_reviews(db: AsyncSession, user: User) -> list[PatientReviewOut]:
    profile = await _patient_profile(db, user)
    reviews = list(
        (
            await db.execute(
                select(Review)
                .where(Review.patient_id == profile.id)
                .order_by(Review.created_at.desc(), Review.id.desc())
                .limit(200)
            )
        ).scalars()
    )
    return await _patient_review_outs(db, reviews)


async def reviewable_bookings(db: AsyncSession, user: User) -> list[ReviewableBookingOut]:
    """Completed bookings of the patient without a review yet (newest first)."""
    profile = await _patient_profile(db, user)
    reviewed = select(Review.id).where(Review.booking_id == Booking.id).exists()
    bookings = list(
        (
            await db.execute(
                select(Booking)
                .where(Booking.patient_id == profile.id, Booking.status == BookingStatus.COMPLETED, ~reviewed)
                .order_by(Booking.completed_at.desc().nulls_last(), Booking.id.desc())
                .limit(100)
            )
        ).scalars()
    )
    if not bookings:
        return []
    hospitals = {
        h.id: h
        for h in (
            await db.execute(select(Hospital).where(Hospital.id.in_({b.hospital_id for b in bookings})))
        ).scalars()
    }
    doctor_ids = {b.doctor_id for b in bookings if b.doctor_id}
    doctors = (
        {d.id: d for d in (await db.execute(select(Doctor).where(Doctor.id.in_(doctor_ids)))).scalars()}
        if doctor_ids
        else {}
    )
    proc_ids = {b.procedure_id for b in bookings if b.procedure_id}
    procs = (
        {p.id: p for p in (await db.execute(select(Procedure).where(Procedure.id.in_(proc_ids)))).scalars()}
        if proc_ids
        else {}
    )
    out: list[ReviewableBookingOut] = []
    for b in bookings:
        h = hospitals.get(b.hospital_id)
        if h is None:
            continue
        d = doctors.get(b.doctor_id) if b.doctor_id else None
        p = procs.get(b.procedure_id) if b.procedure_id else None
        out.append(
            ReviewableBookingOut(
                booking_id=b.id,
                booking_number=b.booking_number,
                hospital=IdSlugName(id=h.id, slug=h.slug, name=h.name),
                doctor=NameRef(id=d.id, name=d.full_name) if d else None,
                procedure=IdSlugName(id=p.id, slug=p.slug, name=p.name) if p else None,
                admission_date=b.admission_date,
                discharge_date=b.discharge_date,
                completed_at=b.completed_at,
            )
        )
    return out


async def _own_pending_review(db: AsyncSession, user: User, review_id: uuid.UUID) -> Review:
    profile = await _patient_profile(db, user)
    review = await db.get(Review, review_id)
    if review is None or review.patient_id != profile.id:
        raise NotFound("Review not found")
    if review.status != ReviewStatus.PENDING:
        raise Conflict(
            "Only reviews that are still waiting for moderation can be changed", code="review_not_editable"
        )
    return review


async def update_my_review(
    db: AsyncSession, user: User, review_id: uuid.UUID, body: ReviewUpdateIn, request: Request
) -> PatientReviewOut:
    review = await _own_pending_review(db, user, review_id)
    changes: dict[str, Any] = body.model_dump(exclude_unset=True)
    if "doctor_id" in changes:
        await _check_doctor(db, changes["doctor_id"], review.hospital_id)
    before = {k: getattr(review, k) for k in changes}
    for key, value in changes.items():
        setattr(review, key, value)
    if changes:
        await audit_log(
            db,
            actor=user,
            action="review.update",
            entity_type="review",
            entity_id=review.id,
            before=before,
            after=changes,
            request=request,
        )
    await db.commit()
    await db.refresh(review)
    return (await _patient_review_outs(db, [review]))[0]


async def delete_my_review(db: AsyncSession, user: User, review_id: uuid.UUID, request: Request) -> None:
    review = await _own_pending_review(db, user, review_id)
    await audit_log(
        db,
        actor=user,
        action="review.delete",
        entity_type="review",
        entity_id=review.id,
        before={"booking_id": review.booking_id, "hospital_id": review.hospital_id, "rating": review.rating},
        request=request,
    )
    await db.delete(review)
    await db.commit()


# ----------------------------------------------------------------------------- reviews: staff
async def _admin_review_outs(db: AsyncSession, reviews: list[Review]) -> list[AdminReviewOut]:
    base = await catalog.review_outs(db, reviews)
    booking_ids = {r.booking_id for r in reviews if r.booking_id}
    numbers: dict[uuid.UUID, str] = {}
    if booking_ids:
        numbers = dict(
            (
                await db.execute(
                    select(Booking.id, Booking.booking_number).where(Booking.id.in_(booking_ids))
                )
            ).all()
        )
    return [
        AdminReviewOut(
            **out.model_dump(),
            booking_id=r.booking_id,
            booking_number=numbers.get(r.booking_id) if r.booking_id else None,
            patient_id=r.patient_id,
            moderation_reason=r.moderation_reason,
            moderated_at=r.moderated_at,
            moderated_by_user_id=r.moderated_by_user_id,
            updated_at=r.updated_at,
        )
        for r, out in zip(reviews, base, strict=True)
    ]


async def list_admin_reviews(
    db: AsyncSession,
    params: Any,
    *,
    status: ReviewStatus | None = None,
    hospital_id: uuid.UUID | None = None,
    doctor_id: uuid.UUID | None = None,
) -> Page[AdminReviewOut]:
    stmt = select(Review)
    if status is not None:
        stmt = stmt.where(Review.status == status)
    if hospital_id is not None:
        stmt = stmt.where(Review.hospital_id == hospital_id)
    if doctor_id is not None:
        stmt = stmt.where(Review.doctor_id == doctor_id)
    # Oldest pending first is the moderation queue order; other lists newest first.
    order = (
        (Review.created_at.asc(), Review.id.asc())
        if status == ReviewStatus.PENDING
        else (Review.created_at.desc(), Review.id.desc())
    )

    async def _transform(rows: list[Review]) -> list[AdminReviewOut]:
        return await _admin_review_outs(db, rows)

    return await paginate(db, stmt.order_by(*order), params, transform=_transform)


async def moderate_review(
    db: AsyncSession, actor: User, review_id: uuid.UUID, body: ReviewModerateIn, request: Request
) -> AdminReviewOut:
    review = await db.get(Review, review_id)
    if review is None:
        raise NotFound("Review not found")
    target = ReviewStatus(body.status)
    before = {"status": str(review.status), "moderation_reason": review.moderation_reason}
    now = _now()
    review.status = target
    review.moderated_at = now
    review.moderated_by_user_id = actor.id
    review.moderation_reason = body.reason
    if target == ReviewStatus.PUBLISHED and review.published_at is None:
        review.published_at = now
    await db.flush()
    await recompute_ratings(db, [review.hospital_id])
    await audit_log(
        db,
        actor=actor,
        action="review.moderate",
        entity_type="review",
        entity_id=review.id,
        before=before,
        after={"status": target.value, "moderation_reason": body.reason},
        request=request,
    )
    await publish(
        db,
        "review.moderated",
        {
            "review_id": str(review.id),
            "hospital_id": str(review.hospital_id),
            "doctor_id": str(review.doctor_id) if review.doctor_id else None,
            "patient_id": str(review.patient_id),
            "status": target.value,
        },
    )
    await db.commit()
    await catalog.invalidate_catalog_cache()
    await db.refresh(review)
    return (await _admin_review_outs(db, [review]))[0]


# ----------------------------------------------------------------------------- accreditations
def accreditation_out(acc: HospitalAccreditation) -> AccreditationOut:
    today = catalog.today_ist()
    verified = acc.verified_at is not None
    return AccreditationOut(
        id=acc.id,
        hospital_id=acc.hospital_id,
        body=acc.body,
        certificate_number=acc.certificate_number,
        valid_until=acc.valid_until,
        document_id=acc.document_id,
        verified=verified,
        verified_at=acc.verified_at,
        verified_by_admin_id=acc.verified_by_admin_id,
        is_public=verified and (acc.valid_until is None or acc.valid_until >= today),
        created_at=acc.created_at,
        updated_at=acc.updated_at,
    )


async def _check_document(db: AsyncSession, document_id: uuid.UUID | None, hospital_id: uuid.UUID) -> None:
    if document_id is None:
        return
    doc = await db.get(Document, document_id)
    if doc is None or doc.deleted_at is not None or doc.hospital_id not in (None, hospital_id):
        raise BadRequest("Certificate document not found", code="invalid_document")


async def _ensure_body_free(
    db: AsyncSession, hospital_id: uuid.UUID, body: str, exclude: uuid.UUID | None = None
) -> None:
    stmt = select(HospitalAccreditation.id).where(
        HospitalAccreditation.hospital_id == hospital_id, HospitalAccreditation.body == body
    )
    if exclude is not None:
        stmt = stmt.where(HospitalAccreditation.id != exclude)
    if (await db.execute(stmt)).first() is not None:
        raise Conflict(
            f"This hospital already has a {body.upper()} accreditation", code="duplicate_accreditation"
        )


def _snapshot(acc: HospitalAccreditation) -> dict[str, Any]:
    return {
        "body": acc.body,
        "certificate_number": acc.certificate_number,
        "valid_until": acc.valid_until,
        "document_id": acc.document_id,
        "verified_at": acc.verified_at,
    }


async def list_accreditations(db: AsyncSession, hospital_id: uuid.UUID) -> list[AccreditationOut]:
    rows = (
        await db.execute(
            select(HospitalAccreditation)
            .where(HospitalAccreditation.hospital_id == hospital_id)
            .order_by(HospitalAccreditation.body, HospitalAccreditation.id)
        )
    ).scalars()
    return [accreditation_out(a) for a in rows]


async def get_accreditation(
    db: AsyncSession, accreditation_id: uuid.UUID, hospital_id: uuid.UUID | None = None
) -> HospitalAccreditation:
    acc = await db.get(HospitalAccreditation, accreditation_id)
    if acc is None or (hospital_id is not None and acc.hospital_id != hospital_id):
        raise NotFound("Accreditation not found")
    return acc


async def _commit(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise Conflict(
            "This hospital already has that accreditation", code="duplicate_accreditation"
        ) from exc
    await catalog.invalidate_catalog_cache()


async def create_accreditation(
    db: AsyncSession, actor: User, hospital_id: uuid.UUID, body: AccreditationIn, request: Request
) -> AccreditationOut:
    if await db.get(Hospital, hospital_id) is None:
        raise NotFound("Hospital not found")
    await _ensure_body_free(db, hospital_id, body.body)
    await _check_document(db, body.document_id, hospital_id)
    acc = HospitalAccreditation(hospital_id=hospital_id, **body.model_dump())
    db.add(acc)
    await db.flush()
    await audit_log(
        db,
        actor=actor,
        action="accreditation.create",
        entity_type="hospital_accreditation",
        entity_id=acc.id,
        after={"hospital_id": hospital_id, **_snapshot(acc)},
        request=request,
    )
    await _commit(db)
    await db.refresh(acc)
    return accreditation_out(acc)


async def update_accreditation(
    db: AsyncSession, actor: User, acc: HospitalAccreditation, body: AccreditationPatch, request: Request
) -> AccreditationOut:
    changes: dict[str, Any] = body.model_dump(exclude_unset=True)
    if "body" in changes and changes["body"] != acc.body:
        await _ensure_body_free(db, acc.hospital_id, changes["body"], exclude=acc.id)
    if "document_id" in changes:
        await _check_document(db, changes["document_id"], acc.hospital_id)
    before = _snapshot(acc)
    changed = {k: v for k, v in changes.items() if getattr(acc, k) != v}
    for key, value in changed.items():
        setattr(acc, key, value)
    if changed and acc.verified_at is not None:
        # The admin checked the old certificate details, not these.
        acc.verified_at = None
        acc.verified_by_admin_id = None
    if changed:
        await audit_log(
            db,
            actor=actor,
            action="accreditation.update",
            entity_type="hospital_accreditation",
            entity_id=acc.id,
            before=before,
            after=_snapshot(acc),
            request=request,
        )
    await _commit(db)
    await db.refresh(acc)
    return accreditation_out(acc)


async def delete_accreditation(
    db: AsyncSession, actor: User, acc: HospitalAccreditation, request: Request
) -> None:
    await audit_log(
        db,
        actor=actor,
        action="accreditation.delete",
        entity_type="hospital_accreditation",
        entity_id=acc.id,
        before={"hospital_id": acc.hospital_id, **_snapshot(acc)},
        request=request,
    )
    await db.delete(acc)
    await _commit(db)


async def set_accreditation_verified(
    db: AsyncSession, actor: User, acc: HospitalAccreditation, verified: bool, request: Request
) -> AccreditationOut:
    before = _snapshot(acc)
    if verified:
        if acc.valid_until is not None and acc.valid_until < catalog.today_ist():
            raise BadRequest("This certificate has expired", code="accreditation_expired")
        acc.verified_at = _now()
        acc.verified_by_admin_id = actor.id
    else:
        acc.verified_at = None
        acc.verified_by_admin_id = None
    await audit_log(
        db,
        actor=actor,
        action="accreditation.verify" if verified else "accreditation.unverify",
        entity_type="hospital_accreditation",
        entity_id=acc.id,
        before=before,
        after=_snapshot(acc),
        request=request,
    )
    await _commit(db)
    await db.refresh(acc)
    return accreditation_out(acc)
