from __future__ import annotations

from datetime import date, datetime, timedelta, timezone


def validate_settlement_period(period_start: date, period_end: date) -> None:
    if period_end < period_start:
        raise ValueError("period_end must be on or after period_start")


def period_utc_bounds(period_start: date, period_end: date) -> tuple[datetime, datetime]:
    """Return [start, end_exclusive) in UTC for overlap tests."""
    validate_settlement_period(period_start, period_end)
    start = datetime.combine(period_start, datetime.min.time(), tzinfo=timezone.utc)
    end_exclusive = datetime.combine(period_end + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    return start, end_exclusive
