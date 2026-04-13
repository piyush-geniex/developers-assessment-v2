# Design Decisions

> This document explains the schema and implementation choices for the
> WorkLog settlement solution.

## Schema Design

### Tables / Collections

- **`worklog`**
  - Columns: `id`, `external_id`, `user_id`, `user_name`, `task_name`, `hourly_rate`
  - Why: represents the task-level container for all related segments and adjustments. `external_id` preserves source identity from seed data, while `hourly_rate` stays on the worklog for deterministic segment valuation.

- **`time_segment`**
  - Columns: `id`, `worklog_id`, `external_id`, `start`, `end`, `status`, `dispute_reason`
  - Why: segments are independently recorded and can have different lifecycle statuses (`approved`, `disputed`, `cancelled`). Keeping them separate supports overlap queries and auditability.

- **`adjustment`**
  - Columns: `id`, `worklog_id`, `external_id`, `amount`, `reason`, `applied_at`
  - Why: retroactive financial changes are modeled as append-only ledger deltas so historical corrections are explicit and auditable.

- **`remittance`**
  - Columns: `id`, `user_id`, `period_start`, `period_end`, `amount`, `status`
  - Why: captures one settlement attempt per user and period (unique on `(user_id, period_start, period_end)`), including attempt outcome (`SUCCEEDED`, `FAILED`, `CANCELLED`, `PENDING`).

- **`remittance_allocation`**
  - Columns: `id`, `remittance_id`, `allocation_type`, `segment_id`, `adjustment_id`, `amount`
  - Why: allocation rows record exactly which segments/adjustments were included in a remittance and at what amount snapshot. Partial unique indexes prevent the same segment/adjustment from being allocated more than once in successful settlement history.

- **Normalization vs denormalization**
  - Chosen: normalized relational schema with explicit FK links.
  - Reason: settlement correctness depends on FK integrity, uniqueness constraints, and precise "unallocated item" checks. Denormalized JSON would reduce joins but make financial invariants harder to enforce.

### Key Design Choices

1. **Allocation ledger instead of mutating settled rows**
   - Choice: write remittance allocations for segments/adjustments rather than flipping per-item "settled" flags.
   - Trade-off: one extra table and joins, but much better audit trail and idempotency safety.

2. **Eligibility rules split by data type**
   - Choice: segments are eligible by period overlap; adjustments are eligible when unallocated and `applied_at <= as_of`.
   - Trade-off: slightly more complex query logic, but this correctly supports late retroactive adjustments without reopening previous successful remittances.

3. **Status-aware settlement accounting**
   - Choice: only allocations tied to `SUCCEEDED` remittances count as settled; failed/cancelled attempts do not block retries.
   - Trade-off: additional filtering logic, but behavior aligns with requirement that settlement attempts may fail/cancel and later be retried.

---

## AGENTS.md Evaluation

### Rules I Followed

- **Domain-oriented project layout** (`worklogs` and `settlement` domains with routes/services/models/validation): improves ownership and locality of business logic.
- **Singular `snake_case` table names** and indexed foreign keys: aligns with guidance and supports performant FK traversal.
- **Synchronous handlers and SQLAlchemy sync sessions**: keeps complexity low for this assessment scope.
- **Response envelope** (`data`, `meta.timestamp`, `meta.request_id`): implemented consistently across endpoints.
- **Service-level validation helpers** for periods, amounts, and segment intervals: makes key domain checks explicit and testable.
- **Batch continuation behavior** in settlement: one user failure is captured in summary errors and does not abort the entire run.

### Rules I Rejected

- **Wide JSONB record-table pattern**
  - Recommendation: prefer wide embedded data models.
  - Decision: rejected in favor of normalized tables because settlement allocation integrity (FKs + unique constraints) is central to correctness.

- **Avoid SQL checks/aggregation entirely**
  - Recommendation: keep aggregation in application code.
  - Decision: monetary totals are computed in Python, but lightweight SQL existence checks and filters are used for practical query efficiency and clarity.

- **Granular multi-commit settlement sample pattern**
  - Recommendation: commit each unit in sequence.
  - Decision: one transaction per user attempt is used to avoid partial writes (e.g., remittance created without complete allocations or vice versa).

---

## Edge Cases

### Considered Edge Cases

- Re-running a successful period is idempotent (`200`, no new remittances).
- Failed/cancelled attempts can be retried and replaced by a later successful attempt.
- Concurrency conflicts are handled via unique constraint + `IntegrityError` fallback to settled state.
- Zero-duration approved segments contribute `0.00`.
- Negative net remittances are allowed.
- Users with no eligible items are counted under `skipped_nothing_to_pay`.
- `/worklogs` period filter includes segment overlap or adjustment `applied_at` within the period window.

### Assumptions

- Segment eligibility is based on worked-time overlap with the period.
- Adjustment eligibility is based on unallocated rows and `applied_at` cutoff at execution time.
- External payout provider integration is out of scope; status is persisted as the attempt outcome.
