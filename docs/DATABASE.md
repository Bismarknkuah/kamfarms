# KAM-ROMS — Database (Phase 1 slice)

Full target schema: `prisma/schema.prisma` (all entity groups). This doc
covers the tables with real business logic behind them as of Phase 1; the
rest are modeled ahead of time so later migrations are additive, and get
their own doc updates as each phase lands.

## Live in Phase 1

| Table | Purpose | Notes |
|---|---|---|
| `companies` | Company profile | Admin-editable, never hard-coded in logic |
| `facilities` | Physical sites (HQ, manufacturing facility) | |
| `departments` | Org departments | |
| `users` | All system users | Soft-deletable (`deleted_at`) — no financial/inventory history lives here |
| `roles` | Named permission bundles | `is_system_role` protects seeded roles from deletion |
| `permissions` | Fine-grained action codes | Seeded from `PERMISSION_CATALOG`, the single source of truth |
| `role_permissions` | Role ↔ Permission | Composite PK |
| `user_roles` | User ↔ Role (many-to-many) | A user may hold several roles |
| `user_scopes` | Scope grant per user-role | `GLOBAL \| FARM \| WAREHOUSE \| MILLING_CENTER \| DEPARTMENT` |
| `refresh_tokens` | Rotating refresh tokens | Stored as SHA-256 hash, never the raw token; `replaced_by_hash` links rotation chains |
| `login_attempts` | Every login attempt, success or failure | Powers lockout + future "recent failed logins" admin widget |
| `password_reset_tokens` | One-time reset tokens | SHA-256 hashed, single-use (`used_at`), 1-hour expiry |
| `audit_logs` | Append-only audit trail | No application code path updates or deletes a row here |
| `farms`, `farm_managers` | Farm master data | Exactly Farm A–F seeded; Farm G intentionally not created — Admin-creatable |
| `warehouses`, `warehouse_managers`, `milling_centers` | Warehouse/milling master data | 3 warehouses + 3 milling centers seeded, both configurable |
| `paddy_types`, `paddy_grades` | Configurable paddy classification | "Size 4"/"Size 5" are data, not hard-coded logic |
| `products`, `packaging_sizes` | Configurable product/package catalog | Pectra Rice + 1/2/5/10/25/50 KG seeded, both editable |
| `system_settings` | Key-value company/system config | |

## Conventions

- UUID primary keys everywhere (`@default(uuid())`)
- `created_at` / `updated_at` on every table that isn't purely a join table
- Money and KG quantities: Postgres `numeric` (Prisma `Decimal`) — floats
  are never used for financial or weight values
- Soft delete (`deleted_at`) only where it cannot destroy financial or
  inventory history (currently: `users` only) — inventory and financial
  tables are append-only by design, not soft-deleted
- Every foreign key is indexed; every status/type column used in filtering
  is indexed

## Coming in later phases (already modeled in `schema.prisma`)

`inventory_transactions` (append-only, DB-trigger-enforced), the rest of
farm/warehouse/production/sales/finance domain tables, `approval_*`,
`ai_*`, `reset_*` — see `PROJECT_PLAN.md` section 3 for the full list and
which phase introduces each group's business logic.
