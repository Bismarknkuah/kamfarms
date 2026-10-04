# The sales chain: who does what, who sees what

A sale passes through seven hand-offs. Each has one accountable person, and every hand-off is written to the order's **activity trail**
(who, in which role, when, and what they said), which anyone who may see the order can read.

| # | Who | What they do | Order status after |
|---|-----|--------------|--------------------|
| 1 | Sales Officer | Creates the order, uploads the payment receipt, sends it | `SUBMITTED` |
| 2 | Finance Director | Reads the details and receipt; **approves** or **rejects** | `APPROVED` / `REJECTED` |
| 3 | Managing Director (or CEO) | Reads the details; **releases** or **rejects**. No longer picks a warehouse | `RELEASED` / `REJECTED` |
| 4 | Warehouse Supervisor | **Assigns a warehouse** (its stock is held for the order). Can move it to another warehouse until processing starts | `RESERVED` (shown as "Assigned to a warehouse") |
| 5 | That warehouse's team | **Starts processing** (picking and packing) | `PROCESSING` |
| 6 | That warehouse's team | Moves it **on track** once it has left, with driver, vehicle and expected arrival | `ON_TRACK` |
| 7 | That warehouse's team | **Confirms delivery**: the stock leaves the warehouse | `FULFILLED` |

The Sales Officer, Supervisor and MD can **cancel** until the warehouse starts processing (the Sales Officer who made it, or the MD).

## Approvals, everywhere in the system
* **Read first, then decide.** Wherever something waits for approval (sales orders, expenses, paddy entries, production runs, delivery reports,
  payments, system resets), the approver opens a **Review** window showing all the details (and receipt photo where there is one). Approve and Reject
  are inside that window, not on a bare row of buttons.
* **Rejecting always needs a comment.** The server refuses a blank or one-word comment on every rejection form (`reject-*.dto.ts`), and a test
  checks every such form automatically, including any added later. The person who sent the item reads the comment. Stock corrections and
  declined paddy requests follow the same rule.
* Nobody approves or rejects their own entry (unchanged).

## Who sees which orders
* **A Sales Officer sees only the orders they made.** Another officer's order is reported as "not found", so its existence is not revealed either.
  This covers the order list, the order itself, its receipts and the dashboard. The sales report was already limited to the officer's own sales.
* **A warehouse team member** sees only orders assigned to their own warehouse(s); the Supervisor and administrators see all.
* **Finance, MD, CEO, Supervisor and read-only oversight roles** (`sales.view`) see every order.
* Customers remain a shared list, so an officer can sell to an existing customer. Their *orders* stay private.

## Payment receipts
The Sales Officer adds receipts to the order by **taking a photo** (a phone opens its rear camera) or **choosing a photo or PDF** from the phone or
computer. There are no links. JPEG, PNG, WebP or PDF, up to 10 MB each, up to 10 per order. Photos are shrunk to about 1800 px before sending
(typically a few hundred KB). The server checks what the file really is, not what it is called. A receipt can be removed only while the order is a
draft; after sending it is part of the record, and a corrected one is added instead. Receipts are stored in the database and opened with the
person's own sign-in (they are never public links). iPhone "HEIC" photos are converted in the browser where it can; otherwise the officer is
told to retake it as JPEG or send a screenshot.

## Slow orders
An order that has sat longer than 48 hours at one desk is flagged in amber in the order list and on the order, so nothing quietly stalls.

## Products: Broken Rice and Rice Hull
At every start-up the server makes sure **Broken Rice** and **Rice Hull** exist as products (it adds only what is missing, judged by name, so an
existing "Rice Husk" counts). They then appear in Packaging, the order form and the **Price list**, where the Administrator sets their prices
(until then they show "Not set" and cannot be ordered).

## Permissions
`sales.assign` is new: held by the Warehouse Supervisor (and every permission by the Administrator). It is added by the start-up permission sync.

## Upgrading a live system
* The first start after this update creates two tables (`sales_order_events`, `sales_receipts`) and three order statuses (`RELEASED`, `PROCESSING`,
  `ON_TRACK`). Check the Control center for a database alert afterwards, as before.
* Orders that are already "Reserved" carry on from there: the warehouse team starts processing, moves it on track, then confirms delivery.
  Orders released earlier have no activity-trail history before the update.
* Receipts are kept in the database. Plan for roughly 0.3 to 0.5 MB per receipt; if volume grows a lot, move them to file storage.
- Browser tests for all of this live in e2e/ (see e2e/README.md).
