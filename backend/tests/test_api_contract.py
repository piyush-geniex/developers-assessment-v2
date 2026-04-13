from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from app.constants import (
    HEADER_REQUEST_ID,
    REMITTANCE_STATUS_SUCCEEDED,
    SEGMENT_STATUS_APPROVED,
    SEGMENT_STATUS_DISPUTED,
    WORKLOG_REMITTANCE_REMITTED,
    WORKLOG_REMITTANCE_UNREMITTED,
)
from app.database import get_session_factory
from app.worklogs.models import Adjustment, TimeSegment, Worklog

from tests.factories import add_cancelled_segment_worklog, add_worklog_with_segment

UTC = timezone.utc


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
                start=datetime(2025, 11, 5, 9, 0, tzinfo=UTC),
                end=datetime(2025, 11, 5, 11, 0, tzinfo=UTC),
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
                applied_at=datetime(2025, 11, 15, 0, 0, tzinfo=UTC),
            )
        )
        session.commit()


# --- Health ---


def test_health_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# --- POST /generate-remittances: positive ---


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


def test_generate_remittances_total_amount_matches_ledger(client):
    """2h * 100 + (-10) adjustment => 190.00 for usr-test."""
    _seed_minimal_worklog()
    response = client.post(
        "/generate-remittances",
        json={"period_start": "2025-11-01", "period_end": "2025-11-30"},
    )
    assert response.status_code == 201
    rows = {r["user_id"]: r["amount"] for r in response.json()["data"]["remittances"]}
    assert rows["usr-test"] == "190.00"


def test_generate_remittances_single_day_period(client):
    _seed_minimal_worklog()
    response = client.post(
        "/generate-remittances",
        json={"period_start": "2025-11-05", "period_end": "2025-11-05"},
    )
    assert response.status_code == 201
    assert response.json()["data"]["summary"]["remittances_created"] >= 1


def test_generate_remittances_two_users_two_remittances(client):
    factory = get_session_factory()
    with factory() as session:
        add_worklog_with_segment(
            session,
            external_id="wl-a",
            user_id="usr-a",
            hourly_rate=Decimal("10.00"),
            segment_external_id="s-a",
            start=datetime(2025, 11, 1, 10, 0, tzinfo=UTC),
            end=datetime(2025, 11, 1, 11, 0, tzinfo=UTC),
        )
        add_worklog_with_segment(
            session,
            external_id="wl-b",
            user_id="usr-b",
            hourly_rate=Decimal("20.00"),
            segment_external_id="s-b",
            start=datetime(2025, 11, 2, 10, 0, tzinfo=UTC),
            end=datetime(2025, 11, 2, 12, 0, tzinfo=UTC),
        )
    response = client.post(
        "/generate-remittances",
        json={"period_start": "2025-11-01", "period_end": "2025-11-30"},
    )
    assert response.status_code == 201
    summary = response.json()["data"]["summary"]
    assert summary["remittances_created"] == 2
    users = {r["user_id"] for r in response.json()["data"]["remittances"]}
    assert users == {"usr-a", "usr-b"}


def test_x_request_id_echoed_in_meta(client):
    _seed_minimal_worklog()
    rid = "custom-req-id-123"
    response = client.post(
        "/generate-remittances",
        headers={HEADER_REQUEST_ID: rid},
        json={"period_start": "2025-11-01", "period_end": "2025-11-30"},
    )
    assert response.status_code == 201
    assert response.json()["meta"]["request_id"] == rid


# --- POST /generate-remittances: negative ---


def test_generate_remittances_rejects_period_end_before_start(client):
    _seed_minimal_worklog()
    response = client.post(
        "/generate-remittances",
        json={"period_start": "2025-11-30", "period_end": "2025-11-01"},
    )
    assert response.status_code == 400
    assert "period" in response.json()["detail"].lower()


def test_generate_remittances_missing_field_returns_422(client):
    response = client.post("/generate-remittances", json={"period_start": "2025-11-01"})
    assert response.status_code == 422


def test_generate_remittances_invalid_date_type_returns_422(client):
    response = client.post(
        "/generate-remittances",
        json={"period_start": "not-a-date", "period_end": "2025-11-30"},
    )
    assert response.status_code == 422


# --- POST /generate-remittances: edge ---


def test_generate_remittances_idempotent(client):
    _seed_minimal_worklog()
    client.post("/generate-remittances", json={"period_start": "2025-11-01", "period_end": "2025-11-30"})
    second = client.post(
        "/generate-remittances",
        json={"period_start": "2025-11-01", "period_end": "2025-11-30"},
    )
    assert second.status_code == 200
    assert second.json()["data"]["summary"]["skipped_already_settled"] >= 1


def test_generate_remittances_skipped_nothing_to_pay_no_overlap_and_future_adjustment(client):
    """December work + adjustment applied in the future => nothing for November period."""
    factory = get_session_factory()
    with factory() as session:
        add_worklog_with_segment(
            session,
            external_id="wl-dec",
            user_id="usr-late",
            hourly_rate=Decimal("100.00"),
            segment_external_id="s-dec",
            start=datetime(2025, 12, 5, 9, 0, tzinfo=UTC),
            end=datetime(2025, 12, 5, 10, 0, tzinfo=UTC),
            adjustments=[
                ("adj-future", Decimal("-5.00"), datetime(2030, 1, 1, 0, 0, tzinfo=UTC), "future"),
            ],
        )
    response = client.post(
        "/generate-remittances",
        json={"period_start": "2025-11-01", "period_end": "2025-11-30"},
    )
    assert response.status_code == 200
    summary = response.json()["data"]["summary"]
    assert summary["remittances_created"] == 0
    assert summary["skipped_nothing_to_pay"] >= 1


def test_generate_remittances_disputed_segment_only_skipped_for_period(client):
    """Disputed segment does not pay; no adjustments => nothing to settle."""
    factory = get_session_factory()
    with factory() as session:
        add_worklog_with_segment(
            session,
            external_id="wl-dis",
            user_id="usr-dis",
            hourly_rate=Decimal("100.00"),
            segment_external_id="s-dis",
            start=datetime(2025, 11, 10, 9, 0, tzinfo=UTC),
            end=datetime(2025, 11, 10, 11, 0, tzinfo=UTC),
            segment_status=SEGMENT_STATUS_DISPUTED,
        )
    response = client.post(
        "/generate-remittances",
        json={"period_start": "2025-11-01", "period_end": "2025-11-30"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["summary"]["remittances_created"] == 0


def test_generate_remittances_zero_duration_segment_still_allocates_adjustment(client):
    factory = get_session_factory()
    with factory() as session:
        add_worklog_with_segment(
            session,
            external_id="wl-zero",
            user_id="usr-zero",
            hourly_rate=Decimal("100.00"),
            segment_external_id="s-zero",
            start=datetime(2025, 11, 10, 12, 0, tzinfo=UTC),
            end=datetime(2025, 11, 10, 12, 0, tzinfo=UTC),
            adjustments=[
                ("adj-z", Decimal("25.00"), datetime(2025, 11, 11, 0, 0, tzinfo=UTC), "bonus"),
            ],
        )
    response = client.post(
        "/generate-remittances",
        json={"period_start": "2025-11-01", "period_end": "2025-11-30"},
    )
    assert response.status_code == 201
    amounts = {r["user_id"]: r["amount"] for r in response.json()["data"]["remittances"]}
    assert amounts["usr-zero"] == "25.00"


# --- GET /worklogs: positive ---


def test_worklogs_list_envelope(client):
    _seed_minimal_worklog()
    response = client.get("/worklogs")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body and "meta" in body
    assert len(body["data"]["worklogs"]) >= 1


def test_worklogs_user_id_filter(client):
    factory = get_session_factory()
    with factory() as session:
        add_worklog_with_segment(
            session,
            external_id="wl-u1",
            user_id="user-one",
            segment_external_id="s1",
            start=datetime(2025, 11, 1, 10, 0, tzinfo=UTC),
            end=datetime(2025, 11, 1, 11, 0, tzinfo=UTC),
        )
        add_worklog_with_segment(
            session,
            external_id="wl-u2",
            user_id="user-two",
            segment_external_id="s2",
            start=datetime(2025, 11, 2, 10, 0, tzinfo=UTC),
            end=datetime(2025, 11, 2, 11, 0, tzinfo=UTC),
        )
    response = client.get("/worklogs", params={"user_id": "user-one"})
    assert response.status_code == 200
    ids = {row["user_id"] for row in response.json()["data"]["worklogs"]}
    assert ids == {"user-one"}


def test_worklogs_remitted_filter_after_settlement(client):
    _seed_minimal_worklog()
    client.post("/generate-remittances", json={"period_start": "2025-11-01", "period_end": "2025-11-30"})
    remitted = client.get("/worklogs", params={"remittance_status": WORKLOG_REMITTANCE_REMITTED})
    assert remitted.status_code == 200
    rows = remitted.json()["data"]["worklogs"]
    assert len(rows) >= 1
    assert all(r["remittance_status"] == WORKLOG_REMITTANCE_REMITTED for r in rows)


def test_worklogs_unremitted_empty_after_full_settlement(client):
    _seed_minimal_worklog()
    client.post("/generate-remittances", json={"period_start": "2025-11-01", "period_end": "2025-11-30"})
    unremitted = client.get("/worklogs", params={"remittance_status": WORKLOG_REMITTANCE_UNREMITTED})
    assert unremitted.status_code == 200
    assert unremitted.json()["data"]["worklogs"] == []


def test_worklogs_period_filter_matches_segment_in_range(client):
    factory = get_session_factory()
    with factory() as session:
        add_worklog_with_segment(
            session,
            external_id="wl-oct",
            user_id="usr-p",
            segment_external_id="s-oct",
            start=datetime(2025, 10, 15, 10, 0, tzinfo=UTC),
            end=datetime(2025, 10, 15, 11, 0, tzinfo=UTC),
        )
        add_worklog_with_segment(
            session,
            external_id="wl-nov",
            user_id="usr-p",
            segment_external_id="s-nov",
            start=datetime(2025, 11, 15, 10, 0, tzinfo=UTC),
            end=datetime(2025, 11, 15, 11, 0, tzinfo=UTC),
        )
    oct_only = client.get(
        "/worklogs",
        params={"period_start": "2025-10-01", "period_end": "2025-10-31"},
    )
    assert oct_only.status_code == 200
    external_ids = {r["worklog_id"] for r in oct_only.json()["data"]["worklogs"]}
    assert external_ids == {"wl-oct"}


def test_worklogs_calculated_amount_excludes_disputed_segment_gross(client):
    factory = get_session_factory()
    with factory() as session:
        wl = Worklog(
            external_id="wl-mix",
            user_id="usr-mix",
            user_name="Mix",
            task_name="T",
            hourly_rate=Decimal("100.00"),
        )
        session.add(wl)
        session.flush()
        session.add(
            TimeSegment(
                worklog_id=wl.id,
                external_id="s-app",
                start=datetime(2025, 11, 1, 9, 0, tzinfo=UTC),
                end=datetime(2025, 11, 1, 11, 0, tzinfo=UTC),
                status=SEGMENT_STATUS_APPROVED,
                dispute_reason=None,
            )
        )
        session.add(
            TimeSegment(
                worklog_id=wl.id,
                external_id="s-dis",
                start=datetime(2025, 11, 2, 9, 0, tzinfo=UTC),
                end=datetime(2025, 11, 2, 17, 0, tzinfo=UTC),
                status=SEGMENT_STATUS_DISPUTED,
                dispute_reason="x",
            )
        )
        session.commit()
    response = client.get("/worklogs", params={"user_id": "usr-mix"})
    assert response.status_code == 200
    row = next(r for r in response.json()["data"]["worklogs"] if r["worklog_id"] == "wl-mix")
    assert row["calculated_amount"] == "200.00"


# --- GET /worklogs: negative ---


def test_worklogs_rejects_period_start_only(client):
    response = client.get("/worklogs", params={"period_start": "2025-11-01"})
    assert response.status_code == 400


def test_worklogs_rejects_period_end_only(client):
    response = client.get("/worklogs", params={"period_end": "2025-11-30"})
    assert response.status_code == 400


def test_worklogs_rejects_period_end_before_start(client):
    response = client.get(
        "/worklogs",
        params={"period_start": "2025-11-30", "period_end": "2025-11-01"},
    )
    assert response.status_code == 400


def test_worklogs_invalid_remittance_status_returns_422(client):
    response = client.get("/worklogs", params={"remittance_status": "NOT_A_STATUS"})
    assert response.status_code == 422


# --- GET /worklogs: edge ---


def test_cancelled_only_worklog_shows_remitted_without_settlement(client):
    factory = get_session_factory()
    with factory() as session:
        add_cancelled_segment_worklog(
            session,
            external_id="wl-can",
            user_id="usr-can",
            start=datetime(2025, 11, 5, 10, 0, tzinfo=UTC),
            end=datetime(2025, 11, 5, 11, 0, tzinfo=UTC),
        )
    response = client.get("/worklogs", params={"user_id": "usr-can"})
    assert response.status_code == 200
    row = response.json()["data"]["worklogs"][0]
    assert row["remittance_status"] == WORKLOG_REMITTANCE_REMITTED
    assert row["calculated_amount"] == "0.00"


def test_x_request_id_trimmed_from_header(client):
    _seed_minimal_worklog()
    response = client.get("/worklogs", headers={HEADER_REQUEST_ID: "  padded-id  "})
    assert response.status_code == 200
    assert response.json()["meta"]["request_id"] == "padded-id"
