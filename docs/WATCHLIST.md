# Watchlist

Shows the Managing Director and the CEO where recent records look unusual compared with what each place's **own history** predicts, across every milling center, warehouse and farm.

**Who:** the `insights.view` permission (MD and CEO only; it can be given to another role on the Roles page).
**Where:** Oversight, **Watchlist** tab; and a summary card on the MD and CEO dashboard.
**Endpoint:** `GET /api/insights/watchlist?days=30` (7 to 90 days, default 30). Read-only.

## What it is, and is not

It is a set of comparisons: the last N days against the same place's earlier approved records (or, for write-downs, against its sister places). It is **not** machine learning and not a verdict. A flag means "worth a look", and every flag shows the figure its history predicts beside the figure recorded, the record numbers behind it, what to check next, and how much history stands behind it. Harvest seasons, repairs and honest mistakes cause flags too.

It names record numbers and places, never people.

## The checks

| Check | Place | Compares | Needs | Flags when | Severity |
|---|---|---|---|---|---|
| Rice recovery | Milling center | each run's recovery (rice out / paddy in) with the center's median over earlier approved runs | 5 earlier approved runs | a run is at least max(5 points, 3 robust spreads) below usual | HIGH if 3 or more runs, or a gap of twice the threshold; otherwise MEDIUM |
| Unusually high recovery | Milling center | the same | the same | at least that far above usual | LOW |
| Power per kg of paddy | Milling center | kWh per kg over the period with the median of earlier approved runs | 5 earlier runs with power, 3 in the period | 25% or more above usual | MEDIUM; HIGH at 50% or more |
| Power with no production | Milling center | days with metered power of at least max(10 kWh, 20% of a typical production day) and no run logged that day | meter readings on 5 days | one or more such days | MEDIUM; HIGH for 3 or more days, or a quarter of metered days |
| Paddy arriving short | Warehouse | bags received with bags expected, on shipments received in the period | 3 shipments | shortfall of 1.5% and 5 bags or more | MEDIUM; HIGH at 4% and 10 bags, or half the loads short |
| Reserved orders not leaving | Warehouse | orders released but not delivered | none | reserved 3 days or more | MEDIUM; HIGH at 7 days |
| Stock written down | Any place | approved negative corrections with sister places of the same kind | none | 20 bags or more and twice the median of the others | MEDIUM; HIGH at 50 bags and 3 times, or 6 corrections totalling 20 bags |
| Paddy intake | Farm | approved bags with the average of the three periods before, allowing for the season by looking at the other farms | about 20 bags a period | half of usual or less (and, when most farms are down, much less than the others) | MEDIUM; HIGH at a quarter or less when not seasonal |
| Paddy entries rejected | Farm | rejected with decided entries | 6 decided entries | 25% or more | MEDIUM; HIGH at 40% |
| Spending | Farm, warehouse | approved spending with the average of the three periods before | about GHS 1,000 a period | twice as much and GHS 1,000 more | MEDIUM; HIGH at 3 times and GHS 3,000 more |
| Expenses without a receipt | Farm, warehouse | approved expenses with no receipt photo | 5 expenses totalling GHS 2,000 | 60% or more without | LOW |

All thresholds are in one object, `WATCH`, in `backend/src/insights/watchlist.engine.ts`, and every rule has tests in `backend/src/insights/__tests__/`.

## "Not enough records to judge"

A check that does not have the history it needs says so, instead of staying quiet. A place is only shown as **Nothing unusual** when at least one check that depends on history was really made on it. Checks that look for events (write-downs, stalled orders) do not count, because finding no events says little. So a new milling center with three approved runs shows **Not enough records to judge**, never a green tick. The Place by place view lists what was checked and what could not be.

## Data it reads

Production runs (approved for history; submitted runs are judged in the current period), meter readings, shipments and their receipts, approved inventory corrections, reserved sales orders, paddy entries, and approved expenses (receipts are found by id; the photos are never loaded).
