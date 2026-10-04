# Paddy requests: the chain from the warehouse and the mill to the farm (version 2026.10.12)

Paddy is asked for **up** the chain and sent **down** it. Each person does only their own part, in one tap, and is told when it is their move.
This page covers the two request chains, the stock checks that guide each decision, the "Where is the paddy?" view, and the small changes that
make the screens easier for people who do not want to read much.

## The two chains

```
A WAREHOUSE needs paddy
  Warehouse Manager asks          (Size 4 and Size 5, the day needed)
  -> Warehouse Supervisor         "Send to the Farm Director"  (or "Not possible", with a reason)
  -> Farm Director                "Choose a farm": each farm's stock of EACH size is shown beside the choice
  -> the Farm Manager of that farm is asked to dispatch (the Dispatch desk takes over, and this request follows it)
  -> on the road (driver and vehicle shown) -> arrived at the warehouse

A MILLING CENTER needs paddy      (a mill draws its paddy from its own warehouse)
  Operations Officer asks
  -> Operations Manager           "Send to the Warehouse Supervisor"
  -> Warehouse Supervisor of the mill's warehouse sees that warehouse's stock against the need:
       enough  -> "Paddy is ready"
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
| `POST /api/supply-requests/:id/assign` | `supply.fulfil` | Farm Director: this farm will send it (asks its manager to dispatch) |
| `POST /api/supply-requests/:id/ready` | `supply.fulfil` | Warehouse Supervisor: the paddy is ready (refused if the stock is not there) |
| `POST /api/supply-requests/:id/ask-farm-director` | `supply.fulfil` | Warehouse Supervisor: ask for exactly the shortfall |
| `POST /api/supply-requests/:id/cancel` | `supply.request` | Cancel (only by whoever asked, before it is filled) |
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

## Limits worth knowing

- Paddy **moving from one warehouse to another** is not built. The Farm Director chooses among the farms; a mill's request is answered from its own
  warehouse's stock, and what is short is asked of the Farm Director.
- A warehouse that asks cannot ask two farms to share one request: the Farm Director chooses one farm that can cover it.
- The warehouse receives each size of a truck as its own shipment (grouped receiving is not built).
- The Warehouse Supervisor and Operations Manager must exist for a request to have someone to go to; a warehouse with no supervisor assigned has its
  requests wait. Assign them under Users.

## Checking it works

Server: `cd backend && npx jest src/supply src/logistics`. Browser: `e2e/t_supply.py` (the whole chain, both sizes everywhere, notification links) and
`e2e/t_dispatch.py`. See `e2e/README.md`.
