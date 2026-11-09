"""Contact enquiries from the public website (``POST /site/enquiries``).

The form has a honeypot field (``website``) that people never see; when a bot fills it the API answers 202 as
usual but stores nothing. Real enquiries are stored and support/admin get an in-app notification + email (the
notification carries the sender's name and topic, never the message text). Staff list and triage them under
``/admin/enquiries``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.deps import get_client_ip, get_user_agent
from app.core.enums import EnquiryStatus, UserRole
from app.core.errors import NotFound
from app.core.pagination import Page, paginate
from app.models import SiteEnquiry, User
from app.modules.messaging import policies as messaging_policies
from app.modules.messaging.notifications import notify_many
from app.modules.messaging.schemas import EnquiryCreate, EnquiryOut, ModerationUserRef

logger = structlog.get_logger(__name__)


def _ref(user: User | None) -> ModerationUserRef | None:
    if user is None:
        return None
    return ModerationUserRef(id=user.id, full_name=user.full_name or "", role=user.role, status=user.status)


def enquiry_out(e: SiteEnquiry, handler: User | None = None) -> EnquiryOut:
    return EnquiryOut(
        id=e.id,
        name=e.name,
        email=e.email,
        phone=e.phone,
        country=e.country,
        topic=e.topic,
        message=e.message,
        status=e.status,
        created_at=e.created_at,
        handled_by=_ref(handler),
        handled_at=e.handled_at,
    )


async def create_enquiry(db: AsyncSession, body: EnquiryCreate, request: Request) -> SiteEnquiry | None:
    if body.website and body.website.strip():
        logger.info("site.enquiry_honeypot")
        return None
    now = datetime.now(UTC)
    enquiry = SiteEnquiry(
        name=body.name,
        email=str(body.email).lower(),
        phone=body.phone,
        country=body.country,
        topic=body.topic,
        message=body.message,
        status=EnquiryStatus.NEW,
        ip=get_client_ip(request),
        user_agent=(get_user_agent(request) or "")[:512] or None,
        created_at=now,
        updated_at=now,
    )
    db.add(enquiry)
    await db.flush()
    topic = f" ({enquiry.topic})" if enquiry.topic else ""
    await notify_many(
        db,
        await messaging_policies.staff_user_ids(db, [UserRole.SUPPORT, UserRole.ADMIN]),
        "site_enquiry.created",
        "New website enquiry",
        f"{enquiry.name} sent an enquiry through the website contact form{topic}. Please reply within one "
        "working day.",
        {"enquiry_id": str(enquiry.id), "link": f"/enquiries?enquiry={enquiry.id}"},
        dedupe_key=f"site_enquiry.created:{enquiry.id}",
    )
    await db.commit()
    return enquiry


async def list_enquiries(db: AsyncSession, params: Any, status: EnquiryStatus | None) -> Page[EnquiryOut]:
    stmt = select(SiteEnquiry)
    if status is not None:
        stmt = stmt.where(SiteEnquiry.status == status)
    stmt = stmt.order_by(SiteEnquiry.created_at.desc(), SiteEnquiry.id.desc())
    page = await paginate(db, stmt, params)
    handler_ids = {e.handled_by_user_id for e in page.items if e.handled_by_user_id}
    handlers = {
        u.id: u for u in (await db.execute(select(User).where(User.id.in_(handler_ids)))).scalars().all()
    }
    items = [
        enquiry_out(e, handlers.get(e.handled_by_user_id) if e.handled_by_user_id else None)
        for e in page.items
    ]
    return Page[EnquiryOut].create(items, page.total, page.page, page.page_size)


async def update_enquiry(
    db: AsyncSession, actor: User, enquiry_id: uuid.UUID, status: EnquiryStatus, request: Request | None
) -> EnquiryOut:
    enquiry = (
        await db.execute(select(SiteEnquiry).where(SiteEnquiry.id == enquiry_id).with_for_update())
    ).scalar_one_or_none()
    if enquiry is None:
        raise NotFound("Enquiry not found")
    before = str(getattr(enquiry.status, "value", enquiry.status))
    enquiry.status = status
    enquiry.handled_by_user_id = actor.id
    enquiry.handled_at = datetime.now(UTC)
    await audit_log(
        db,
        actor=actor,
        action="site_enquiry.update",
        entity_type="site_enquiry",
        entity_id=enquiry.id,
        before={"status": before},
        after={"status": status.value},
        request=request,
    )
    await db.commit()
    return enquiry_out(enquiry, actor)
