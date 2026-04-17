#!/bin/sh
set -e

# The assessment requirement is that `docker compose up` starts a working system
# without manual steps. We do migrations + seed automatically on boot.
npx prisma migrate deploy
npx prisma db seed

exec node dist/src/main.js
