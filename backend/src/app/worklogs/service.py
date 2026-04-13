from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants import (
    SEGMENT_STATUSES_PAYABLE,
    SEGMENT_STATUS_APPROVED,
    REMITTANCE_STATUSES_TERMINAL_SUCCESS,
    WORKLOG_REMITTANCE_REMITTED,
    WORKLOG_REMITTANCE_UNREMITTED,
)
from app.settlement.models import Remittance, RemittanceAllocation
from app.settlement.validation import period_utc_bounds
from app.worklogs.models import Adjustment, TimeSegment, Worklog
from app.worklogs.validation import validate_segment_interval


def segment_gross_amount(hourly_rate: Decimal, start: datetime, end: datetime) -> Decimal:
    """
    Gross payable for a segment before adjustments.

    hr: hourly_rate from parent worklog.
    """
    validate_segment_interval(start, end)
    seconds = (end - start).total_seconds()
    if seconds <= 0:
        return Decimal("0.00")
    hours = Decimal(str(seconds)) / Decimal("3600")
    return (hours * hourly_rate).quantize(Decimal("0.01"))


def worklog_calculated_amount(worklog: Worklog) -> Decimal:
    """Total ledger amount: approved segment gross plus all adjustments."""
    total = Decimal("0.00")
    for segment in worklog.segments:
        if segment.status in SEGMENT_STATUSES_PAYABLE:
            total += segment_gross_amount(worklog.hourly_rate, segment.start, segment.end)
    for adjustment in worklog.adjustments:
        total += adjustment.amount
    return total.quantize(Decimal("0.01"))


def _allocated_segment_ids(session: Session) -> set[int]:
    rows = session.scalars(
        select(RemittanceAllocation.segment_id)
        .join(Remittance, Remittance.id == RemittanceAllocation.remittance_id)
        .where(
            RemittanceAllocation.segment_id.is_not(None),
            Remittance.status.in_(REMITTANCE_STATUSES_TERMINAL_SUCCESS),
        )
    ).all()
    return {int(r) for r in rows if r is not None}


def _allocated_adjustment_ids(session: Session) -> set[int]:
    rows = session.scalars(
        select(RemittanceAllocation.adjustment_id)
        .join(Remittance, Remittance.id == RemittanceAllocation.remittance_id)
        .where(
            RemittanceAllocation.adjustment_id.is_not(None),
            Remittance.status.in_(REMITTANCE_STATUSES_TERMINAL_SUCCESS),
        )
    ).all()
    return {int(r) for r in rows if r is not None}


def worklog_remittance_status(session: Session, worklog: Worklog) -> str:
    """
    REMITTED when every payable segment and every adjustment is captured by a
    successful allocation. Non-payable segments do not block REMITTED.
    """
    allocated_seg = _allocated_segment_ids(session)
    allocated_adj = _allocated_adjustment_ids(session)

    for segment in worklog.segments:
        if segment.status == SEGMENT_STATUS_APPROVED and segment.id not in allocated_seg:
            return WORKLOG_REMITTANCE_UNREMITTED
    for adjustment in worklog.adjustments:
        if adjustment.id not in allocated_adj:
            return WORKLOG_REMITTANCE_UNREMITTED
    return WORKLOG_REMITTANCE_REMITTED


def worklog_matches_period(session: Session, worklog_id: int, period_start: date, period_end: date) -> bool:
    """True if any segment overlaps the period or any adjustment applied_at falls in the period."""
    ps, pe_excl = period_utc_bounds(period_start, period_end)
    seg_hit = session.scalars(
        select(TimeSegment.id)
        .where(TimeSegment.worklog_id == worklog_id)
        .where(TimeSegment.start < pe_excl)
        .where(TimeSegment.end > ps)
        .limit(1)
    ).first()
    if seg_hit is not None:
        return True
    adj_hit = session.scalars(
        select(Adjustment.id)
        .where(Adjustment.worklog_id == worklog_id)
        .where(Adjustment.applied_at >= ps)
        .where(Adjustment.applied_at < pe_excl)
        .limit(1)
    ).first()
    return adj_hit is not None


def list_worklogs_for_api(
    session: Session,
    *,
    remittance_status: str | None,
    user_id: str | None,
    period_start: date | None,
    period_end: date | None,
) -> list[dict]:
    stmt = select(Worklog).order_by(Worklog.id)
    if user_id is not None:
        stmt = stmt.where(Worklog.user_id == user_id)
    worklogs = list(session.scalars(stmt).all())

    if period_start is not None and period_end is not None:
        worklogs = [wl for wl in worklogs if worklog_matches_period(session, wl.id, period_start, period_end)]

    out: list[dict] = []
    for wl in worklogs:
        amount = worklog_calculated_amount(wl)
        status = worklog_remittance_status(session, wl)
        if remittance_status is not None and status != remittance_status:
            continue
        out.append(
            {
                "id": wl.id,
                "worklog_id": wl.external_id,
                "user_id": wl.user_id,
                "user_name": wl.user_name,
                "task_name": wl.task_name,
                "hourly_rate": str(wl.hourly_rate),
                "calculated_amount": str(amount),
                "remittance_status": status,
            }
        )
    return out
