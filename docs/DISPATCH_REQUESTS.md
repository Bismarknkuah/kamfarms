# Dispatch requests, tasks and tracking (version 2026.10.10)

A Farm Supervisor asks a farm manager to dispatch bags to a warehouse. The request is spelled out in full, becomes a task on the farm
manager's list automatically, and the supervisor can follow it until it arrives. This page also covers the two related changes made in the
same release: one intake with several sizes, and kilograms being optional wherever there is no scale.

"Farm Supervisor" in the system means the **Farm Director** (and the MD and CEO). They hold `delivery.create` and `delivery.approve`. The farm
manager holds `delivery.create`.

## The flow

```
Farm Supervisor asks (Dispatch page: "Ask a farm manager to dispatch")
  -> one delivery order per size, tied by one request reference (RQ-2026-000012)
  -> one TASK per manager of that farm, with everything spelled out (TASK-2026-000034)
Farm manager opens the task -> "Open the dispatch and log the report" -> logs a dispatch report for each size
Farm Supervisor approves the report -> stock leaves the farm, a shipment is on the road
Warehouse Manager receives the shipment (Shipments page) -> the report is reconciled
```

Nothing moves in stock when the request is made. Stock leaves the farm only when the supervisor approves the dispatch report.

## What the farm manager is told

The task is titled `Dispatch 20 bags to Tamale Warehouse` and reads:

```
Dispatch from Nkawkaw Farm to Tamale Warehouse (Tamale, Northern Region).
Needed there by: Fri 9 Oct 2026.
Priority: HIGH.
What to send:
- Size 4: 17 bags
- Size 5: 3 bags
Total: 20 bags.
Who to ask at the warehouse: Kwabena Adjei (0244111222).
Instructions from Efua Mensah: Load the Size 4 first. The truck leaves at 6am.
When the bags are loaded, open Dispatch and log a dispatch report for each size. Request RQ-2026-000012.
```

The same detail goes in a notification. The Tasks page shows the destination and a button that opens the Dispatch page with that
request's orders highlighted; the report form starts with a brief (where it goes, what, when, the instruction). My Office lists orders with
the warehouse and its location, and shows the same brief when one is picked.

If the farm has **no manager assigned**, nobody gets the task. The confirmation says so in a warning rather than failing silently. Assign a
manager under Farms. If the person asking is themselves the farm's only manager, no separate task is made.

## Where it is (tracking)

Worked out by the server from what has actually happened (`backend/src/logistics/dispatch-tracking.util.ts`), and shown on every order.

| Stage | Meaning | Whose move |
|---|---|---|
| Requested | Nobody has started a dispatch report | Farm manager |
| Preparing / Sent back | A report is being prepared, or was sent back (the reason is shown) | Farm manager |
| In review | The report is waiting for approval | Farm supervisor |
| On the way | Approved: shows driver and vehicle | On the road |
| Arrived | Received: shows bags received against bags that left, and any difference that needs approval | nobody |
| Cancelled | | nobody |

"Track" on an order opens the step-by-step timeline. The "Log delivery report" button is hidden once an order is in review, on the way,
arrived or cancelled.

## Who is told, and the task's status

| When | Who is notified |
|---|---|
| A request is made | The farm manager(s), with the full detail |
| A report is submitted | The supervisor who asked |
| A report is sent back | The farm manager who wrote it, with the reason |
| A report is approved | The supervisor who asked (driver and vehicle), and the receiving warehouse's manager(s) |
| A shipment is received | The supervisor who asked and the farm's manager(s), saying if any bags were short |

The person who did the action is never notified of their own action. The task goes **in progress** when the farm manager starts a report and
**completed** when every size of the request is on its way. These follow-ups are best effort: they are logged and never undo the dispatch
itself.

## One intake with several sizes

`POST /api/paddy-entries/intake` saves every size that arrived (for example 17 bags of Size 4 and 3 bags of Size 5) as one intake, **all or
nothing**, and submits it for approval in the same step unless `submit: false`. Each size is still its own entry with its own approval, tied
together by `intake_ref` (IN-2026-000007). Both the Paddy entries page and My Office use it. A failure says nothing was saved and why.

## Kilograms are optional

Most farms and warehouses have no scale, so they deal in bags. Where kilograms are left out they are worked out from the bags and marked as
an estimate (never passed off as a measurement). The one standard is `STANDARD_PADDY_BAG_WEIGHT_KG = 50` in
`backend/src/common/constants/bag-weight.ts`.

| Form | If kilograms are left out |
|---|---|
| Paddy intake, dispatch request | bags times the standard bag weight |
| Delivery report | bags times the order's own weight per bag (`actual_kg_estimated`) |
| Receiving a shipment | bags times the weight per bag the shipment left with, so a full load shows no difference (`received_kg_estimated`) |
| Stock transfer (send and receive) | exactly bags times the pack size |
| Paddy request | bags times the standard bag weight |

## API

`POST /api/delivery-orders/request` (permission `delivery.create`):

```json
{ "farmId": "...", "destinationWarehouseId": "...", "requestedDate": "2026-10-09", "priority": "HIGH",
  "notes": "Load the Size 4 first.", "lines": [ { "paddyGradeId": "...", "bagCount": 17 }, { "paddyGradeId": "...", "bagCount": 3 } ] }
```

It answers with the request reference, the orders, the warehouse (name, location, contacts), the tasks created and who they went to, and
`noTaskCreated` / `noManagerOnFarm`. `POST /api/delivery-orders` (one size) still works and now goes the same way. `GET /api/delivery-orders`
returns each order with a `tracking` object. `GET /api/warehouses/directory` now includes each warehouse's `location`.

## Database changes

Applied automatically by the start-up schema step. Nothing to run by hand. If you ever need to apply them manually:

```sql
ALTER TABLE paddy_entries    ADD COLUMN IF NOT EXISTS intake_ref TEXT;
CREATE INDEX IF NOT EXISTS paddy_entries_intake_ref_idx ON paddy_entries (intake_ref);
ALTER TABLE delivery_reports ADD COLUMN IF NOT EXISTS actual_kg_estimated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE shipments       ADD COLUMN IF NOT EXISTS received_kg_estimated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE delivery_orders  ADD COLUMN IF NOT EXISTS request_ref TEXT;
CREATE INDEX IF NOT EXISTS delivery_orders_request_ref_idx ON delivery_orders (request_ref);
ALTER TABLE tasks           ADD COLUMN IF NOT EXISTS delivery_request_ref TEXT;
CREATE INDEX IF NOT EXISTS tasks_delivery_request_ref_idx ON tasks (delivery_request_ref);
```

## Checking it works

Server tests: `cd backend && npx jest src/logistics src/paddy src/warehouses`. Browser tests: `e2e/t_dispatch.py` (the request, the task,
the tracker) and `e2e/t_intake.py` (the intake, new users, kilograms optional). See `e2e/README.md`.
