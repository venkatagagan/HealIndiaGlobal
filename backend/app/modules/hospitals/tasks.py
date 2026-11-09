"""Background jobs for the hospitals module."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import periodic
from app.modules.catalog.service import invalidate_catalog_cache
from app.modules.hospitals.service import recompute_ratings


@periodic("hospitals.refresh_ratings", every_seconds=3600)
async def refresh_ratings(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Keep hospital/doctor ``rating_avg``/``rating_count`` in line with published reviews (idempotent)."""
    updated = await recompute_ratings(db)
    if updated:
        await db.commit()
        await invalidate_catalog_cache()
