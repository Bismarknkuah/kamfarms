# Browser tests for the sales chain, the approval screens, intake and dispatch

315 checks (74 + 76 + 31 + 41 + 50 + 43) that drive the real website in a real browser, one signed-in browser per role (Sales Officer, Finance Director, MD,
Warehouse Supervisor, Warehouse Managers, Administrator).

They run against `mock-api.js`, a small stand-in for the API. It is **not** the real database, but it reuses the real backend code for the parts that
carry the rules (the multi-size intake, the dispatch request and its task, the delivery report, and the order tracker run the real services): the request-validation classes (so a blank rejection comment is refused exactly as the server refuses it), the "who may see which
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
python3 e2e/t_intake.py          # one intake with several sizes, new users, kilograms optional (50)
python3 e2e/t_dispatch.py        # the dispatch request, the farm manager's task, the tracker  (43)
```
Each script exits non-zero if any check fails. `POST http://localhost:4000/__reset` restores the seed data between runs.
If the build cannot reach Google Fonts (an offline machine), build with a temporary stand-in for the two `next/font/google` fonts in
`frontend/src/app/layout.tsx` and put the original back afterwards.
