# Browser tests for the sales chain, the approval screens, intake and dispatch

656 checks (74 + 76 + 31 + 41 + 48 + 62 + 52 + 50 + 75 + 41 + 24 + 82) that drive the real website in a real browser, one signed-in browser per role (Sales Officer, Finance Director, MD,
Warehouse Supervisor, Warehouse Managers, Administrator).

They run against `mock-api.js`, a small stand-in for the API. It is **not** the real database, but it reuses the real backend code for the parts that
carry the rules (the multi-size intake, the dispatch request and its task, one dispatch with several sizes and its approval, the request board and the order tracker run the real services): the request-validation classes (so a blank rejection comment is refused exactly as the server refuses it), the "who may see which
order" rule, and the receipt file check. So the website is tested against the real contract. It is no substitute for checking a real deployment.

## Run
```
npm install                      # once, at the repo root (needs ts-node)
pip install playwright && playwright install chromium

# the stand-in API, and the website built to talk to it
node e2e/mock-api.js &                                   # port 4000
cd frontend && NEXT_PUBLIC_API_URL=http://localhost:4000/api npx next build && npx next start -p 3100 &

python3 e2e/t_sales_chain.py     # the whole chain, receipts, isolation, tracking          (74)
python3 e2e/t_modules.py         # Expenses, Paddy, Production, Deliveries, My Office       (76)
python3 e2e/t_extras.py          # progress bar, slow flag, every dashboard desk, phone     (31)
python3 e2e/t_ai.py              # AI Insights: three directions vs the real server maths      (41)
python3 e2e/t_intake.py          # one intake with several sizes, new users, kilograms optional (48)
python3 e2e/t_supply.py          # paddy requests: warehouse and mill chains, stock checks, both sizes everywhere (52)
python3 e2e/t_control_center.py   # the control centers, their isolation by place, the top bar and the removed Quick access row (75)
python3 e2e/t_tracking.py         # Track dispatch for every role, who delayed, counting a truck in, and who is offered Trace (41)
python3 e2e/t_search.py           # quick search: pages, records, keyboard, and each person finding only what is theirs (24)
python3 e2e/t_deliveries.py      # deliveries between warehouses, the Farm Director choosing a warehouse, the mill confirming, menu for every role (50)
python3 e2e/t_dispatch.py        # the Dispatch desk: request, task, ONE dispatch for both sizes, approval (62)
python3 e2e/t_update.py          # 2026.10.16: control center buttons, the install pop-up, search under slow/failing parts, damaged bags, who can use what (82)
```
Each script exits non-zero if any check fails. `POST http://localhost:4000/__reset` restores the seed data between runs.
If the build cannot reach Google Fonts (an offline machine), build with a temporary stand-in for the two `next/font/google` fonts in
`frontend/src/app/layout.tsx` and put the original back afterwards.
