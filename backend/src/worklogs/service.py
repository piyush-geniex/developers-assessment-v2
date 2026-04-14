import json
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy.orm import Session

from src.ledger.models import LedgerEntry
from src.remittances.models import Remittance, RemittanceItem
from src.users.models import User
from src.worklogs.models import Worklog, WorklogAdjustment, WorklogSegment


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _is_in_period(value_date: date, period_start: date | None, period_end: date | None) -> bool:
    if period_start is not None and value_date < period_start:
        return False
    if period_end is not None and value_date > period_end:
        return False
    return True


def _resolve_seed_path() -> Path:
    candidate_paths = [
        Path("/app/seed/worklogs.json"),
        Path(__file__).resolve().parents[3] / "seed" / "worklogs.json",
    ]
    for candidate in candidate_paths:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("seed/worklogs.json was not found")


def seed_worklogs(database_session: Session) -> dict:
    seed_path = _resolve_seed_path()
    records = json.loads(seed_path.read_text())
    now = datetime.now(UTC)
    seeded_worklogs = 0

    for record in records:
        user = database_session.query(User).filter(User.name == record["user_name"]).first()
        if user is None:
            user = User(
                name=record["user_name"],
                created_at=now,
            )
            database_session.add(user)
            database_session.flush()
        else:
            user.name = record["user_name"]

        worklog = (
            database_session.query(Worklog)
            .filter(Worklog.user_id == user.id, Worklog.task_name == record["task_name"])
            .first()
        )
        if worklog is None:
            worklog = Worklog(
                user_id=user.id,
                task_name=record["task_name"],
                hourly_rate=Decimal(str(record["hourly_rate"])),
                created_at=now,
                updated_at=now,
            )
            database_session.add(worklog)
            database_session.flush()
            seeded_worklogs += 1
        else:
            worklog.user_id = user.id
            worklog.task_name = record["task_name"]
            worklog.hourly_rate = Decimal(str(record["hourly_rate"]))
            worklog.updated_at = now

        for segment_record in record["segments"]:
            segment_start = _parse_datetime(segment_record["start"])
            segment_end = _parse_datetime(segment_record["end"])
            dispute_reason = segment_record.get("dispute_reason")
            segment = (
                database_session.query(WorklogSegment)
                .filter(
                    WorklogSegment.worklog_id == worklog.id,
                    WorklogSegment.start_time == segment_start,
                    WorklogSegment.end_time == segment_end,
                )
                .first()
            )

            if segment is None:
                segment = WorklogSegment(
                    worklog_id=worklog.id,
                    start_time=segment_start,
                    end_time=segment_end,
                    status=segment_record["status"].upper(),
                    dispute_reason=dispute_reason,
                    created_at=now,
                )
                database_session.add(segment)
                database_session.flush()
            else:
                segment.worklog_id = worklog.id
                segment.start_time = segment_start
                segment.end_time = segment_end
                segment.status = segment_record["status"].upper()
                segment.dispute_reason = dispute_reason

            if segment_record["status"].lower() == "approved":
                duration_hours = Decimal(
                    str((segment_end - segment_start).total_seconds() / 3600)
                )
                earned_amount = duration_hours * Decimal(str(record["hourly_rate"]))
                ledger_entry = database_session.query(LedgerEntry).filter(
                    LedgerEntry.reference_type == "segment",
                    LedgerEntry.reference_id == str(segment.id),
                ).first()
                if ledger_entry is None:
                    database_session.add(
                        LedgerEntry(
                            user_id=user.id,
                            worklog_id=worklog.id,
                            type="EARNED",
                            amount=earned_amount,
                            period_start=segment_start.date(),
                            period_end=segment_end.date(),
                            reference_type="segment",
                            reference_id=str(segment.id),
                            created_at=now,
                        )
                    )

        for adjustment_record in record["adjustments"]:
            applied_at = _parse_datetime(adjustment_record["applied_at"])
            adjustment = (
                database_session.query(WorklogAdjustment)
                .filter(
                    WorklogAdjustment.worklog_id == worklog.id,
                    WorklogAdjustment.amount == Decimal(str(adjustment_record["amount"])),
                    WorklogAdjustment.reason == adjustment_record["reason"],
                    WorklogAdjustment.applied_at == applied_at,
                )
                .first()
            )
            if adjustment is None:
                adjustment = WorklogAdjustment(
                    worklog_id=worklog.id,
                    amount=Decimal(str(adjustment_record["amount"])),
                    reason=adjustment_record["reason"],
                    applied_at=applied_at,
                    created_at=now,
                )
                database_session.add(adjustment)
                database_session.flush()
            else:
                adjustment.worklog_id = worklog.id
                adjustment.amount = Decimal(str(adjustment_record["amount"]))
                adjustment.reason = adjustment_record["reason"]
                adjustment.applied_at = applied_at

            ledger_entry = database_session.query(LedgerEntry).filter(
                LedgerEntry.reference_type == "adjustment",
                LedgerEntry.reference_id == str(adjustment.id),
            ).first()
            if ledger_entry is None:
                database_session.add(
                    LedgerEntry(
                        user_id=user.id,
                        worklog_id=worklog.id,
                        type="ADJUSTMENT",
                        amount=Decimal(str(adjustment_record["amount"])),
                        period_start=applied_at.date(),
                        period_end=applied_at.date(),
                        reference_type="adjustment",
                        reference_id=str(adjustment.id),
                        created_at=now,
                    )
                )

    database_session.commit()
    return {"seeded_worklogs": seeded_worklogs, "total_records": len(records)}


def list_worklogs(
    database_session: Session,
    remittance_status: str | None = None,
    user_id: int | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
):
    # 1. Fetch worklogs + users together
    query = database_session.query(Worklog, User).join(User)

    if user_id:
        query = query.filter(User.id == user_id)

    rows = query.all()
    worklogs = [row[0] for row in rows]
    users_map = {row[1].id: row[1] for row in rows}

    worklog_ids = [w.id for w in worklogs]

    if not worklog_ids:
        return []

    # 2. Fetch all segments in one go
    segments = database_session.query(WorklogSegment).filter(
        WorklogSegment.worklog_id.in_(worklog_ids)
    ).all()

    segments_map = {}
    for seg in segments:
        segments_map.setdefault(seg.worklog_id, []).append(seg)

    # 3. Fetch all adjustments
    adjustments = database_session.query(WorklogAdjustment).filter(
        WorklogAdjustment.worklog_id.in_(worklog_ids)
    ).all()

    adjustments_map = {}
    for adj in adjustments:
        adjustments_map.setdefault(adj.worklog_id, []).append(adj)

    # 4. Fetch remitted ledger entries
    remitted_ledger_ids = set(
        r[0]
        for r in database_session.query(RemittanceItem.ledger_entry_id)
        .join(Remittance)
        .filter(Remittance.status == "SUCCESS")
        .all()
    )

    # 5. Fetch ledger entries per worklog
    ledger_entries = database_session.query(LedgerEntry).filter(
        LedgerEntry.worklog_id.in_(worklog_ids)
    ).all()

    ledger_map = {}
    for entry in ledger_entries:
        ledger_map.setdefault(entry.worklog_id, []).append(entry)

    response = []

    for worklog in worklogs:
        user = users_map.get(worklog.user_id)
        if user is None:
            continue

        segments = segments_map.get(worklog.id, [])
        adjustments = adjustments_map.get(worklog.id, [])
        ledger_entries = ledger_map.get(worklog.id, [])

        # remittance status
        if ledger_entries:
            remitted_count = sum(
                1 for le in ledger_entries if le.id in remitted_ledger_ids
            )
            fully_remitted = remitted_count == len(ledger_entries)
        else:
            fully_remitted = False

        current_status = "REMITTED" if fully_remitted else "UNREMITTED"

        if remittance_status and current_status != remittance_status:
            continue

        # earnings
        approved_earnings = Decimal("0")
        for seg in segments:
            if seg.status != "APPROVED":
                continue
            if not _is_in_period(seg.start_time.date(), period_start, period_end):
                continue

            hours = Decimal(
                str((seg.end_time - seg.start_time).total_seconds() / 3600)
            )
            approved_earnings += hours * Decimal(str(worklog.hourly_rate))

        # adjustments
        adjustment_total = Decimal("0")
        for adj in adjustments:
            if not _is_in_period(adj.applied_at.date(), period_start, period_end):
                continue
            adjustment_total += Decimal(str(adj.amount))

        total = approved_earnings + adjustment_total

        response.append(
            {
                "worklog_id": worklog.id,
                "user_id": user.id,
                "user_name": user.name,
                "task_name": worklog.task_name,
                "hourly_rate": float(worklog.hourly_rate),
                "remittance_status": current_status,
                "amount": float(total),
            }
        )

    return response