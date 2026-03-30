# Frontend Assessment: WorkLog Payment Dashboard

## Background

You're building an **admin dashboard for a company that hires freelancers**. Freelancers log their time against tasks, and at the end of each payment cycle, an admin reviews the logged work and processes payments.

Each task has a **worklog** containing multiple **time entries** recorded by the freelancer. The admin needs to review the logged work, decide what should be paid for, and issue payments.

For this assessment, you will **build only the frontend interface**. Use **mock data** to simulate API responses.

---

## Requirements

1. Admin should see a **list of all worklogs with total earnings per task**
2. Admin should be able to **drill down into a worklog to see individual time entries**
3. Admin should be able to **filter worklogs by a date range** to determine which are eligible for payment
4. Admin should be able to **review the selected worklogs and included time entries before confirming payment**
5. Admin should be able to **exclude specific worklogs or freelancers from a payment batch**

---

## Implementation Guidelines

- Build a **frontend-only** implementation
- Use **mock data** (local JSON files or an in-memory data layer) to simulate backend responses
- Structure mock data to resemble realistic API responses
- Your app must be startable via `docker compose up`

---

## Technology

Use any frontend framework and language you prefer:
- React, Vue, Svelte, Angular, etc.
- TypeScript or JavaScript
- Any UI library

Add a `Dockerfile` inside `frontend/` and update `docker-compose.yml` as needed.

---

## Required Documentation

### a. `DECISIONS.md`

Fill in the provided template with your design rationale, which AGENTS.md rules you followed/rejected, and edge cases you considered.

### b. Screenshots

Include screenshots of key screens in your PR description:
- Worklogs list view
- Worklog details / time entries view
- Date range filtering
- Payment review screen

---

## Submission Checklist

- [ ] `docker compose up` starts your frontend application
- [ ] Functional UI implementing the required workflows
- [ ] Uses mock data instead of a real backend
- [ ] Filled in `DECISIONS.md`
- [ ] Added screenshots to PR description
- [ ] Created Pull Request
