"""Data-rights hooks for the referral programme (called by app.modules.privacy)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.referrals import PatientCredit, PatientCreditMovement, Referral, ReferralCode


async def export_for_patient(db: AsyncSession, patient_id: uuid.UUID, serialize: Any) -> dict[str, Any]:
    code = (
        await db.execute(select(ReferralCode).where(ReferralCode.patient_id == patient_id))
    ).scalar_one_or_none()
    referrals = (
        (
            await db.execute(
                select(Referral)
                .where(
                    or_(
                        Referral.referrer_patient_id == patient_id, Referral.referred_patient_id == patient_id
                    )
                )
                .order_by(Referral.created_at)
            )
        )
        .scalars()
        .all()
    )
    credits = (
        (await db.execute(select(PatientCredit).where(PatientCredit.patient_id == patient_id)))
        .scalars()
        .all()
    )
    movements = (
        (
            await db.execute(
                select(PatientCreditMovement)
                .where(PatientCreditMovement.patient_id == patient_id)
                .order_by(PatientCreditMovement.created_at)
            )
        )
        .scalars()
        .all()
    )
    return {
        "code": serialize(code, exclude=("device_hashes",)) if code is not None else None,
        # the other party is referenced by id only (their data is theirs)
        "referrals": [serialize(r, exclude=("signup_device_hash", "checks")) for r in referrals],
        "credits": [serialize(c) for c in credits],
        "credit_movements": [serialize(m) for m in movements],
    }


async def erase_for_patient(db: AsyncSession, patient_id: uuid.UUID) -> None:
    """Disable the code, drop device hashes and void unused credit (the account is gone). Referral and credit
    rows are kept (financial records linked to the ledger) but only point at the anonymised patient shell."""
    from app.models.referrals import CreditMovementKind, PatientCreditStatus
    from app.modules.referrals.service import release_credit

    await db.execute(
        update(ReferralCode)
        .where(ReferralCode.patient_id == patient_id)
        .values(device_hashes=[], disabled_at=func.coalesce(ReferralCode.disabled_at, func.now()))
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(Referral)
        .where(or_(Referral.referrer_patient_id == patient_id, Referral.referred_patient_id == patient_id))
        .values(signup_device_hash=None)
        .execution_options(synchronize_session=False)
    )
    active = (
        (
            await db.execute(
                select(PatientCredit)
                .where(
                    PatientCredit.patient_id == patient_id, PatientCredit.status == PatientCreditStatus.ACTIVE
                )
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for credit in active:
        await release_credit(db, credit, kind=CreditMovementKind.VOID, note="account erased")
