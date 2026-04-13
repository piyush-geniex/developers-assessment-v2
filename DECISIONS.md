# Design Decisions

> Fill in each section below. This document is a required part of your
> submission and will be evaluated alongside your code.

## Schema Design

### Tables / Collections

- **`worklog`** — One row per task-level container (`external_id` matches seed `worklog_id`). Stores `user_id`, display fields, and `hourly_rate` used to value approved time. Normalized from the seed JSON for queryable settlement state.
- **`time_segment`** — Independently recorded work intervals with `start`/`end` (UTC), `status`, and optional `dispute_reason`. Only **`approved`** segments contribute to gross pay; **disputed** / **cancelled** are excluded from settlement totals but remain visible for audit.
- **`adjustment`** — Retroactive ledger entries (`amount` may be negative or positive) with `applied_at` (UTC). Adjustments are always included in the worklog’s **calculated** amount on reads; settlement picks up **unallocated** rows when a remittance is generated.
- **`remittance`** — One logical payout per **`(user_id, period_start, period_end)`** (unique constraint). Stores the **netted batch total** for that user-period and a **status** (`SUCCEEDED`, `FAILED`, `CANCELLED`, `PENDING` reserved). This models “single payout per cycle” while allowing failed/cancelled attempts to be retried.
- **`remittance_allocation`** — Links a remittance to specific **segments** and/or **adjustments** with a snapshot `amount`. Partial unique indexes ensure each segment/adjustment is allocated **at most once**, preventing double payment if settlement is re-run or periods overlap in time.

### Key Design Choices

1. **Allocations instead of mutating history** — Financial history stays append-friendly: we never rewrite segments after payment; instead, new segments/adjustments appear as new rows, and **allocations** record what a given remittance covered. This matches “work evolves after payment” and “adjustments can be retroactive” without reopening old remittance rows.
2. **Period overlap for segments, `applied_at` cutoff for adjustments** — **Segments** enter a settlement batch only if their interval overlaps the requested **`[period_start, period_end]`** (inclusive calendar dates, UTC boundaries). **Adjustments** are eligible if they are still **unallocated** and **`applied_at <= now()`** (settlement execution time). That allows a “November” run executed in December to include **late November/December-dated adjustments** in the November remittance **without duplicating** prior successful remittances, as long as those adjustments were not already allocated.
3. **Normalized tables vs. wide JSON** — `backend/AGENTS.md` suggests wide JSONB tables for read performance. I used **normalized FK tables** here because settlement correctness hinges on **set-oriented constraints** (partial uniques, FKs) and straightforward queries for “unallocated” rows. The trade-off is more joins if we later add heavy reporting; for this API surface, per-request volume is small and **application-level loading** (per AGENTS.md) keeps services explicit.

---

## AGENTS.md Evaluation

### Rules I Followed

- **Domain-oriented layout** under `backend/src/app/{worklogs,settlement}/` with `models`, `routes`, `service`, plus shared `config`, `database`, `main`.
- **Singular `snake_case` table names** and **indexes on FK columns**; composite/partial indexes where needed for allocation integrity.
- **HTTP status codes** — `201` when new remittances are created, `200` when the run is a no-op (idempotent), `400` for invalid period parameters.
- **Response envelope** with `data` + `meta.timestamp` / `meta.request_id` (optional `X-Request-ID` header).
- **Synchronous** FastAPI handlers and **SQLAlchemy sync** sessions.
- **Domain exceptions** type hierarchy under `settlement/exceptions.py` (reserved for future strict modes); **batch settlement** continues per user with per-user errors captured in `summary.errors`.
- **Explicit validator functions** in `worklogs/validation.py` and `settlement/validation.py` for amounts and period bounds.
- **Application-level composition** for worklog listing (load worklogs, then compute amount/status in Python) rather than SQL aggregation.
- **Constants** centralized in `app/constants.py` for segment statuses, remittance statuses, allocation types, and API header names.

### Rules I Rejected

- **Pure “wide JSONB record table”** — Rejected for this assessment to keep **allocation uniqueness** and FK integrity first-class; documented above.
- **Strict “no SQL aggregation ever”** — Counts and existence checks use SQL; **money totals** for API-displayed worklog amounts and remittance line items are summed in Python as required.
- **Granular two-commit settlement (mark settled, then pay)** — The sample used worklog-level status; this design uses **allocations** as the source of truth. I use **one transaction per user remittance** so we do not leave **orphan allocations** without a remittance if the second commit failed.
- **Raising on missing rate card** — Seed always includes `hourly_rate`; if missing in future, the service would log and default to **0** for that user’s segment valuation (pattern from AGENTS.md); not wired as a separate table in this scope.

---

## Edge Cases

### Considered Edge Cases

- **Idempotent `POST /generate-remittances`** — `(user_id, period_start, period_end)` unique with **`SUCCEEDED`** skips re-processing. Re-running returns **`200`** with `remittances_created: 0` and `skipped_already_settled` incremented.
- **Failed/cancelled remittance retry** — Non-successful remittance rows for a user-period are **removed** before a new attempt so the user is not permanently blocked after a failed payout.
- **Race / duplicate insert** — `IntegrityError` on insert falls back to “already settled” when a concurrent request wins the unique constraint.
- **Zero-duration approved segments** — Contribute **0** gross; still **allocatable** if ever included (harmless).
- **Negative net remittance** — Allowed (heavy deductions); amounts are **not clamped** to zero.
- **Users with nothing to settle** — No remittance row created; counted under `skipped_nothing_to_pay`.
- **GET `/worklogs` filters** — `remittance_status` filters the computed status; **period** filter matches worklogs with **segment overlap** or **adjustment `applied_at`** in the inclusive UTC window. `period_start` / `period_end` must be supplied together.

### Assumptions

- **“Eligible work within a given period”** for **segments** means **time worked** overlaps the period window; **adjustments** are not tied to the segment window and instead follow the **unallocated + applied_at cutoff** rule so retroactive corrections can be swept into the **correct settlement batch** when that batch is executed later.
- **Seed `hourly_rate` applies to all segments** on that worklog (no per-segment rate card).
- **Payout execution** (bank APIs) is out of scope; **`SUCCEEDED`** means “batch accepted internally” unless extended to integrate a PSP later.
- **First successful settlement for a calendar period** should be executed when finance is ready to include **all adjustments known through `as_of`**; an early successful run can **exclude** adjustments that do not yet exist—address operationally by re-run policies or future supplemental remittance types.
