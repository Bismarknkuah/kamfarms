# The Dispatch desk: requests, one dispatch per truck, approval and tracking (version 2026.10.11)

A Farm Supervisor asks a farm manager to dispatch bags to a warehouse. The request says exactly where, what and by when, and becomes the
manager's task. The farm manager loads **one truck** and submits **one dispatch** with every size on it. The supervisor approves it **as one**
and follows it until it arrives. Both work from the **same Dispatch desk**, so what one sees is what the other sees.

"Farm Supervisor" in the system means the **Farm Director**: `delivery.create`, `delivery.approve`, `delivery.reject`. The **Farm Manager**
holds `delivery.create`. Both hold `farm.inventory.view`, which is what opens the desk. The CEO and the auditor can read it.

## The flow

```
Farm Supervisor: "Ask a farm manager to dispatch"   (every size, one warehouse, a needed-by date, instructions)
  -> one delivery order per size, tied by one request reference (RQ-2026-000012)
  -> one TASK for each manager of that farm, with everything spelled out (TASK-2026-000034)
Farm Manager: "Load & dispatch"                      (ONE form: every size on the truck, the driver and vehicle, the trip's costs)
  -> one dispatch (DS-2026-000007): a report per size, submitted together
Farm Supervisor: "Review & approve"                  (what was asked against what was loaded, the truck, the cost)
  -> approved: every size leaves the farm together, a shipment per size is on the road
  -> or sent back, with a reason: the whole dispatch returns to the farm manager
Warehouse Manager receives each shipment (Shipments page)
```

Nothing moves in stock until the supervisor approves the dispatch.

## The Dispatch desk

Where it is: the first tab of the **Dispatch** page, on the **Farm Director** and **Farm Manager dashboards**, and on **My Office**. It is one
screen shared by both people. Every request is one card: where it goes (the warehouse and its location), the sizes and bags, the needed-by
date (late is flagged), the instructions, where it is now and whose move it is, the dispatch prepared for it, and a **Track** timeline.

What each person sees first:

| Person | First section | What they can do |
|---|---|---|
| Farm Supervisor | **Waiting for your decision**: dispatches the farm manager prepared | Review and approve, or send back with a reason (a comment is required) |
| Farm Manager | **Your move**: requests to load, requests sent back, their own drafts | Load and dispatch, prepare it again, send a draft for approval |

Everything else is under **In progress** (with the tracker) and **Arrived recently** (the last 14 days). The supervisor is never offered
"Load & dispatch" or "Send for approval", and the farm manager is never offered approve: no one is shown a button that cannot work.

## One dispatch, every size

- One truck goes from one farm to **one warehouse**. Orders for different warehouses need separate dispatches.
- Stock is per size, so each size is its own report, tied together by one dispatch reference (`DS-...`). They are saved, submitted,
  approved or sent back **together, all or none**. Approving moves every size's stock in a single database transaction.
- The trip's driver, vehicle and costs are entered once. The cost is recorded **once** (on the first report), so it is never counted twice.
- A size loaded short of (or over) what was asked is flagged to both people.
- **Sent back:** the farm manager chooses "Prepare it again". The form remembers the truck, driver and costs and shows the reason. It goes
  as a **new** dispatch; the old one stays as history.
- **Drafts** belong to the person who prepared them: only they can send one. A draft they left on the same orders the old
  one-size-at-a-time way is replaced by the new dispatch.
- Vehicle number and driver are optional but encouraged, so the supervisor and the warehouse can recognise the truck.

## What the farm manager is told

The task is **short**, with one big **Open** button that opens the Dispatch desk on this request. It is titled `Send 20 bags to Tamale Warehouse` and
reads one line (and the Farm Director's note, if they typed one):

```
Size 4: 17 bags, Size 5: 3 bags · by Fri 9 Oct 2026
Note: Load the Size 4 first. The truck leaves at 6am.
```

The notification is one line too (`Efua Mensah asks you to send 20 bags to Tamale Warehouse (Tamale): Size 4 17, Size 5 3 · by Fri 9 Oct 2026`) and has an Open
button. Everything else (where it goes and its location, the day, the instructions) is on the desk card. If the farm has **no
manager assigned** nobody gets the task, and the confirmation says so in a warning. Assign a manager under Farms.

## Where it is (tracking)

Worked out by the server from what has happened (`dispatch-tracking.util.ts`, `dispatch-board.util.ts`). A request with several sizes is only
as far along as its **slowest** size.

| Stage | Meaning | Whose move |
|---|---|---|
| Requested | Nobody has started a dispatch | Farm manager |
| Preparing / Sent back | A dispatch is being prepared, or was sent back (the reason is shown) | Farm manager |
| In review | A dispatch is waiting for approval | Farm supervisor |
| On the way | Approved, with driver and vehicle | On the road |
| Arrived | Received, with bags received against bags sent, and any difference that needs approval | nobody |
| Cancelled | | nobody |

## Who is told, and the task's status

| When | Who is notified |
|---|---|
| A request is made | The farm manager(s), with the full detail |
| A dispatch is submitted | The supervisor who asked, once for the whole dispatch |
| A dispatch is sent back | The farm manager who prepared it, with the reason |
| A dispatch is approved | The supervisor who asked (driver and vehicle), and the receiving warehouse's manager(s) |
| A shipment is received | The supervisor who asked and the farm's manager(s), saying if bags were short |

The person who did the action is never told of their own action. The task goes **in progress** when the manager starts (or submits) a
dispatch and **completed** when every size of the request is on its way. These follow-ups are best effort: logged, and never undoing the
dispatch itself.

## One intake with several sizes

`POST /api/paddy-entries/intake` saves every size that arrived as one intake, all or nothing, and submits it for approval in the same step
unless `submit: false`. Each size keeps its own approval, tied together by `intake_ref`. A failure says nothing was saved and why.

## Kilograms are optional

Where kilograms are left out they are worked out from the bags and marked as an estimate. The one standard is
`STANDARD_PADDY_BAG_WEIGHT_KG = 50` in `backend/src/common/constants/bag-weight.ts`.

| Form | If kilograms are left out |
|---|---|
| Paddy intake, dispatch request, paddy request | bags times the standard bag weight |
| Dispatch (per size) | bags times that order's own weight per bag (`actual_kg_estimated`) |
| Receiving a shipment | bags times the weight per bag the shipment left with, so a full load shows no difference (`received_kg_estimated`) |
| Stock transfer (send and receive) | exactly bags times the pack size |

## API

| Route | Permission | What it does |
|---|---|---|
| `POST /api/delivery-orders/request` | `delivery.create` | A request: every size, one warehouse, a date, instructions. Also creates the task |
| `GET /api/delivery-orders/requests` | `farm.inventory.view` or `delivery.view` | The desk: one card per request, scoped to the person's farms |
| `POST /api/delivery-reports/dispatch` | `delivery.create` | One dispatch with every size; `submit: false` saves a draft |
| `POST /api/delivery-reports/dispatch/:ref/submit` | `delivery.create` | Send a draft or sent-back dispatch (only by whoever prepared it) |
| `POST /api/delivery-reports/dispatch/:ref/approve` | `delivery.approve` | Approve the whole dispatch (not your own) |
| `POST /api/delivery-reports/dispatch/:ref/reject` | `delivery.reject` | Send the whole dispatch back; `{ "reason": "..." }` is required |

`POST /api/delivery-orders` and the one-size report routes still work and follow the same rules; a report that belongs to a dispatch is
decided through the dispatch.

## Database changes

Applied automatically by the start-up schema step. If you ever need to apply them by hand:

```sql
ALTER TABLE paddy_entries    ADD COLUMN IF NOT EXISTS intake_ref TEXT;
CREATE INDEX IF NOT EXISTS paddy_entries_intake_ref_idx ON paddy_entries (intake_ref);
ALTER TABLE delivery_reports ADD COLUMN IF NOT EXISTS actual_kg_estimated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE delivery_reports ADD COLUMN IF NOT EXISTS dispatch_ref TEXT;
CREATE INDEX IF NOT EXISTS delivery_reports_dispatch_ref_idx ON delivery_reports (dispatch_ref);
ALTER TABLE shipments        ADD COLUMN IF NOT EXISTS received_kg_estimated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE delivery_orders  ADD COLUMN IF NOT EXISTS request_ref TEXT;
CREATE INDEX IF NOT EXISTS delivery_orders_request_ref_idx ON delivery_orders (request_ref);
ALTER TABLE tasks            ADD COLUMN IF NOT EXISTS delivery_request_ref TEXT;
CREATE INDEX IF NOT EXISTS tasks_delivery_request_ref_idx ON tasks (delivery_request_ref);
```

## Limits worth knowing

- The warehouse receives **each size as its own shipment** (a truck with two sizes is two receipts). Receiving a whole dispatch in one step is not built.
- A farm with no manager: only the Administrator can load a dispatch for it.
- The desk shows the latest 300 orders and refreshes every 45 seconds.

## Checking it works

Server: `cd backend && npx jest src/logistics src/paddy src/warehouses`. Browser: `e2e/t_dispatch.py` (the whole supervisor and farm manager
collaboration) and `e2e/t_intake.py` (intake, new users, kilograms optional). See `e2e/README.md`.

## Both sizes, always (version 2026.10.12)

The farm manager's truck form always shows **Size 4 and Size 5**, filled in from the request. A size the request did not ask for can still go on
the truck: `POST /api/delivery-reports/dispatch` accepts a line with a `paddyGradeId` instead of a `deliveryOrderId` (with the `requestRef`), and the
order for it is made as part of the same dispatch (the farm's stock for it is checked). A truck can even be loaded with no request at all, by naming
`farmId` and `destinationWarehouseId`. The bag weight used for estimates is the Settings value (see `docs/PADDY_REQUESTS.md`).
