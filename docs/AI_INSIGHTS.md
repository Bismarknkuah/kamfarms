# AI Insights: what power and paddy should produce

The AI page (`/assistant`, menu entry **AI Insights**) answers the question the MD and CEO ask most:

> If 1 kWh of power is used, how many bags of packaged rice, broken rice and hull should we get?

and the same question starting from paddy: *100 bags of paddy needs how much power, and gives how many bags of each?*

## What is on the page

| Part | What it does |
|---|---|
| **Top band** | Whose activities the page covers (**Whole company** for the MD, CEO and Administrator, or the person's own places), how many milling runs it read, and the headline: every 1 kWh gives X bags of packaged rice, broken rice and hull. |
| **Work it out** | Type a kWh amount (or bags of paddy) and see the bags, the kilograms, the typical range, and a colour bar of where the paddy goes. It changes as you type. Can be based on all runs, one grade of paddy, or one milling center. |
| **Side by side** | A table by grade and a table by milling center, for 1, 100 or 1,000 kWh. For the MD and CEO the center table ranks the centers by rice per kWh and shows each one above or below the company. |
| **Is every milling center delivering what was expected?** | For each milling center, whether its runs gave **more than, as much as, or less than** the AI expected for the power used, with the AI's own accuracy, and every run in turn. For the MD and CEO the whole company; for everyone else their own places. A short version sits on the MD and CEO home page. |
| **Ask a question** | A conversation. Ask about activities, stock, production, sales, who owes money, what is waiting for approval, or how to do something in the system. Every answer says who worked it out, whose activities it covers, which lookups it made, its confidence and what it is based on. |

## How the figures are made

`backend/src/ai/ai-yield.util.ts` (and the same arithmetic in `frontend/src/lib/ai-yield.ts`, tested on both sides).

- Source: **approved** production records that **recorded their power** (`energyConsumptionKwh > 0`), the most recent 300.
- **Ratio of totals**: all the rice from all the runs divided by all the power they used, so one tiny run with a freak
  reading cannot swing the answer. The **typical range** uses each run's own ratio, one spread either side.
- **Fewer than 3 runs**: an industry benchmark (about 28 kWh per tonne of paddy; 68% rice, 12% broken, 18% hull,
  2% lost) is shown, clearly labelled as not the company's own data, with Low confidence.
- **Confidence**: Low under 4 runs, Medium 4 to 9, High 10 or more.
- **Bags**: kilograms divided by the bag weight. Paddy uses the existing *Standard paddy bag weight*. Packaged rice,
  broken rice and hull use the **AI predictions** settings (System settings; defaults 50, 50 and 20 kg). Hull uses the
  weight the runs actually recorded (`riceHullBags`) once at least 3 runs recorded it.

## Jurisdiction

See `docs/AI_APPROACH.md`. In short: MD, CEO and Administrator see everything; everyone else sees only the milling
centers at their own warehouses, and a role without `milling.view` gets no predictions at all.

## Routes

| Route | Permission | Purpose |
|---|---|---|
| `GET /ai/insights` | `ai.view` | All the figures for the page, within the asker's jurisdiction. |
| `POST /ai/predict-from-energy` | `ai.use` | `{ kwh, paddyGradeId?, millingCenterId? }` to bags of each product. |
| `POST /ai/predict-from-paddy` | `ai.use` | `{ bags, paddyGradeId?, millingCenterId? }` to the power needed and bags of each product. |
| `GET /ai/anomalies` | `ai.view` | Unusual readings and runs that did not add up, limited to the asker's places. |
| `GET /ai/feedback?days=30&millingCenterId=` | `ai.view` | Each milling run against what the AI expected, per milling center, and how the AI is learning. |
| `POST /ai/assistant/ask` | `ai.use` | The question box. Body: `question` and, optionally, the earlier `history` turns. |

The server reports the feature `ai-predictions` in `/api/health`; the Administrator dashboard warns when the website needs it and the server lacks it.

## The AI learns from every approved run

`backend/src/ai/ai-learning.util.ts`. Nothing is stored: it is all worked out again from the recorded milling runs.

1. **Expected before the run.** Each run is judged against what the approved runs *before it* had taught: the same grade's own history when there are at least 3 earlier runs, otherwise all grades, otherwise a labelled industry benchmark.
2. **Compared with what it actually gave.** Packaged rice (and broken rice and hull) against expectation, as a percentage. Within the tolerance (5% by default) is **as expected**; above is **more than expected**; below is **less than expected**.
3. **Learned from.** Once a run is **approved** it joins the history the next expectation is built from, so the AI adapts as soon as runs are approved. **Recent runs count more** than old ones (a run's weight halves every 40 runs by default), so it follows the mill as it changes. A run **flagged as not adding up is never learned from**, and a run that is only submitted gets feedback but does not teach the AI yet.
4. **Early estimates.** A run judged only against the industry benchmark (fewer than 3 earlier runs) is called an early estimate. It is shown, but never counted as a verdict.
5. **The AI's report card.** Accuracy is 100 minus its average miss on packaged rice over its latest 20 judged runs, with a trend (still learning, getting more accurate, steady, getting less accurate) and the average miss by week.

Adjustable in System settings, **AI predictions**: the tolerance and how quickly the AI favours recent runs.

## The question box

`backend/src/ai/ai-assistant.service.ts`, `ai-tools.service.ts`, `ai-agent.service.ts`.

- **Lookups (tools).** Production, what power gives, output against expectations, stock, paddy intake, sales, customers who owe money, runs waiting for approval, unusual readings, what the person can see, and a guide to how the system works (`ai-help.ts`). **Each lookup checks the person's permission and applies their jurisdiction itself, on the server.** Whoever asks, it returns only what the person could already open elsewhere, inside their own places.
- **Built-in answerer.** Always available. Recognises the common questions (and periods like "last week", and milling center names) and answers from the lookups.
- **Claude, for open-ended questions (optional).** Set `ANTHROPIC_API_KEY` on the API service (and optionally `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`). Claude then decides which lookups to make and phrases the answer; it never touches the database and only receives what a lookup returns for that person. If the key is missing, Claude is unreachable, or a person has asked 40 questions in an hour, the built-in answerer answers instead.
- **What Claude is sent.** The question, the last few turns of the conversation, and the figures the lookups return (which can include milling center, farm and customer names). It is not sent anything the lookups did not return.
- **Everything is recorded.** Every question is written to the audit log with who asked it, which engine answered and which lookups it used.

## Three ways to ask: power, paddy, or the rice recovered
The **Work it out** calculator on the AI Insights page works from whatever you know, and fills in the rest from what your own approved milling
runs have taught:

| You know | You get |
|---|---|
| **The paddy sent to the mill** (e.g. 5 bags of Size 4) | the power it should use, and the packaged rice, broken rice and hull it should give, in bags and kg |
| **The rice recovered, or wanted** (e.g. 100 bags) | the paddy to send, the power it should take, and the broken rice and hull that come with it |
| **The power used** (kWh on the meter) | the paddy it mills and the packaged rice, broken rice and hull it should give |

Pick **Based on** to narrow it to one grade of paddy (Size 4, Size 5 ...) or one milling center. Each grade and center learns from its own runs, so
"5 bags of Size 4" is answered from Size 4 history, not the company average. With fewer than 3 approved runs that recorded their meter, the page
uses a clearly labelled industry benchmark instead and says so; confidence reads Low (under 4 runs), Medium (4 to 9) or High (10 or more).
It trains itself: every approved milling run teaches it, and the feedback cards on this page show how close each run came to what was expected.

**Who can use it:** the MD, CEO, Operations Manager and the Administrator (company-wide); Warehouse Supervisors see their own warehouses' runs.

**Typing the question works too.** In the question box, "I milled 5 bags size 4, what should it give?", "how much paddy and power do I need for
100 bags of rice?" and "what will 200 kWh give?" are read for their numbers and answered from the same figures (with Claude connected it
understands any wording; without, the built-in answerer reads these patterns).

Server routes: `POST /ai/predict-from-paddy` (`{bags}`), `POST /ai/predict-from-rice` (`{bags}` or `{kg}`) and `POST /ai/predict-from-energy` (`{kwh}`),
each with optional `paddyGradeId` and `millingCenterId`, all requiring `ai.use`. Browser tests: `e2e/t_ai.py` checks the page against the server's
real maths for every direction.
