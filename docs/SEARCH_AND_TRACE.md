# Quick search, and who may trace a batch (version 2026.10.14)

## Quick search

The search field in the top bar finds, as you type (from two characters; dispatches from three): **pages** (from the menu the person is already offered, instantly), **orders**
(by order number or customer), **dispatches**, **paddy requests**, **farms**, **warehouses** and **milling centers**. Arrow keys move, Enter opens, Escape closes.

Each kind is searched only if the person's role may see it, and only within their own places, using the same rule as the page that lists it: a Sales Officer finds only their own
orders, a Farm Manager only their own farm, a Warehouse Manager only their own warehouse. `GET /api/search?q=` (any signed-in person; the service decides kind by kind). One kind
failing never takes the rest down. At most five results per kind.

Not searched: customers, people, batches, reports. The top bar is not shown on a phone, so there is no search there.

## Trace batch

Tracing a batch has its own permission, `trace.view`, held by the **Finance Director, MD, CEO, Sales Officers and Warehouse Supervisors** only (the Administrator holds every
permission). The menu entry and the server route both require it. The Auditor, Warehouse Manager, farm roles and Operations roles no longer have it. Change it on the Roles page.

## Tests

`cd backend && npx jest src/search src/common` and `e2e/t_search.py`, `e2e/t_tracking.py`.
