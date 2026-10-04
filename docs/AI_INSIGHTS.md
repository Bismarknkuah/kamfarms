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
| **Ask a question** | The fixed-question assistant (not a general chatbot). Every answer says whose activities it covers, its confidence and what it is based on. |

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
| `POST /ai/assistant/ask` | `ai.use` | The question box. |

The server reports the feature `ai-predictions` in `/api/health`; the Administrator dashboard warns when the website needs it and the server lacks it.
