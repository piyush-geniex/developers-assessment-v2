# Backend Assessment – Architectural Decisions

## 1. Overview
This document explains key technical and architectural decisions made in the backend assessment project, including database setup, seeding strategy, environment handling, and Docker usage.

---

## 2. Technology Choices

### Node.js + TypeScript
- Chosen for type safety and maintainability
- Helps reduce runtime errors in backend logic
- Common in production-grade backend systems

---

### Database (PostgreSQL)
- Reliable relational database suitable for structured data (e.g., worklogs)
- Strong support for constraints, joins, and indexing
- Works well with both local development and Dockerized environments

---

## 3. Environment Configuration Strategy

### dotenv-based configuration
- All sensitive credentials are stored in `.env`
- Loaded using `dotenv` at application startup

### Reasoning:
- Keeps secrets out of codebase
- Allows environment-specific configuration (local vs docker vs production)

### Key Decision:
We allow two runtime modes:
- Local development → `DB_HOST=localhost`
- Docker environment → `DB_HOST=db`

---

## 4. Database Connection Handling

### Dynamic configuration via environment variables
```ts
host: process.env.DB_HOST
user: process.env.DB_USER
password: process.env.DB_PASSWORD