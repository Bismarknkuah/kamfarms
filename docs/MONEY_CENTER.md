# The company's money: dashboards and ledger (version 2026.10.17)

The **Finance Director**, the **MD** and the **CEO** each have a control center built like the Administrator's (since 2026.10.18 each has a **different** dashboard: see `docs/EXECUTIVE_DASHBOARDS.md`). It opens with the company's money, then the work waiting for them, then
where the money goes. A **Money ledger** page lists every payment and every expense.

## Who sees it

Only people who hold `finance.view` **and** see the whole company (no place limit): the Finance Director, MD, CEO and the Administrator. (The Auditor also holds `finance.view`, so may open the
Money ledger; the Auditor's dashboard is unchanged.) The server refuses everyone else, whatever the website shows. It is read-only: deciding on an order, payment or expense still happens on the
Finance Director's desk or the MD/CEO's release desk, which sit on the page under *Decide here*.

## What the dashboards show

| Figure | What it adds up |
|---|---|
| **Sales booked** | Orders the Finance Director has approved and that are not rejected or cancelled (approved, released, reserved, processing, on track, fulfilled), by order date |
| **Money collected** | Customer payments that are **verified** (by payment date) |
| **Money spent** | Expenses that are **approved** (by expense date) |
| **Net cash** | Collected less spent |
| **Owed to us** | Invoices less verified payments, as the receivables screen works it out; "overdue" is past the due date |
| **Payments to verify / Expenses to approve** | Everything still waiting for a decision, whatever its date |

Every headline figure is compared with the period before it (this month with last month, this quarter with last quarter, and so on). *All time* has nothing to compare with. Periods are worked out in
UTC (Ghana keeps GMT). The six-month chart always shows the last six months, whatever period is chosen.

**Where the money is spent** lists every active farm, warehouse and milling center (including those that spent nothing), and the head office. **Each expense is counted once, at the most specific place
it names: the mill, else the warehouse, else the farm, else the head office**, so the four totals always add up to exactly what was spent. Spending still waiting for approval is shown on its place.
Clicking a place opens the ledger limited to it. The MD also sees the stock on the ground and the output feedback, and the CEO a scorecard and a risk radar, both with the Watchlist (see `docs/EXECUTIVE_DASHBOARDS.md`).

## The Money ledger (`/money`)

Every payment received and every expense, newest first, with filters for money in or out, place, state (confirmed, waiting, refused), dates (the last day included) and a search. The totals count what
is **confirmed**; what is waiting for a decision is shown apart. Payments from customers are not tied to a place, so **a place filter shows spending only**. The page shows the latest 200 entries;
the totals cover the whole filtered list, and the page says when it was cut.

## Spending at a milling center

An expense can now name a milling center (`expenses.milling_center_id`, empty for every existing expense, so nothing changes for them). It is attached the way a farm or warehouse is: from the single
place the person works at, so an **Operations Officer** scoped to one mill records spending for it. The same place rules apply as for farms and warehouses: they may record and see only their own mill's
expenses; people who see the whole company are not limited. An expense that names no place is counted at the head office.

## Not included

- Payments are not tied to a place or to an order, and refunds are not netted off.
- The ledger has no CSV export (the *Reports* page has the downloads).
- *All time* reads every approved expense and payment; fine at the present volume.

## Where it lives

`backend/src/finance/finance-center.service.ts` (the figures and the ledger) and `finance-center.controller.ts` (`GET /api/finance-center/overview?period=` and `/ledger`), `expenses.service.ts`;
`frontend/src/components/executive/ExecutiveDashboard.tsx`, `frontend/src/app/money/page.tsx`, `frontend/src/components/ControlCenter.tsx`.

## Tests

`finance-center.service.spec.ts` and `expenses-milling-center.spec.ts` (server, with exact figures); `e2e/t_executive.py` (browser).
