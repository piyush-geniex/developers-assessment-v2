# Design Decisions

> Fill in each section below. This document is a required part of your
> submission and will be evaluated alongside your code.

## Schema Design

### Tables / Collections

- `user`
  - `id`, `name`, `created_at`
  - `id` is the business identifier from input data (e.g., `usr-a`) and is used directly as PK.

- `worklog`
  - `id`, `user_id`, `task_name`, `hourly_rate`, `created_at`, `updated_at`
  - Represents a task-level container of work that can evolve over time.

- `time_segment`
  - `id`, `worklog_id`, `start_time`, `end_time`, `status`, `dispute_reason`, `created_at`
  - Tracks granular time slices so approved/disputed/cancelled segments can be treated independently.

- `worklog_adjustment`
  - `id`, `worklog_id`, `amount`, `reason`, `applied_at`, `created_at`
  - Stores retroactive corrections as explicit events.

- `ledger_entry`
  - `id`, `user_id`, `worklog_id`, `type`, `amount`, `period_start`, `period_end`, `reference_type`, `reference_id`, `created_at`
  - Financial source of truth. Approved segments and adjustments are both projected into immutable ledger entries.

- `remittance`
  - `id`, `user_id`, `period_start`, `period_end`, `total_amount`, `status`, `idempotency_key`, `created_at`, `processed_at`
  - Stores one payout attempt/result for a user and period context.

- `remittance_item`
  - `id`, `remittance_id`, `ledger_entry_id`, `amount`
  - Explicitly maps what ledger entries were included in a payout.

I used a normalized schema (instead of a single wide JSON table) to preserve clear lineage from work input -> ledger -> payout, which is critical for financial auditability and avoiding duplicate settlement.

### Key Design Choices

1. **Ledger-first settlement**
   - Approved segments and adjustments are converted to `ledger_entry` rows.
   - Trade-off: extra write path and mapping table, but much stronger correctness and traceability for retroactive updates.

2. **Carry-forward settlement eligibility**
   - Settlement queries unpaid ledger entries up to a run cutoff (`period_end`) instead of strictly within the same month only.
   - Trade-off: more complex explanation to API consumers, but directly satisfies overlapping-period correction requirements.

3. **Business IDs as primary keys**
   - Removed `external_*` columns and used IDs from data (`usr-*`, `wl-*`, `seg-*`, `adj-*`) as PKs.
   - Trade-off: tighter coupling to source IDs, but simpler schema and fewer joins/mappings.

---

## AGENTS.md Evaluation

### Rules I Followed

- **Domain-oriented project layout**: separated modules into `users`, `worklogs`, `ledger`, and `remittances`.
- **Synchronous handlers by default**: FastAPI routes are sync handlers.
- **Framework validation for payloads**: request DTOs are defined with Pydantic.
- **Batch processing behavior**: remittance generation processes users independently and returns aggregated run summary (`created/skipped/failed/errors`).
- **Application-layer financial aggregation**: totals and settlement amounts are computed in service logic.
- **Response envelope**: endpoints return `{ "data": ... }`.
- **Idempotency key usage**: remittances include idempotency keys to avoid duplicate attempt collisions.

### Rules I Rejected

- **Wide-table embedding recommendation**
  - Recommendation: prefer a wide/discriminator table with embedded JSON.
  - Decision: rejected; normalized tables were chosen to keep explicit financial relationships and simplify auditing.
  - I considered a polymorphic JSONB model for flexibility, but rejected it because this is a financial system requiring strong relational guarantees, auditability, and efficient aggregations. Instead, I used normalized tables with a ledger-based design to ensure correctness and performance.

- **Strict singular examples vs domain naming examples**
  - I aligned table names to singular `snake_case` as required (`user`, `worklog`, `time_segment`, etc.), but kept domain module names plural where that improved readability in code organization.

- **Explicit custom validator function for every domain field**
  - For this scope, I relied on typed models and service checks rather than hand-written validator functions per field.

---

## Edge Cases

### Considered Edge Cases

- **Work evolves after payment**
  - New approved segments become new `ledger_entry` records and are eligible in later runs if still unpaid.

- **Retroactive adjustments**
  - Adjustments are stored as independent events and mirrored into ledger with signed amounts.
  - Later runs include unresolved prior-period entries, so retroactive deductions/credits are carried forward.

- **Overlapping periods with corrections**
  - Settlement excludes entries already linked to `SUCCESS` remittances and includes unresolved entries up to run cutoff.
  - This prevents re-issuing old remittance while still applying late corrections.

- **Repeated settlement execution**
  - Already success-remitted ledger entries are excluded from future remittance creation.

- **Failure/cancellation lifecycle**
  - Non-success outcomes are represented by status (`FAILED`, `CANCELLED`) and can be explicitly set via status update endpoint.

- **Invalid input range**
  - `period_start > period_end` returns a failed summary response.

### Assumptions

- A ledger entry is considered settled only when linked to a `SUCCESS` remittance.
- `period_end` acts as settlement cutoff for unresolved entries, allowing carry-forward of older corrections.
- Seed endpoint can be called multiple times safely because segment/adjustment/reference identifiers prevent duplicate ledger projection for the same source event.
- External payment processor integration is out of scope; remittance status transitions are handled at application level.
