"""Staff-only catalogue quality reports served by the catalog module.

``GET /admin/catalog/benchmark-gaps`` lists active procedures that have no home-country cost benchmark for one
of the platform's top patient countries (US, UK, Nigeria, UAE/Oman, Bangladesh by default). The public cost
comparison and the website's treatment pages can only show "cost at home" for countries that have a benchmark,
so the admin console shows these gaps for staff to fill from a cited source. Nothing here invents figures.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import STAFF_ROLES, DbSession, require_roles
from app.models import CostBenchmark, Procedure, Specialty, User
from app.modules.catalog.schemas import BenchmarkGapItem, BenchmarkGapsOut

# Country groups checked by default; a group is satisfied by a benchmark for any of its members.
TOP_PATIENT_COUNTRIES: tuple[tuple[str, ...], ...] = (("US",), ("GB",), ("NG",), ("AE", "OM"), ("BD",))

admin_router = APIRouter(tags=["admin"])

StaffUser = Annotated[User, Depends(require_roles(*STAFF_ROLES))]


def parse_country_groups(raw: str | None) -> tuple[tuple[str, ...], ...]:
    """``"US,GB,AE/OM"`` -> ``(("US",), ("GB",), ("AE", "OM"))``; empty -> the top patient countries."""
    if not raw or not raw.strip():
        return TOP_PATIENT_COUNTRIES
    groups: list[tuple[str, ...]] = []
    for part in raw.split(","):
        codes = (c.strip().upper() for c in part.split("/"))
        members = tuple(dict.fromkeys(c for c in codes if len(c) == 2 and c.isalpha()))
        if members and members not in groups:
            groups.append(members)
    return tuple(groups) or TOP_PATIENT_COUNTRIES


async def benchmark_gaps(db: AsyncSession, groups: tuple[tuple[str, ...], ...]) -> BenchmarkGapsOut:
    procedures = (
        await db.execute(
            select(Procedure.id, Procedure.slug, Procedure.name, Specialty.slug, Specialty.name)
            .join(Specialty, Specialty.id == Procedure.specialty_id)
            .where(Procedure.is_active.is_(True))
            .order_by(Specialty.sort_order, Specialty.name, Procedure.name)
        )
    ).all()
    countries_by_procedure: dict[uuid.UUID, set[str]] = {}
    if procedures:
        rows = await db.execute(
            select(CostBenchmark.procedure_id, CostBenchmark.country_code).where(
                CostBenchmark.procedure_id.in_([p[0] for p in procedures])
            )
        )
        for procedure_id, country in rows.all():
            countries_by_procedure.setdefault(procedure_id, set()).add(str(country).upper())

    items: list[BenchmarkGapItem] = []
    without_any = 0
    for pid, slug, name, spec_slug, spec_name in procedures:
        have = countries_by_procedure.get(pid, set())
        if not have:
            without_any += 1
        missing = ["/".join(group) for group in groups if not have.intersection(group)]
        if missing:
            items.append(
                BenchmarkGapItem(
                    procedure_id=pid,
                    procedure_slug=slug,
                    procedure_name=name,
                    specialty_slug=spec_slug,
                    specialty_name=spec_name,
                    benchmark_countries=sorted(have),
                    missing_countries=missing,
                )
            )
    return BenchmarkGapsOut(
        countries=["/".join(group) for group in groups],
        total_active_procedures=len(procedures),
        procedures_with_gaps=len(items),
        procedures_without_any_benchmark=without_any,
        items=items,
    )


@admin_router.get("/admin/catalog/benchmark-gaps", response_model=BenchmarkGapsOut)
async def get_benchmark_gaps(
    db: DbSession,
    _: StaffUser,
    countries: Annotated[
        str | None,
        Query(
            max_length=200,
            description="Comma-separated ISO codes; '/' joins alternatives (default US,GB,NG,AE/OM,BD)",
        ),
    ] = None,
) -> BenchmarkGapsOut:
    return await benchmark_gaps(db, parse_country_groups(countries))
