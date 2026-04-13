# Design Decisions

> This submission implements the WorkLog settlement API with **NestJS**, **TypeScript**, **PostgreSQL**, and **TypeORM**, following `backend/AGENTS.md` where it applies to this stack.

## Schema Design

### Tables / Collections

- **`worklog`** — One row per worklog. **Segments and adjustments are stored as JSONB** on the row (embedded payloads), matching the assessment seed shape and the AGENTS.md preference for embedding related data that is always read together. Columns: `external_id` (seed key such as `wl-001`), `user_id`, display fields, `hourly_rate`, `segments`, `adjustments`.

- **`remittance`** — One payout attempt per user for a given settlement run over `[period_start, period_end]`. Stores `amount` (net for that run), `status` (`completed` | `failed` | `cancelled`), and `created_at`. Failed payouts **do not** create remittance lines, so billable components stay **UNREMITTED** and can be picked up by a later run.

- **`remittance_line`** — Atomic lines that tie a **specific segment or adjustment** (by `component_kind` + `reference_id`) to a completed remittance. **Unique** on `(worklog_id, component_kind, reference_id)` prevents paying the same component twice. This supports: new segments after a prior payout, retroactive adjustments in a **later** period without altering old remittances, and idempotent re-runs (already-settled components are skipped).

### Key Design Choices

1. **Period rules** — An **approved** segment is included in a settlement if its **segment end** date (UTC calendar day) falls in `[period_start, period_end]`. An **adjustment** is included if its **`applied_at`** date (UTC calendar day) falls in the same range. Retroactive adjustments dated in December therefore appear in a **December** settlement, not by mutating October’s remittance.

2. **Remitted vs unremitted** — A worklog is **REMITTED** only when **every** billable component (each approved segment + each adjustment) has a matching `remittance_line` on a **completed** remittance. Adding a new approved segment or adjustment moves the worklog back to **UNREMITTED** until those new components are settled.

3. **Batch settlement** — Users are processed **independently** (per AGENTS.md): errors on one user are logged, recorded in the response `summary.errors`, and do not abort the whole batch. Each successful user’s remittance + lines are committed in **one transaction**; failed payout simulation (optional `PAYOUT_FAIL_USER_ID`) persists a **failed** remittance with **no lines**.

---

## AGENTS.md Evaluation

### Rules I Followed

- **Domain-oriented layout** — `worklog/` and `settlement/` each contain controller-equivalent routes, entities (models), services, and DTOs (schemas).
- **HTTP status codes** — `POST /generate-remittances` returns `201` when at least one remittance row is created, `200` when the run is a no-op (idempotent re-run with nothing new to settle). `GET /worklogs` uses `200`. Invalid periods / query combinations return `400`.
- **Response envelope** — All successful JSON responses use `{ "data", "meta": { "timestamp", "request_id" } }` via a global interceptor; `x-request-id` is honored when sent.
- **Domain validation** — Explicit validators in `common/domain.validation.ts` for amounts and hourly rates, plus `class-validator` on DTOs.
- **Batch resilience** — Per-user try/catch in settlement with a summary of successes, failures, and errors.
- **Short transactions** — One transaction per user remittance + line inserts.
- **Application-level composition** — Totals and eligibility are computed in TypeScript; listing uses straightforward queries without SQL aggregation for totals.
- **Idempotency** — Natural keys on lines prevent double settlement of the same segment/adjustment; repeat runs for the same period only pick up **new** eligible components.

### Rules I Rejected

- **Synchronous-only handlers** — AGENTS.md defaults to sync handlers for Python; **NestJS/Node use async I/O idiomatically** for database access. Behavior matches the same business rules.
- **`synchronize: true`** — Enabled for the assessment via `TYPEORM_SYNC` for zero-friction startup. Production would use migrations instead (called out explicitly here).
- **Composite `(created_at, type)` index on a discriminator table** — Not used because we did not model a single polymorphic `record` table; remittance already has `(created_at, status)` for time-scoped status queries.

---

## Edge Cases

### Considered Edge Cases

| Case | Handling |
|------|----------|
| Re-run settlement for the same period | Already-settled components are skipped; only new segments/adjustments in range create new lines. Unique constraint races are caught and reported per user. |
| Retroactive adjustment after prior period paid | New line in a **later** period’s remittance; old `remittance` rows unchanged. |
| Payout fails | `remittance` with `status=failed`, **no** `remittance_line` rows; amounts remain unsettled. Optional `PAYOUT_FAIL_USER_ID` simulates failure for one user. |
| Disputed / cancelled segments | Excluded from earnings and from settlement (`status` must be `approved`). |
| Zero-duration approved segment | Contributes **0** hours (and therefore **0** amount). |
| Worklog with no billable components | Treated as **REMITTED** (nothing to settle). |
| Negative net remittance | Allowed (adjustments can dominate); amounts stored with two decimal places. |

### Assumptions

- Dates in the API are **inclusive** calendar ranges in **UTC** (derived from ISO timestamps on segments and adjustments).
- “Single payout” per user per run is modeled as **one `remittance` row** for that period window; supplemental amounts in the same window from new components can produce **additional** completed remittances for the same user and overlapping dates, each with its own lines (multiple payouts in practice would be reconciled downstream).
- Seed file path is resolved from `SEED_PATH` or common locations (`../seed/worklogs.json` when running from `backend/`).
