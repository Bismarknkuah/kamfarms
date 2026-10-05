# The Finance Director's, MD's and CEO's dashboards (version 2026.10.18)

The three roles have **three different dashboards**, because they hold different rights and answer different questions. Each is built like the Administrator's control center, and each
lets its owner **carry out every task of the role without leaving the page**.

| | Finance Director | Managing Director | CEO |
|---|---|---|---|
| **The question** | Where is the money, and what is waiting for my decision? | What is moving, what must I release, who must do what? | How is the company performing, and where is it exposed? |
| **Decides** | Approves orders, verifies payments, decides expenses, raises invoices, signs off resets | Releases orders, decides director-level expenses, signs off resets | The same as the MD |
| **Directs people** | Gives tasks | Gives tasks and announces to the team | Gives tasks and announces to the team |
| **Only theirs** | Invoices | Setting up the company's places and master lists | The scorecard and the risk radar |

## Finance Director (the money desk)

Money band (sales booked, collected, spent, net cash) with a period switcher, the control center, then **Decide here** (the Finance desk: orders to review, expenses to approve, payments to verify),
**Invoices to raise**, **System reset requests**, **Give someone a task**, and below them the money in full: where it stands, spending at every farm, warehouse and milling center, the six-month
chart, the sales record, who owes the company, and the latest money in and out.

- **Invoices to raise** lists delivered (fulfilled) orders that have no invoice, newest first (`GET /api/invoices/awaiting`, `invoice.create`). He raises one with the tax (%), any discount and the
  date it is due (`POST /api/invoices`). The server's rules hold: only a delivered order can be invoiced, and only once. The first time he opens the page it lists every delivered order that was never invoiced, old ones included.

## Managing Director (command of the business)

**The business in motion** (trucks and transfers on the way, running late, damaged-bag reports waiting, delivered, from the dispatch list), the control center, **Decide here** (release approved
orders and director-level expenses) beside the reset sign-off, **Give someone a task** and **Announce to the team**, the company on the ground (stock), **Set up the company** (Organization and Master
data: the two things only the MD manages), then the money briefly (four cards, spending at every place, the chart and the sales record), the Watchlist, and where to go.

## CEO (performance and risk)

**The company scorecard**: six dials worked out from the real figures, each coloured green (healthy), gold (watch) or red (act):

| Dial | What it measures | Green | Gold | Red |
|---|---|---|---|---|
| Sales collected | Money collected as a share of sales booked | 80% or more | 50% or more | below 50% |
| Net cash margin | What is left of the money collected after spending | 20% or more | 0% or more | below 0% |
| Spending against collections | Money spent per 100 collected (lower is better) | 70% or less | 100% or less | above 100% |
| Debt that is overdue | Share of what customers owe that is past its due date (lower is better) | 10% or less | 30% or less | above 30% |
| Deliveries on time | Delivered trucks and transfers that were not late | 90% or more | 70% or more | below 70% |
| Biggest customer's share | How much of the sales one customer is (lower is safer) | 30% or less | 50% or less | above 50% |

**Where the company is exposed** (the risk radar): overdue debts (action when over 30% of debt), cash position (action when negative), payments not yet verified and expenses not yet approved (watch
when any are waiting), trucks running late (action when any), damaged-bag reports waiting (watch). Then the control center, **Decide here** with the reset sign-off, **What changed** (sales, collections, spending
and net cash against the period before, and the biggest cost, in plain words), spending at every place, the six-month chart, who the company depends on (each customer's share of the sales), give a task,
announce to the team, and the Watchlist. The thresholds are fixed in the code (`CeoDashboard.tsx`), not settings.

## The tools they share

- **System reset requests** (`ResetApprovalQueue`, also on My Office): a reset needs both the Finance Director and the MD (or CEO) before the Administrator can carry it out; nobody approves their own request.
- **Give someone a task** (`tasks.assign`): to one person or to everyone who holds a role, with a due date and a priority (low, normal, high, urgent). They are told at once.
- **Announce to the team** (`messages.broadcast`, MD and CEO): an announcement to everyone, or to everyone who holds one role, delivered as a message, optionally asking people to acknowledge it.

## Not included

- A task cannot be edited or cancelled from the dashboard (the Tasks page lists them); there is no invoice print-out yet.
- The Finance Director has no announcement panel (`messages.broadcast` is the MD's and CEO's).

## Where it lives

`frontend/src/components/executive/` (`FinanceDashboard.tsx`, `MdDashboard.tsx`, `CeoDashboard.tsx`, shared `parts.tsx`, the desks in `desks.tsx`, data hooks in `hooks.ts`),
`frontend/src/components/review/ResetApprovalQueue.tsx`, `backend/src/finance/invoices.service.ts` (`awaitingInvoice`).

## Tests

`invoices-awaiting.spec.ts`, `trace-and-tracking-permissions.spec.ts` (server); `e2e/t_executive.py` (browser: that the three pages differ, each role's figures, and every task performed).
