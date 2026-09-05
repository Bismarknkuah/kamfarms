# AI / Analytics Approach

Spec section 21 requires an AI module that predicts production yield,
energy consumption, and stock depletion, and section 22 wants a natural-
language "AI Management Assistant". This document is honest about what
Phase 11 actually implements versus what "AI" might suggest.

## What this phase is

A **statistical prediction layer**, implemented entirely in TypeScript
inside the NestJS backend:

- **Cold start** (spec's own required term): when there isn't enough
  history for a given machine/grade/product, predictions fall back to a
  documented industry benchmark constant, flagged with low confidence and
  an explicit `assumptions` note saying so. This is spec section 21's
  literal requirement: *"Do not pretend that reliable predictions exist
  with no historical data... implement a cold-start strategy: historical
  averages, rolling averages, configurable operational benchmarks,
  rule-based estimates."*
- **Rolling average**, once enough history exists: the mean and standard
  deviation of the last N relevant records (production recovery %, energy
  per KG, sales velocity), with confidence scaled by sample size.
- Every prediction is stored as an `AiPrediction` row referencing an
  `AiModel` row that records its `type` (`rolling_average` or
  `cold_start_benchmark`), sample size, and — once enough data exists —
  basic metrics (mean, standard deviation). This satisfies spec section
  21's model-versioning requirement without pretending a trained model
  exists when it doesn't.

## What this phase is NOT

- **Not a trained machine-learning model.** Spec section 21 also says
  *"Once sufficient historical records exist: train ML models,"*
  suggesting scikit-learn/pandas via an optional Python FastAPI service
  (`apps/ai` in the original repo layout, now `ai-service/` at the repo
  root — see `PROJECT_PLAN.md`). That service is **not implemented**.
  Building and validating a real training pipeline needs a genuine
  historical dataset this fresh, seeded dev database doesn't have, and a
  Python environment this NestJS backend doesn't run in. Rather than
  simulate training on data too thin to mean anything, this phase
  implements the honest fallback the spec itself describes for exactly
  this situation.
- **Not a general-purpose chatbot.** The "AI Management Assistant" (spec
  section 22) is implemented as a small, fixed set of recognized query
  intents (matched by keyword) mapped to the real report/ledger queries
  already built in Phases 3–10 — not a call to an LLM API. Every
  recognized question returns real data, a date range, a confidence
  level, and its assumptions, exactly as spec section 22 requires
  ("Every AI-generated recommendation should show: source data, date
  range, confidence, assumptions"). An unrecognized question gets an
  honest "I don't have a mapped answer for that yet" response, listing
  what IS recognized — never a fabricated answer.

## The one rule that's structural, not just documented

Spec rule 11: *"AI predictions cannot automatically modify operational or
financial records."* In this codebase, `AiPredictionsService` and
`AiAssistantService` do not have `InventoryLedgerService`, any approval
service, or any write-capable service injected into their constructors at
all — they can only read via `PrismaService` and write to the two AI
tables. This isn't a runtime check; it's structurally impossible for
these services to touch inventory or financial records, because they
have no reference to the services that do.
