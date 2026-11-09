"""Generic paginated responses.

Usage::

    from app.core.deps import PageParams
    from app.core.pagination import Page, paginate

    @router.get("/cases", response_model=Page[CaseOut])
    async def list_cases(db: DbSession, user: CurrentUser, params: PageParams) -> Page[CaseOut]:
        stmt = select(Case).where(...).order_by(Case.created_at.desc())
        return await paginate(
            db, stmt, params, transform=lambda rows: [CaseOut.model_validate(r) for r in rows]
        )
"""

from __future__ import annotations

import math
from collections.abc import Awaitable, Callable, Sequence
from inspect import isawaitable
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession


class _PageLike(Protocol):
    page: int
    page_size: int


class Page[T](BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

    @classmethod
    def create(cls, items: Sequence[T], total: int, page: int, page_size: int) -> Page[T]:
        pages = math.ceil(total / page_size) if page_size > 0 else 0
        return cls(items=list(items), total=total, page=page, page_size=page_size, pages=pages)


Transform = Callable[[list[Any]], Sequence[Any] | Awaitable[Sequence[Any]]]


async def paginate(
    db: AsyncSession,
    stmt: Select[Any],
    params: _PageLike,
    transform: Transform | None = None,
    *,
    scalars: bool = True,
) -> Page[Any]:
    """Run ``stmt`` with LIMIT/OFFSET and a COUNT over the statement as a subquery.

    * ``scalars=True`` (default) returns the first column of each row (ORM entities for ``select(Model)``);
      ``scalars=False`` returns ``Row`` objects (for multi-column selects).
    * ``transform`` receives the list of rows and returns the items (may be async).
    """
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = int((await db.execute(count_stmt)).scalar_one())
    offset = (params.page - 1) * params.page_size
    rows: list[Any] = []
    if total > offset:
        result = await db.execute(stmt.limit(params.page_size).offset(offset))
        rows = list(result.scalars().all()) if scalars else list(result.all())
    items: Sequence[Any] = rows
    if transform is not None:
        produced = transform(rows)
        items = await produced if isawaitable(produced) else produced
    return Page[Any].create(items, total, params.page, params.page_size)
