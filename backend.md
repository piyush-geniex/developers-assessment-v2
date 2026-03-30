# Backend Assessment: WorkLog Settlement System

## Assessment Task

You're building a backend feature for a system that compensates independent workers based on time they've reported against tasks. Time is not reported as a single value but as **multiple independently recorded segments**, each of which may later be questioned, removed, or adjusted. The container representing all work done against a task is called a **WorkLog**.

Workers are not paid per task or per time segment. Instead, at the end of every month, the system performs a **settlement run** that calculates how much a worker should receive for all eligible work within a given period and attempts to issue a single payout. Let's call this single payout a **Remittance**.

However, the system must support the fact that **historical financial data is not immutable**.

### Key Constraints

The system must correctly handle the following realities:

1. **Work can evolve after payment**
   Additional time segments may be recorded against previously settled work.

2. **Adjustments can be retroactive**
   Quality issues or disputes may result in deductions applied to work that was already settled in the past or work yet to be settled.

3. **Settlement attempts are not guaranteed to succeed**
   A payout attempt may fail or be explicitly cancelled.

4. **Settlement periods may overlap with ongoing corrections**
   A settlement run for November may execute in December, by which time adjustments to October (already settled) may have arrived. The system must account for prior-period adjustments in the current settlement without re-issuing the original remittance.

### Expected Endpoints

1. **`POST /generate-remittances`**
   Generates remittances for all users for a given settlement period.

   **Request body:**
   ```json
   {
     "period_start": "2025-11-01",
     "period_end": "2025-11-30"
   }
   ```

2. **`GET /worklogs`**
   Lists all worklogs with filtering and amount information.

   **Query Parameters:**
   - `remittance_status`: Filter by `REMITTED` or `UNREMITTED`
   - `user_id` (optional): Filter by worker
   - `period_start`, `period_end` (optional): Filter by date range

   **Response:** Must include the calculated amount per worklog.

### Seed Data

A file `seed/worklogs.json` is included in the repository. You may use it to bootstrap your database, adapt it to your schema, or create your own test data. It is provided for convenience, not as a constraint.

---

## Setup

1. Copy `.env.example` to `.env`.
2. Add a `Dockerfile` inside `backend/` for your application.
3. Run `docker compose up` to start the database and your application.

You may modify `docker-compose.yml` freely — change the database image, add services, adjust ports. The only requirement is that `docker compose up` starts a working system.

---

## Required Documentation

Your PR must include:

### a. `DECISIONS.md`

Fill in the provided `DECISIONS.md` template with:
- Your schema design rationale
- Which AGENTS.md recommendations you followed, which you rejected, and why
- Edge cases you considered and how you handled them

### b. Schema Diagram

Include a schema diagram in any common format:
- DBML (save as `schema.dbml`)
- SQL DDL
- Entity-relationship diagram (image)

### c. Sample API Responses

Include a JSON file (`sample-responses.json`) showing example responses from both endpoints with realistic data.

---

## Submission Checklist

- [ ] Forked the repository
- [ ] `docker compose up` starts a working system
- [ ] Implemented both required endpoints
- [ ] Filled in `DECISIONS.md`
- [ ] Included schema diagram
- [ ] Included sample API responses
- [ ] Created Pull Request

---

## Technology

Use any language, framework, and database you prefer. The only requirement is Docker. The provided `docker-compose.yml` includes PostgreSQL as a starting point, but you may replace it with MySQL, MongoDB, SQLite, or anything else.
