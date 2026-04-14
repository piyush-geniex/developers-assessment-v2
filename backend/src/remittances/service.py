from collections import defaultdict
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from src.ledger.models import LedgerEntry
from src.remittances.models import Remittance, RemittanceItem
from src.users.models import User


def generate_remittances(
    database_session: Session, period_start: date, period_end: date
) -> dict:
    if period_start > period_end:
        return {
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "created": 0,
            "skipped": 0,
            "failed": 1,
            "errors": [{"error": "period_start must be before or equal to period_end"}],
        }

    results = {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "created": 0,
        "skipped": 0,
        "failed": 0,
        "errors": [],
    }

    now = datetime.now(UTC)

    try:
        # QUERY 1: Fetch ALL unpaid ledger entries in one go
        success_remitted_entry_ids_subquery = (
            database_session.query(RemittanceItem.ledger_entry_id)
            .join(Remittance, RemittanceItem.remittance_id == Remittance.id)
            .filter(Remittance.status == "SUCCESS")
            .distinct()
            .subquery()
        )

        unpaid_entries = (
            database_session.query(LedgerEntry)
            .filter(
                LedgerEntry.period_end <= period_end,
                ~LedgerEntry.id.in_(success_remitted_entry_ids_subquery),
            )
            .all()
        )

        if not unpaid_entries:
            results["skipped"] = 1
            return results

        # Group entries by user (in-memory, fast)
        entries_by_user = defaultdict(list)
        for entry in unpaid_entries:
            entries_by_user[entry.user_id].append(entry)

        user_ids = list(entries_by_user.keys())

        # QUERY 2: Fetch users in one go
        users = (
            database_session.query(User)
            .filter(User.id.in_(user_ids))
            .all()
        )
        user_map = {u.id: u for u in users}

        existing_attempts = (
            database_session.query(Remittance.user_id, Remittance.idempotency_key)
            .filter(
                Remittance.user_id.in_(user_ids),
                Remittance.period_start == period_start,
                Remittance.period_end == period_end,
            )
            .all()
        )
        attempt_counter_by_user: dict[int, int] = defaultdict(int)
        for existing_user_id, existing_key in existing_attempts:
            if ":" in existing_key:
                key_suffix = existing_key.rsplit(":", 1)[-1]
                if key_suffix.isdigit():
                    attempt_counter_by_user[existing_user_id] = max(
                        attempt_counter_by_user[existing_user_id], int(key_suffix)
                    )
                    continue
            attempt_counter_by_user[existing_user_id] += 1

        remittance_items_to_create = []

        for user_id, entries in entries_by_user.items():
            try:
                total_amount = sum(Decimal(str(e.amount)) for e in entries)

                if total_amount <= Decimal("0"):
                    results["skipped"] += 1
                    continue

                attempt_counter_by_user[user_id] += 1
                idempotency_key = (
                    f"remittance:{user_id}:{period_start}:{period_end}:"
                    f"{attempt_counter_by_user[user_id]}"
                )

                remittance = Remittance(
                    user_id=user_id,
                    period_start=period_start,
                    period_end=period_end,
                    total_amount=total_amount,
                    status="SUCCESS",
                    idempotency_key=idempotency_key,
                    created_at=now,
                    processed_at=now,
                )

                database_session.add(remittance)
                database_session.flush()  # get remittance.id

                for entry in entries:
                    remittance_items_to_create.append(
                        RemittanceItem(
                            remittance_id=remittance.id,
                            ledger_entry_id=entry.id,
                            amount=Decimal(str(entry.amount)),
                        )
                    )

                results["created"] += 1

            except Exception as error:
                results["failed"] += 1
                results["errors"].append(
                    {
                        "user_id": user_map.get(user_id).id
                        if user_id in user_map
                        else user_id,
                        "error": str(error),
                    }
                )

        # BULK INSERT
        if remittance_items_to_create:
            database_session.bulk_save_objects(remittance_items_to_create)

        database_session.commit()

    except Exception as error:
        database_session.rollback()
        results["failed"] += 1
        results["errors"].append({"error": str(error)})

    return results


def update_remittance_status(
    database_session: Session, remittance_id: int, status: str
) -> dict:
    normalized_status = status.upper()

    if normalized_status not in {"FAILED", "CANCELLED"}:
        return {
            "updated": False,
            "error": "status must be FAILED or CANCELLED",
        }

    remittance = (
        database_session.query(Remittance)
        .filter(Remittance.id == remittance_id)
        .first()
    )

    if remittance is None:
        return {"updated": False, "error": "remittance not found"}

    if remittance.status == "SUCCESS":
        return {
            "updated": False,
            "error": "cannot transition SUCCESS remittance to FAILED or CANCELLED",
        }

    remittance.status = normalized_status
    remittance.processed_at = datetime.now(UTC)

    database_session.commit()

    return {
        "updated": True,
        "remittance_id": remittance_id,
        "status": remittance.status,
    }