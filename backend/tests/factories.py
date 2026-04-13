"""Small factories for building worklog graphs in tests (no external deps)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.constants import SEGMENT_STATUS_APPROVED, SEGMENT_STATUS_CANCELLED, SEGMENT_STATUS_DISPUTED
from app.worklogs.models import Adjustment, TimeSegment, Worklog


def add_worklog_with_segment(
    session: Session,
    *,
    external_id: str,
    user_id: str,
    hourly_rate: Decimal = Decimal("50.00"),
    segment_external_id: str = "seg-1",
    start: datetime,
    end: datetime,
    segment_status: str = SEGMENT_STATUS_APPROVED,
    adjustments: list[tuple[str, Decimal, datetime, str]] | None = None,
) -> Worklog:
    """
    adjustments: list of (external_id, amount, applied_at, reason).
    """
    wl = Worklog(
        external_id=external_id,
        user_id=user_id,
        user_name="Tester",
        task_name="Task",
        hourly_rate=hourly_rate,
    )
    session.add(wl)
    session.flush()
    session.add(
        TimeSegment(
            worklog_id=wl.id,
            external_id=segment_external_id,
            start=start,
            end=end,
            status=segment_status,
            dispute_reason="dispute" if segment_status == SEGMENT_STATUS_DISPUTED else None,
        )
    )
    for adj_id, amt, applied_at, reason in adjustments or []:
        session.add(
            Adjustment(
                worklog_id=wl.id,
                external_id=adj_id,
                amount=amt,
                reason=reason,
                applied_at=applied_at,
            )
        )
    session.commit()
    return wl


def add_cancelled_segment_worklog(
    session: Session,
    *,
    external_id: str,
    user_id: str,
    start: datetime,
    end: datetime,
) -> Worklog:
    wl = Worklog(
        external_id=external_id,
        user_id=user_id,
        user_name="Tester",
        task_name="Task",
        hourly_rate=Decimal("40.00"),
    )
    session.add(wl)
    session.flush()
    session.add(
        TimeSegment(
            worklog_id=wl.id,
            external_id=f"{external_id}-seg",
            start=start,
            end=end,
            status=SEGMENT_STATUS_CANCELLED,
            dispute_reason="dup",
        )
    )
    session.commit()
    return wl
