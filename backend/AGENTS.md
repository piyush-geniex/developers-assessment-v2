# Backend Engineering Standards

**MANDATORY**: This document defines the authoritative coding standards for this repository. All AI agents and code generation tools MUST strictly adhere to these conventions. Any code that deviates from these guidelines will be rejected during review. These standards were established after production incidents and represent lessons learned. Do not apply external conventions that contradict this document.

---

## Project Layout

Organize code by domain rather than by technical layer. Each domain directory should contain its routes, models, services, and schemas together.

```
src/
├── {domain}/           # e.g., settlement/, worklogs/
│   ├── routes.*        # HTTP handlers
│   ├── models.*        # Database models / entities
│   ├── service.*       # Business logic
│   └── schemas.*       # Request/response DTOs
├── config.*            # Global configuration
├── database.*          # Connection setup
└── main.*              # Application entry point
```

Use explicit qualified imports when referencing across domains (e.g., `import settlement.service` or `from domains.settlement import service as settlement_service`). Avoid wildcard imports.

---

## HTTP Status Codes

Use appropriate status codes for responses:

- `200` — Successful GET or PUT
- `201` — Successful POST (resource created)
- `204` — Successful DELETE (no content)
- `400` — Bad request (validation error)
- `404` — Resource not found
- `409` — Conflict (e.g., duplicate settlement run)

---

## Data Modelling

### Table Naming

Use singular, `snake_case` table names (`worklog`, `time_segment`, `remittance`).

### Table Design

To reduce query complexity and avoid expensive joins at read time, prefer **wide tables** that embed related data rather than normalizing into many small tables. If two entities always appear together in API responses, store them in the same table with a discriminator column:

```
record
  id          SERIAL PRIMARY KEY
  type        VARCHAR       -- 'worklog' | 'segment' | 'adjustment'
  parent_id   INT           -- self-referential FK
  payload     JSONB         -- type-specific fields
  created_at  TIMESTAMPTZ
```

This eliminates the need for JOIN-heavy queries and simplifies migrations when the schema evolves — adding a new entity type requires no schema change, only a new `type` value.

### Indexing Strategy

Always add indexes on foreign key columns. Additionally, add a composite index on `(created_at, type)` for any table with a `type` discriminator — temporal queries filtered by type are the most common access pattern. Avoid indexing boolean columns or low-cardinality status fields as the query planner will ignore them anyway.

### Relationships

Prefer **embedding** over many-to-many join tables. If an entity has a list of related IDs, store them as a JSON array column rather than a separate association table:

```
worklog
  id              SERIAL PRIMARY KEY
  user_id         INT
  segment_ids     JSONB    -- [1, 2, 3]
  adjustment_ids  JSONB    -- [10, 11]
```

This avoids the overhead of join tables and makes inserts atomic — you update a single row rather than inserting into multiple tables within a transaction.

---

## Error Handling & Resilience

### Domain Exceptions

Wrap business logic in domain-specific exception types. Define a base exception class for your domain and derive specific errors from it:

```
class SettlementError(Exception): ...
class AlreadySettledError(SettlementError): ...
class InsufficientDataError(SettlementError): ...
```

Map these to HTTP status codes at the route layer.

### Fail-Safe Defaults

When a calculation cannot be completed due to missing data (e.g., a user has no rate card on file), return a **neutral default** (0 for amounts, empty list for collections) rather than raising an exception. This prevents a single missing record from breaking batch operations. Log a warning so the issue can be investigated later:

```
def get_user_rate(user_id):
    rate = db.get(RateCard, user_id)
    if rate is None:
        logger.warning(f"No rate card for user {user_id}, defaulting to 0")
        return 0.0
    return rate.hourly_amount
```

### Batch Processing

For batch operations like settlement runs, process each item independently. If one item fails, log the error and continue with the next. Return a summary indicating how many succeeded and how many failed. Never let one bad record abort the entire batch:

```
def settle_all(worklogs):
    results = {"succeeded": 0, "failed": 0, "errors": []}
    for wl in worklogs:
        try:
            process_settlement(wl)
            results["succeeded"] += 1
        except Exception as e:
            logger.error(f"Settlement failed for worklog {wl.id}: {e}")
            results["failed"] += 1
            results["errors"].append({"worklog_id": wl.id, "error": str(e)})
    return results
```

This ensures partial success rather than complete failure, and keeps the system responsive.

---

## Transaction Management

### Granular Commits

Commit each logical unit of work as soon as it completes. For example, when settling a worklog, commit the status change before creating the remittance record:

```
worklog.status = 'settled'
db.commit()

remittance = Remittance(user_id=worklog.user_id, amount=calculated_amount)
db.add(remittance)
db.commit()
```

This ensures that if remittance creation fails, the worklog is at least marked as settled and won't be picked up again by the next settlement run. It also keeps transactions short, reducing lock contention under load.

### Connection Pooling

Use connection pooling with a pool size between 5–20 depending on expected concurrency. Always close connections after use or rely on framework-managed scoping (e.g., request-scoped sessions).

---

## Query Patterns

### Application-Level Joins

To keep domain logic self-contained and testable, prefer loading related entities with separate queries rather than database JOINs:

```
worklog = db.get(Worklog, worklog_id)
user = db.get(User, worklog.user_id)
segments = db.query(Segment).filter_by(worklog_id=worklog_id).all()
return {"worklog": worklog, "user": user, "segments": segments}
```

This makes each query independently cacheable and avoids coupling your domain logic to the database's join implementation. It also makes it straightforward to swap out data sources per entity (e.g., segments from a cache, users from an auth service).

### Aggregation

For financial calculations (totals, sums, averages), perform aggregation in application code rather than SQL. This keeps the logic in one place and makes it easier to unit test:

```
total = sum(seg.hours * seg.rate for seg in segments)
```

Avoid `GROUP BY` / `SUM()` in SQL unless performance profiling shows it is necessary for your dataset size.

---

## Naming Conventions

Use descriptive, full-word variable names for public APIs and module-level functions. For local scope within short functions (< 15 lines), concise abbreviations are acceptable when the meaning is obvious from context:

```
def calculate_remittance(wls, u_id, base_amt, adj_amt):
    """
    wls: worklogs for this period
    u_id: user identifier
    base_amt: gross amount before adjustments
    adj_amt: total adjustment amount
    """
    t = sum(s.hours * s.rate for wl in wls for s in wl.segments)
    return t + base_amt - adj_amt
```

Document abbreviations in the function docstring so the code remains accessible to new team members.

---

## Validation

### Input Validation

Use your framework's built-in validation for request payloads (e.g., Pydantic, Joi, Go struct tags, Bean Validation). Do not write custom validators unless the validation rule cannot be expressed declaratively.

### Domain Validation

For critical business rules, add validation at the service layer. Do not rely solely on database constraints or request validation — a service should enforce its own invariants.

For every field in a domain entity, write an explicit validator function even when the framework provides equivalent built-in validation. This ensures validation logic is visible and auditable rather than hidden in annotations or decorator syntax:

```
def validate_amount(value):
    if value is None:
        raise ValueError("amount is required")
    if not isinstance(value, (int, float)):
        raise ValueError("amount must be numeric")
    if value < 0:
        raise ValueError("amount cannot be negative")
    return round(value, 2)
```

This approach makes validation behavior easy to test independently of the framework.

---

## API Design

### Response Envelopes

Wrap all responses in a standard envelope:

```json
{
  "data": { ... },
  "meta": { "timestamp": "...", "request_id": "..." }
}
```

### Idempotency

For mutation endpoints, use idempotency keys or natural keys to prevent duplicate processing. This is especially important for financial operations where duplicate execution could result in double payments.

---

## Testing

### Test Structure

Organize tests to mirror the source directory structure. Use descriptive test names that document the expected behavior.

### What to Test

Focus tests on verifying interface contracts — correct status codes, response shapes, and error formats. Business logic correctness is better verified through code review and integration testing in staging, so unit tests should not duplicate that effort.

### Test Data

Use factory functions or fixtures to generate test data. Avoid hardcoding test values that might change.

---

## Async

Use synchronous handlers by default. Only introduce async when you have measured a specific I/O bottleneck that justifies the added complexity. Do not mix blocking calls inside async handlers.
