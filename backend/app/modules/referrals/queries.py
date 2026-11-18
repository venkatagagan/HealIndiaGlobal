"""Read models for the referral programme (patient screens, admin page)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.config import settings
from app.core.deps import PageQuery
from app.core.money import BASE_CURRENCY
from app.core.pagination import Page, paginate
from app.core.referral_settings import REFERRAL_SETTING_KEY
from app.models import PatientProfile, User
from app.models.referrals import (
    CreditMovementKind,
    PatientCredit,
    PatientCreditKind,
    PatientCreditMovement,
    PatientCreditStatus,
    Referral,
    ReferralCode,
    ReferralStatus,
)
from app.modules.ledger.service import REFERRAL_CREDIT, get_balance
from app.modules.referrals import credits as credit_svc
from app.modules.referrals import service
from app.modules.referrals.schemas import (
    AdminReferralOut,
    CodeCheckOut,
    CreditBalanceOut,
    CreditMovementOut,
    CreditOut,
    CreditsOut,
    MoneyOut,
    MyReferralOut,
    ReferralCreditBrief,
    ReferralOverviewOut,
    ReferralPartyOut,
    ReferralRewardInfo,
    ReferralSettingsOut,
    ReferralSummaryOut,
)

MY_REFERRALS_LIMIT = 100
MOVEMENTS_LIMIT = 100


def _v(value: Any) -> str:
    return str(getattr(value, "value", value))


async def balance_out(db: AsyncSession, profile: PatientProfile) -> CreditBalanceOut:
    base = await credit_svc.available_minor(db, profile.id)
    soon, next_expiry = await credit_svc.expiring_soon(db, profile.id)
    amount, ccy = await service.display_amount(db, base, profile.preferred_currency)
    soon_amount, _ = await service.display_amount(db, soon, ccy)
    return CreditBalanceOut(
        base_amount_minor=base,
        base_currency=BASE_CURRENCY,
        amount_minor=amount,
        currency=ccy,
        expiring_soon_minor=soon_amount,
        next_expiry_at=next_expiry,
    )


async def _reward(
    db: AsyncSession, amounts: dict[str, int], fallback: str, ccy: str | None
) -> MoneyOut | None:
    amount, code, _ = await service.reward_amount(db, amounts, fallback, ccy)
    return MoneyOut(amount_minor=amount, currency=code) if amount > 0 else None


async def overview(db: AsyncSession, profile: PatientProfile, device_id: str | None) -> ReferralOverviewOut:
    """The "Refer a friend" screen. Creates the code on first use and remembers the caller's device (keyed
    hash) for the self-referral check. Commits when it changed something."""
    prog = await service.programme(db)
    code: ReferralCode | None = None
    if prog.enabled:
        code = await service.get_or_create_code(db, profile)
        if service.remember_device(code, device_id) or db.dirty or db.new:
            await db.commit()
    else:
        code = (
            await db.execute(select(ReferralCode).where(ReferralCode.patient_id == profile.id))
        ).scalar_one_or_none()
    links = service.share_links(code.code) if code is not None and prog.enabled else {}
    referred = aliased(PatientProfile)
    rows = (
        await db.execute(
            select(Referral, referred)
            .join(referred, referred.id == Referral.referred_patient_id)
            .where(Referral.referrer_patient_id == profile.id)
            .order_by(Referral.created_at.desc())
            .limit(MY_REFERRALS_LIMIT)
        )
    ).all()
    referral_ids = [r.id for r, _ in rows] or [uuid.uuid4()]
    my_rewards = {
        c.referral_id: c
        for c in (
            await db.execute(
                select(PatientCredit).where(
                    PatientCredit.referral_id.in_(referral_ids),
                    PatientCredit.patient_id == profile.id,
                    PatientCredit.kind == PatientCreditKind.REFERRER_REWARD,
                )
            )
        ).scalars()
    }
    items: list[MyReferralOut] = []
    for referral, friend in rows:
        credit = my_rewards.get(referral.id)
        reward = None
        if credit is not None:
            reward = MoneyOut(
                amount_minor=int(credit.original_amount_minor or credit.amount_minor),
                currency=credit.original_currency or credit.currency,
            )
        items.append(
            MyReferralOut(
                id=referral.id,
                friend_name=service._first_name_initial(friend, None),
                # "qualified" without a reward (yearly cap) is shown as such; no booking details are exposed
                status=referral.status,
                created_at=referral.created_at,
                rewarded_at=referral.rewarded_at if credit is not None else None,
                reward=reward,
            )
        )
    counts_rows = (
        await db.execute(
            select(Referral.status, func.count())
            .where(Referral.referrer_patient_id == profile.id)
            .group_by(Referral.status)
        )
    ).all()
    counts = {s.value: 0 for s in ReferralStatus}
    counts.update({_v(s): int(n) for s, n in counts_rows})
    return ReferralOverviewOut(
        enabled=prog.enabled,
        code=code.code if code is not None and prog.enabled else None,
        share_url=links.get("share_url"),
        patient_web_url=links.get("patient_web_url"),
        app_url=links.get("app_url"),
        rewards=ReferralRewardInfo(
            referrer=(
                await _reward(db, prog.referrer_reward, prog.fallback_currency, profile.preferred_currency)
                if prog.reward_referrer
                else None
            ),
            referee=(
                await _reward(db, prog.referee_reward, prog.fallback_currency, profile.preferred_currency)
                if prog.reward_referee
                else None
            ),
            max_rewards_per_year=prog.max_rewards_per_year,
            credit_validity_days=prog.credit_validity_days,
        ),
        credit=await balance_out(db, profile),
        counts=counts,
        referrals=items,
    )


async def credits_out(db: AsyncSession, profile: PatientProfile) -> CreditsOut:
    balance = await balance_out(db, profile)
    ccy = balance.currency
    credits = (
        (
            await db.execute(
                select(PatientCredit)
                .where(PatientCredit.patient_id == profile.id)
                .order_by(PatientCredit.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    movements = (
        (
            await db.execute(
                select(PatientCreditMovement)
                .where(PatientCreditMovement.patient_id == profile.id)
                .order_by(PatientCreditMovement.created_at.desc(), PatientCreditMovement.id.desc())
                .limit(MOVEMENTS_LIMIT)
            )
        )
        .scalars()
        .all()
    )
    credit_items = []
    for c in credits:
        shown, _ = await service.display_amount(db, int(c.remaining_minor), ccy)
        credit_items.append(
            CreditOut(
                id=c.id,
                kind=c.kind,
                status=c.status,
                amount_minor=c.amount_minor,
                remaining_minor=c.remaining_minor,
                currency=c.currency,
                original_amount_minor=c.original_amount_minor,
                original_currency=c.original_currency,
                display_remaining_minor=shown,
                display_currency=ccy,
                expires_at=c.expires_at,
                created_at=c.created_at,
            )
        )
    movement_items = []
    for m in movements:
        shown, _ = await service.display_amount(db, int(m.amount_minor), ccy)
        movement_items.append(
            CreditMovementOut(
                id=m.id,
                credit_id=m.credit_id,
                kind=m.kind,
                amount_minor=m.amount_minor,
                display_amount_minor=shown,
                display_currency=ccy,
                booking_id=m.booking_id,
                payment_id=m.payment_id,
                created_at=m.created_at,
            )
        )
    return CreditsOut(balance=balance, credits=credit_items, movements=movement_items)


async def check_code(db: AsyncSession, code: str, currency: str | None) -> CodeCheckOut:
    from app.modules.auth.service import agent_code_valid  # lazy: auth imports this module

    prog = await service.programme(db)
    row = await service.lookup_code(db, code)
    if row is not None and prog.enabled:
        reward = (
            await _reward(db, prog.referee_reward, prog.fallback_currency, currency)
            if prog.reward_referee
            else None
        )
        return CodeCheckOut(valid=True, kind="patient", referee_reward=reward)
    if await agent_code_valid(db, code):
        return CodeCheckOut(valid=True, kind="agent", referee_reward=None)
    return CodeCheckOut(valid=False, kind=None, referee_reward=None)


# ------------------------------------------------------------------------------------------------- staff
@dataclass(slots=True)
class ReferralFilters:
    status: tuple[ReferralStatus, ...] = ()
    q: str | None = None


def _admin_query(filters: ReferralFilters) -> Select[Any]:
    referrer = aliased(PatientProfile)
    referred = aliased(PatientProfile)
    referrer_user = aliased(User)
    referred_user = aliased(User)
    stmt = (
        select(Referral)
        .join(referrer, referrer.id == Referral.referrer_patient_id)
        .join(referred, referred.id == Referral.referred_patient_id)
        .join(referrer_user, referrer_user.id == referrer.user_id)
        .join(referred_user, referred_user.id == referred.user_id)
    )
    if filters.status:
        stmt = stmt.where(Referral.status.in_(list(filters.status)))
    if filters.q:
        pattern = "%" + filters.q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        stmt = stmt.where(
            or_(
                Referral.code.ilike(pattern, escape="\\"),
                referrer_user.full_name.ilike(pattern, escape="\\"),
                referred_user.full_name.ilike(pattern, escape="\\"),
                referrer_user.email.ilike(pattern, escape="\\"),
                referred_user.email.ilike(pattern, escape="\\"),
            )
        )
    return stmt


async def _party(db: AsyncSession, patient_id: uuid.UUID) -> ReferralPartyOut:
    profile = await db.get(PatientProfile, patient_id)
    user = await db.get(User, profile.user_id) if profile is not None else None
    name = (profile.full_name if profile is not None else "") or (user.full_name if user else "") or "-"
    return ReferralPartyOut(
        patient_id=patient_id,
        user_id=user.id if user is not None else None,
        name=name,
        email=user.email if user is not None else None,
    )


async def admin_outs(db: AsyncSession, rows: list[Referral]) -> list[AdminReferralOut]:
    ids = [r.id for r in rows] or [uuid.uuid4()]
    credits = (
        (await db.execute(select(PatientCredit).where(PatientCredit.referral_id.in_(ids)))).scalars().all()
    )
    by_referral: dict[uuid.UUID, list[ReferralCreditBrief]] = {}
    for c in credits:
        if c.referral_id is None:
            continue
        by_referral.setdefault(c.referral_id, []).append(
            ReferralCreditBrief(
                id=c.id,
                patient_id=c.patient_id,
                kind=c.kind,
                status=c.status,
                amount_minor=c.amount_minor,
                remaining_minor=c.remaining_minor,
                original_amount_minor=c.original_amount_minor,
                original_currency=c.original_currency,
            )
        )
    out = []
    for r in rows:
        out.append(
            AdminReferralOut(
                id=r.id,
                code=r.code,
                status=r.status,
                channel=r.channel,
                referrer=await _party(db, r.referrer_patient_id),
                referred=await _party(db, r.referred_patient_id),
                created_at=r.created_at,
                expires_at=r.expires_at,
                qualified_at=r.qualified_at,
                rewarded_at=r.rewarded_at,
                voided_at=r.voided_at,
                void_reason=r.void_reason,
                qualifying_booking_id=r.qualifying_booking_id,
                checks=dict(r.checks or {}),
                credits=by_referral.get(r.id, []),
            )
        )
    return out


async def admin_list(db: AsyncSession, params: PageQuery, filters: ReferralFilters) -> Page[AdminReferralOut]:
    stmt = _admin_query(filters).order_by(Referral.created_at.desc(), Referral.id.desc())

    async def _transform(rows: list[Referral]) -> list[AdminReferralOut]:
        return await admin_outs(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


async def admin_get(db: AsyncSession, referral_id: uuid.UUID) -> AdminReferralOut:
    from app.core.errors import NotFound

    referral = await db.get(Referral, referral_id)
    if referral is None:
        raise NotFound("Referral not found")
    return (await admin_outs(db, [referral]))[0]


async def summary(db: AsyncSession) -> ReferralSummaryOut:
    by_status = {s.value: 0 for s in ReferralStatus}
    for status, n in (
        await db.execute(select(Referral.status, func.count()).group_by(Referral.status))
    ).all():
        by_status[_v(status)] = int(n)
    by_channel = {
        _v(ch): int(n)
        for ch, n in (
            await db.execute(select(Referral.channel, func.count()).group_by(Referral.channel))
        ).all()
    }
    sums = {
        _v(kind): int(total or 0)
        for kind, total in (
            await db.execute(
                select(PatientCreditMovement.kind, func.sum(PatientCreditMovement.amount_minor)).group_by(
                    PatientCreditMovement.kind
                )
            )
        ).all()
    }
    outstanding = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(PatientCredit.remaining_minor), 0)).where(
                    PatientCredit.status == PatientCreditStatus.ACTIVE
                )
            )
        ).scalar_one()
    )
    return ReferralSummaryOut(
        by_status=by_status,
        by_channel=by_channel,
        credits_issued_minor=sums.get(CreditMovementKind.GRANT.value, 0),
        credits_redeemed_minor=sums.get(CreditMovementKind.REDEEM.value, 0),
        credits_expired_minor=sums.get(CreditMovementKind.EXPIRE.value, 0),
        credits_voided_minor=sums.get(CreditMovementKind.VOID.value, 0),
        credits_reinstated_minor=sums.get(CreditMovementKind.REINSTATE.value, 0),
        outstanding_minor=outstanding,
        ledger_liability_minor=await get_balance(db, REFERRAL_CREDIT),
        base_currency=BASE_CURRENCY,
    )


async def settings_out(db: AsyncSession) -> ReferralSettingsOut:
    prog = await service.programme(db)
    return ReferralSettingsOut(
        env_enabled=bool(settings.REFERRAL_ENABLED),
        effective_enabled=prog.enabled,
        setting_key=REFERRAL_SETTING_KEY,
        value=prog.as_dict(),
    )
