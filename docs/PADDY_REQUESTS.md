# Paddy requests: the chain from the warehouse and the mill to the farm or another warehouse (version 2026.10.13)

Paddy is asked for **up** the chain and sent **down** it. Each person does only their own part, in one tap, and is told when it is their move.
This page covers the two request chains, the stock checks that guide each decision, the "Where is the paddy?" view, and the small changes that
make the screens easier for people who do not want to read much.

## The two chains

```
A WAREHOUSE needs paddy
  Warehouse Manager asks          (Size 4 and Size 5, the day needed)
  -> Warehouse Supervisor         "Send to the Farm Director"  (or "Not possible", with a reason)
  -> Farm Director                "Choose where it comes from": each farm's stock of EACH size is shown beside the choice,
                                  and so is the stock of each OTHER warehouse that holds paddy
       a FARM      -> the Farm Manager of that farm is asked to dispatch (the Dispatch desk takes over, and this request follows it)
       a WAREHOUSE -> the Warehouse Supervisor of that warehouse is asked to send it (the Deliveries desk, below)
  -> on the road (driver and vehicle shown) -> arrived at the warehouse

A MILLING CENTER needs paddy      (a mill draws its paddy from its own warehouse)
  Operations Officer asks
  -> Operations Manager           "Send to the Warehouse Supervisor"
  -> Warehouse Supervisor of the mill's warehouse sees that warehouse's stock against the need:
       enough  -> "Paddy is ready" -> the mill's officer presses "Paddy received at the mill" when it has reached the mill
       short   -> "Ask the Farm Director for the rest": a warehouse request is raised for EXACTLY the shortfall and follows the first chain.
                  The mill's request waits; when that paddy has arrived it comes back to the supervisor to press "Paddy is ready".
```

Someone who is already the first reviewer (a Warehouse Supervisor asking for their own warehouse, the Operations Manager asking for a mill) does not
send the request to themselves: it goes straight on.

## Who can do what

| Role | Permissions | Does |
|---|---|---|
| Warehouse Manager | `supply.view`, `supply.request` | Asks for paddy for their own warehouse |
| Warehouse Supervisor | `supply.view`, `supply.request`, `supply.forward`, `supply.fulfil` | Sends a warehouse's request on; answers a mill's request from the warehouse stock |
| Farm Director | `supply.view`, `supply.fulfil` | Chooses the farm for a warehouse's request |
| Operations Officer | `supply.view`, `supply.request` | Asks for paddy for the mill |
| Operations Manager | `supply.view`, `supply.request`, `supply.forward` | Sends a mill's request on |
| MD, CEO | `supply.view` | Watch the whole chain |

The permission opens the screen; the **role** decides the step. A Warehouse Supervisor cannot send a mill request on, the Farm Director cannot answer
one, and a supervisor of another warehouse cannot act on this warehouse's request. Each person sees only their part of the chain (a Warehouse Manager
their own warehouse's requests; the Operations Officer their mill's; the Farm Director the warehouse requests).

## Short tasks, with a button that opens the work

Every hand-off gives the next person a **task** and a **notification**. Both are one short line (the size and bags, and the day), because most people
using the system do not want to read. The task has one big **Open** button, and a notification has one too, that goes straight to the request or the
dispatch. The same is true for the farm manager's dispatch task. Nothing is explained at length: the screen the button opens is the explanation.

## The screens

- **Paddy requests** (`/warehouse-requests`, also on My Office and the dashboards of the people in the chain): the shared desk. "Your move" comes first,
  then "On the way", then "Done". Big buttons, few words. "Track" opens the steps and who did each. Requests made before this chain existed are under
  "Older requests".
- **Size 4 and Size 5** are on every form where bags are counted (the farm intake, the dispatch request, the farm manager's truck form, the paddy request),
  already there with a big minus, a number and a plus. Leave a size at 0 and it is not on the list. Any other size is one tap away. A farm manager
  loading a truck can put a size on it that the request did not ask for: it is added to the same request as part of the one dispatch.
- **Where is the paddy?** (button on the Paddy requests screen): every place the paddy is now, size by size: farms, the road (one entry per truck, with
  the driver and vehicle), warehouses, mills. Each person sees their own places; the Farm Director and management see all of them.

## Paddy between warehouses: the Deliveries desk (new in 2026.10.13)

A warehouse has its own place for deliveries: **Deliveries** in the menu of Warehouse Supervisors and Warehouse Managers (`/site-deliveries`).

- **Going out.** The Warehouse Supervisor presses "Send paddy": the warehouse the paddy goes to, Size 4 and Size 5 in bags (what the warehouse holds is
  shown beside each size), the driver and vehicle if known. Only bags are asked for. The paddy leaves the sender's stock **at once** and is counted as
  "on the road", so nobody can promise it twice. A delivery can be cancelled by the person who sent it until it is counted in: the bags come back.
- **Coming to you.** The other warehouse's Manager (or Supervisor) is told. When the paddy arrives they press "Paddy arrived", say how many bags of each
  size really came (it starts at what was sent), and confirm. What arrived goes into their stock and the "on the road" bucket is closed completely.
  If fewer bags came, the difference is written down for review (it is held for approval when it is more than 5 kg) and both sides are told. More bags
  than were sent cannot be counted in: the sender must correct the delivery first.
- **For a paddy request.** When the Farm Director chose a warehouse, its Supervisor has a short task and a big "Send the paddy" button on the request. It
  opens the send form already filled in (where, and both sizes). The request then follows that delivery: getting it ready, on the road, arrived.
- **Paddy that comes from a farm** is still counted in on the Shipments page. A mill's outgoing rice goes to its warehouse inside the packaging batch.
- **At the mill.** When a mill request is "ready", the Operations Officer (or Manager) presses **Paddy received at the mill**. That writes the mill's own
  record of paddy received (the same one the Production page keeps, both sizes in bags) and closes the request.

| Who | Permission | On the Deliveries desk |
|---|---|---|
| Warehouse Supervisor | `warehouse.transfer` | Sends paddy, cancels what they sent, counts in |
| Warehouse Manager | `warehouse.receive` | Counts in |
| Operations Officer, Operations Manager | `supply.request` | "Paddy received at the mill" (on the Paddy requests desk) |

No new permissions were added: the desk uses the two warehouse permissions that already exist. A person sees only deliveries to or from the warehouses
they look after (the Administrator and the management roles see all).

## The bag weight is a setting

When only a number of bags is entered, the kilograms are worked out from the bags and marked as an estimate. The weight of a bag is the **Standard paddy
bag weight** in Settings (Logistics, default 50 kg). Change it there and every estimate follows; nothing in the code needs to change.

## API

| Route | Permission | What it does |
|---|---|---|
| `GET /api/supply-requests` | `supply.view` | The requests this person may see, each with where it is and whose move it is |
| `POST /api/supply-requests` | `supply.request` | Ask: `warehouseId` or `millingCenterId`, `lines` (grade and bags), `neededBy`, `notes` |
| `GET /api/supply-requests/:id/sources` | reviewer or supplier role | The farms' stock (warehouse request) or the warehouse's stock (mill request), size by size |
| `POST /api/supply-requests/:id/forward` | `supply.forward` | Send it on |
| `POST /api/supply-requests/:id/decline` | `supply.forward` or `supply.fulfil` | "Not possible": a reason is required |
| `POST /api/supply-requests/:id/assign` | `supply.fulfil` | Farm Director: this farm (`sourceFarmId`) OR this warehouse (`sourceWarehouseId`) will send it |
| `POST /api/supply-requests/:id/ready` | `supply.fulfil` | Warehouse Supervisor: the paddy is ready (refused if the stock is not there) |
| `POST /api/supply-requests/:id/ask-farm-director` | `supply.fulfil` | Warehouse Supervisor: ask for exactly the shortfall |
| `POST /api/supply-requests/:id/cancel` | `supply.request` | Cancel (only by whoever asked, before it is filled) |
| `POST /api/supply-requests/:id/received` | `supply.request` | Mill: the paddy that is ready has reached the mill (Operations Officer or Manager of that mill) |
| `GET /api/paddy-transfers` | `warehouse.transfer` or `warehouse.receive` | Deliveries to or from the person's warehouses, marked IN, OUT or BOTH |
| `GET /api/paddy-transfers/places` | same | Where the person may send from (with the stock, size by size) and where it can go |
| `POST /api/paddy-transfers` | `warehouse.transfer` | Send paddy: `fromWarehouseId`, `toWarehouseId`, `lines` (grade and bags), optional driver, vehicle, note, `supplyRequestNumber` |
| `POST /api/paddy-transfers/:id/receive` | either | Count it in: `lines` (grade and bags that arrived), optional note |
| `POST /api/paddy-transfers/:id/cancel` | `warehouse.transfer` | Cancel before it is counted in (the sender, or the Administrator) |
| `GET /api/supply-requests/whereabouts` | `supply.view`, `farm.inventory.view` or `warehouse.inventory.view` | Where the paddy is |

## Database changes

Applied automatically by the start-up schema step: one table (`supply_requests`) and one column on tasks. The four `supply.*` permissions are added
and granted to the roles above by the start-up permission sync. If you ever need to apply them by hand:

```sql
CREATE TYPE "SupplyRequestKind" AS ENUM ('WAREHOUSE', 'MILL');
CREATE TYPE "SupplyRequestStatus" AS ENUM ('SUBMITTED', 'FORWARDED', 'ASSIGNED', 'READY', 'DECLINED', 'CANCELLED');
CREATE TABLE IF NOT EXISTS supply_requests (
  id TEXT PRIMARY KEY, request_number TEXT NOT NULL UNIQUE, kind "SupplyRequestKind" NOT NULL,
  warehouse_id TEXT NOT NULL, milling_center_id TEXT, lines JSONB NOT NULL, total_bags INTEGER NOT NULL,
  needed_by TIMESTAMP(3), notes TEXT, status "SupplyRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  requested_by_id TEXT NOT NULL, forwarded_by_id TEXT, forwarded_at TIMESTAMP(3), forward_note TEXT,
  decided_by_id TEXT, decided_at TIMESTAMP(3), decision_note TEXT,
  source_farm_id TEXT, dispatch_request_ref TEXT, parent_request_id TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS supply_requests_status_idx ON supply_requests (status);
CREATE INDEX IF NOT EXISTS supply_requests_warehouse_id_idx ON supply_requests (warehouse_id);
CREATE INDEX IF NOT EXISTS supply_requests_dispatch_request_ref_idx ON supply_requests (dispatch_request_ref);
CREATE INDEX IF NOT EXISTS supply_requests_parent_request_id_idx ON supply_requests (parent_request_id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS supply_request_number TEXT;
CREATE INDEX IF NOT EXISTS tasks_supply_request_number_idx ON tasks (supply_request_number);
```

### Added in 2026.10.13

```sql
CREATE TYPE "PaddyTransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'CANCELLED');
CREATE TABLE IF NOT EXISTS paddy_transfers (
  id TEXT PRIMARY KEY, transfer_number TEXT NOT NULL UNIQUE, from_warehouse_id TEXT NOT NULL, to_warehouse_id TEXT NOT NULL,
  lines JSONB NOT NULL, total_bags INTEGER NOT NULL, total_kg DECIMAL(14,2) NOT NULL, driver_name TEXT, vehicle_plate TEXT, notes TEXT,
  status "PaddyTransferStatus" NOT NULL DEFAULT 'IN_TRANSIT', sent_by_id TEXT NOT NULL, sent_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_by_id TEXT, received_at TIMESTAMP(3), received_lines JSONB, variance_bags INTEGER, receive_note TEXT, cancel_reason TEXT,
  supply_request_number TEXT, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS paddy_transfers_status_idx ON paddy_transfers (status);
CREATE INDEX IF NOT EXISTS paddy_transfers_from_warehouse_id_idx ON paddy_transfers (from_warehouse_id);
CREATE INDEX IF NOT EXISTS paddy_transfers_to_warehouse_id_idx ON paddy_transfers (to_warehouse_id);
CREATE INDEX IF NOT EXISTS paddy_transfers_supply_request_number_idx ON paddy_transfers (supply_request_number);
ALTER TYPE "SupplyRequestStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TABLE supply_requests ADD COLUMN IF NOT EXISTS source_warehouse_id TEXT;
ALTER TABLE supply_requests ADD COLUMN IF NOT EXISTS received_by_id TEXT;
ALTER TABLE supply_requests ADD COLUMN IF NOT EXISTS received_at TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS supply_requests_source_warehouse_id_idx ON supply_requests (source_warehouse_id);
```

## Limits worth knowing

- A request is filled from **one** place: the Farm Director chooses one farm or one warehouse that can cover it, not two sharing it.
- A delivery between warehouses is counted in as one whole delivery (sizes together). Paddy from farms is still counted in per size on the Shipments page.
- A warehouse that asks cannot ask two farms to share one request: the Farm Director chooses one farm that can cover it.
- The warehouse receives each size of a truck as its own shipment (grouped receiving is not built).
- The Warehouse Supervisor and Operations Manager must exist for a request to have someone to go to; a warehouse with no supervisor assigned has its
  requests wait. Assign them under Users.

## Checking it works

Server: `cd backend && npx jest src/supply src/logistics`. Browser: `e2e/t_supply.py` (the whole chain, both sizes everywhere, notification links),
`e2e/t_deliveries.py` (sending, counting in with a shortage, cancelling, the Farm Director choosing a warehouse, the mill confirming, and who is
offered the page across every role) and `e2e/t_dispatch.py`. See `e2e/README.md`.
