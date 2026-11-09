"""Agent portal business logic (PLAN 8.10).

Scoping: an agent sees patients it manages (``managed_by_agent_id``) or referred (``referred_by_agent_id``)
and the cases of those patients plus cases created with its ``agent_id``. Anything else is 404.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, get_args

from fastapi import Request
from sqlalchemy import ColumnElement, Select, and_, func, literal_column, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.currency import default_currency_for_country
from app.core.deps import PageQuery
from app.core.enums import (
    AgentStatus,
    BookingStatus,
    CaseStatus,
    DocumentKind,
    KycStatus,
    PayeeType,
    SettlementItemStatus,
    UserRole,
    UserStatus,
    VerificationPurpose,
)
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.jobs import enqueue
from app.core.pagination import Page, paginate
from app.core.security import new_opaque_token
from app.models import (
    Agent,
    Booking,
    Case,
    Document,
    Hospital,
    PatientProfile,
    Screening,
    SettlementItem,
    User,
    VerificationToken,
)
from app.models.sequences import IST
from app.modules.agents.consent import attest_patient_consent, consent_states
from app.modules.agents.schemas import (
    AgentCommissionOut,
    AgentCommissionStatusCounts,
    AgentConsentAttestationIn,
    AgentConsentStatus,
    AgentDashboardOut,
    AgentMonthPoint,
    AgentPatientCounts,
    AgentPatientCreate,
    AgentPatientOut,
    AgentPatientUpdate,
    AgentProfileIn,
    AgentProfileOut,
    ReferralOut,
)
from app.modules.agents.views import build_case_outs
from app.modules.messaging.notifications import notify_many
from app.modules.messaging.policies import staff_user_ids

KYC_DOCUMENT_KINDS: tuple[str, ...] = (
    DocumentKind.KYC_REGISTRATION.value,
    DocumentKind.KYC_ACCREDITATION.value,
    DocumentKind.KYC_PAN.value,
    DocumentKind.KYC_GST.value,
    DocumentKind.KYC_ID_PROOF.value,
    DocumentKind.BANK_PROOF.value,
)
INVITE_TTL_HOURS = 72
DASHBOARD_MONTHS = 6
RECENT_CASES = 5
ACTIVE_CASE_STATUSES = (
    CaseStatus.ENQUIRY,
    CaseStatus.QUOTED,
    CaseStatus.ACCEPTED,
    CaseStatus.BOOKED,
    CaseStatus.IN_TREATMENT,
)
CONVERTED_BOOKING_STATUSES = (BookingStatus.CONFIRMED, BookingStatus.ADMITTED, BookingStatus.COMPLETED)
PENDING_ITEM_STATUSES = (
    SettlementItemStatus.PENDING,
    SettlementItemStatus.ELIGIBLE,
    SettlementItemStatus.ON_HOLD,
    SettlementItemStatus.BATCHED,
)


# -------------------------------------------------------------------------------------------------- scoping
async def get_agent(db: AsyncSession, user: User) -> Agent:
    agent = (await db.execute(select(Agent).where(Agent.user_id == user.id))).scalar_one_or_none()
    if agent is None:
        raise NotFound("Agent profile not found", code="agent_not_found")
    return agent


def patient_scope(agent: Agent) -> ColumnElement[bool]:
    return or_(
        PatientProfile.managed_by_agent_id == agent.id, PatientProfile.referred_by_agent_id == agent.id
    )


def case_scope(agent: Agent) -> ColumnElement[bool]:
    return or_(
        Case.agent_id == agent.id,
        Case.patient_id.in_(select(PatientProfile.id).where(patient_scope(agent))),
    )


def _require_operational(agent: Agent) -> None:
    status = str(getattr(agent.status, "value", agent.status))
    if status != AgentStatus.ACTIVE.value:
        raise Forbidden(
            "Your agency must be approved before you can add or edit patients", code="agent_not_active"
        )


# -------------------------------------------------------------------------------------------------- profile
async def _kyc_documents_count(db: AsyncSession, agent: Agent) -> int:
    stmt = (
        select(func.count())
        .select_from(Document)
        .where(
            Document.deleted_at.is_(None),
            Document.kind.in_(KYC_DOCUMENT_KINDS),
            or_(
                Document.agent_id == agent.id,
                and_(Document.owner_user_id == agent.user_id, Document.patient_id.is_(None)),
            ),
        )
    )
    return int((await db.execute(stmt)).scalar_one())


async def profile_out(db: AsyncSession, agent: Agent) -> AgentProfileOut:
    user = await db.get(User, agent.user_id)
    out = AgentProfileOut.model_validate(agent)
    out.full_name = user.full_name if user else None
    out.email = user.email if user else None
    out.kyc_documents_count = await _kyc_documents_count(db, agent)
    return out


async def update_profile(
    db: AsyncSession, user: User, body: AgentProfileIn, request: Request | None = None
) -> AgentProfileOut:
    agent = await get_agent(db, user)
    changes = body.model_dump(exclude_unset=True)
    if "agency_name" in changes and changes["agency_name"] is None:
        raise BadRequest("Agency name cannot be empty", code="invalid_agency_name")
    before = {k: getattr(agent, k) for k in changes if k != "full_name"}
    full_name = changes.pop("full_name", None)
    for key, value in changes.items():
        setattr(agent, key, value)
    if full_name:
        before["full_name"] = user.full_name
        user.full_name = full_name
    await audit_log(
        db,
        actor=user,
        action="agent.profile_update",
        entity_type="agent",
        entity_id=agent.id,
        before=before,
        after={**changes, **({"full_name": full_name} if full_name else {})},
        request=request,
    )
    await db.commit()
    return await profile_out(db, agent)


async def submit_kyc(db: AsyncSession, user: User, request: Request | None = None) -> AgentProfileOut:
    agent = await get_agent(db, user)
    kyc = str(getattr(agent.kyc_status, "value", agent.kyc_status))
    if kyc == KycStatus.APPROVED.value:
        raise Conflict("KYC is already approved", code="kyc_already_approved")
    if kyc == KycStatus.PENDING.value:
        return await profile_out(db, agent)  # idempotent re-submit
    if await _kyc_documents_count(db, agent) < 1:
        raise BadRequest(
            "Upload at least one KYC document before submitting",
            code="kyc_documents_required",
            details={"accepted_kinds": list(KYC_DOCUMENT_KINDS)},
        )
    agent.kyc_status = KycStatus.PENDING
    await audit_log(
        db,
        actor=user,
        action="agent.kyc_submit",
        entity_type="agent",
        entity_id=agent.id,
        before={"kyc_status": kyc},
        after={"kyc_status": KycStatus.PENDING.value},
        request=request,
    )
    await notify_many(
        db,
        await staff_user_ids(db, [UserRole.ADMIN]),
        "agent.kyc_submitted",
        "Agent KYC submitted",
        f"{agent.agency_name} ({agent.agent_code}) submitted KYC documents for review.",
        {"agent_id": str(agent.id), "link": f"/agents/{agent.id}"},
        dedupe_key=f"agent.kyc_submitted:{agent.id}:{datetime.now(UTC).date().isoformat()}",
        email=False,
    )
    await db.commit()
    return await profile_out(db, agent)


def referral(agent: Agent) -> ReferralOut:
    return ReferralOut(
        agent_code=agent.agent_code,
        referral_url=f"{settings.PATIENT_WEB_URL.rstrip('/')}/register?ref={agent.agent_code}",
    )


# ------------------------------------------------------------------------------------------------ dashboard
def _as_month_map(rows: Any) -> dict[str, int]:
    return {str(month): int(value or 0) for month, value in rows}


def _month_starts(months: int, now: datetime) -> list[date]:
    starts: list[date] = []
    year, month = now.year, now.month
    for _ in range(months):
        starts.append(date(year, month, 1))
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return list(reversed(starts))


async def dashboard(db: AsyncSession, user: User) -> AgentDashboardOut:
    agent = await get_agent(db, user)
    scope = case_scope(agent)

    patients_total = int(
        (
            await db.execute(select(func.count()).select_from(PatientProfile).where(patient_scope(agent)))
        ).scalar_one()
    )
    total_cases = int((await db.execute(select(func.count()).select_from(Case).where(scope))).scalar_one())
    active_cases = int(
        (
            await db.execute(
                select(func.count()).select_from(Case).where(scope, Case.status.in_(ACTIVE_CASE_STATUSES))
            )
        ).scalar_one()
    )
    booking_base = select(Booking).join(Case, Case.id == Booking.case_id).where(scope)
    bookings_confirmed = int(
        (
            await db.execute(
                select(func.count()).select_from(
                    booking_base.where(Booking.status.in_(CONVERTED_BOOKING_STATUSES)).subquery()
                )
            )
        ).scalar_one()
    )
    converted_cases = int(
        (
            await db.execute(
                select(func.count(func.distinct(Booking.case_id)))
                .select_from(Booking)
                .join(Case, Case.id == Booking.case_id)
                .where(scope, Booking.status.in_(CONVERTED_BOOKING_STATUSES))
            )
        ).scalar_one()
    )

    item_scope = and_(SettlementItem.payee_type == PayeeType.AGENT, SettlementItem.payee_id == agent.id)
    pending = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(SettlementItem.net_minor), 0)).where(
                    item_scope, SettlementItem.status.in_(PENDING_ITEM_STATUSES)
                )
            )
        ).scalar_one()
    )
    paid = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(SettlementItem.net_minor), 0)).where(
                    item_scope, SettlementItem.status == SettlementItemStatus.PAID
                )
            )
        ).scalar_one()
    )

    now = datetime.now(UTC)
    starts = _month_starts(DASHBOARD_MONTHS, now)
    since = datetime(starts[0].year, starts[0].month, 1, tzinfo=UTC)
    keys = [s.strftime("%Y-%m") for s in starts]

    def month_expr(col: Any) -> Any:
        # Literal (not bound) arguments so SELECT and GROUP BY render the identical expression.
        return func.to_char(
            func.date_trunc(literal_column("'month'"), func.timezone(literal_column("'UTC'"), col)),
            literal_column("'YYYY-MM'"),
        )

    cases_by_month: dict[str, int] = _as_month_map(
        (
            await db.execute(
                select(month_expr(Case.created_at), func.count())
                .where(scope, Case.created_at >= since)
                .group_by(month_expr(Case.created_at))
            )
        ).all()
    )
    bookings_by_month: dict[str, int] = _as_month_map(
        (
            await db.execute(
                select(month_expr(Booking.confirmed_at), func.count())
                .join(Case, Case.id == Booking.case_id)
                .where(scope, Booking.confirmed_at.is_not(None), Booking.confirmed_at >= since)
                .group_by(month_expr(Booking.confirmed_at))
            )
        ).all()
    )
    commission_by_month: dict[str, int] = _as_month_map(
        (
            await db.execute(
                select(
                    month_expr(SettlementItem.created_at),
                    func.coalesce(func.sum(SettlementItem.net_minor), 0),
                )
                .where(
                    item_scope,
                    SettlementItem.status != SettlementItemStatus.REVERSED,
                    SettlementItem.created_at >= since,
                )
                .group_by(month_expr(SettlementItem.created_at))
            )
        ).all()
    )
    monthly = [
        AgentMonthPoint(
            month=k,
            cases=int(cases_by_month.get(k, 0)),
            bookings=int(bookings_by_month.get(k, 0)),
            commission_minor=int(commission_by_month.get(k, 0)),
        )
        for k in keys
    ]
    recent = (
        (
            await db.execute(
                select(Case).where(scope).order_by(Case.created_at.desc(), Case.id.desc()).limit(RECENT_CASES)
            )
        )
        .scalars()
        .all()
    )
    return AgentDashboardOut(
        patients_total=patients_total,
        active_cases=active_cases,
        bookings_confirmed=bookings_confirmed,
        commission_pending_minor=pending,
        commission_paid_minor=paid,
        currency=settings.BASE_CURRENCY,
        conversion_rate=round(converted_cases / total_cases, 4) if total_cases else 0.0,
        monthly=monthly,
        recent_cases=await build_case_outs(db, recent),
    )


# ------------------------------------------------------------------------------------------------- patients
def account_activated(user: User | None) -> bool:
    """True once the person behind a managed patient account has taken control of it by ANY method: a
    password (accepted invite / reset), Google sign-in, a verified email or any login. From then on only
    they may change the account email (SEC-056: otherwise the agent re-points the email to itself, accepts
    the new invite and takes over the account)."""
    if user is None:
        return False
    return bool(
        user.password_hash
        or user.google_sub
        or user.email_verified_at is not None
        or user.last_login_at is not None
    )


def _last4(value: str | None) -> str | None:
    if not value:
        return None
    return value[-4:]


async def _patient_outs(db: AsyncSession, agent: Agent, rows: list[PatientProfile]) -> list[AgentPatientOut]:
    if not rows:
        return []
    ids = [p.id for p in rows]
    users = {
        u.id: u
        for u in (await db.execute(select(User).where(User.id.in_([p.user_id for p in rows]))))
        .scalars()
        .all()
    }
    case_counts = dict(
        (
            await db.execute(
                select(Case.patient_id, func.count())
                .where(Case.patient_id.in_(ids))
                .group_by(Case.patient_id)
            )
        ).all()
    )
    active_case_counts = dict(
        (
            await db.execute(
                select(Case.patient_id, func.count())
                .where(Case.patient_id.in_(ids), Case.status.in_(ACTIVE_CASE_STATUSES))
                .group_by(Case.patient_id)
            )
        ).all()
    )
    screening_counts = dict(
        (
            await db.execute(
                select(Screening.patient_id, func.count())
                .where(Screening.patient_id.in_(ids))
                .group_by(Screening.patient_id)
            )
        ).all()
    )
    consents = await consent_states(db, [p.user_id for p in rows])
    out: list[AgentPatientOut] = []
    for p in rows:
        u = users.get(p.user_id)
        out.append(
            AgentPatientOut(
                id=p.id,
                user_id=p.user_id,
                first_name=p.first_name,
                last_name=p.last_name,
                full_name=p.full_name or (u.full_name if u else ""),
                email=u.email if u else None,
                date_of_birth=p.date_of_birth,
                gender=p.gender,
                nationality=p.nationality,
                country_of_residence=p.country_of_residence,
                passport_last4=p.passport_last4,
                passport_expiry=p.passport_expiry,
                phone=p.phone,
                whatsapp=p.whatsapp,
                address=p.address,
                emergency_contact=p.emergency_contact,
                preferred_language=p.preferred_language,
                blood_group=p.blood_group,
                allergies=p.allergies,
                medical_history=p.medical_history,
                insurance_provider=p.insurance_provider,
                insurance_policy_last4=_last4(p.insurance_policy_number),
                referred_by_agent_id=p.referred_by_agent_id,
                managed_by_agent_id=p.managed_by_agent_id,
                preferred_currency=p.preferred_currency,
                is_managed=p.managed_by_agent_id == agent.id,
                account_activated=account_activated(u),
                cases_count=int(case_counts.get(p.id, 0)),
                active_cases_count=int(active_case_counts.get(p.id, 0)),
                screenings_count=int(screening_counts.get(p.id, 0)),
                consent=consents[p.user_id],
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
        )
    return out


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@dataclass(frozen=True)
class PatientListFilters:
    """``GET /agent-portal/patients`` filters (all optional, combined with AND)."""

    q: str | None = None
    #: consent states (``AgentConsentStatus`` values); computed per patient, so matched in Python
    consent: tuple[str, ...] = ()
    #: ISO-3166 alpha-2 nationality codes
    nationality: tuple[str, ...] = ()
    #: True: at least one case in an open status; False: none
    has_active_case: bool | None = None
    #: inclusive IST calendar dates on ``created_at``
    created_from: date | None = None
    created_to: date | None = None


PATIENT_SORT_FIELDS: dict[str, Any] = {
    "created_at": PatientProfile.created_at,
    "updated_at": PatientProfile.updated_at,
    "name": func.lower(PatientProfile.first_name + " " + PatientProfile.last_name),
}
PATIENT_SORT_PATTERN = r"^-?(" + "|".join(PATIENT_SORT_FIELDS) + r")$"


def _ist_day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=IST)


def _patient_conditions(
    agent: Agent, f: PatientListFilters, *, skip: str | None = None
) -> list[ColumnElement[bool]]:
    """SQL conditions for every filter except ``consent`` (and except ``skip``, for facet counts)."""
    conds: list[ColumnElement[bool]] = [patient_scope(agent)]
    if f.q and f.q.strip():
        term = f"%{_escape_like(f.q.strip())}%"
        conds.append(
            or_(
                PatientProfile.first_name.ilike(term),
                PatientProfile.last_name.ilike(term),
                (PatientProfile.first_name + " " + PatientProfile.last_name).ilike(term),
                User.email.ilike(term),
                PatientProfile.phone.ilike(term),
            )
        )
    if f.nationality and skip != "nationality":
        conds.append(func.upper(PatientProfile.nationality).in_([n.upper() for n in f.nationality]))
    if f.has_active_case is not None:
        active = (
            select(Case.id)
            .where(Case.patient_id == PatientProfile.id, Case.status.in_(ACTIVE_CASE_STATUSES))
            .exists()
        )
        conds.append(active if f.has_active_case else ~active)
    if f.created_from is not None:
        conds.append(PatientProfile.created_at >= _ist_day_start(f.created_from))
    if f.created_to is not None:
        conds.append(PatientProfile.created_at < _ist_day_start(f.created_to + timedelta(days=1)))
    return conds


async def _consent_by_patient(
    db: AsyncSession, conds: list[ColumnElement[bool]]
) -> list[tuple[uuid.UUID, str | None, str]]:
    """(patient id, nationality, consent status) for every patient matching ``conds``."""
    rows = (
        await db.execute(
            select(PatientProfile.id, PatientProfile.user_id, PatientProfile.nationality)
            .join(User, User.id == PatientProfile.user_id)
            .where(*conds)
        )
    ).all()
    states = await consent_states(db, [user_id for _, user_id, _ in rows])
    return [(pid, nationality, states[user_id].status) for pid, user_id, nationality in rows]


async def _patients_query(
    db: AsyncSession, agent: Agent, f: PatientListFilters, sort: str | None = None
) -> Select[Any]:
    conds = _patient_conditions(agent, f)
    if f.consent:
        wanted = set(f.consent)
        matching = [pid for pid, _, status in await _consent_by_patient(db, conds) if status in wanted]
        conds.append(PatientProfile.id.in_(matching))
    stmt = select(PatientProfile).join(User, User.id == PatientProfile.user_id).where(*conds)
    sort = sort or "-created_at"
    column = PATIENT_SORT_FIELDS.get(sort.lstrip("-"), PatientProfile.created_at)
    if sort.startswith("-"):
        return stmt.order_by(column.desc(), PatientProfile.id.desc())
    return stmt.order_by(column.asc(), PatientProfile.id.asc())


async def list_patients(
    db: AsyncSession,
    user: User,
    params: PageQuery,
    filters: PatientListFilters | str | None = None,
    sort: str | None = None,
) -> Page[AgentPatientOut]:
    agent = await get_agent(db, user)
    if not isinstance(filters, PatientListFilters):  # legacy: the search text
        filters = PatientListFilters(q=filters)

    async def transform(rows: list[PatientProfile]) -> list[AgentPatientOut]:
        return await _patient_outs(db, agent, rows)

    stmt = await _patients_query(db, agent, filters, sort)
    return await paginate(db, stmt, params, transform=transform)


async def patient_counts(db: AsyncSession, user: User, filters: PatientListFilters) -> AgentPatientCounts:
    """Patients per consent status (consent filter ignored) and per nationality (its filter ignored)."""
    agent = await get_agent(db, user)
    counts: dict[str, int] = dict.fromkeys(get_args(AgentConsentStatus), 0)
    for _, _, status in await _consent_by_patient(db, _patient_conditions(agent, filters)):
        counts[status] = counts.get(status, 0) + 1
    wanted = set(filters.consent)
    nationalities: dict[str, int] = {}
    for _, nationality, status in await _consent_by_patient(
        db, _patient_conditions(agent, filters, skip="nationality")
    ):
        if nationality and (not wanted or status in wanted):
            code = nationality.upper()
            nationalities[code] = nationalities.get(code, 0) + 1
    return AgentPatientCounts(counts=counts, total=sum(counts.values()), nationalities=nationalities)


async def _get_scoped_patient(db: AsyncSession, agent: Agent, patient_id: uuid.UUID) -> PatientProfile:
    patient = (
        await db.execute(select(PatientProfile).where(PatientProfile.id == patient_id, patient_scope(agent)))
    ).scalar_one_or_none()
    if patient is None:
        raise NotFound("Patient not found")
    return patient


async def get_patient(db: AsyncSession, user: User, patient_id: uuid.UUID) -> AgentPatientOut:
    agent = await get_agent(db, user)
    patient = await _get_scoped_patient(db, agent, patient_id)
    return (await _patient_outs(db, agent, [patient]))[0]


async def _email_taken(db: AsyncSession, email: str, exclude_user_id: uuid.UUID | None = None) -> bool:
    stmt = select(User.id).where(func.lower(User.email) == email.lower())
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    return (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None


async def _send_invite(db: AsyncSession, agent: Agent, patient_user: User, inviter: User) -> None:
    if not patient_user.email:
        return
    raw, token_hash = new_opaque_token()
    db.add(
        VerificationToken(
            user_id=patient_user.id,
            purpose=VerificationPurpose.INVITE,
            token_hash=token_hash,
            expires_at=datetime.now(UTC) + timedelta(hours=INVITE_TTL_HOURS),
        )
    )
    # One-time token in the URL fragment: never sent to servers or in Referer (INTEGRATION_BACKLOG #22).
    url = f"{settings.PUBLIC_SITE_URL.rstrip('/')}/accept-invite#token={raw}"
    await enqueue(
        db,
        "email.send",
        {
            "to": patient_user.email,
            "subject": f"{agent.agency_name} invited you to Heal India Global",
            "template": "invite.html",
            "context": {
                "name": patient_user.full_name,
                "url": url,
                "inviter_name": inviter.full_name or agent.agency_name,
                "organization_name": agent.agency_name,
                "role": "patient",
                "expires_hours": INVITE_TTL_HOURS,
            },
        },
    )


async def create_patient(
    db: AsyncSession, user: User, body: AgentPatientCreate, request: Request | None = None
) -> AgentPatientOut:
    agent = await get_agent(db, user)
    _require_operational(agent)
    email = str(body.email).strip().lower() if body.email else None
    if email and await _email_taken(db, email):
        raise Conflict("An account with this email already exists", code="email_taken")
    full_name = f"{body.first_name} {body.last_name}".strip()
    patient_user = User(
        email=email,
        phone=body.phone,
        password_hash=None,
        full_name=full_name,
        role=UserRole.PATIENT,
        status=UserStatus.ACTIVE,
        country_code=body.nationality,
        preferred_language="en",
        is_guest=False,
    )
    db.add(patient_user)
    profile = PatientProfile(
        user_id=patient_user.id,
        first_name=body.first_name,
        last_name=body.last_name,
        date_of_birth=body.date_of_birth,
        gender=body.gender,
        nationality=body.nationality,
        country_of_residence=body.nationality,
        phone=body.phone,
        medical_history=body.medical_history,
        managed_by_agent_id=agent.id,
        referred_by_agent_id=agent.id,
        preferred_language="en",
        preferred_currency=await default_currency_for_country(db, body.nationality),
    )
    db.add(profile)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise Conflict("An account with this email already exists", code="email_taken") from exc
    await _send_invite(db, agent, patient_user, user)
    await attest_patient_consent(
        db,
        actor=user,
        agent=agent,
        patient_user=patient_user,
        body=body,
        request=request,
    )
    await audit_log(
        db,
        actor=user,
        action="agent.patient_create",
        entity_type="patient_profile",
        entity_id=profile.id,
        after={"user_id": str(patient_user.id), "agent_id": str(agent.id), "invited": bool(email)},
        request=request,
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise Conflict("An account with this email already exists", code="email_taken") from exc
    return (await _patient_outs(db, agent, [profile]))[0]


async def attest_consent(
    db: AsyncSession,
    user: User,
    patient_id: uuid.UUID,
    body: AgentConsentAttestationIn,
    request: Request | None = None,
) -> AgentPatientOut:
    """(Re-)record the agent's consent attestation for a managed patient (backlog #30)."""
    agent = await get_agent(db, user)
    patient = await _get_scoped_patient(db, agent, patient_id)
    if patient.managed_by_agent_id != agent.id:
        raise Forbidden(
            "Consent can only be recorded for patients managed by your agency", code="patient_not_managed"
        )
    _require_operational(agent)
    patient_user = await db.get(User, patient.user_id)
    if patient_user is None:
        raise NotFound("Patient not found")
    await attest_patient_consent(
        db, actor=user, agent=agent, patient_user=patient_user, body=body, request=request
    )
    await db.commit()
    return (await _patient_outs(db, agent, [patient]))[0]


_PROFILE_FIELDS = (
    "first_name",
    "last_name",
    "date_of_birth",
    "gender",
    "nationality",
    "country_of_residence",
    "passport_expiry",
    "phone",
    "whatsapp",
    "preferred_language",
    "blood_group",
    "allergies",
    "medical_history",
    "insurance_provider",
    "preferred_currency",
)
_NOT_NULL_FIELDS = ("first_name", "last_name", "preferred_currency")


async def update_patient(
    db: AsyncSession,
    user: User,
    patient_id: uuid.UUID,
    body: AgentPatientUpdate,
    request: Request | None = None,
) -> AgentPatientOut:
    agent = await get_agent(db, user)
    patient = await _get_scoped_patient(db, agent, patient_id)
    if patient.managed_by_agent_id != agent.id:
        raise Forbidden("Only patients managed by your agency can be edited", code="patient_not_managed")
    _require_operational(agent)
    changes = body.model_dump(exclude_unset=True)
    for key in _NOT_NULL_FIELDS:
        if key in changes and changes[key] is None:
            raise BadRequest(f"{key} cannot be empty", code="invalid_field", details={"field": key})
    patient_user = await db.get(User, patient.user_id)
    if patient_user is None:
        raise NotFound("Patient not found")
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    for key in _PROFILE_FIELDS:
        if key in changes:
            before[key] = getattr(patient, key)
            setattr(patient, key, changes[key])
            after[key] = changes[key]
    if "preferred_currency" in changes:
        patient.currency_set_by_user = True
    if changes.get("country_of_residence"):
        from app.modules.patients.service import sync_home_country

        await sync_home_country(db, patient_user, patient, changes["country_of_residence"])
        after["preferred_currency"] = patient.preferred_currency
    if "address" in changes:
        before["address"] = patient.address
        patient.address = body.address.model_dump(exclude_none=True) if body.address else None
        after["address"] = patient.address
    if "emergency_contact" in changes:
        before["emergency_contact"] = patient.emergency_contact
        patient.emergency_contact = (
            body.emergency_contact.model_dump(exclude_none=True) if body.emergency_contact else None
        )
        after["emergency_contact"] = patient.emergency_contact
    if "passport_number" in changes:
        patient.passport_number = body.passport_number
        patient.passport_last4 = _last4(body.passport_number)
        after["passport_number"] = "***"
    if "insurance_policy_number" in changes:
        value = (body.insurance_policy_number or "").strip() or None
        patient.insurance_policy_number = value
        after["insurance_policy_number"] = "***"
    if "first_name" in changes or "last_name" in changes:
        patient_user.full_name = patient.full_name
    if "phone" in changes:
        patient_user.phone = changes["phone"]
    resend_invite = False
    if "email" in changes:
        new_email = str(body.email).strip().lower() if body.email else None
        current = (patient_user.email or "").lower() or None
        if new_email != current:
            if account_activated(patient_user):
                raise BadRequest(
                    "The patient has activated their account; only they can change its email",
                    code="email_locked",
                )
            if new_email and await _email_taken(db, new_email, exclude_user_id=patient_user.id):
                raise Conflict("An account with this email already exists", code="email_taken")
            before["email"] = patient_user.email
            patient_user.email = new_email
            patient_user.email_verified_at = None
            after["email"] = new_email
            resend_invite = new_email is not None
    if resend_invite:
        await _send_invite(db, agent, patient_user, user)
    await audit_log(
        db,
        actor=user,
        action="agent.patient_update",
        entity_type="patient_profile",
        entity_id=patient.id,
        before=before,
        after=after,
        request=request,
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise Conflict("An account with this email already exists", code="email_taken") from exc
    return (await _patient_outs(db, agent, [patient]))[0]


# ---------------------------------------------------------------------------------------------- commissions
@dataclass(frozen=True)
class CommissionListFilters:
    """``GET /agent-portal/commissions`` filters (all optional, combined with AND)."""

    status: tuple[SettlementItemStatus, ...] = ()
    hospital_id: uuid.UUID | None = None
    #: booking number, case number, patient or hospital name
    q: str | None = None
    #: inclusive IST calendar dates on the item's ``created_at``
    created_from: date | None = None
    created_to: date | None = None
    #: net amount bounds (minor units, inclusive)
    min_net: int | None = None
    max_net: int | None = None


_PATIENT_NAME = PatientProfile.first_name + " " + PatientProfile.last_name
COMMISSION_SORT_FIELDS: dict[str, Any] = {
    "created_at": SettlementItem.created_at,
    "eligible_at": SettlementItem.eligible_at,
    "net_minor": SettlementItem.net_minor,
    "gross_minor": SettlementItem.gross_minor,
    "status": SettlementItem.status,
    "booking_number": Booking.booking_number,
}
COMMISSION_SORT_PATTERN = r"^-?(" + "|".join(COMMISSION_SORT_FIELDS) + r")$"


def _commission_conditions(
    agent: Agent, f: CommissionListFilters, *, with_status: bool = True
) -> list[ColumnElement[bool]]:
    conds: list[ColumnElement[bool]] = [
        SettlementItem.payee_type == PayeeType.AGENT,
        SettlementItem.payee_id == agent.id,
    ]
    if with_status and f.status:
        conds.append(SettlementItem.status.in_(list(f.status)))
    if f.hospital_id is not None:
        conds.append(Booking.hospital_id == f.hospital_id)
    if f.q and f.q.strip():
        term = f"%{_escape_like(f.q.strip()[:100])}%"
        conds.append(
            or_(
                Booking.booking_number.ilike(term),
                Case.case_number.ilike(term),
                Hospital.name.ilike(term),
                _PATIENT_NAME.ilike(term),
            )
        )
    if f.created_from is not None:
        conds.append(SettlementItem.created_at >= _ist_day_start(f.created_from))
    if f.created_to is not None:
        conds.append(SettlementItem.created_at < _ist_day_start(f.created_to + timedelta(days=1)))
    if f.min_net is not None:
        conds.append(SettlementItem.net_minor >= f.min_net)
    if f.max_net is not None:
        conds.append(SettlementItem.net_minor <= f.max_net)
    return conds


def _commission_joins(stmt: Select[Any]) -> Select[Any]:
    return (
        stmt.outerjoin(Booking, Booking.id == SettlementItem.booking_id)
        .outerjoin(Case, Case.id == Booking.case_id)
        .outerjoin(Hospital, Hospital.id == Booking.hospital_id)
        .outerjoin(PatientProfile, PatientProfile.id == Booking.patient_id)
    )


async def list_commissions(
    db: AsyncSession,
    user: User,
    params: PageQuery,
    filters: CommissionListFilters | SettlementItemStatus | None = None,
    sort: str | None = None,
) -> Page[AgentCommissionOut]:
    agent = await get_agent(db, user)
    if filters is None:
        filters = CommissionListFilters()
    elif not isinstance(filters, CommissionListFilters):  # legacy: a single status
        filters = CommissionListFilters(status=(filters,))
    stmt = _commission_joins(
        select(
            SettlementItem,
            Booking.booking_number,
            Booking.case_id,
            Case.case_number,
            Booking.hospital_id,
            Hospital.name,
            Booking.patient_id,
            _PATIENT_NAME,
        ).select_from(SettlementItem)
    ).where(*_commission_conditions(agent, filters))
    sort = sort or "-created_at"
    column = COMMISSION_SORT_FIELDS.get(sort.lstrip("-"), SettlementItem.created_at)
    if sort.startswith("-"):
        stmt = stmt.order_by(column.desc().nulls_last(), SettlementItem.id.desc())
    else:
        stmt = stmt.order_by(column.asc().nulls_last(), SettlementItem.id.asc())

    def transform(rows: list[Any]) -> list[AgentCommissionOut]:
        out: list[AgentCommissionOut] = []
        for item, booking_number, case_id, case_number, hospital_id, hospital_name, patient_id, name in rows:
            out.append(
                AgentCommissionOut(
                    id=item.id,
                    payee_type=item.payee_type,
                    payee_id=item.payee_id,
                    payee_name=agent.agency_name,
                    booking_id=item.booking_id,
                    booking_number=booking_number,
                    gross_minor=item.gross_minor,
                    commission_minor=item.commission_minor,
                    tax_minor=item.tax_minor,
                    tds_minor=item.tds_minor,
                    net_minor=item.net_minor,
                    currency=item.currency,
                    status=item.status,
                    eligible_at=item.eligible_at,
                    hold_reason=item.hold_reason,
                    batch_id=item.batch_id,
                    created_at=item.created_at,
                    case_id=case_id,
                    case_number=case_number,
                    hospital_id=hospital_id,
                    hospital_name=hospital_name,
                    patient_id=patient_id,
                    patient_name=(name or "").strip() or None,
                )
            )
        return out

    return await paginate(db, stmt, params, transform=transform, scalars=False)


async def commission_status_counts(
    db: AsyncSession, user: User, filters: CommissionListFilters
) -> AgentCommissionStatusCounts:
    """Items and net amount per status for the list filters (the status filter itself ignored)."""
    agent = await get_agent(db, user)
    stmt = _commission_joins(
        select(
            SettlementItem.status, func.count(), func.coalesce(func.sum(SettlementItem.net_minor), 0)
        ).select_from(SettlementItem)
    )
    rows = (
        await db.execute(
            stmt.where(*_commission_conditions(agent, filters, with_status=False)).group_by(
                SettlementItem.status
            )
        )
    ).all()
    counts = {s.value: 0 for s in SettlementItemStatus}
    net = {s.value: 0 for s in SettlementItemStatus}
    for status, count, total in rows:
        key = SettlementItemStatus(status).value
        counts[key] = int(count)
        net[key] = int(total)
    return AgentCommissionStatusCounts(counts=counts, net_minor=net, total=sum(counts.values()))
