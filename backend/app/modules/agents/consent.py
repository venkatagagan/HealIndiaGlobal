"""Consent capture for agent-created patients (INTEGRATION_BACKLOG #30, agent side).

Flow:
1. An agent creating (or later re-confirming) a managed patient must attest that the patient consented to
   the platform terms + privacy policy (optionally also hospital sharing / AI processing / marketing), with
   the method used (in person, phone, ...). The attestation is an append-only ``audit_logs`` row
   (action ``agent.patient_consent_attested``, entity ``user``/<patient user id>) carrying kinds, method,
   version and the agent's IP/user agent.
2. The attestation is deliberately NOT written to ``consents``: those rows are the patient's own consent
   (be-auth, ``POST /auth/consents``). Until the patient confirms each attested kind there, the consent is
   "pending_patient_confirmation"; the patient receives an in-app notification asking to confirm.
3. ``pending_agent_consents(db, user_id)`` lists the attested kinds the patient has not yet confirmed -
   be-auth can call it on login / ``/auth/me`` to force the confirmation screen on first login.

This module only imports core/models at import time so that ``app.modules.auth`` may import it without cycles.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import datetime
from typing import Any

from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.enums import ConsentKind
from app.models import Agent, AuditLog, Consent, User
from app.modules.agents.schemas import AgentConsentAttestationIn, AgentPatientConsentOut

CONSENT_ATTEST_ACTION = "agent.patient_consent_attested"
CONSENT_NOTIFICATION_KIND = "consent.confirmation_required"


def _terms_version() -> str:
    from app.modules.auth.service import TERMS_VERSION  # lazy: keeps auth -> agents imports cycle-free

    return TERMS_VERSION


def _kinds(raw: Any) -> list[ConsentKind]:
    out: list[ConsentKind] = []
    for value in raw or []:
        try:
            out.append(ConsentKind(value))
        except ValueError:
            continue
    return out


async def _latest_attestations(db: AsyncSession, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, AuditLog]:
    if not user_ids:
        return {}
    rows = (
        await db.execute(
            select(AuditLog)
            .where(
                AuditLog.action == CONSENT_ATTEST_ACTION,
                AuditLog.entity_type == "user",
                AuditLog.entity_id.in_([str(u) for u in user_ids]),
            )
            .order_by(AuditLog.entity_id, AuditLog.created_at.desc(), AuditLog.id.desc())
            .ext(distinct_on(AuditLog.entity_id))
        )
    ).scalars()
    return {uuid.UUID(str(row.entity_id)): row for row in rows}


async def _latest_patient_consents(
    db: AsyncSession, user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[ConsentKind, Consent]]:
    """Latest ``consents`` row per (user, kind) - the patient's own effective consent (read-only)."""
    out: dict[uuid.UUID, dict[ConsentKind, Consent]] = {}
    if not user_ids:
        return out
    rows = (
        await db.execute(
            select(Consent)
            # account-wide consents only (case/hospital-scoped rows are separate grants)
            .where(
                Consent.user_id.in_(user_ids),
                Consent.case_id.is_(None),
                Consent.hospital_id.is_(None),
                # SEC-060: rows recorded by someone else (an agent) are not the patient's own confirmation
                or_(Consent.granted_by_user_id.is_(None), Consent.granted_by_user_id == Consent.user_id),
            )
            .order_by(Consent.user_id, Consent.kind, Consent.created_at.desc(), Consent.id.desc())
            .ext(distinct_on(Consent.user_id, Consent.kind))
        )
    ).scalars()
    for row in rows:
        out.setdefault(row.user_id, {})[ConsentKind(row.kind)] = row
    return out


def _state(attestation: AuditLog | None, own: dict[ConsentKind, Consent]) -> AgentPatientConsentOut:
    if attestation is None:
        # No agent attestation (e.g. a referred patient who registered and consented themselves).
        required = (ConsentKind.TERMS, ConsentKind.PRIVACY)
        if all(k in own and own[k].granted for k in required):
            return AgentPatientConsentOut(
                status="confirmed",
                kinds=[k for k, row in own.items() if row.granted],
                patient_confirmed_at=max(own[k].created_at for k in required),
            )
        return AgentPatientConsentOut(status="not_recorded")
    data = attestation.after or {}
    kinds = _kinds(data.get("kinds"))
    withdrawn = [k for k in kinds if k in own and not own[k].granted]
    pending = [k for k in kinds if k not in own]
    confirmed_at: datetime | None = None
    if not pending and not withdrawn and kinds:
        confirmed_at = max(own[k].created_at for k in kinds)
    status = "withdrawn" if withdrawn else ("pending_patient_confirmation" if pending else "confirmed")
    return AgentPatientConsentOut(
        status=status,
        kinds=kinds,
        method=data.get("method"),
        version=data.get("version"),
        attested_at=attestation.created_at,
        attested_by_user_id=attestation.actor_user_id,
        patient_confirmed_at=confirmed_at,
        pending_kinds=pending,
    )


async def consent_states(
    db: AsyncSession, user_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, AgentPatientConsentOut]:
    """Consent state for each patient user id (batched; two queries)."""
    ids = list(dict.fromkeys(user_ids))
    attestations = await _latest_attestations(db, ids)
    own = await _latest_patient_consents(db, ids)
    return {uid: _state(attestations.get(uid), own.get(uid, {})) for uid in ids}


async def pending_agent_consents(db: AsyncSession, user_id: uuid.UUID) -> list[ConsentKind]:
    """Attested consent kinds the patient still has to confirm themselves (empty when none / no attestation).

    Intended for be-auth: show the consent confirmation step on the patient's first login while this is
    non-empty; the patient confirms through ``POST /auth/consents`` (one row per kind).
    """
    return (await consent_states(db, [user_id]))[user_id].pending_kinds


async def attest_patient_consent(
    db: AsyncSession,
    *,
    actor: User,
    agent: Agent,
    patient_user: User,
    body: AgentConsentAttestationIn,
    request: Request | None = None,
) -> AuditLog:
    """Record the agent's attestation (no commit) and ask the patient to confirm it."""
    from app.modules.messaging.notifications import notify

    version = _terms_version()
    entry = await audit_log(
        db,
        actor=actor,
        action=CONSENT_ATTEST_ACTION,
        entity_type="user",
        entity_id=patient_user.id,
        after={
            "agent_id": str(agent.id),
            "kinds": [k.value for k in body.consent_kinds],
            "method": body.consent_method,
            "note": body.consent_note,
            "version": version,
        },
        request=request,
    )
    await notify(
        db,
        patient_user.id,
        CONSENT_NOTIFICATION_KIND,
        "Please confirm your consent",
        (
            f"{agent.agency_name} registered you on Heal India Global and confirmed that you agreed to our "
            "terms and privacy policy. Please review and confirm these consents when you sign in."
        ),
        {"agent_id": str(agent.id), "kinds": [k.value for k in body.consent_kinds], "version": version},
        dedupe_key=f"{version}:{','.join(sorted(k.value for k in body.consent_kinds))}",
        email=False,
    )
    return entry
