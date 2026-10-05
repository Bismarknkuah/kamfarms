# Control centers (version 2026.10.14, extended in 2026.10.16 and 2026.10.17)

The Managing Director, the CEO, the Farm Supervisor (the Farm Director role), the Warehouse Manager and Supervisor, the Operations Manager, the Operations Officer and the
Finance Director each have a **control center** at the top of their home page, and a **Control center** button in their menu (it opens the same thing as a page of its own). It shows the work waiting for THEM, with real figures, and the pages they run their area from. The Administrator
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

Data-reset approval counts (the dashboard's rule for them is applied in the browser).

## Added in 2026.10.16

- The **CEO** and the **Operations Officer** have a control center, and every role that has one has the menu button (`/control-center`). The Administrator can switch the
  control center off for a role (Settings, *Who can use what*): the button and the dashboard section disappear and the server refuses it.
- New tiles (each appears only to the roles named):

| Work | Held by | Counted as |
|---|---|---|
| Damaged bags waiting for your review | `receipt.review` (Warehouse Supervisor) | reviews PENDING, in the supervisor's warehouses |
| Paddy on its way to your mill | Operations Officer | paddy mill dispatches IN_TRANSIT to their mills |
| Finished products waiting at the mill to be sent | Operations Officer | product lines with stock at their mills |
| Mill dispatches waiting for your approval | Warehouse Supervisor (paddy going out) / Operations Manager (products coming back) | PENDING_APPROVAL, by direction and place |
| Milled rice on its way to your warehouse | Warehouse Manager, Warehouse Supervisor | product mill dispatches IN_TRANSIT to their warehouses |

A tile can be limited to certain **roles** as well as a permission (`onlyRoles` in the catalogue), because several roles share one permission but do different things with it.

## Tests

`cd backend && npx jest src/control-center src/supply` and `e2e/t_control_center.py`.

## Restyled in 2026.10.17

Every control center now looks like the Administrator's: an italic *Control center* heading, a status line (*N waiting for you* or *Nothing is waiting for you*, and when it was refreshed), tiles with an icon
each, and *Run your area* as cards with dark icon squares. The test hooks (`cc-title`, `cc-jurisdiction`, `cc-tiles`, `cc-tile`, `cc-count`, `cc-control`) are unchanged.
For the Finance Director, MD and CEO the control center is part of a larger page that adds the company's money (see `docs/MONEY_CENTER.md`).

Since 2026.10.18 the Finance Director, MD and CEO each have their own dashboard around the control center, with the tools to carry out their tasks on the page: `docs/EXECUTIVE_DASHBOARDS.md`.
