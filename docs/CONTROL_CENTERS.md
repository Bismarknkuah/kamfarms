# Control centers (version 2026.10.14)

The Managing Director, the Farm Supervisor (the Farm Director role), the Warehouse Manager and Supervisor, the Operations Manager and the Finance Director each have a
**control center** at the top of their home page. It shows the work waiting for THEM, with real figures, and the pages they run their area from. The Administrator
keeps their own control center. Nobody else has one (the server refuses them).

## What each person sees

Which work appears is decided by the **permissions** the person's role holds, so changing a role on the Roles page changes its control center by itself. How much of it
they are shown is decided by their **places** (scopes): a Warehouse Manager's figures count their own warehouse, never another.

| Work | Held by (permission) | Counted as |
|---|---|---|
| Orders waiting for your approval | `sales.approve` (Finance Director) | orders SUBMITTED |
| Orders waiting for your release | `sales.release` (MD, CEO) | orders APPROVED |
| Released orders waiting for a warehouse | `sales.assign` (Warehouse Supervisor) | orders RELEASED |
| Orders to prepare and send | `sales.fulfill` (Warehouse Manager and Supervisor) | RESERVED or PROCESSING, in the person's own warehouses |
| Payments waiting to be verified | `payment.verify` (Finance Director) | PENDING_VERIFICATION |
| Expenses waiting for your decision | `finance.approve` (Finance Director) | PENDING, other people's (never your own) |
| Expenses waiting for you | `finance.approve.director` (MD) | PENDING, entered by the Finance Director |
| Paddy entries waiting for your approval | `paddy.approve` (Farm Supervisor) | SUBMITTED, in the person's farms |
| Dispatches waiting for your approval | `delivery.approve` (Farm Supervisor) | SUPERVISOR_REVIEW, in the person's farms |
| Stock corrections waiting for you | `inventory.adjust` | PENDING, in the person's farms and warehouses |
| Production records waiting for your approval | `production.approve` (Operations Manager) | SUBMITTED, in the person's mills |
| Paddy requests waiting for your move | `supply.forward` or `supply.fulfil` | the same rule as the Paddy requests desk's "Your move" |
| Trucks from farms on the road to you | `warehouse.receive` (Warehouse Manager) | not yet counted in, to the person's warehouses |
| Paddy coming from other warehouses | `warehouse.receive` or `warehouse.transfer` | IN_TRANSIT, to the person's warehouses |
| Rice transfers coming to you | `warehouse.transfer` | DISPATCHED, to the person's warehouses |
| Paddy requests in progress | `supply.view` | not yet delivered, among those the person can see |
| Your open tasks | everyone | TODO, IN_PROGRESS or BLOCKED, assigned to the person |

Every figure uses the same status the matching page treats as "waiting", so a figure is never different from the list it opens. A figure above zero is highlighted.

## Isolation

- The **server** computes everything: `GET /api/control-center`. There is no id in the request to change; it is always the signed-in person's.
- The limits go into the database query itself (for example `farmId in [the person's farms]`), and the tests check the query, not just the answer.
- Someone with no place at all sees zeros and a line saying so; they are never mistaken for someone responsible for everything.
- "Run your area" shows only pages the person is already offered in their menu.

## Not included

Data-reset approval counts (the dashboard's rule for them is applied in the browser). The CEO has no control center unless `CEO` is added to `CONTROL_CENTER_ROLES` in
`backend/src/control-center/control-center.catalog.ts` and `frontend/src/components/ControlCenter.tsx`.

## Tests

`cd backend && npx jest src/control-center src/supply` and `e2e/t_control_center.py`.
