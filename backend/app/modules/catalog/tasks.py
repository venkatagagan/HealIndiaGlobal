"""Background jobs for the catalog module (imported at startup by ``app.core.events.load_module_hooks``)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import task
from app.modules.catalog import revalidate
from app.modules.catalog.settings import catalog_settings

# Importing this module (API, worker and test suite all do) turns on change capture for website revalidation.
revalidate.install_listeners()


@task(revalidate.TASK_NAME, timeout_seconds=60)
async def revalidate_website(db: AsyncSession, payload: dict[str, Any]) -> None:
    """POST the changed catalogue tags to the website's on-demand revalidation route (no-op when unset)."""
    if not catalog_settings.revalidation_enabled:
        return
    tags = await revalidate.resolve_tags(db, payload)
    await revalidate.post_revalidate(tags)
