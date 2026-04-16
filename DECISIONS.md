# Design Decisions

> Fill in each section below. This document is a required part of your
> submission and will be evaluated alongside your code.

## Schema Design

### Tables / Collections

- `worklog`
  Stores the task-level container the assessment describes: worker identity, task metadata, hourly rate, current high-level status, and lightweight JSON arrays of child record ids. I kept one row per worklog because the task list endpoint is worklog-centric and needs a fast top-level read shape.
- `record`
  Stores the mutable financial events for a worklog. I kept both time segments and adjustments in one table with a `type` discriminator, plus event-specific columns (`start_time`, `end_time`, `seg_status`, `applied_at`) and a flexible `payload` JSON blob for external ids and descriptive fields. This lets later corrections be appended as new ledger entries instead of mutating historical payouts.
- `remittance`
  Stores one payout attempt per user and settlement period, including the remitted amount, status, and contributing worklog ids. Individual `record.remittance_id` links are the real source of truth for whether a segment or adjustment has already been settled.

Normalization vs. denormalization:
- I normalized mutable financial events into `record` rows so each segment or adjustment can be settled exactly once.
- I kept `segment_ids`, `adjustment_ids`, and `worklog_ids` as JSON arrays because they make API responses and debugging easier without changing the accounting source of truth.

### Key Design Choices

1. I modeled settlement at the `record` level rather than the `worklog` level.
   This is the key choice that makes retroactive adjustments and late-added segments workable. A worklog can have some history already remitted and newer records still outstanding. The trade-off is slightly more application-side calculation logic.
2. I treated approved segments and adjustments as append-only ledger events.
   Rather than recomputing and rewriting old remittances, the system links new eligible records into a newer remittance. The trade-off is that the settlement query has to gather outstanding records up to a settlement cutoff.
3. I kept the existing single `remittance_id` on `worklog` as a convenience field only.
   The record-level links drive correctness. The trade-off is that `worklog.remittance_id` represents the latest related remittance, not a complete history, which I call out explicitly here.

---

## AGENTS.md Evaluation

### Rules I Followed

- I followed the domain-oriented structure recommendation by creating `src/worklogs`, `src/remittances`, and `src/settlement` folders instead of piling everything into generic controllers/services.
- I followed the batch-processing guidance in the remittance generator: one user failing does not abort the whole settlement run, and the response returns created, skipped, and failed groups.
- I followed the recommendation to keep important financial aggregation in application code. All amount calculations happen in the settlement service, which made the rules easier to test and explain.
- I kept the provided wide-table shape for mutable records, which aligns with the AGENTS.md preference for reducing complex joins.

### Rules I Rejected

- I did not fully follow the recommendation to commit each logical unit of work independently. For remittance generation, I still process one user at a time, but the write sequence inside each user is kept together so the remittance row and its linked records stay consistent.
- I did not lean on the suggested JSON-array-only relationship strategy as the accounting source of truth. I kept the JSON arrays for convenience, but I used foreign keys on `record.remittance_id` and `record.parent_id` because settlement correctness matters more here than avoiding relational links.

---

## Edge Cases

### Considered Edge Cases

- Running settlement twice for the same period:
  The code checks for an existing `remittance` per `user_id + period_start + period_end` and skips that user on rerun instead of duplicating payouts.
- Retroactive adjustments against previously settled work:
  Adjustments are their own `record` rows and remain unsettled until linked to a remittance, so a newer settlement can include them without reopening the original payout.
- Late-approved or late-added segments:
  Segment records are also settled individually. Any approved segment without a `remittance_id` remains eligible for a future settlement run.
- Disputed, cancelled, or zero-duration segments:
  Only approved segments count toward earnings. Cancelled and disputed segments stay visible in the underlying data but contribute `0`.
- Partial settlement failures:
  The remittance generator catches per-user failures and continues processing the remaining users.
- Repeated container startup:
  The seed script now skips existing worklogs by external id, so `docker compose up` or repeated seed runs do not fail on duplicates.

### Assumptions

- `POST /generate-remittances` represents a successful payout attempt in this assessment, so newly created remittances are marked `SUCCEEDED`. The schema still leaves room for `FAILED` and `CANCELLED` statuses even though no dedicated mutation endpoint was requested.
- A settlement run should include all outstanding approved segments and adjustments with event dates on or before the requested `period_end`. That is how the implementation carries prior-period corrections into the current payout.
- `GET /worklogs` calculates amount based on the provided date window when one is supplied. Without a date filter, it reports across the full worklog history currently stored.
- Monetary values are rounded to two decimal places at the application boundary.
