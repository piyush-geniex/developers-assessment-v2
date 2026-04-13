from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation


def validate_amount(value: object, *, field_name: str = "amount") -> Decimal:
    if value is None:
        raise ValueError(f"{field_name} is required")
    try:
        d = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be numeric") from exc
    return d.quantize(Decimal("0.0001"))


def validate_non_negative_hourly_rate(value: object) -> Decimal:
    rate = validate_amount(value, field_name="hourly_rate")
    if rate < 0:
        raise ValueError("hourly_rate cannot be negative")
    return rate


def validate_segment_interval(start: datetime, end: datetime) -> None:
    if end < start:
        raise ValueError("segment end must not be before start")
