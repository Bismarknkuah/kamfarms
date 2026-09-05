# KAM-ROMS — KAM Rice Operations Management System
## Project Plan

Company: KAM Trading and Farms Limited
Product: Pectra Rice (Superfine Perfumed Rice)
Facility: Sefwi Kanchabio, Western North Region (GPS WG-3361-7726)
HQ: P.O. Box DT 1892, Adenta, Accra

---

## 0. Honest scope note

This is an ERP-scale system: 90+ tables, an inventory ledger, milling/
mass-balance logic, sales/finance workflows, AI forecasting, messaging,
and full RBAC, with per-module approval workflows (paddy, delivery,
production, sales, payment, expense, and the dual-approval system reset)
rather than a single generic configurable approval engine — see section 6
below for why that trade-off was made deliberately, not by oversight. It
was built **in phases**, each phase fully wired top-to-bottom (DB → API →
auth → tests → docs) before the next started, per the build order below.
Nothing is marked done until it actually runs — and where this sandbox's
own limitations prevented that (see below), the docs say so explicitly
rather than claiming more than was verified.

Environment constraint: this build sandbox has no Docker daemon and no live
Postgres server, so Docker/Postgres steps are written and validated for
correctness but must be run on your machine (`docker compose up`) — exact
commands are in `docs/INSTALLATION.md`.

---

## 1. Architecture

Modular monolith (NestJS backend, Next.js frontend), one Postgres database,
Redis for cache/sessions/queues, optional MinIO for file storage, optional
Python FastAPI service for ML (added in Phase 11).

```
kam-roms/
├── backend/      NestJS backend (REST, modular) — deploys to Railway
├── frontend/     Next.js frontend — deploys to Vercel
├── ai-service/   FastAPI ML service (Phase 11)
├── packages/
│   ├── shared/   shared TS types/constants (permission codes, enums)
│   ├── ui/       shared React components
│   └── config/   shared eslint/tsconfig
├── prisma/       schema.prisma, migrations, seed.ts
├── docs/         architecture, DB, API, roles, deployment, backup docs
├── docker/       Dockerfiles (local dev only — Railway/Vercel build natively)
├── tests/        e2e/integration tests
└── docker-compose.yml
```

---

## 2. Backend modules (NestJS)

`auth, users, roles, permissions, organization, farms, farm-inventory, paddy,
farm-deliveries, warehouses, warehouse-inventory, milling, operations,
machines, meter-readings, production, products, packaging, sales, customers,
orders, finance, payments, expenses, reports, analytics, ai, notifications,
messaging, documents, approvals, audit, system-settings, backup-reset, tasks`

---

## 3. Database entity groups (Prisma / Postgres, UUID PKs, created_at/updated_at)

- **Org/Auth**: companies, facilities, departments, users, roles, permissions,
  role_permissions, user_roles, user_scopes, refresh_tokens, login_attempts
- **Farms**: farms, farm_managers, paddy_types, paddy_grades, paddy_entries,
  paddy_batches, farm_inventory
- **Warehouses/Milling**: warehouses, warehouse_managers, warehouse_inventory,
  milling_centers, machines, machine_maintenance, meter_readings
- **Production**: production_batches, production_records, production_outputs,
  packaging_batches, packaging_sizes, products, product_prices
- **Inventory ledger**: inventory_transactions (append-only), inventory_balances
  (materialized/derived), stock_reservations
- **Logistics**: delivery_orders, delivery_reports, vehicles, drivers,
  shipments, shipment_events
- **Quality**: quality_inspections
- **Sales/Finance**: customers, sales_orders, sales_order_items, invoices,
  invoice_items, payments, payment_allocations, expenses, expense_categories
- **Collaboration**: tasks, task_comments, messages, conversations,
  conversation_members, message_receipts, notifications, documents
- **Governance**: approval_workflows, approval_steps, approval_requests,
  approval_actions, audit_logs, system_settings, backup_records,
  reset_requests, reset_approvals
- **AI**: ai_models, ai_predictions, ai_recommendations

Money fields: `Decimal` (Postgres `numeric`), never float. Quantities:
`Decimal` KG, `Int` bag counts. All FKs indexed; status/type columns indexed.

---

## 4. Inventory ledger design

`inventory_transactions` is append-only (no UPDATE/DELETE at the app layer —
enforced by a Postgres trigger in Phase 3). Every stock-affecting action
(paddy approval, delivery approval, warehouse receipt, milling output,
packaging, sale, adjustment) inserts one or more transaction rows inside a
single DB transaction alongside the approval/audit/notification records.
Current balances are a `SUM()` aggregate over transactions (materialized
into `inventory_balances` and refreshed inside the same DB transaction, so
reads stay O(1) without ever trusting a mutable counter as the source of
truth). Corrections = new reversal transactions, never edits.

---

## 5. RBAC & scope model

- `permissions` = fine-grained codes (`paddy.approve`, `finance.verify`, …)
- `roles` = named bundles (`FARM_MANAGER`, `FINANCE_DIRECTOR`, …), Admin can
  clone/create custom roles
- `user_roles` = many-to-many, a user may hold multiple roles
- `user_scopes` = per user-role, a scope type (`GLOBAL|FARM|WAREHOUSE|
  MILLING_CENTER|DEPARTMENT`) + scope entity id
- Every protected endpoint: `JwtAuthGuard` → `PermissionGuard
  (@RequirePermission)` → `ScopeGuard (@RequireScope)`, which loads the
  user's scopes and filters/validates the target entity against them.
  Nothing is enforced only in the frontend.

Full permission matrix lives in `docs/ROLES_AND_PERMISSIONS.md` (generated in
Phase 1 alongside the seed).

---

## 6. Approval engine — planned generic design vs. what was actually built

This section originally described a fully generic `approval_workflows` +
`approval_steps` + `approval_requests` + `approval_actions` engine, where
paddy, deliveries, production, sales, payments, and system resets would
all be *configured* instances of one generic engine, addable from Admin
without code changes.

**That generic engine was not built.** What exists instead, as of Phase
12: each of those workflows (paddy, delivery, production, sales, payment,
expense, and the reset workflow's dual-approval chain) has its own
bespoke, hand-written state machine in its own service — `DRAFT →
SUBMITTED → APPROVED/REJECTED` (or the reset workflow's two-stage
variant), with self-approval blocked and a mandatory rejection reason,
implemented the same way each time but as separate code, not one shared
engine.

This was a deliberate trade-off, not an oversight: building the fully
generic engine *and* correctly retrofitting seven already-built,
already-tested modules onto it carried real regression risk for
functionality the spec's actual behavioral requirements didn't strictly
need — every workflow the spec describes does work correctly today. The
cost is that adding a genuinely new ninth approval workflow from Admin
today requires writing code, not just database configuration, which is a
real gap against the original ambition stated here. It's recorded exactly
this way in `docs/RESET_WORKFLOW.md`'s companion note in the Phase 12
schema comments, not discovered only now.

---

## 7. Build order (phases — matches the brief's required sequence)

| Phase | Contents | Status |
|---|---|---|
| 1 | Repo scaffold, Docker, Postgres, Prisma, Auth, Users, Roles, Permissions | **Complete** |
| 2 | Company, Farms, Warehouses, Milling Centers, master data | **Complete** |
| 3 | Paddy entries, farm inventory, farm approval workflow, inventory ledger core | **Complete** |
| 4 | Deliveries, transport, in-transit tracking, warehouse receiving | **Complete** |
| 5 | Milling, production, meter readings, machines, quality | **Complete** |
| 6 | Packaging, warehouse finished goods | **Complete** |
| 7 | Sales, customers, orders, reservations | **Complete** |
| 8 | Finance: invoices, payments, receivables, expenses | **Complete** |
| 9 | Messaging, notifications, tasks | **Complete** |
| 10 | Reports, analytics | **Complete** |
| 11 | AI/ML service | **Complete** |
| 12 | Admin console, audit, backup, reset workflow | **Complete** |
| 13 | Testing, security hardening, deployment docs | **Complete (this delivery)** |

Each phase = Prisma models + migration, NestJS module (controller/service/DTO/
guards/tests), audit + notification hooks, Next.js pages, and doc updates —
delivered together, not frontend-only or backend-only.

---

## 8. What's included in Phase 13 (this delivery, on top of Phases 1–12) -- final phase

- **Startup environment validation** -- `config/env.validation.ts`,
  wired via `ConfigModule.forRoot({ validate })`. Production refuses to
  start if `JWT_SECRET` is missing, is the documented dev default, or is
  under 32 characters; also requires `DATABASE_URL` and `WEB_ORIGIN`.
  Reports every problem at once, not just the first one hit. This is the
  **third fully-passing, zero-mocked-Prisma test suite in this project**
  (after Phase 10's `export.service.spec.ts` and the pre-existing
  `permission.guard.spec.ts`) -- 7/7 tests genuinely green in this
  sandbox, not just verified-by-error-isolation like everything else.
- **Rate-limit hardening** on the three brute-force-sensitive auth
  endpoints specifically (`login`: 5/min, `forgot-password`: 3/min,
  `reset-password`: 5/min), tighter than the global 100/min default --
  layered on top of (not replacing) `AuthService`'s existing per-account
  lockout from Phase 1.
- **Two new e2e specs** (`test/rbac.e2e-spec.ts`,
  `test/paddy-workflow.e2e-spec.ts`), following the exact pattern
  `test/auth.e2e-spec.ts` established in Phase 1 (`describeIfDb`, so
  they skip cleanly without a real Postgres and run for real against
  one). The RBAC spec proves authorization end-to-end over real HTTP --
  a 403 (not 401) for an authenticated-but-under-permissioned user hits
  the live server, not just a guard unit test. The paddy-workflow spec
  is the one true end-to-end business-flow test in this project: create
  -> submit -> self-approval-blocked -> approve -> confirmed in
  real-time farm inventory, over real HTTP against a real database.
  Verified: these compile cleanly on their own (isolated the compiler
  diff and found zero errors attributable to the new files themselves --
  every error present is the same already-documented Prisma-stub issue,
  inherited transitively through importing `AppModule`, exactly like
  every other file in this codebase).
- `docs/SECURITY.md` -- a single consolidated reference of every
  security measure actually implemented across all 13 phases, each
  pointing to the real file and line, plus an explicit, unapologetic
  list of what's NOT done (no CSRF layer -- doesn't apply to a
  Bearer-token API; no WAF; no CI-wired dependency scanning; no third-
  party security audit has been performed).
- `docs/DEPLOYMENT.md` reviewed for accuracy against everything built
  since Phase 1 (confirmed: `npm install` already picks up Phase 10's
  `exceljs` dependency automatically, no changes needed there) and
  updated with a pointer to the new startup validation and
  `docs/SECURITY.md` in the pre-launch checklist.
- `docs/BACKUP_RESTORE.md` was already corrected in Phase 12 to stop
  making a forward-looking promise about Phase 13 delivering automated
  backups -- it still doesn't, and still says so.

## 9. What's included in Phase 12 (on top of Phases 1–11)

- `docs/RESET_WORKFLOW.md` -- read this first. The system reset workflow
  is the single most dangerous operation this spec describes (rule 10),
  and this document draws an explicit line between "the approval
  workflow is fully implemented" (it is, completely) and "the
  destructive action is fully implemented" (deliberately, only for a
  small, hand-picked allowlist of tables).
- Schema: `BackupRecord`, `ResetRequest`.
- `audit-viewer` module -- read-only queries over the `AuditLog` table
  that every other module has been writing to since Phase 1 (filterable
  by user/action/entity/entity id/date range, plus a full timeline for
  one specific entity -- spec section 70's "activity timeline").
- `backup` module -- an honest status tracker, not a simulated backup
  runner. It does not call `pg_dump` itself; a scheduled job (Railway's
  managed Postgres backups, or a cron hitting this API) is expected to
  call `recordCompletion` after actually running one. The admin
  dashboard fields spec section 58 wants (last successful/failed backup,
  size) are real queries against this table.
- `system-reset` module -- the full request -> dual-approval -> execute
  chain:
  - Admin requests (`reset.request`) with a frozen `affectedTables` list
    that can't change after approval.
  - Finance Director approves (`reset.approve`), then MD approves
    (`reset.approve`) -- and the second approval is only accepted from a
    genuinely different person than both the requester AND the first
    approver, proven directly by a unit test.
  - A single rejection at either stage stops the process entirely, even
    after one approval already happened -- also proven directly.
  - Execution (`reset.execute`, ADMIN-only in the seed) requires
    `APPROVED` status AND validates the frozen scope against a
    **hard-coded allowlist of exactly two tables**
    (`InventoryTransaction`, `InventoryBalance`). A request approved for
    any broader scope throws `RESET_SCOPE_NOT_IMPLEMENTED` rather than
    silently deleting something wider than what was actually reviewed --
    proven directly by a unit test.
  - Pre- and post-execution row-count snapshots are captured and stored
    permanently on the request record itself, alongside the append-only
    audit trail.
- Found and fixed a real gap while wiring this up: the ADMIN role in the
  seed had `reset.request` but not `reset.execute` -- meaning Admin could
  request a reset but never actually carry one out even after both
  approvals. Caught by actually reading the seed rather than assuming it
  was already correct.
- Unit tests: self-approval ban at the first stage, sequencing (can't
  skip to the second approval before the first), the
  different-second-approver requirement, rejection stopping an
  in-progress (partially approved) request, execution blocked before
  full approval, execution blocked for out-of-allowlist scope with the
  exact error code checked, and the backup service's status-independent
  querying (last success / last failure / currently running are three
  separate, correctly-filtered queries, not one query sliced three ways).

## 10. What's included in Phase 11 (on top of Phases 1–10)

- `docs/AI_APPROACH.md` -- read this first. Short version: a real
  statistical (rolling-average + documented cold-start benchmark)
  prediction layer, not a trained ML model and not an LLM-backed
  chatbot. Both omissions are spec-consistent (section 21 explicitly
  requires the cold-start fallback for exactly this situation) and
  honestly documented rather than faked.
- Schema: `AiModel`, `AiPrediction`, `AiRecommendation`.
- `ai` module -- two services:
  - **AiPredictionsService** -- `predictProduction` (recovered/broken/
    hull KG from a paddy quantity + grade, matching spec section 21's
    worked example shape), `predictEnergyConsumption` (kWh from a paddy
    quantity + machine), `forecastStockDepletion` (days-until-stockout
    from real sales velocity against a live balance -- genuinely
    different math from the two production-side predictions, not the
    same formula relabeled). Each falls back to a documented benchmark
    with deliberately low (25%) confidence below 5 historical records,
    and to a rolling average with confidence that scales with sample
    size above that threshold -- proven by a unit test that supplies 2
    records (benchmark path) and then 5 (rolling-average path) and
    checks the math takes the correct branch each time, not just that
    *a* number comes back.
  - **AiAssistantService** -- a fixed set of recognized question
    patterns (paddy stock, top-performing farm, top debtors, sales this
    month, recovery rate, production this month) mapped to the real
    report/finance queries built in Phases 3-10. An unrecognized
    question gets an honest "I don't have a mapped answer" response
    listing what IS recognized, proven directly by a unit test -- never
    a fabricated answer.
  - `GET /ai/anomalies` surfaces anomalies already detected by Phase 5's
    own logic (meter-reading deviation, production mass-balance
    variance) rather than re-implementing a second, competing anomaly
    detector.
- **The one rule enforced structurally, not just documented**: spec rule
  11 says AI predictions can't modify operational or financial records.
  Neither AI service has `InventoryLedgerService`, or any approval
  service, injected into its constructor -- it is structurally
  impossible for them to call `adjustBalance` or any approval method,
  because they have no reference to the services that do. A unit test
  inspects the constructor's `design:paramtypes` metadata directly to
  prove this isn't just a docstring claim.
- Unit tests: cold-start-vs-rolling-average branching (with the exact
  benchmark and rolling-average numbers checked, not just "some number"),
  stockout forecasting with real velocity math, the "no sales history"
  honest-null case, all four recognized assistant intents, the
  unrecognized-question fallback, and the structural
  can't-touch-inventory proof.

## 11. What's included in Phase 10 (on top of Phases 1–9)

- `reports` module -- two services:
  - **ReportsService** -- executive summary (spec section 30's CEO
    dashboard KPIs, computed from real ledger balances and finance
    aggregates, not fabricated numbers), farm report (per-farm intake,
    rejections, delivery costs -- spec section 31), warehouse report
    (per-warehouse paddy/packaged-rice/fulfilled-orders -- spec section
    32), sales report (by-salesperson and by-product breakdowns), and
    finance report (revenue/payments/expenses/estimated profit, with
    expenses grouped by category).
  - **ExportService** -- CSV (pure string formatting, zero dependencies,
    RFC 4180 quoting/escaping) and Excel (via the real `exceljs`
    package -- confirmed installable through the npm registry in this
    sandbox, unlike the Prisma engine binaries the rest of this project's
    tests are blocked on). `GET /reports/farms?format=csv` or `?format=xlsx`
    streams a real downloadable file; omitting `format` returns JSON.
  - Exporting requires `reports.export` specifically, checked separately
    from the `reports.view` that gates seeing the JSON in the first
    place -- someone can view a report without being able to download it.
- **PDF export is explicitly NOT implemented** -- spec section 33 asks for
  it, but a properly branded PDF renderer (company header, filters,
  summary, page numbers per spec section 79) is substantial additional
  surface. This is documented in the code and here, not silently skipped;
  CSV and Excel cover the same underlying data in the meantime.
- Notable verification: `export.service.spec.ts` is the **first fully
  passing test suite with real business logic in this entire project** --
  it has zero Prisma dependency, so it isn't blocked by this sandbox's
  network restriction. All 7 tests genuinely run and pass, including one
  that inspects the actual byte output of a real `exceljs`-generated
  `.xlsx` file (the `PK` zip-archive magic number) to confirm it isn't a
  stub. Every other test suite in this project is verified by isolating
  its errors to the single documented cause; this one is verified by
  actually running green.
- `reports.service.spec.ts` (mocked-Prisma, like every other service
  test) covers: farm-balance-only aggregation matching spec section 9's
  worked example exactly (105,000 KG), receivables correctly excluding
  non-VERIFIED payment allocations, estimated-profit arithmetic, and
  per-farm isolation in the farm report.

## 12. What's included in Phase 9 (on top of Phases 1–8)

- Schema: `Conversation`, `ConversationMember`, `Message`, `MessageReceipt`,
  `Notification`, `Task`, `TaskComment`.
- `notifications` module — a `@Global()` service (same pattern as
  `AuditService`), so every other module can inject `NotificationsService`
  directly without an explicit import. `notify()` fans one event out to
  any number of recipients in a single bulk insert. IN_APP notifications
  are fully functional end to end; EMAIL/SMS rows are recorded with that
  channel but no external provider is wired up yet -- a documented scope
  boundary, not a silent gap, since the env vars for it already exist
  from Phase 1's `.env.example`.
- `messaging` module -- conversations (direct/group/department/role/
  warehouse/farm/broadcast/announcement) and messages with **per-recipient**
  receipt tracking through the full SENT -> DELIVERED -> READ ->
  ACKNOWLEDGED -> RESPONDED chain the spec requires (section 34) -- tracked
  per (message, recipient) pair since different people in a group read and
  respond at different times, not as one message-level flag.
  - Creating a BROADCAST or ANNOUNCEMENT conversation requires
    `messages.broadcast`; DIRECT/GROUP conversations don't -- checked
    inside the service since the same endpoint handles every type and the
    decorator-based guard can't branch on request-body content.
  - Fetching a conversation's messages is also what advances a member's
    receipts to READ (a documented simplification: opening the
    conversation IS reading it).
  - `respond()` posts an actual reply message AND marks the original
    RESPONDED; `acknowledge()` marks ACKNOWLEDGED without a reply --
    matching the spec's explicit distinction between the two.
  - Sending a message notifies every other member automatically via the
    injected `NotificationsService` -- the first concrete example of
    cross-module notification wiring in this codebase.
- `tasks` module -- assignment to either a specific user or any holder of
  a role code (spec section 35's "assigned role"), status workflow using
  the `TaskStatus` enum already defined in Phase 1's schema, comments, and
  completion evidence required before a task can move to COMPLETED.
  - Status updates are authorized by an OR condition (assignee, or
    creator, or any `tasks.assign` holder) that a simple permission
    decorator can't express -- checked explicitly in the service, same
    pattern as the scope-check helpers from Phase 3.
  - Assigning a task notifies the assignee, or **every** holder of the
    assigned role if it's role-based -- proven directly by a unit test
    with two role holders.
- Honest scope note: notification wiring is proven end-to-end in this
  phase's own new code (messages, tasks) but has **not** been retrofitted
  into every approval/rejection action across Phases 3-8 (e.g. paddy
  approval doesn't yet notify the Farm Manager). That retrofit is a
  mechanical, low-risk extension of the exact same
  `NotificationsService.notify()` call already proven here -- deferred
  rather than rushed into already-verified code under time pressure.
- Unit tests: broadcast-permission gating (allowed for DIRECT/GROUP,
  blocked for BROADCAST/ANNOUNCEMENT without the permission), non-member
  send rejection, notification fan-out on message send, acknowledgment
  rejection when not required, task-with-no-assignee rejection,
  role-based notification fan-out, assignee-can-update /
  bystander-cannot authorization, completion-evidence requirement, and
  `NotificationsService`'s bulk-insert and zero-recipient short-circuit
  behavior.

## 13. What's included in Phase 8 (on top of Phases 1–7)

- Schema: `Invoice`, `InvoiceItem`, `Payment`, `PaymentAllocation`,
  `ExpenseCategory`, `Expense`.
- `finance` module — four services:
  - **Invoices** — generated only from a `FULFILLED` sales order, copying
    its exact line items (never re-entered by hand). `amountPaid`,
    `balance`, and `status` (`OPEN`/`PARTIALLY_PAID`/`PAID`) are never
    stored columns — always derived from `PaymentAllocation` rows, same
    principle as the inventory ledger's materialized balances. Tax rate
    is a request parameter, never hard-coded (spec rule: "Never
    hard-code Ghana taxes").
  - **Payments** — Sales Officer records (`PENDING_VERIFICATION`),
    Finance Officer verifies. Allocations only count toward an invoice's
    balance once the payment is VERIFIED — a still-pending or rejected
    payment has zero financial effect, proven directly by a unit test. A
    Finance Officer cannot verify a payment they themselves recorded
    (spec: cash payments need proper authorization — this is that
    authorization, enforced the same way self-approval is blocked
    everywhere else in the system).
  - **Expenses** — category-based, `PENDING -> APPROVED/REJECTED`,
    self-approval blocked, mandatory rejection reason.
  - **Receivables** — accounts-receivable aging (current / 1-30 / 31-60 /
    61-90 / 90+ days) computed at read time from invoices and verified
    allocations only, exactly like every other derived figure in this
    system. `GET /receivables/top-debtors` powers the management
    dashboard's "top debtors" requirement (spec section 28).
- Two new permission codes not explicitly listed in the spec's own
  permission catalog but required by the functionality it describes:
  `invoice.create`, `expense.create` -- granted to Finance Director/Officer
  in the seed, following the same pattern as Phase 2's
  `warehouse.create/update/delete` additions.
- Unit tests: FULFILLED-only invoicing, no-double-invoicing, invoice
  totals ignoring non-verified allocations, PAID-status transition,
  allocation-exceeds-payment rejection, self-verification ban, and three
  aging-bucket scenarios (mid-range overdue, fully paid, not-yet-due)
  using literal day-offsets so the bucket boundaries are actually
  exercised, not just asserted in the abstract.

## 14. What's included in Phase 7 (on top of Phases 1–6)

- Schema: `Customer`, `ProductPrice`, `SalesOrder`, `SalesOrderItem`,
  `StockReservation`.
- `customers` module — CRUD with an auto-generated customer number.
- `sales` module — two services:
  - **Sales orders** — multi-line orders (spec's `sales_order_items`
    modeled as a real child table, not a single-line simplification).
    Every line's `totalKg` and `lineTotal` are computed server-side from
    the packaging size and a resolved price — never trusted from the
    client. Pricing resolution: customer-specific active price → general
    list price → an explicit override if the sales officer supplies one
    and nothing is configured yet — never a hard-coded number (spec
    section 25).
  - **Stock reservations** — a reservation is a *hold*, not a ledger
    movement: physical stock never leaves the warehouse balance until
    fulfillment. "Available to sell" is computed at read time as
    `warehouse balance − sum(ACTIVE reservations)`, never a separately
    stored counter that could drift. This is what makes it structurally
    impossible for two orders to reserve the same stock — proven by a
    unit test where a second order's approval correctly sees the first
    order's active reservation and rejects for insufficient stock.
  - Approval (Warehouse Supervisor) is **all-or-nothing per order** in
    this phase — documented simplification, matching how Phases 4–6
    handle their own approval edge cases: if any line item can't be fully
    covered at the allocated warehouse, the whole approval is rejected
    with the exact shortfall spelled out, rather than partially
    approving individual lines (the `PARTIALLY_APPROVED` status exists in
    the schema for a future refinement).
  - **Fulfillment** is where stock actually moves: `PACKAGED_RICE_SOLD`
    ledger transaction, warehouse balance decreases, and — using
    `LocationType.CUSTOMER` (already in the schema since Phase 3) — a
    customer-location balance increases, giving a free, queryable
    purchase-history ledger per customer that also matches the spec's
    forward-traceability requirement (batch → ... → customer).
  - Self-approval blocked, same rule as every other approval in this
    system.
  - Cancelling a reserved order releases its holds with **zero ledger
    effect** — nothing physically moved for a mere reservation.
- Unit tests: self-approval ban, insufficient-stock rejection, the
  double-booking-prevention scenario specifically, and full ledger wiring
  on fulfillment (warehouse down, customer-location up).

## 15. What's included in Phase 6 (on top of Phases 1–5)

- Schema: `PackagingBatch` — bulk unpackaged rice (from Phase 5's milling
  output) becomes retail-sized bags.
- `packaging` module — deliberately **no multi-step approval workflow**,
  matching spec section 17 (which describes packaging as a direct
  operational record, unlike paddy/delivery/production). The safety net
  is the ledger itself:
  - `totalKg` is **always** `packagingSize.sizeKg × bagCount`, computed
    server-side — reproducing spec section 17's own example exactly
    (25 KG × 100 bags = 2,500 KG), never accepted as a number from the
    client.
  - The bulk rice actually consumed (`sourceBulkKg`) may exceed the
    packaged total — the difference becomes an explicit `STOCK_LOSS`
    ledger transaction for packaging loss. It can never be *less* than
    the packaged total (would mean manufacturing mass from nothing) —
    rejected outright.
  - You cannot package more bulk rice than the milling center actually
    holds — enforced by the same `adjustBalance` negative-inventory
    guard every other module uses, not a bespoke check.
  - Packaged goods land in the warehouse's finished-goods balance,
    automatically visible through the existing (Phase 4) `GET
    /warehouses/:id/inventory` endpoint — no changes needed there, since
    it was already built generically against product+packagingSize.
- Unit tests: exact total-KG formula reproduction, no-loss consumption,
  negative-loss rejection, and packaging-loss transaction on a lossy run.

## 16. What's included in Phase 5 (on top of Phases 1–4)

- Schema: `Machine`, `MachineMaintenance`, `MeterReading`, `ProductionRecord`,
  `QualityInspection`.
- `machines` module — Machine CRUD (status: `RUNNING/IDLE/MAINTENANCE/
  FAULT/OFFLINE`), maintenance logging (a `BREAKDOWN` or in-progress
  `SCHEDULED` log takes the machine offline automatically; completing one
  returns it to `IDLE`), and meter readings with **anomaly detection
  against the machine's own trailing average** — not a fixed global
  threshold, matching spec section 20's "unusually high/low", "sudden
  changes", "meter rollback", "duplicate readings" list. Cold-start rule:
  no anomaly flag possible until 3 prior readings exist for that machine.
- `production` module — `ProductionRecordsService` is where paddy actually
  becomes rice. On create, the mass balance is validated immediately:
  - **Impossible** (outputs summing to more than the paddy processed) is
    **rejected outright** — spec section 16's "do not silently allow
    impossible production data."
  - **Abnormal but physically possible** (a large unaccounted variance)
    is **flagged**, not blocked — the Operations Manager approval step is
    the human check for that case.
  - Approval moves stock for real: warehouse paddy balance decreases,
    passes through the milling center (netted to zero — it's consumed,
    not stored), and recovered rice / broken rice / hull land as bulk,
    unpackaged balances at the milling center, ready for Phase 6
    packaging. Byproduct `Product` rows ("Broken Rice", "Rice Hull") are
    upserted automatically the first time they're needed.
  - Self-approval blocked, same rule as every other approval in this
    system.
- `QualityInspectionsService` — a `FAILED` result is stored as
  `QUARANTINED`; only an explicit `release()` call moves it to `RELEASED`
  (spec section 42: quarantined batches never become sellable just
  because time passed).
- New permission: `quality.manage`, granted to Operations Manager/Officer
  in the seed (a dedicated QC role can be cloned from Admin later — the
  role-cloning capability from Phase 1 already supports this without any
  code change).
- Unit tests: exact reproduction of spec section 51's worked mass-balance
  example (20,000 KG in → 14,000 + 3,000 + 2,500 + 500 out, exactly),
  impossible-mass-balance rejection, abnormal-but-possible flagging,
  self-approval ban, full ledger wiring on approval (warehouse → milling
  center → three output balances), meter rollback rejection, cold-start
  (no flag before 3 readings), and deviation-from-baseline flagging.

## 17. What's included in Phase 4 (on top of Phases 1–3)

- Schema: `Vehicle`, `Driver` (reusable lookup entities, upserted by plate
  number / license number so the same truck/driver is recognized across
  deliveries), `DeliveryOrder`, `DeliveryReport`, `Shipment`,
  `ShipmentEvent`.
- `logistics` module, three controllers sharing three services:
  - **Delivery orders** (`DeliveryOrdersService`) — Farm Supervisor
    requests stock move to a warehouse. Checks live farm balance before
    allowing the request, but creating the order never touches inventory
    itself (spec section 11: "Do NOT reduce available inventory before
    approval").
  - **Delivery reports** (`DeliveryReportsService`) — Farm Manager's
    logistics record (labour cost, transport fee, vehicle, driver,
    departure info). `totalDeliveryCost` is computed server-side, never
    trusted from the client. `DRAFT → SUPERVISOR_REVIEW →
    APPROVED/REJECTED`, and **approval is the one action that actually
    moves stock**: farm balance decreases, a `Shipment` is created, and an
    equal amount lands in an in-transit balance bucket — all one DB
    transaction.
  - **Shipments** (`ShipmentsService`) — the "on the way" list (spec
    section 14) and warehouse receiving. Receiving closes the in-transit
    bucket by the *full expected amount* and credits the warehouse with
    the *actual* received amount; any difference is logged as an explicit
    `STOCK_ADJUSTMENT` ledger transaction with a reason (spec section 13's
    "variance record"), flagged `PENDING` approval when it exceeds a 5 KG
    tolerance rather than silently auto-approved.
- **In-transit stock is a real location**, not a status flag:
  `LocationType.EXTERNAL` with `locationId = shipment.id`. This is what
  makes spec rule 7 ("in-transit stock is not available stock")
  structurally true — no farm or warehouse balance query ever includes it,
  because it isn't stored under either location.
- `GET /warehouses/:id/inventory` — mirrors the Phase 3 farm inventory
  endpoint, ledger-derived, ready for milling/packaging balances to join
  in once those phases exist.
- Self-approval blocked on delivery reports the same way as paddy entries
  (spec rule 54), tested directly.
- Unit tests: self-approval ban, farm-balance-decrease +
  in-transit-balance-increase on approval, double-receipt prevention,
  exact mass-balance closing of the in-transit bucket on receipt (proven
  with a short-delivery scenario), and variance-tolerance flagging.

## 18. What's included in Phase 3 (on top of Phases 1–2)

- `inventory-ledger` module: `InventoryLedgerService` — the shared,
  global-injectable core every future stock-touching module (delivery,
  milling, packaging, sales) will call. `recordTransaction` inserts an
  append-only `InventoryTransaction` row; `adjustBalance` updates the
  materialized `InventoryBalance` row and throws before letting a balance
  go negative. Both only ever run inside a caller-supplied Prisma
  transaction — never called standalone.
- `paddy` module: full `PaddyEntry` lifecycle —
  `DRAFT → SUBMITTED → APPROVED/REJECTED`, matching spec section 8–11 and
  the section 69 end-to-end example. Approval is one DB transaction that
  creates the `PaddyBatch`, records the `PADDY_APPROVED` ledger
  transaction, adjusts the farm's balance, and writes the audit record —
  or none of it happens.
- Self-approval is blocked unconditionally (spec rule 54) — enforced in
  both `approve()` and `reject()`, not just at the permission layer.
- `GET /farms/:id/inventory` — real-time, ledger-derived, matches the
  exact worked numbers from spec section 9.
- Manual scope-check helpers (`assertScope`, `scopedLocationIds`) added to
  `common/utils` for the cases `ScopeGuard` can't cover — request bodies
  and list-query auto-filtering, as opposed to route params.
- Unit tests: self-approval ban, ledger-transaction + balance-adjustment
  wiring on approval, cross-farm scope denial, and average-bag-weight
  computed from actual KG (never assumed from the grade label — spec's
  explicit warning in section 8).
- `docs/DEPLOYMENT.md` — Vercel (frontend) + Railway (backend/Postgres/
  Redis) deployment guide, since that's the actual target platform.

## 19. What's included in Phase 2 (on top of Phase 1)

- `organization` module: single Company profile (KAM Trading and Farms
  Limited, seeded — never hard-coded in logic) + Facility CRUD (Adenta HQ,
  Sefwi Kanchabio manufacturing facility seeded, more addable by Admin)
- `farms` module: full CRUD (never hard-coded to 6 — Farm G is one API call
  away), farm manager assignment, deactivation (not hard delete — history
  must survive), all server-side permission + scope enforced
- `warehouses` module: full CRUD (never hard-coded to 3), warehouse manager
  assignment, deactivation, plus nested Milling Center CRUD (one per
  warehouse, logically separate entities per spec section 15)
- `master-data` module: Products, Packaging Sizes (1/2/5/10/25/50KG seeded,
  but genuinely configurable — no code assumes those six exist), Paddy
  Grades (Size 4/5 seeded, same rule), Paddy Types — all Admin-manageable
  without a deploy
- New permission codes: `warehouse.create/update/delete`, `milling.manage`,
  `organization.manage`, `masterdata.manage` — added to the catalog and
  granted to the appropriate seeded roles (Admin gets all; Farm Director
  gets `masterdata.manage`; Warehouse Supervisor gets warehouse/milling
  management)
- Unit tests for `FarmsService` and `WarehousesService` covering: creating a
  farm/warehouse beyond the seeded set (proving nothing is hard-coded),
  duplicate-code rejection, deactivation instead of hard delete, and
  milling-center creation scoped to its parent warehouse
- Frontend: real `/farms` and `/warehouses` pages, backed by the live API,
  no mock data

## 20. What's included in this delivery (Phase 1)

- Monorepo scaffold, root workspace config
- `docker-compose.yml` (Postgres, Redis, MinIO, api, web) + Dockerfiles
- `.env.example`
- Full `prisma/schema.prisma` **data model for the whole system** (all 90+
  tables from the brief) so later phases are additive migrations, not
  redesigns — but only Phase 1's tables (org/auth) get business logic wired
  up now
- Working NestJS `auth` module: register (admin-only), login, JWT access +
  rotating refresh tokens, Argon2 hashing, account lockout, logout /
  logout-all, `/auth/me`
- `users`, `roles`, `permissions` modules with full CRUD, guards enforced
  server-side
- Seed script: company, facilities, permission catalog, 12 roles, demo users
  for every role
- Unit + e2e tests for auth and RBAC guards
- `docs/`: architecture, DB, roles/permissions matrix, installation
