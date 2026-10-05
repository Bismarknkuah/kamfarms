# Damaged bags on a delivery (version 2026.10.16)

When a truck is counted in at a warehouse, the Warehouse Manager says, for each size, how many of the bags that arrived are **spoiled or broken**, and writes what is wrong with them. The
**Warehouse Supervisor** of that warehouse then approves or refuses the report. Every step shows on the truck in **Track dispatch**, to everyone who can track it.

## What happens, step by step

1. **Count-in.** In *Track dispatch* (the *Truck received* button) or on the *Shipments* page the manager enters the bags that arrived and, under it, how many are spoiled or broken. A comment is
   **required** whenever any are damaged. More damaged bags than arrived is refused.
2. **The good bags go into the stock; the damaged ones are held.** The warehouse is credited only with the good bags. The damaged bags are held in a separate bucket (`hold:<shipment>`), so
   **nobody can sell them** while the report waits. The count-in itself is not delayed.
3. **A review is opened** (`RV-<year>-<number>`), one per truck: if several sizes of the same truck have damaged bags they join the same review. The Warehouse Supervisors of that warehouse are
   notified; the notification opens that truck.
4. **The Warehouse Supervisor decides** (only the supervisor of that warehouse, or the Administrator; never the person who reported it, and only once):
   - **Approve:** the held bags are written off as a loss (ledger type `STOCK_LOSS`, with the reference of the review).
   - **Refuse:** the held bags go back into the warehouse stock, and the supervisor **must** say why.
5. **Everyone is told.** The Warehouse Manager who reported it and the farm side (the farm's managers and the Farm Supervisor) are notified of the decision. It is written to the audit log.

## What each person sees

On the truck's card: *Damaged bags: waiting for the Warehouse Supervisor* (or *approved* / *refused by ...*), the bags per size, who reported it and what they wrote, how long it has waited, and the
decision with its comment. The Warehouse Supervisor of that warehouse also gets the **Approve** and **Refuse** buttons. A **Needs review** filter lists only the trucks waiting for a decision, and the
Warehouse Supervisor's control center counts them.

## Not included

- The review is a panel on the truck, not a step in the timeline, so the *Longest wait* line does not include the time a report waits for its decision (the panel shows how long it has waited).
- Damaged *paddy transfers between warehouses* and *rice transfers* are counted in by their own screens and do not use this review.

## Where it lives

`backend/src/logistics/receipt-reviews.service.ts` (the review and the stock rules), `shipments.service.ts` (`receive`, `receiveDispatch`), `backend/src/dispatch-tracking/dispatch-tracking.service.ts`
(`withReviews`), `frontend/src/components/tracking/DispatchTracker.tsx` (`ReviewPanel`). One table, `receipt_reviews`. Permission: `receipt.review` (Warehouse Supervisor).

## Tests

`receipt-reviews.service.spec.ts`, `receive-damage.spec.ts` (server); `e2e/t_update.py` (browser).
