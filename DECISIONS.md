# Design Decisions

## Schema Design

### Tables / Collections

| Table | Purpose |
|-------|---------|
| `users` | Workers receiving remittances. |
| `worklog` | Container per task (`task_id` string); `status` ACTIVE (payable rules apply) or CLOSED (forced zero payout). |
| `work_log_segment` | Time lines: `duration_minutes` plus **exactly one** of `rate` (hourly) or `amount` (flat). `earned_at` **date** (UTC calendar day of work start) drives settlement **period eligibility**. |
| `adjustment` | Retroactive deltas (`amount_delta` signed). `type` (ADD / DEDUCT / MODIFY) is recorded for audit; **all types contribute via sum of `amount_delta`**. `created_at` drives eligibility when corrections are booked inside a period. |
| `remittance` | One row per `(user_id, period_start, period_end)` — natural key for idempotency. `status` SUCCESS (immutable payout), FAILED (retry allowed), CANCELLED (reserved). |
| `remittance_item` | Per–work-log line in a run: snapshots `computed_amount` (final liability), `adjustment_applied_amount` (sum of adjustments), `delta_paid` (this run’s net movement toward settlement). |

Normalized relational model was chosen over the JSONB “wide table” pattern in `backend/AGENTS.md` so constraints (FKs, XOR on segment rate/amount, unique remittance key) are enforced in PostgreSQL and reporting queries stay explicit.

### Key Design Choices

1. **Delta-based payouts (no double pay)** — `delta_paid` for a run is `final_amount − Σ(delta_paid | SUCCESS remittances for this worklog)`. Historical SUCCESS rows are never rewritten; late segments or adjustments change `final_amount`, and the next eligible run pays only the **increment**.
2. **Period eligibility** — A worklog is included in `generate-remittances(period_start, period_end)` if it has **any** segment with `earned_at` in the closed date range **or** any adjustment with `(created_at AT TIME ZONE 'UTC')::date` in that range. That covers “November run in December” while still attributing corrections booked in December to a December period when their `created_at` falls there.
3. **Negative totals** — If the sum of `delta_paid` for a user would be negative, the run persists `remittance` as **FAILED** with an error message and throws to the batch layer (user appears in `errors`). No SUCCESS row is written until data is consistent or a later run nets positive.

---

## AGENTS.md Evaluation

### Rules I Followed

- **Domain-oriented layout** — `src/user`, `src/worklog`, `src/settlement` each contain `models`, `service`, `routes`, `schemas`.
- **Synchronous HTTP** — Default async handlers without mixing blocking calls in async contexts.
- **Application-level aggregation** — Amounts summed in TypeScript services for unit-testability and a single place for rules.
- **Batch resilience** — `generate-remittances` loops users independently; one failure does not block others (errors collected).
- **Explicit validation** — `class-validator` on DTOs plus date-order checks in routes.

### Rules I Rejected

| AGENTS.md suggestion | Decision |
|---------------------|----------|
| Wide JSONB `record` table | Rejected: assessment requires explicit tables and auditable financial columns. |
| Response envelope `{ data, meta }` | Rejected for the two assessment endpoints: required response shapes are fixed (`success` / `generated` and a raw worklog array). |
| Granular commits (commit worklog before remittance) | Rejected: would break atomicity; each user’s remittance replace is **one transaction** with pessimistic lock. |
| Avoid SQL aggregation | Partially rejected: **one** grouped query for remitted totals by worklog id to avoid N+1; remaining sums stay in application code. |

---

## Edge Cases

### Considered Edge Cases

| Case | Handling |
|------|----------|
| Settlement run twice for same period | Unique `(user_id, period_start, period_end)`; second run with SUCCESS returns existing totals without new items. |
| FAILED remittance retry | Same key: items deleted and recomputed inside a transaction; SUCCESS remains immutable. |
| Retroactive adjustments after SUCCESS | `final_amount` increases/decreases; next run’s `delta_paid` picks up only the difference. |
| Worklog with no segments | `base_amount` 0; adjustments can still apply; included if adjustment activity falls in period. |
| CLOSED worklog | Treated as **zero** liability (no pay); segments still listed in GET for audit. |
| Negative total for user | Remittance **FAILED**, message stored; user listed in `errors`. |
| Concurrent runs | `SELECT … FOR UPDATE` on the `remittance` row under the same natural key serializes per user. |
| Duplicate segments | No DB uniqueness on segments beyond PK; duplicate rows would double `base_amount` (seed avoids duplicate disputed rows; production API would validate). |

### Assumptions

- Dates in API bodies are **ISO date** (`YYYY-MM-DD`); times are stored in UTC for `created_at` on adjustments.
- `task_id` is an opaque string (seed uses task title).
- Segment billing uses **approved** segments only in seed data; disputed/cancelled rows are omitted from seed inserts.

---

## Idempotency & Concurrency

- **Natural key** `(user_id, period_start, period_end)` ensures at most one remittance row per user per window.
- **Idempotent POST**: SUCCESS → read-only return path; FAILED → replace in one transaction.
- **Concurrency**: pessimistic row lock on `remittance` during replace.

---

## Documentation Artifacts

- **Schema diagram**: [backend/schema.dbml](backend/schema.dbml) (duplicate reference DDL: [backend/schema.sql](backend/schema.sql)).
- **Sample API JSON**: [sample-responses.json](sample-responses.json).
