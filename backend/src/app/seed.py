from __future__ import annotations

import json
import logging
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.worklogs.models import Adjustment, TimeSegment, Worklog
from app.worklogs.validation import (
    validate_amount,
    validate_non_negative_hourly_rate,
    validate_segment_interval,
)

logger = logging.getLogger(__name__)


def _parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def load_seed_json(session: Session, path: str) -> None:
    """Load assessment seed file into empty tables (idempotent if worklogs already exist)."""
    file_path = Path(path)
    if not file_path.is_file():
        logger.warning("Seed file not found at %s; skipping seed.", path)
        return

    existing = session.scalar(select(func.count()).select_from(Worklog))
    if existing is not None and existing > 0:
        return

    rows = json.loads(file_path.read_text(encoding="utf-8"))
    for row in rows:
        worklog = Worklog(
            external_id=row["worklog_id"],
            user_id=row["user_id"],
            user_name=row["user_name"],
            task_name=row["task_name"],
            hourly_rate=validate_non_negative_hourly_rate(row["hourly_rate"]),
        )
        session.add(worklog)
        session.flush()

        for segment in row["segments"]:
            start = _parse_dt(segment["start"])
            end = _parse_dt(segment["end"])
            validate_segment_interval(start, end)
            session.add(
                TimeSegment(
                    worklog_id=worklog.id,
                    external_id=segment["segment_id"],
                    start=start,
                    end=end,
                    status=segment["status"],
                    dispute_reason=segment.get("dispute_reason"),
                )
            )

        for adjustment in row["adjustments"]:
            session.add(
                Adjustment(
                    worklog_id=worklog.id,
                    external_id=adjustment["adjustment_id"],
                    amount=validate_amount(adjustment["amount"], field_name="adjustment.amount"),
                    reason=adjustment["reason"],
                    applied_at=_parse_dt(adjustment["applied_at"]),
                )
            )

    session.commit()
