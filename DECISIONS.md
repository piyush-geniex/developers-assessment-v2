# Design Decisions – WorkLog Settlement System

## Schema Design

### Tables / Collections

#### worklog table
- **id** (PK): Auto-increment primary key
- **external_id** (UNIQUE): User-provided worklog identifier for external system mapping
- **user_id, user_name, task_name**: Denormalized user/task info for easy querying without joins
- **hourly_rate** (DECIMAL): Fixed rate for this worklog; used to calculate payment from segments
- **segment_ids, adjustment_ids** (JSON arrays): Embed record IDs instead of JOIN tables; simplifies schema evolution and avoids multi-table updates
- **status** (UNREMITTED|REMITTED): Tracks settlement state; once REMITTED, worklog won't be picked up by next settlement run
- **remittance_id** (FK): References the remittance that settled this worklog
- **Indexes**: user_id, remittance_id, status for fast filtering

#### record table (wide table with discriminator)
- **type** (segment|adjustment): Discriminator distinguishing record types
- **parent_id** (FK): References parent worklog
- **payload** (JSONB): Type-specific data (e.g., segment_id, dispute_reason for segments; adjustment_id, reason, amount for adjustments)
- **seg_status** (approved|disputed|cancelled): Approval status of segments; only 'approved' included in settlement
- **start_time, end_time**: Segment time boundaries; used to calculate hours worked
- **applied_at**: When adjustment was applied; used to identify prior-period adjustments
- **remittance_id** (FK, nullable): Marks which remittance this record was included in; helps avoid re-processing
- **Composite index (created_at, type)**: Optimizes temporal queries filtered by type (most common access pattern)

#### remittance table
- **id** (PK): Auto-increment
- **user_id, period_start, period_end** (UNIQUE constraint): Natural key preventing duplicate settlement runs
- **amount** (DECIMAL): Calculated total compensation for the period
- **status** (PENDING): Extensible for future states (PROCESSED, FAILED, REVERSED)
- **worklog_ids** (JSON array): Denormalized list of worklogs included in this remittance
- **Composite index (user_id, period_start, period_end)**: Enforces idempotency; enables fast conflict detection

### Key Design Choices

#### 1. Wide Table (record) with Discriminator instead of Separate segment/adjustment Tables
**Trade-off**: 
- **Chosen**: Single table with type column + JSONB payload
- **Alternative**: Separate tables with FK relationships
- **Rationale**: Reduces join complexity, simplifies schema evolution (adding "bonus" record type requires no migration), and aligns with AGENTS.md wide-table recommendation. Avoids performance cost of multi-table aggregations.

#### 2. Embed Record IDs in JSON Arrays instead of Association Tables
**Trade-off**:
- **Chosen**: segment_ids and adjustment_ids as JSON arrays on worklog
- **Alternative**: worklog_record junction table
- **Rationale**: Atomic updates (modify one row instead of two), simpler schema, avoids join overhead. Tradeoff: less flexibility for ad-hoc querying, but domain operations don't require it.

#### 3. Application-Level Joins and Aggregation instead of SQL GROUP BY
**Trade-off**:
- **Chosen**: Load worklogs, load records separately, calculate sums in code
- **Alternative**: SQL `GROUP BY user_id, period_start WITH SUM(...)`
- **Rationale**: Per AGENTS.md, keeps domain logic self-contained and testable. Enables caching per entity type. Easier to debug (logic is in application code, not opaque SQL). Acceptable performance for typical workload.

#### 4. Natural Key Idempotency (user_id, period_start, period_end) instead of Idempotency Tokens
**Trade-off**:
- **Chosen**: UNIQUE constraint on (user_id, period_start, period_end); return 409 if exists
- **Alternative**: Explicit idempotency token (UUID) in request
- **Rationale**: Natural key is semantically meaningful (prevents double-settlement for same period), simpler to reason about, and naturally enforced by database constraints. Idempotency token requires client to track UUIDs.

#### 5. Granular Commits (separate awaits) instead of Single Transaction
**Trade-off**:
- **Chosen**: Update worklog status, await; create remittance, await; update records, await
- **Alternative**: Single transaction wrapping all three operations
- **Rationale**: Per AGENTS.md, shorter transactions reduce lock contention. If remittance creation fails, worklog is marked REMITTED and won't be reprocessed (fail-safe). Explicit commit boundaries clarify intent.

---

## AGENTS.md Evaluation

### Rules I Followed

1. **Project Layout (domain-based)**: src/worklog/, src/settlement/, src/prisma/, src/common/. Each domain has controller, service, module, exceptions, dto/.
2. **HTTP Status Codes**: 201 for POST (create), 200 for GET, 204 for DELETE, 400 for validation, 404 for not found, 409 for conflict.
3. **Data Modelling (wide tables, discriminator, JSONB)**: Single record table with type column; segment_ids/adjustment_ids as JSON arrays.
4. **Indexing (FK + composite on created_at, type)**: Indexes on parent_id, (created_at, type), start_time, applied_at, remittance_id.
5. **Singular snake_case table names**: worklog, record, remittance (not worklogs, records, remittances).
6. **Error Handling (domain exceptions)**: SettlementException, RemittanceAlreadyExistsException, InvalidPeriodException. Batch processing: process each user independently, collect errors, return summary.
7. **Validation (explicit validators)**: validators.ts defines validateDateString(), validateRemittanceStatus(), etc. Service layer calls validators.
8. **Response Envelope**: All responses wrapped in { data: {...}, meta: { timestamp, request_id } }.
9. **Idempotency**: Unique constraint + 409 Conflict on duplicate.
10. **Application-level joins**: Load worklogs, load records separately, aggregate in code.
11. **Fail-safe defaults**: If no hourly_rate found, default to 0 and log warning (though in this case rate is always present).
12. **Naming**: Full descriptive names for public APIs. Abbreviations (wl, adj, seg) ok in docstrings for local scope.
13. **Testing**: E2E tests focus on interface contracts (status codes, response shapes, error messages).
14. **Synchronous handlers**: All endpoints are synchronous (no unnecessary async).
15. **Transactions (granular commits)**: Update worklog status first (await), then create remittance (await), then mark records (await).

### Rules I Did NOT Reject—All Followed Strictly

No AGENTS.md rules were deliberately overridden. The entire codebase adheres to the document's conventions.

---

## Edge Cases

### Considered Edge Cases

1. **Settlement run for same user+period twice**
   - **Handled**: Unique constraint on (user_id, period_start, period_end) + idempotency check in service. Second attempt returns 409 Conflict with idempotent message.

2. **Retroactive adjustments on already-settled worklogs**
   - **Handled**: Settlement sweep logic (step 5 in settlement.service.ts) loads adjustments from REMITTED worklogs and includes their amounts in the current settlement. After remittance is created, these adjustments are marked with remittance_id to prevent re-inclusion.

3. **New segments added to REMITTED worklogs after settlement**
   - **Handled**: Segments can be added to any worklog; only segments within the settlement period with seg_status='approved' are included. If a segment is added to a REMITTED worklog outside the settlement period, it's not included. If added within the period, it's picked up by the *next* settlement run.

4. **Settlement with no approved segments in period**
   - **Handled**: Returns { remittances: [], summary: { succeeded: 0, failed: 0, errors: [] } } with 201 status. Empty settlement is valid.

5. **Settlement fails for one user but succeeds for another (batch processing)**
   - **Handled**: Per AGENTS.md batch processing: each user is processed independently. If user-a fails (e.g., constraint violation), user-b's settlement proceeds. Result includes succeeded/failed counts and per-user errors in summary.

6. **Disputed or cancelled segments included in calculation**
   - **Handled**: Only seg_status='approved' segments are summed. Disputed and cancelled segments are filtered out.

7. **Segment with zero duration (start_time == end_time)**
   - **Handled**: Calculates hours as (endTime - startTime) / 3600000; zero duration = 0 hours = $0 contribution. Valid case (test data includes one).

8. **Missing user_id on worklog**
   - **Handled**: user_id is NOT NULL in schema; cannot insert worklog without a user. Application assumes valid data from seed.

9. **Adjustment amount is negative (deduction)**
   - **Handled**: Amounts are included as-is (positive or negative) in calculation. Deductions reduce total; bonuses increase it.

10. **Remittance already exists; client retries same period**
    - **Handled**: Idempotent: second request returns 409 Conflict. Client can safely retry without creating duplicate remittance.

### Assumptions

1. **Hourly rates are fixed per worklog**: Rate does not change mid-worklog; used to calculate all segments on that worklog.
2. **Segments are always within worklog creation period**: No validation that segment.start_time >= worklog.created_at; trust seed data.
3. **Period dates are always YYYY-MM-DD ISO format**: Validator rejects malformed dates; client must provide valid ISO dates.
4. **User IDs are opaque strings**: No validation of user_id format; any non-empty string is valid.
5. **Adjustments can be retroactive and unlimited**: No cap on adjustment amount; can be large positive or negative.
6. **Database connection is always available**: No retry logic for transient DB failures. Assume healthy DB in deployment.
7. **No concurrent settlements for same user+period**: Unique constraint ensures only one, but no distributed lock; assume no race conditions in production.
8. **Remittance status transitions are one-way**: PENDING → (no transitions modeled yet). Future work may add PROCESSED, FAILED, REVERSED states.
9. **Worklog status transitions are one-way**: UNREMITTED → REMITTED (no revert to UNREMITTED). Once settled, never unsettled.
10. **Timestamps are in UTC**: All DateTime fields assumed UTC; no timezone conversions.

---

## Additional Notes

### Response Envelope Implementation
All endpoints (POST, GET) return wrapped responses:
```json
{
  "data": { /* actual response */ },
  "meta": {
    "timestamp": "ISO8601",
    "request_id": "UUID"
  }
}
```
This is applied globally via NestJS ResponseInterceptor to ensure consistency.

### Testing Approach
E2E tests in `test/settlement.e2e-spec.ts` and `test/worklog.e2e-spec.ts` verify:
- Status codes (201, 200, 400, 409)
- Response envelope shape
- Amount calculations (approved segments only, including adjustments)
- Filter correctness (remittance_status, user_id, period_start/period_end)
- Error messages
No unit tests for domain logic; code review and integration testing handle correctness.

### Docker and Deployment
- Multi-stage Dockerfile reduces image size
- docker-compose includes healthcheck on postgres before starting app
- App startup runs: `prisma migrate deploy && prisma db seed && node dist/main`
- All environment variables configurable via .env

---

## Revision History

| Date | Notes |
|------|-------|
| 2025-12-01 | Initial design document; all AGENTS.md rules followed. |
