# Fullstack Assessment: WorkLog Payment Dashboard

## Background

You're building an admin dashboard for a company that hires freelancers. Freelancers log their time against tasks, and at the end of each payment cycle, an admin reviews the logged work and processes payments. Each task has a worklog that contains multiple time entries. The admin needs to see what work was done, decide what to pay for, and issue payments.

---

## Requirements

1. User should see a **list of all worklogs and how much was earned per task**
2. User should be able to **drill down into a worklog to see individual time entries**
3. User should be able to **select a date range to filter worklogs eligible for payment**
4. User should be able to **review the selection before confirming payment**
5. User should be able to **exclude specific worklogs or freelancers from a payment batch**

The backend must also support the constraints described in [backend.md](backend.md) (settlement runs, retroactive adjustments, failed payouts).

---

## Setup

1. Copy `.env.example` to `.env`.
2. Add Dockerfiles for your backend and frontend.
3. Update `docker-compose.yml` so that `docker compose up` starts everything (database, backend, frontend).

You may use any language, framework, and database.

---

## Required Documentation

### a. `DECISIONS.md`

Fill in the provided template with your design rationale, which AGENTS.md rules you followed/rejected, and edge cases you considered.

### b. Schema Diagram

Include a schema diagram (DBML, SQL DDL, or ER diagram image).

### c. Sample API Responses

Include `sample-responses.json` with example responses from your endpoints.

### d. Screenshots

Include screenshots of key screens in your PR description.

---

## Submission Checklist

- [ ] `docker compose up` starts a complete working system
- [ ] Working backend APIs
- [ ] Functional frontend implementing the workflows
- [ ] Filled in `DECISIONS.md`
- [ ] Included schema diagram and sample API responses
- [ ] Added screenshots to PR description
- [ ] Created Pull Request
