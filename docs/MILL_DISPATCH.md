# Mill dispatch (version 2026.10.15)

Paddy goes from a warehouse to its milling center, and finished products (packaged rice, broken rice, rice hull) come back from the mill to the warehouse. **Each is asked for,
approved by a supervisor, and counted in at the other end.** Nothing leaves until it is approved. Page: **Mill dispatch** (menu). Permissions `milldispatch.view`, `.request`, `.approve`, `.receive`.

## The two flows

| | Asks | Approves | Counts in |
|---|---|---|---|
| **Paddy to the mill** | Warehouse Manager of that warehouse | Warehouse Supervisor of that warehouse | Operations Officer of that mill |
| **Finished products to the warehouse** | Operations Officer of that mill | Operations Manager | Warehouse Manager of the mill's warehouse |

Nobody approves or refuses their own request, even holding both roles. A refusal needs a reason. The person who asked (or the approver) may cancel before approval; once it is on the
way only the approver may, and the stock goes back. The Managing Director and CEO can see every dispatch but only watch.

## What moves, and when

- **Asking** moves nothing (it checks the stock is there).
- **Approving** moves it out of the source into "on the way" (checked against the stock again at that moment, so something sold or sent in between cannot be sent twice).
- **Counting in** puts what actually arrived into the destination's stock and closes "on the way". The person says how much arrived of every item (it starts at what was sent; it can never be
  more). A shortage is written down for review, and held for approval when it is more than 5 kg, the same rule as paddy arriving from a farm.
- Paddy is sent in bags (kilograms follow the Standard paddy bag weight in Settings), packaged rice in bags (kilograms from the pack size), broken rice and hull in kilograms.
- Counting paddy in also writes the mill's own record of paddy received (the one the Production page keeps).

## What this changed elsewhere

1. **Production uses the mill's own paddy first.** When a production run is approved, the paddy comes from what the mill holds (counted in from dispatches); only the shortfall is taken from the warehouse,
   exactly as before. A mill with no paddy of its own behaves exactly as it always did.
2. **Packaged rice waits at the mill** until it is dispatched and counted in at the warehouse. Setting **Packaged rice waits at the mill until it is sent** (Settings, Production): `1` (default) is the new
   behaviour; `0` puts packaged rice straight into the warehouse stock when it is packaged, as it used to. Broken rice and hull were always created at the mill.

## Limits

- Mill dispatches are not yet on the **Track dispatch** page or in the control centers.
- Counting a dispatch in writes the mill's received-paddy record afterwards; if that record fails, the count still stands and a warning is logged.
- A mill dispatch carries one source and one destination (the mill and its own warehouse); paddy to a mill that belongs to another warehouse is not possible.

## Database change

One table, `mill_transfers`, created by the start-up schema step (equivalent SQL:
`CREATE TYPE "MillTransferDirection" AS ENUM ('TO_MILL','TO_WAREHOUSE'); CREATE TYPE "MillTransferStatus" AS ENUM ('PENDING_APPROVAL','IN_TRANSIT','RECEIVED','REJECTED','CANCELLED');` then the table in `prisma/schema.prisma`).

## Tests

`cd backend && npx jest src/mill-dispatch src/production src/packaging`.
