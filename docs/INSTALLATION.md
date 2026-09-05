# KAM-ROMS — Installation Guide

## Prerequisites

- Node.js 20+ and npm 10+
- Docker + Docker Compose (for Postgres/Redis/MinIO)
- Normal outbound internet access (Prisma downloads its query engine from
  `binaries.prisma.sh` on first `prisma generate` — this single domain is
  the one thing a locked-down sandbox may block; a normal dev machine or CI
  runner will not have this problem)

## 1. Install dependencies

```bash
npm install --workspaces --include-workspace-root --legacy-peer-deps
```

## 2. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum change JWT_SECRET to a long random string before
# anything resembling production use.
```

## 3. Start infrastructure

```bash
docker compose up -d postgres redis minio
```

## 4. Generate the Prisma client and run migrations

```bash
npm run prisma:generate
npm run prisma:migrate      # creates the initial migration + applies it
npm run prisma:seed         # loads company, roles, permissions, demo users
```

If `prisma generate` ever fails with a 403/checksum error against
`binaries.prisma.sh`, it means outbound access to that host is blocked
(some corporate proxies and sandboxes do this) — allow it, or set
`PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` if you're deliberately running
disconnected with pre-cached engines.

## 5. Run the API

```bash
npm run dev:api
```

API: `http://localhost:4000/api`
Swagger docs: `http://localhost:4000/api/docs`
Health check: `http://localhost:4000/api/health`

## 6. Run the web app

```bash
npm run dev:web
```

Web: `http://localhost:3000`

## 7. Log in

Use any seeded demo account (see `docs/ROLES_AND_PERMISSIONS.md` for the
full list), e.g.:

- `admin@kam.local` / `ChangeMe123!`
- `md@kam.local` / `ChangeMe123!`
- `farmmanager.a@kam.local` / `ChangeMe123!`

All demo accounts are forced to change their password on first login
(`mustChangePassword` is set true by the seed).

## 8. Run everything in Docker instead

```bash
docker compose up --build
```

## Tests

```bash
npm run test              # unit tests (no DB required)
DATABASE_URL=postgresql://kam:kam_dev_password@localhost:5432/kam_roms_test npm run test:e2e
```

E2E tests need a real (ideally disposable) Postgres database, migrated and
seeded exactly like development. Point `DATABASE_URL` at a `_test` database
so you never run e2e tests against real data.
