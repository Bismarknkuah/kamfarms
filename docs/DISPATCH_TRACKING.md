# Track dispatch (version 2026.10.14)

**Track dispatch** (in the menu) shows every dispatch the person may track, with where it is, every step it went through, and who held it up. Permission: `dispatch.track`.

## Who tracks what

| Role | Sees |
|---|---|
| Farm Manager | Only their own farm's dispatches |
| Warehouse Manager | What is coming to their warehouse and what leaves it: trucks from farms, paddy sent between warehouses, rice transfers |
| Warehouse Supervisor, Farm Supervisor (Farm Director), MD, CEO | Every dispatch (they supervise the managers and the warehouses). MD and CEO read only |

The limits are applied in the database query. A person with no farm and no warehouse sees nothing.

## What a dispatch shows

Steps, in order, each with who did it, when, and how long it waited after the step before: **Requested** (Farm Supervisor), **Loaded and sent for approval** (Farm Manager),
**Approved** (Farm Supervisor), **Left the farm** (driver and vehicle), **Delivered and counted in** (Warehouse Manager). Paddy sent between warehouses and rice transfers are
two steps: sent, counted in.

- **Supposed to arrive by**: the needed-by day of the request. A dispatch is **late** if it arrives after the END of that day (UTC), and **overdue** while it is still on the way after it.
- **Longest wait**: the step that took longest, with who had it. A dispatch still waiting says who it is waiting for, and for how long so far.
- Status words: Requested, Waiting for approval, **In transit**, **Delivered**.

## Counting a truck in

The Warehouse Manager of the warehouse the truck is going to sees **Truck received**: one count per size (it starts at what was sent), a note, one confirmation. The truck then says Delivered.
`POST /api/shipments/dispatch/:ref/receive` (permission `warehouse.receive`): everything is checked first (scope, sizes, counts); each size is then counted in with the ordinary
receive, so stock moves exactly as before. A size already counted in is left alone, so pressing it again after a failure finishes the rest and never counts anything twice.
The Warehouse Supervisor and the management roles can track but not count in.

## Limits

- The system knows when the warehouse manager **confirmed** the truck, not when it physically arrived. A truck that arrived but was not confirmed shows as still waiting for the Warehouse Manager.
- The paddy request chain's own steps (asked, sent on, source chosen) stay on the Paddy requests page.
- Counting a truck in is not all-or-nothing across sizes (each size is its own transaction); the retry behaviour above makes that safe.
- The Administrator's menu does not list the page (the Administrator can open `/track-dispatch`).

## Tests

`cd backend && npx jest src/dispatch-tracking src/logistics` and `e2e/t_tracking.py`.

## Damaged bags (2026.10.16)

When the Warehouse Manager counts a truck in and reports spoiled or broken bags, the truck's card shows the report: how many, per size, who reported it and what they wrote, how long it has waited for the
Warehouse Supervisor, and the decision. A **Needs review** filter lists the trucks waiting for one. See `docs/RECEIPT_REVIEW.md`. The Finance Director may also follow tracking (read only).
