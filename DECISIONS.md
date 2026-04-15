# Design Decisions

## Schema Design

### Tables / Collections

#### `worklog`
| Column             | Type          | Notes                                       |
|--------------------|---------------|---------------------------------------------|
| id                 | SERIAL PK     |                                             |
| external_id        | VARCHAR UNIQUE| Original ID from seed data (e.g. `wl-001`) |
| user_id            | VARCHAR       | Worker identifier                           |
| user_name          | VARCHAR       | Denormalised for read convenience           |
| task_name          | VARCHAR       |                                             |
| hourly_rate        | NUMERIC(10,2) | Rate applied to all segments of this task   |
| remittance_status  | VARCHAR       | `REMITTED` \| `UNREMITTED`                 |
| created_at         | TIMESTAMPTZ   |                                             |

#### `time_segment`
| Column      | Type        | Notes                                           |
|-------------|-------------|-------------------------------------------------|
| id          | SERIAL PK   |                                                 |
| external_id | VARCHAR UNIQUE |                                              |
| worklog_id  | INT FK      | References `worklog.id`                         |
| started_at  | TIMESTAMPTZ |                                                 |
| ended_at    | TIMESTAMPTZ |                                                 |
| status      | VARCHAR     | `approved` \| `disputed` \| `cancelled`        |
| dispute_reason | TEXT NULL |                                               |

#### `adjustment`
| Column                    | Type          | Notes                                                          |
|---------------------------|---------------|----------------------------------------------------------------|
| id                        | SERIAL PK     |                                                                |
| external_id               | VARCHAR UNIQUE|                                                               |
| worklog_id                | INT FK        | References `worklog.id`                                        |
| amount                    | NUMERIC(12,2) | Positive = bonus, negative = deduction                         |
| reason                    | TEXT          |                                                                |
| applied_at                | TIMESTAMPTZ   |                                                                |
| settled_in_remittance_id  | INT NULL      | FK to `remittance.id`; NULL = not yet settled                  |

The `settled_in_remittance_id` column is the core mechanism for handling retroactive adjustments. An adjustment applied in December to October work will have `NULL` here until the next settlement run includes it, regardless of whether the parent worklog is already `REMITTED`.

#### `remittance`
| Column       | Type          | Notes                                     |
|--------------|---------------|-------------------------------------------|
| id           | SERIAL PK     |                                           |
| user_id      | VARCHAR       |                                           |
| user_name    | VARCHAR       |                                           |
| period_start | DATE          |                                           |
| period_end   | DATE          |                                           |
| amount       | NUMERIC(12,2) |                                           |
| status       | VARCHAR       | `SETTLED` \| `FAILED` \| `CANCELLED`     |
| created_at   | TIMESTAMPTZ   |                                           |

Unique constraint on `(user_id, period_start, period_end)` enforces idempotency at the DB level.

### Key Design Choices

**1. Normalized tables instead of a wide JSONB table**
Keeping worklogs, segments, and adjustments in separate typed tables makes every field queryable, indexable, and type-safe. Using a JSONB payload blob would make it impossible to filter or sort on fields like `started_at` or `status` without casting, would prevent foreign key constraints, and would push schema enforcement entirely into application code.

**2. `settled_in_remittance_id` on `adjustment` instead of a period snapshot**
Rather than computing "which adjustments were created after the last run", I track whether each adjustment has been included in a remittance via a nullable FK. This means retroactive adjustments on already-settled worklogs are naturally picked up in the next run without re-issuing the original remittance.

**3. Single database transaction per user settlement**
Creating the remittance row, marking worklogs REMITTED, and stamping adjustments all happen inside one `dataSource.transaction()` call. This guarantees atomicity — a crash mid-way leaves no partial state. The alternative (separate commits per step) would leave the system in inconsistent states that are difficult to recover from in a financial context.

---

## AGENTS.md Evaluation

### Rules I Followed

- **Domain-based folder structure** — worklogs and settlement are separate modules, each with their own controller, service, DTO, and entity files.
- **HTTP status codes** — `201` for `POST /generate-remittances`, `400` for validation failures, `409` for duplicate settlement attempts.
- **Input validation via framework decorators** — `class-validator` decorators on DTOs rather than hand-written validators.
- **Idempotency** — duplicate `(user_id, period_start, period_end)` is rejected before any write.
- **Batch processing with partial failure** — each user is settled independently; one failure logs and continues, returning a full summary.
- **Connection pooling** — `poolSize: 10` set on the TypeORM connection.

### Rules I Rejected

- **Wide table with JSONB payload** — The document recommends storing worklogs, segments, and adjustments in a single `record` table with a `type` discriminator and `payload JSONB` column. I rejected this because: (1) financial data must be individually queryable and indexable; (2) JSONB blobs cannot have typed constraints or FK relationships; (3) migrating the payload shape later requires a JSON migration rather than a column migration. Normalized tables are the correct choice here.

- **Application-level joins instead of SQL JOINs** — The document recommends running separate queries per entity and joining in application code. This is effectively an N+1 query pattern and does not scale. TypeORM's `leftJoinAndSelect` expresses the same intent more efficiently in a single round-trip.

- **Aggregation in application code instead of SQL** — I do compute hours × rate in TypeScript (which is reasonable for a small dataset and keeps the formula testable), but I use SQL `WHERE` filtering and TypeORM query builders where appropriate rather than loading all rows and filtering in memory.

- **Granular commits (separate commit per step)** — The document recommends committing the worklog status change before creating the remittance so the worklog "won't be picked up again". This approach deliberately creates inconsistent intermediate states. In a financial system, atomicity is more important than avoiding re-processing — the idempotency check on remittance creation already prevents double payment.

- **Explicit validator function for every field** — The document recommends writing a `validate_amount(value)` function for every entity field alongside framework decorators. This is redundant and increases maintenance surface. `class-validator` decorators are the established NestJS pattern.

- **File naming (`routes.*`, `models.*`)** — The document uses non-standard names for NestJS projects. I followed NestJS conventions: `*.controller.ts`, `*.service.ts`, `*.entity.ts`, `*.dto.ts`.

---

## Edge Cases

### Considered Edge Cases

**Duplicate settlement run for the same period**
The `remittance` table has a unique index on `(user_id, period_start, period_end)`. The service also checks for an existing record before writing, returning a structured error per user in the batch response rather than aborting the whole run.

**Retroactive adjustments on already-settled worklogs**
Handled via `settled_in_remittance_id = NULL` on the adjustment. When November runs in December, any adjustments stamped onto October worklogs (which are already `REMITTED`) but not yet linked to a remittance will be included in the November settlement amount. The October remittance is untouched.

**Settlement period with no eligible worklogs for a user**
`baseAmount` is 0, and only pending adjustments contribute to the remittance. A remittance is still created so the period is marked as processed for that user.

**Segment with zero duration (start === end)**
Hours calculation returns 0; the segment contributes nothing to the amount. No error is thrown.

**Disputed and cancelled segments excluded from payment**
Only `status === 'approved'` segments are summed. Disputed segments are visible in the response for admin review but do not affect the calculated amount.

**Failed or cancelled payout**
The `remittance.status` column supports `FAILED` and `CANCELLED`. These can be updated by an admin action (not in scope for this assessment). Because the idempotency check queries by status-agnostic `(user_id, period_start, period_end)`, a failed remittance would block a re-run for the same period — which is intentional: a human should review and handle failed payouts rather than automatically retrying.

### Assumptions

- A worklog is "in period" if at least one of its approved segments has `started_at` within `[period_start, period_end]` inclusive.
- `period_start` and `period_end` in request bodies are ISO date strings (`YYYY-MM-DD`).
- All monetary values are stored and returned as `NUMERIC(12,2)` to avoid floating-point drift.
- The seed data `external_id` values are treated as stable identifiers; re-seeding is idempotent based on `worklog.count()`.
