#!/bin/sh
# Everything that has to happen before the API starts: create or update the database tables, then bring permissions,
# retired roles and expense categories up to date.
#
# This is the ONE copy of those steps. It is run by docker/start.sh (the image's start command, and the one railway.json
# pins), and by the API itself if it finds it was started without them (backend/src/startup/startup-tasks.ts), for
# example because an old start command is still set in the Railway dashboard.
#
# The schema push is required: if it fails this exits 1. The three syncs are not: a failure is logged and carried past.
cd "$(dirname "$0")/.." || exit 1

echo "[startup] 1/4 Applying the database schema (this creates any missing tables)..."
if ! npx prisma@5.22.0 db push --schema=prisma/schema.prisma --accept-data-loss --skip-generate; then
  echo "[startup] ERROR: the database schema could not be applied. Screens that need the missing tables will fail until it can."
  exit 1
fi

echo "[startup] 2/4 Updating permissions and roles..."
npx ts-node --transpile-only prisma/sync-permissions.ts || echo "[startup] WARNING: the permission sync failed. Continuing."

echo "[startup] 3/4 Retiring roles that no longer exist..."
npx ts-node --transpile-only prisma/retire-roles.ts || echo "[startup] WARNING: retire-roles failed. Continuing."

echo "[startup] 4/4 Updating expense categories..."
npx ts-node --transpile-only prisma/sync-expense-categories.ts || echo "[startup] WARNING: the expense category sync failed. Continuing."

echo "[startup] Database is ready."
