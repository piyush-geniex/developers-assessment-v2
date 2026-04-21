# Design Decisions

## Schema Design

### Tables / Collections

Five normalised tables, each with a clear single responsibility:

**`worklog`** — the top-level container for work done against a task.
Stores the external `worklog_id`, the worker's identity (`user_id`, `user_name`), the task name, and the hourly rate that applies to this specific worklog. The rate is stored per-worklog rather than per-user because the seed data shows different rates for the same user across tasks (Alice has $75 on wl-001 and $80 on wl-009). This avoids a separate rate-card table and makes the rate immutable per worklog, which is what you want for financial records.

**`time_segment`** — individual recorded time blocks within a worklog.
Each segment has a status (`approved`, `disputed`, `cancelled`) and an optional `dispute_reason`. Only `approved` segments contribute to billable hours. Foreign-keyed to `worklog` via `worklog_id`.

**`adjustment`** — retroactive financial modifications applied to a worklog.
Can be negative (deductions) or positive (bonuses). The `applied_at` timestamp determines which settlement period picks up the adjustment, even if the worklog itself belongs to an earlier period. This is the core mechanism for prior-period corrections.

**`remittance`** — the settlement payout record for a user within a period.
Has a unique constraint on `(user_id, period_start, period_end)` which enforces idempotency — you cannot accidentally generate two remittances for the same user and period. Tracks `gross_amount` (segment hours × rate), `adjustment_amount` (sum of adjustments), and `net_amount` (gross + adjustments). The `status` field (`pending`, `paid`, `failed`, `cancelled`) models the payout lifecycle.

**`remittance_line`** — audit trail linking individual worklogs to a remittance.
Each line records the per-worklog breakdown of segment and adjustment amounts. This makes it possible to trace exactly which worklogs contributed to a payout and reconcile disputes.

### Key Design Choices

1. **Normalised tables over wide-table-with-discriminator**. The AGENTS.md recommends a single `record` table with a `type` column and a JSONB `payload`. I rejected this because it sacrifices referential integrity (no FKs between type variants), makes queries harder to reason about, and because the entities here have genuinely different shapes and lifecycles. Proper tables with constraints catch bugs at the database level rather than in application code.

2. **`applied_at` on adjustments drives period assignment**. An adjustment's `applied_at` determines which settlement period absorbs it, regardless of which worklog (and thus which historical period) it refers to. This is how prior-period corrections work: if October was already settled and a deduction for an October worklog arrives in November, it lands in the November settlement via `applied_at`.

3. **Unique constraint for idempotency**. The `(user_id, period_start, period_end)` unique constraint on `remittance` prevents duplicate settlements. If the endpoint is called twice for the same period, the first user that already has a remittance will hit the constraint and be reported in the error list — the rest continue processing. This is safer than application-level checks which are subject to race conditions.

---

## AGENTS.md Evaluation

### Rules I Followed

- **Domain-organised project layout** — code is grouped by domain (`settlement/`, `worklogs/`) with routes, service, schemas, and errors co-located, as specified.
- **HTTP status codes** — 201 for successful remittance creation, 200 for reads, 400 for validation, 409 for duplicates.
- **Domain exception hierarchy** — `SettlementError` → `AlreadySettledError`, `InvalidPeriodError`, mapped to HTTP codes at the route layer.
- **Fail-safe defaults** — if a worklog has no approved segments, it contributes 0 rather than throwing. Missing data doesn't break the batch.
- **Batch processing with per-item isolation** — each user is settled independently. One user's failure doesn't abort the run; the response includes a `succeeded`/`failed` summary.
- **Response envelopes** — all responses wrapped in `{ data, meta }`.
- **Input validation** — framework-level (Express middleware) for request parsing, plus explicit validation functions in `schemas.js`.
- **Connection pooling** — pg Pool with `max: 10`, request-scoped via `pool.query()`.
- **Synchronous handlers** — Express with standard async/await, no worker threads or message queues.
- **FK indexes** — all foreign key columns have explicit indexes.
- **Descriptive naming with abbreviated locals** — public function names are descriptive; short-lived loop variables are abbreviated.

### Rules I Rejected

1. **Wide table with JSONB discriminator** (Data Modelling → Table Design). The recommendation to use a single `record` table with `type` and `payload` columns throws away everything a relational database gives you: foreign key constraints, column-level type safety, meaningful indexes on actual columns, and schema-as-documentation. In a financial system where correctness matters more than migration convenience, proper tables are the right trade-off.

2. **JSON array columns for relationships** (Data Modelling → Relationships). Storing `segment_ids` as a JSONB array on the worklog makes it impossible to query segments directly, breaks referential integrity, and means you can't filter or aggregate on segment fields without unnesting arrays in every query. Standard FK relationships are more appropriate here.

3. **Application-level joins** (Query Patterns). The recommendation to load related entities with separate queries instead of SQL JOINs trades database-level efficiency for testability. The worklog listing endpoint needs segment hours, adjustment totals, and remittance status per worklog, which requires touching 4 tables. Doing that as N+1 separate queries would be measurably slower. I used LATERAL joins to keep it to a single query while maintaining readability.

4. **Application-level aggregation** (Query Patterns → Aggregation). For the worklog listing, computing `SUM()` in SQL is both faster and simpler than fetching all segments into Node.js and reducing them. The recommendation to avoid SQL aggregation only makes sense if your dataset is small enough that the overhead doesn't matter — but establishing good patterns matters regardless of current data size.

5. **Granular mid-operation commits** (Transaction Management). The recommendation to commit the worklog status change *before* creating the remittance is wrong for this use case. If the remittance insert fails after the worklog is marked settled, you've lost the ability to retry. I use a single transaction per user: the remittance and all its line items are committed atomically, so either the whole settlement succeeds or nothing persists.

6. **Explicit validator for every domain field** (Validation → Domain Validation). Writing a standalone validator function for every field (amount, date, status) when the schema/SQL constraints already enforce the same rules adds maintenance burden without adding safety. I validate at the boundary (request schemas) and rely on database constraints for persistence-level integrity.

---

## Edge Cases

### Considered Edge Cases

- **Duplicate settlement for the same period**: The unique constraint on `(user_id, period_start, period_end)` returns a 409 conflict. The batch continues processing other users even if one user already has a remittance.

- **Retroactive adjustments across periods**: Adjustments are assigned to settlement periods by `applied_at`, not by the worklog's date range. An adjustment applied in November for an October worklog will be included in the November settlement, which is exactly the "prior-period correction" behavior the spec requires.

- **Failed/cancelled payouts**: Remittances have a `status` field. A worklog is considered `REMITTED` only if it's linked to a remittance whose status is not `failed` or `cancelled`. If a payout fails, the worklogs become `UNREMITTED` again and are eligible for a future settlement (after the failed remittance is handled).

- **Zero-duration segments**: Segment seg-007 in the seed data has `start == end` (2025-10-21 09:00 to 09:00, i.e. 0 hours). The math handles this naturally — 0 hours × rate = $0.

- **Overlapping segments**: Segments seg-024 and seg-026 in wl-010 overlap in time. They're billed as-is since the spec doesn't mention deduplication, and the status/dispute mechanism exists specifically for flagging problematic entries.

- **Disputed/cancelled segments excluded**: Only segments with `status = 'approved'` contribute to billable hours. Disputed and cancelled segments are ignored in amount calculations.

- **Positive adjustments (bonuses)**: Adjustment adj-004 is +$120.00. The system handles both positive and negative adjustments since it simply sums the `amount` column.

- **User with no billable work in the period**: If a user's only segments are disputed/cancelled, they produce 0 hours. If they also have no adjustments in the period, no remittance is created.

### Assumptions

- The hourly rate stored on the worklog is the definitive rate. There's no separate rate-card table — the seed data shows per-worklog rates, including different rates for the same user across tasks.
- Settlement periods are defined by the caller and don't need to align to calendar months (the spec uses "month" as an example, but the endpoint accepts arbitrary date ranges).
- A worklog's "period" for date filtering is determined by its segments' `start_time`, not by a date field on the worklog itself.
- Adjustments can be applied to any worklog regardless of whether that worklog has already been settled. The adjustment lands in whatever settlement period its `applied_at` falls in.
- The system doesn't auto-transition remittance status (e.g., from `pending` to `paid`). That would be handled by an external payment processor calling back to update the status.
