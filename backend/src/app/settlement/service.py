from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.constants import (
    ALLOCATION_TYPE_ADJUSTMENT,
    ALLOCATION_TYPE_SEGMENT,
    REMITTANCE_STATUSES_TERMINAL_SUCCESS,
    REMITTANCE_STATUS_SUCCEEDED,
    SEGMENT_STATUS_APPROVED,
)
from app.settlement.models import Remittance, RemittanceAllocation
from app.settlement.validation import period_utc_bounds, validate_settlement_period
from app.worklogs.models import Adjustment, TimeSegment, Worklog
from app.worklogs.service import segment_gross_amount
from app.worklogs.validation import validate_non_negative_hourly_rate

logger = logging.getLogger(__name__)


def _allocated_segment_subquery():
    return (
        select(RemittanceAllocation.segment_id)
        .join(Remittance, Remittance.id == RemittanceAllocation.remittance_id)
        .where(
            RemittanceAllocation.segment_id.is_not(None),
            Remittance.status.in_(REMITTANCE_STATUSES_TERMINAL_SUCCESS),
        )
    )


def _allocated_adjustment_subquery():
    return (
        select(RemittanceAllocation.adjustment_id)
        .join(Remittance, Remittance.id == RemittanceAllocation.remittance_id)
        .where(
            RemittanceAllocation.adjustment_id.is_not(None),
            Remittance.status.in_(REMITTANCE_STATUSES_TERMINAL_SUCCESS),
        )
    )


def _candidate_segments(session: Session, user_id: str, ps: datetime, pe_excl: datetime) -> list[TimeSegment]:
    allocated = _allocated_segment_subquery()
    return list(
        session.scalars(
            select(TimeSegment)
            .join(Worklog)
            .where(
                Worklog.user_id == user_id,
                TimeSegment.status == SEGMENT_STATUS_APPROVED,
                TimeSegment.start < pe_excl,
                TimeSegment.end > ps,
                TimeSegment.id.not_in(allocated),
            )
        ).all()
    )


def _candidate_adjustments(session: Session, user_id: str, as_of: datetime) -> list[Adjustment]:
    allocated = _allocated_adjustment_subquery()
    return list(
        session.scalars(
            select(Adjustment)
            .join(Worklog)
            .where(
                Worklog.user_id == user_id,
                Adjustment.applied_at <= as_of,
                Adjustment.id.not_in(allocated),
            )
        ).all()
    )


def _existing_remittance(session: Session, user_id: str, period_start: date, period_end: date) -> Remittance | None:
    return session.scalars(
        select(Remittance).where(
            Remittance.user_id == user_id,
            Remittance.period_start == period_start,
            Remittance.period_end == period_end,
        )
    ).one_or_none()


def _settle_one_user(
    session: Session,
    user_id: str,
    period_start: date,
    period_end: date,
    as_of: datetime,
    attempt_status: str,
) -> tuple[str, dict | None]:
    """
    Returns (outcome, remittance_payload).

    outcome in {"skipped_settled", "skipped_empty", "created"}
    """
    validate_settlement_period(period_start, period_end)
    ps, pe_excl = period_utc_bounds(period_start, period_end)

    existing = _existing_remittance(session, user_id, period_start, period_end)
    if existing is not None and existing.status in REMITTANCE_STATUSES_TERMINAL_SUCCESS:
        return "skipped_settled", None
    if existing is not None:
        session.delete(existing)
        session.commit()

    segments = _candidate_segments(session, user_id, ps, pe_excl)
    adjustments = _candidate_adjustments(session, user_id, as_of)

    total = Decimal("0.00")
    line_items: list[tuple[str, int, Decimal]] = []

    for segment in segments:
        hourly = validate_non_negative_hourly_rate(segment.worklog.hourly_rate)
        amt = segment_gross_amount(hourly, segment.start, segment.end)
        total += amt
        line_items.append((ALLOCATION_TYPE_SEGMENT, segment.id, amt))

    for adjustment in adjustments:
        total += adjustment.amount
        line_items.append((ALLOCATION_TYPE_ADJUSTMENT, adjustment.id, adjustment.amount))

    if not line_items:
        return "skipped_empty", None

    remittance = Remittance(
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        amount=total.quantize(Decimal("0.01")),
        status=attempt_status,
    )
    session.add(remittance)
    session.flush()

    for alloc_type, fk_id, amt in line_items:
        kwargs: dict = {
            "remittance_id": remittance.id,
            "allocation_type": alloc_type,
            "amount": amt.quantize(Decimal("0.01")),
        }
        if alloc_type == ALLOCATION_TYPE_SEGMENT:
            kwargs["segment_id"] = fk_id
        else:
            kwargs["adjustment_id"] = fk_id
        session.add(RemittanceAllocation(**kwargs))

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        logger.exception("Remittance insert conflict for user_id=%s period=%s..%s", user_id, period_start, period_end)
        settled = _existing_remittance(session, user_id, period_start, period_end)
        if settled is not None and settled.status in REMITTANCE_STATUSES_TERMINAL_SUCCESS:
            return "skipped_settled", None
        raise

    session.refresh(remittance)
    amt = remittance.amount.quantize(Decimal("0.01"))
    payload = {
        "id": remittance.id,
        "user_id": remittance.user_id,
        "period_start": remittance.period_start.isoformat(),
        "period_end": remittance.period_end.isoformat(),
        "amount": str(amt),
        "status": remittance.status,
    }
    return "created", payload


def generate_remittances_for_period(
    session: Session,
    period_start: date,
    period_end: date,
    *,
    as_of: datetime | None = None,
    attempt_status: str = REMITTANCE_STATUS_SUCCEEDED,
) -> tuple[list[dict], dict]:
    """
    Batch settlement: each user is processed independently (per backend/AGENTS.md).

    Includes:
    - Approved, unallocated segments whose work interval overlaps the settlement period.
    - Unallocated adjustments with applied_at <= as_of (execution time), so late
      corrections against earlier worklogs are picked up without reopening prior remittances.
    """
    as_of = as_of or datetime.now(timezone.utc)
    validate_settlement_period(period_start, period_end)

    user_ids = list(session.scalars(select(Worklog.user_id).distinct()).all())
    remittances: list[dict] = []
    summary: dict = {
        "users_considered": 0,
        "remittances_created": 0,
        "skipped_already_settled": 0,
        "skipped_nothing_to_pay": 0,
        "errors": [],
    }

    for user_id in user_ids:
        summary["users_considered"] += 1
        try:
            outcome, payload = _settle_one_user(
                session,
                user_id,
                period_start,
                period_end,
                as_of,
                attempt_status,
            )
            if outcome == "skipped_settled":
                summary["skipped_already_settled"] += 1
            elif outcome == "skipped_empty":
                summary["skipped_nothing_to_pay"] += 1
            else:
                summary["remittances_created"] += 1
                assert payload is not None
                remittances.append(payload)
        except Exception as exc:  # noqa: BLE001 — batch continuation per AGENTS.md
            logger.error("Settlement failed for user_id=%s: %s", user_id, exc)
            summary["errors"].append({"user_id": user_id, "error": str(exc)})

    return remittances, summary
