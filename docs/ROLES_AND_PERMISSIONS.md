# KAM-ROMS — Roles & Permissions

## Roles (seeded, system-protected — cannot be deleted, but Admin can clone
## them as a starting point for custom roles)

| Code | Name | Default scope pattern |
|---|---|---|
| `ADMIN` | System Administrator | GLOBAL — all permissions |
| `MD` | Managing Director / CEO | GLOBAL — all permissions |
| `FARM_DIRECTOR` | Farm Supervisor | GLOBAL across farms |
| `FARM_MANAGER` | Farm Manager | FARM — one farm per grant |
| `WAREHOUSE_SUPERVISOR` | Warehouse Supervisor | GLOBAL across warehouses |
| `WAREHOUSE_MANAGER` | Warehouse Manager | WAREHOUSE — one warehouse per grant |
| `OPERATIONS_MANAGER` | Operations Manager | GLOBAL or MILLING_CENTER |
| `OPERATIONS_OFFICER` | Operations Officer | MILLING_CENTER / WAREHOUSE |
| `SALES_OFFICER` | Sales Officer | GLOBAL (customer/order visibility) |
| `FINANCE_DIRECTOR` | Finance Director | GLOBAL — includes reset approval |
| `FINANCE_OFFICER` | Finance Officer | GLOBAL — financial records, no ops editing |
| `AUDITOR` | Auditor | GLOBAL — read-only |

A user can hold multiple roles (e.g. Warehouse Manager *and* Sales Officer),
each with its own independent scope grant — see `docs/ARCHITECTURE.md`.

## Permission catalog (Phase 1 set — grows with each phase)

| Module | Codes |
|---|---|
| dashboard | `dashboard.view` |
| farm | `farm.view`, `farm.create`, `farm.update`, `farm.delete`, `farm.inventory.view` |
| paddy | `paddy.create`, `paddy.submit`, `paddy.approve`, `paddy.reject` |
| delivery | `delivery.create`, `delivery.approve`, `delivery.reject` |
| warehouse | `warehouse.view`, `warehouse.inventory.view`, `warehouse.receive`, `warehouse.transfer` |
| milling | `milling.view`, `production.create`, `production.approve`, `machine.view`, `machine.manage`, `meter.create` |
| sales | `sales.create`, `sales.approve`, `customer.manage` |
| finance | `payment.create`, `payment.verify`, `finance.view`, `finance.approve` |
| reports | `reports.view`, `reports.export` |
| ai | `ai.view`, `ai.use` |
| messages | `messages.send`, `messages.broadcast` |
| tasks | `tasks.assign`, `tasks.complete` |
| admin | `users.manage`, `roles.manage`, `permissions.manage`, `settings.manage`, `audit.view`, `backup.manage`, `reset.request`, `reset.approve`, `reset.execute` |

Exact role → permission grants live in `prisma/seed.ts` (`ROLE_DEFS`) —
that file is the single source of truth; this table is a human-readable
summary of it.

## Rule: no self-escalation

`UsersService.assignRole` / `.removeRole` and `.update` (status field) all
reject any request where the target user id equals the caller's own id.
This is enforced in the service layer, not just hidden in the UI — see
spec section 73.

## Demo accounts (development only)

All share the password `ChangeMe123!` and are forced to change it on first
login (`mustChangePassword: true`).

| Email | Role | Scope |
|---|---|---|
| admin@kam.local | ADMIN | GLOBAL |
| md@kam.local | MD | GLOBAL |
| farmdirector@kam.local | FARM_DIRECTOR | GLOBAL |
| farmmanager.a@kam.local | FARM_MANAGER | Farm A |
| farmmanager.b@kam.local | FARM_MANAGER | Farm B |
| warehousesupervisor@kam.local | WAREHOUSE_SUPERVISOR | GLOBAL |
| warehousemanager.1@kam.local | WAREHOUSE_MANAGER | Warehouse 1 |
| warehousemanager.2@kam.local | WAREHOUSE_MANAGER | Warehouse 2 |
| warehousemanager.3@kam.local | WAREHOUSE_MANAGER | Warehouse 3 |
| operationsmanager.1@kam.local | OPERATIONS_MANAGER | GLOBAL |
| operations.1@kam.local | OPERATIONS_OFFICER | Warehouse 1 |
| sales.1@kam.local / sales.2@kam.local | SALES_OFFICER | GLOBAL |
| financedirector@kam.local | FINANCE_DIRECTOR | GLOBAL |
| finance.1@kam.local | FINANCE_OFFICER | GLOBAL |
| auditor@kam.local | AUDITOR | GLOBAL |

Never reuse this password pattern outside local development.
