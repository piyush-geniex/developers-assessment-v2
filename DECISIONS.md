# Design Decisions

> Fill in each section below. This document is a required part of your
> submission and will be evaluated alongside your code.

## Schema Design

### Tables / Collections

<!-- List each table/collection, its columns/fields, and why you structured
     it this way. What did you normalize vs. denormalize and why? -->


    Records Table: I implemented a Self-Referencing Polymorphic Table.

        Columns: id (PK), type (Enum: worklog, segment, adjustment, remittance), parentId (FK to records.id), payload (JSONB), createdAt, updatedAt.

        Strategy: I chose a single-table design for all accounting events to ensure a strict Audit Trail.

        Normalization vs. Denormalization: * Normalized: Parent-child relationships (Segments link to Worklogs). This ensures a "Single Source of Truth" for worker identities.

            Denormalized: I used JSONB for the payload. This allows the schema to be flexible (e.g., segments have dates, adjustments have amounts) without needing dozens of sparsely populated columns, which is ideal for evolving mobility platforms.

### Key Design Choices

<!-- Describe 2-3 design decisions you made and the trade-offs you considered.
     For example: "I chose separate tables for worklogs and segments because..."
     or "I used an enum for status because..." -->
JSONB for Business Data: I chose JSONB to store specific domain attributes (like hourly_rate or gps_coordinates). The trade-off is slightly more complex SQL querying (requiring casting), but it provides a "future-proof" schema that can handle new types of work segments without database migrations.

Correlated Subqueries for Filtering: Instead of simple joins, I used EXISTS subqueries to filter Worklogs. This prevents the "Cartesian Product" issue where a Worklog would appear multiple times in results for each segment it contains, keeping the API response clean and the memory footprint low.

---

## AGENTS.md Evaluation

### Rules I Followed
Decoupled Logic: I kept the SettlementService separate from the WorklogService. Settlement logic is sensitive; keeping it isolated makes it easier to unit test and secure.
Idempotency: I followed the recommendation to check for remittance_id IS NULL before processing. This ensures that running the settlement process twice for the same period won't double-charge the company or double-pay the worker.



<!-- Which recommendations from AGENTS.md did you adopt and why? -->

### Rules I Rejected

<!-- Which recommendations did you deliberately ignore or override?
     For each, explain what the recommendation was and why you chose
     a different approach. -->

Separate Tables for Types: While some architectures suggest separate tables for Segments and Adjustments, I rejected this in favor of the unified Records table. In a high-concurrency system, joining five different tables to get a "total balance" is slower than querying one indexed table with a parent ID.

---

## Edge Cases

### Considered Edge Cases

<!-- List edge cases you identified in the requirements and how your
     implementation handles them. Examples might include:
     - What happens when settlement is run twice for the same period?
     - How are retroactive adjustments applied?
     - What happens when a payout fails? -->

Overlapping Remittances: By filtering strictly for segments where payload->>'remittance_id' is null, the system naturally ignores anything already processed, even if the user selects an overlapping date range.

Cancelled Segments: The calculation logic explicitly checks status === 'approved'. If a dispatcher cancels a segment due to a dispute, it is automatically excluded from the worker's total without manual intervention.

Zero/Negative Totals: I implemented a check to skip remittance generation if the totalAmount is ≤0. This prevents the system from generating empty or "debt-only" payment records.

### Assumptions

<!-- List any assumptions you made about the requirements that were
     not explicitly stated. -->
UTC Consistency: I assumed all incoming payload dates are in ISO-8601 UTC format, allowing for direct casting to PostgreSQL timestamps for comparison.