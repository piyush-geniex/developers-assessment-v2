from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from app.constants import (
    REMITTANCE_STATUS_SUCCEEDED,
    SEGMENT_STATUS_APPROVED,
    WORKLOG_REMITTANCE_UNREMITTED,
)
from app.database import get_session_factory
from app.worklogs.models import Adjustment, TimeSegment, Worklog


def _seed_minimal_worklog() -> None:
    factory = get_session_factory()
    with factory() as session:
        wl = Worklog(
            external_id="wl-test-1",
            user_id="usr-test",
            user_name="Test User",
            task_name="Test Task",
            hourly_rate=Decimal("100.00"),
        )
        session.add(wl)
        session.flush()
        session.add(
            TimeSegment(
                worklog_id=wl.id,
                external_id="seg-test-1",
                start=datetime(2025, 11, 5, 9, 0, tzinfo=timezone.utc),
                end=datetime(2025, 11, 5, 11, 0, tzinfo=timezone.utc),
                status=SEGMENT_STATUS_APPROVED,
                dispute_reason=None,
            )
        )
        session.add(
            Adjustment(
                worklog_id=wl.id,
                external_id="adj-test-1",
                amount=Decimal("-10.00"),
                reason="Test adjustment",
                applied_at=datetime(2025, 11, 15, 0, 0, tzinfo=timezone.utc),
            )
        )
        session.commit()


def test_health_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_generate_remittances_envelope_and_status(client):
    _seed_minimal_worklog()
    response = client.post(
        "/generate-remittances",
        json={"period_start": "2025-11-01", "period_end": "2025-11-30"},
    )
    assert response.status_code == 201
    body = response.json()
    assert "data" in body and "meta" in body
    assert "request_id" in body["meta"]
    assert "timestamp" in body["meta"]
    assert body["data"]["summary"]["remittances_created"] >= 1
    assert body["data"]["remittances"][0]["status"] == REMITTANCE_STATUS_SUCCEEDED


def test_generate_remittances_idempotent(client):
    _seed_minimal_worklog()
    client.post("/generate-remittances", json={"period_start": "2025-11-01", "period_end": "2025-11-30"})
    second = client.post(
        "/generate-remittances",
        json={"period_start": "2025-11-01", "period_end": "2025-11-30"},
    )
    assert second.status_code == 200
    assert second.json()["data"]["summary"]["skipped_already_settled"] >= 1


def test_worklists_envelope_and_filters(client):
    _seed_minimal_worklog()
    client.post("/generate-remittances", json={"period_start": "2025-11-01", "period_end": "2025-11-30"})

    response = client.get("/worklogs")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body and "meta" in body
    assert len(body["data"]["worklogs"]) >= 1

    unremitted = client.get("/worklogs", params={"remittance_status": WORKLOG_REMITTANCE_UNREMITTED})
    assert unremitted.status_code == 200

    bad_period = client.get("/worklogs", params={"period_start": "2025-11-01"})
    assert bad_period.status_code == 400
