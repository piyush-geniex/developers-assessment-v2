# Design Decisions

> Fill in each section below. This document is a required part of your
> submission and will be evaluated alongside your code.

> This document explains the main design decisions for the WorkLog settlement
feature implemented in `backend/` (NestJS + Prisma + PostgreSQL).

## Schema Design

### Tables / Collections

- `workers`
  - `id`, `email` (unique), `name`, timestamps
  - Workers are the payees for settlements/remittances.

- `tasks`
  - `id`, `name`, `description`, timestamps
  - Tasks are the unit of work grouping worklogs.

- `worklogs`
  - `id`, `worker_id`, `task_id`, `status`, timestamps
  - A worklog is the container for time segments recorded against a task.

- `time_segments`
  - `id`, `worklog_id`, `start_time`, `end_time`, `minutes_duration`,
    `hourly_rate_snapshot`, `status`, timestamps
  - Segments are the atomic “time reported” units and can be removed/disputed
    via status changes. `hourly_rate_snapshot` is stored on the segment to keep
    historical calculations stable.

- `adjustments`
  - `id`, `worker_id`, `time_segment_id` (nullable), `amount`, `reason`,
    `effective_date`, `created_at`
  - Retroactive deductions/credits. `effective_date` controls when an
    adjustment becomes eligible for settlement.

- `settlement_attempts`
  - `id`, `period_start`, `period_end`, `status`, `created_at`
  - Represents an execution of a settlement run for a period.
  - Unique constraint on (`period_start`, `period_end`) prevents duplicates.

- `settlement_lines`
  - `id`, `settlement_run_id` (FK to `settlement_attempts`), `worker_id`,
    `source_type` (`TIME_SEGMENT` | `ADJUSTMENT`), `source_id`, `amount`,
    `period_start`, `period_end`, `created_at`
  - Line-level ledger of what was included in a run.
  - Unique constraint on (`source_type`, `source_id`) ensures a segment or
    adjustment is only settled once across all runs.

- `remittances`
  - `id`, `worker_id`, `settlement_run_id`, `total_amount`, `status`,
    `created_at`
  - One remittance per worker per settlement attempt (created from grouped
    settlement lines).

### Key Design Choices

1. A ledger-style model (`settlement_lines`) to support mutable history
   - Instead of marking segments/adjustments as “paid” directly, the system
     records exactly what sources were included in which settlement attempt.
   - Tradeoff: more tables/records, but it makes “what was paid when” auditable
     and prevents double-counting via unique constraints.

2. Period-level idempotency via a natural key
   - (`period_start`, `period_end`) is a natural key for a settlement attempt.
     A duplicate request returns `409 Conflict`.
   - Tradeoff: strict 1 attempt per period. This is to match simple assessment
     interpretation; a production system might allow retries with attempt
     versioning.

3. Snapshotted rates on `time_segments`
   - Segment amounts are computed from `minutes_duration` and
     `hourly_rate_snapshot`.
   - Tradeoff: denormalizes rate data, but avoids retroactive rate changes
     unexpectedly altering historical totals.

---

## AGENTS.md Evaluation

### Rules I Followed

- Response envelopes: all responses are wrapped as `{ data, meta }` with
  `meta.timestamp` and `meta.request_id`.
- Input validation: DTO-level validation via `class-validator` and Nest
  `ValidationPipe`.
- HTTP status codes: duplicate settlement period uses `409 Conflict`.
- Query patterns: worklog listing avoids raw SQL and calculates totals in
  application code for testability.

### Rules I Rejected

- Domain-specific exception hierarchy:
  - The guide recommends domain exception classes mapped at the route layer.
  - I used Nest’s built-in HTTP exceptions/filters for speed and clarity in an
    assessment setting.

- “Wide table with type discriminator / JSONB payload”:
  - The guide suggests a single wide table approach to reduce joins.
  - I went with a normalized relational schema because Prisma models fit naturally with clearly defined entities, and this setup makes it easier to maintain referential integrity and keep things auditable.

---

## Edge Cases

### Considered Edge Cases

- Settlement run executed twice for the same period:
  - Prevented by a unique constraint on (`period_start`, `period_end`) and a
    `409 Conflict` response.

- Overlapping periods and late corrections:
  - A segment/adjustment is included at most once due to
    unique (`source_type`, `source_id`) on `settlement_lines`.
  - Adjustments with `effective_date <= period_end` are eligible in the next
    settlement attempt that has not yet settled them.

- Segments removed/disputed:
  - Only `ACTIVE` segments are eligible for settlement and for “unremitted”
    amount calculation.

- No work for a worker / empty runs:
  - Settlement still creates an attempt; remittances are created only for
    workers with settlement lines.

### Assumptions

- “REMITTED” in `/worklogs` means “included in a generated remittance record”
  (i.e., a remittance exists for the settlement attempt that included the
  segment), not “successfully paid”. This avoids needing a cron/external payout
  integration for the assessment.

- The system does not integrate with a payment processor in this assessment.
  `remittances.status` is modeled but not driven by a payout workflow.

- `docker compose up` should be sufficient for reviewers:
  - The backend container runs migrations and seeds automatically on startup.
