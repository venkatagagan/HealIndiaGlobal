"""Standalone job worker: ``.venv/Scripts/python -m app.worker`` (Ctrl+C to stop).

Runs queued jobs and enqueues periodic tasks. Use it with ``RUN_WORKER_IN_API=false`` on the API in
production; in development the API runs an embedded worker instead.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import signal
import sys

import structlog

from app.core import db as db_module
from app.core.config import settings
from app.core.events import load_module_hooks
from app.core.jobs import list_periodic, list_tasks, run_pending_jobs, run_worker
from app.core.logging import configure_logging
from app.core.redis import close_redis

logger = structlog.get_logger("app.worker")


async def _main(concurrency: int, once: bool) -> int:
    configure_logging()
    load_module_hooks()
    logger.info(
        "worker.boot",
        env=settings.ENV,
        tasks=len(list_tasks()),
        periodic=sorted(list_periodic()),
    )
    try:
        if once:
            processed = await run_pending_jobs(max_jobs=10_000)
            logger.info("worker.drained", processed=processed)
            return 0
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()

        def _request_stop(*_: object) -> None:
            loop.call_soon_threadsafe(stop.set)

        # signal.signal works on Windows for SIGINT/SIGTERM (loop.add_signal_handler does not).
        for sig in (signal.SIGINT, signal.SIGTERM):
            with contextlib.suppress(ValueError, OSError):
                signal.signal(sig, _request_stop)
        await run_worker(stop, concurrency=concurrency)
        return 0
    finally:
        await close_redis()
        await db_module.dispose_engine()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.worker", description="Heal India Global job worker")
    parser.add_argument("--concurrency", type=int, default=2, help="parallel job consumers (default 2)")
    parser.add_argument("--once", action="store_true", help="process everything due now and exit")
    args = parser.parse_args(argv)
    try:
        return asyncio.run(_main(max(1, args.concurrency), args.once))
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
