# KAM-ROMS — Architecture

## Style

Modular monolith. One NestJS backend, one Postgres database, one Next.js
frontend. No microservices — the module boundaries inside `backend/src`
give us separation of concerns without the operational cost of a
distributed system this business doesn't need yet.

## Request lifecycle (backend)

```
Request
  → helmet + CORS
  → ValidationPipe (whitelist, transform, reject unknown fields)
  → JwtAuthGuard        (is the caller authenticated? — global, @Public() opts out)
  → PermissionGuard      (does the caller hold the @RequirePermission code? — global)
  → ScopeGuard            (does the caller's scope cover the target entity? — global)
  → Controller → Service → PrismaService
  → AuditService.record(...)   (for anything sensitive, inside the same DB transaction)
  → AllExceptionsFilter   (uniform {success, message, errorCode, data} envelope)
```

All three guards are registered as global `APP_GUARD`s in `AuthModule`, so a
developer cannot accidentally ship an endpoint that skips authorization —
they'd have to explicitly decorate it `@Public()`.

## RBAC model

- `Permission` — fine-grained action codes (`paddy.approve`). Single source
  of truth: `backend/src/common/constants/permissions.ts`.
- `Role` — named bundle of permissions. System roles (`ADMIN`, `FARM_MANAGER`,
  …) are seeded and protected from deletion; Admins can create/clone custom
  roles from any starting point.
- `UserRole` — a user may hold several roles simultaneously.
- `UserScope` — each role grant carries its own scope(s): `GLOBAL`, `FARM`,
  `WAREHOUSE`, `MILLING_CENTER`, or `DEPARTMENT`, each optionally bound to a
  specific entity id. A Farm Manager holds `FARM_MANAGER` scoped to Farm A
  only; a Farm Supervisor holds `FARM_DIRECTOR` scoped `GLOBAL`.

`JwtStrategy.validate()` resolves this entire graph once per request and
attaches it to `req.user` as an `AuthenticatedUser`, so guards never need
extra DB round-trips.

## Inventory ledger (design — implemented starting Phase 3)

`inventory_transactions` is append-only. The Postgres migration for it will
include a trigger that rejects UPDATE/DELETE at the database level — not
just at the application layer — so even a bug or a rogue script cannot
rewrite history. Balances are derived (`SUM()` over transactions), refreshed
into `inventory_balances` inside the same DB transaction that inserts the
new ledger rows, so reads stay fast without ever trusting a mutable counter.

## Approval engine (design — implemented starting Phase 3)

Generic `approval_workflows` → ordered `approval_steps` → `approval_requests`
→ `approval_actions`, addressable against any entity type via
`(entity, entityId)`. Paddy approval, delivery approval, warehouse receiving,
production approval, sales approval, and payment verification are all
*configured instances* of this engine — adding a new approval flow is an
Admin-side configuration change, not a code change.

## Why NestJS + Prisma + Postgres

- NestJS's DI + decorator model maps directly onto "every endpoint needs
  auth + permission + scope + audit", which is the actual hard requirement
  here — not a stylistic preference.
- Prisma gives us migration history, typed queries, and `$transaction` for
  the multi-step writes this business needs (approve delivery → ledger
  entry → shipment → notification → audit, all-or-nothing).
- Postgres's `numeric` type is used for every money and KG field — floats
  are never used for financial or inventory quantities anywhere in the
  schema.

## Directory map

See `PROJECT_PLAN.md` section 1.
