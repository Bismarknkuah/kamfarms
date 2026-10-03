# Report downloads by role

Every role can download the reports its permissions cover, as **CSV, Excel or PDF**, and each download contains only what is inside that person's **own jurisdiction**: the farms, warehouses and milling centers they are assigned to. Someone with company-wide access gets everything; someone assigned to one farm gets that farm.

**Where:** sidebar, **Reports**. The page shows the long-standing reports (farm intake, warehouse, sales, finance, inventory) and, below them, **More reports for your role**, a list the server builds for each person.

## How a person is offered a report

A report is offered only when the person's role holds **both** `reports.export` and the permission that covers that data. The list comes from the server (`GET /api/reports/catalog`), so the screen can never offer something the server would refuse. Choosing a different period applies to every report that has dates.

## The reports, and who can download each (default roles)

| Report | Needs (any of) | Covers | Has dates | Roles |
|---|---|---|---|---|
| Paddy intake | `farm.inventory.view` | own farms, warehouses and milling centers | yes | Managing Director, CEO, Farm Director, Farm Manager, Auditor |
| Deliveries and receipts | `warehouse.inventory.view`, `delivery.create`, `delivery.approve` | own farms, warehouses and milling centers | yes | Managing Director, CEO, Farm Director, Farm Manager, Warehouse Supervisor, Warehouse Manager, Auditor |
| Stock corrections | `farm.inventory.view`, `warehouse.inventory.view`, `inventory.adjust` | own farms, warehouses and milling centers | yes | Managing Director, CEO, Farm Director, Farm Manager, Warehouse Supervisor, Warehouse Manager, Operations Manager, Auditor |
| Milling runs | `milling.view` | own farms, warehouses and milling centers | yes | System Administrator, Managing Director, CEO, Warehouse Supervisor, Warehouse Manager, Operations Manager, Operations Officer, Auditor |
| Machine power readings | `machine.view` | own farms, warehouses and milling centers | yes | System Administrator, Managing Director, CEO, Operations Manager, Operations Officer |
| Expenses | `finance.view`, `expense.create`, `expense.view` | own farms, warehouses and milling centers | yes | Managing Director, CEO, Farm Director, Farm Manager, Warehouse Supervisor, Warehouse Manager, Operations Manager, Operations Officer, Finance Director, Auditor |
| Audit log | `audit.view` | company-wide | yes | System Administrator, Managing Director, CEO, Finance Director, Auditor |
| People and access | `users.manage` | company-wide | no | System Administrator |
| Watchlist flags | `insights.view` | company-wide | no | Managing Director, CEO |

Each report needs exactly the permissions the app's own screen for that data needs (a test reads those screens and fails if they ever differ), so a role can download what it can already open. This table is read from the code and the default role definitions. If an administrator changes a role's permissions on the Roles page, what that role is offered changes with it.

## How jurisdiction is applied

The server, never the screen, cuts each report down. A farm-scoped person asking for paddy intake gets only their farms' entries; deliveries and expenses cover both their farms and their warehouses; milling reports reach a warehouse manager's milling centers through their warehouse. A person assigned to nothing gets an empty report with a note, never everything. Each card on the Reports page says in words what it covers for that person ("Only your 1 farm", "Everything in the company", "Company-wide").

## Limits and safeguards

- Up to 20,000 rows per report. A PDF over 2,000 rows is refused with a message suggesting Excel or CSV or a shorter period.
- The expenses report never includes receipt photos.
- An empty result is a file with a single note explaining why, not a blank file.
- Dates are `YYYY-MM-DD`; a start date after the end date is refused in plain words.
- The reports themselves are defined in `backend/src/reports/report-catalog.service.ts`; each has tests proving its jurisdiction rules.
