"""Demo-data helper for setup-finance-data.mjs: simulates *time passing* for records the demo created itself.

The API (correctly) refuses to discharge a patient before the admission date and keeps settlement items on hold for
``settlement_hold_days`` after discharge; the daily ``settlements.auto_batch`` job runs once a day. To show a populated
settlement pipeline in a walkthrough recorded on the same day, this script:

  stay <booking_id> <days>     move an *admitted* booking's admission date <days> into the past (the stay happened)
  eligible <item_id> ...       end the hold period of those settlement items, then run the real mark_eligible job body
  auto-batch                   run the real daily auto-batch job body (service.mark_eligible + service.auto_batch)

Run from backend/ with the backend venv:  .venv/Scripts/python ../docs/demo/scripts/finance_timetravel.py ...
Development databases only (refuses ENV=production).
"""

from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))

from app.core.config import settings  # noqa: E402
from app.core.db import SessionLocal  # noqa: E402
from app.models.cases import Booking  # noqa: E402
from app.models.settlements import SettlementItem  # noqa: E402
from app.modules.settlements import service  # noqa: E402


async def main(argv: list[str]) -> None:
    if settings.is_production:
        raise SystemExit("refusing to run in production")
    cmd, args = argv[0], argv[1:]
    async with SessionLocal() as db:
        if cmd == "stay":
            booking = await db.get(Booking, uuid.UUID(args[0]))
            if booking is None or str(getattr(booking.status, "value", booking.status)) != "admitted":
                raise SystemExit(f"booking {args[0]} is not admitted")
            booking.admission_date = datetime.now(UTC).date() - timedelta(days=int(args[1]))
            booking.admitted_at = datetime.now(UTC) - timedelta(days=int(args[1]))
            await db.commit()
            print(f"admission_date={booking.admission_date}")
        elif cmd == "eligible":
            past = datetime.now(UTC) - timedelta(minutes=5)
            for raw in args:
                item = await db.get(SettlementItem, uuid.UUID(raw))
                if item is not None and item.eligible_at and item.eligible_at > past:
                    item.eligible_at = past
            await db.flush()
            count = await service.mark_eligible(db)
            await db.commit()
            print(f"eligible={count}")
        elif cmd == "auto-batch":
            await service.mark_eligible(db)
            created = await service.auto_batch(db)
            await db.commit()
            print(f"auto_batches={len(created)}")
        else:
            raise SystemExit(f"unknown command {cmd}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
