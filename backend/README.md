# Backend: WorkLog Settlement System

This backend implements the assessment described in [`backend.md`](../backend.md).

## Run (Recommended)

From the repo root:

```bash
docker compose up --build
```

The backend will:
- wait for Postgres to be healthy
- run Prisma migrations
- seed the database from `seed/worklogs.json`
- start the API on `http://localhost:9001`

## API

All responses use the standard envelope:

```json
{
  "data": { "...": "..." },
  "meta": { "timestamp": "...", "request_id": "..." }
}
```

### `POST /generate-remittances`

Request body:

```json
{ "period_start": "2025-11-01", "period_end": "2025-11-30" }
```

### `GET /worklogs`

Query params:
- `remittance_status`: `REMITTED` | `UNREMITTED`
- `user_id` (optional)
- `period_start`, `period_end` (optional)

Response items include:
- `id`, `amount`
- `worker`: `{ id, email, name }`
- `task`: `{ id, name, description }`

## Local Development (Optional)

If you want to run without Docker, create `backend/.env` and ensure
`DATABASE_URL` points at a running Postgres instance, then:

```bash
cd backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

