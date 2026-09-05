# Deployment — Vercel (frontend) + Railway (backend, Postgres, Redis)

This is the target deployment topology for KAM-ROMS: **frontend on Vercel**,
**backend + Postgres + Redis on Railway**. Docker Compose (`docker-compose.yml`)
is for local development only — neither platform uses it directly.

## 1. Railway — backend, Postgres, Redis

1. Create a new Railway project. Add two managed services from the Railway
   catalog: **PostgreSQL** and **Redis**. Railway provisions
   `DATABASE_URL` and `REDIS_URL` automatically as reference variables —
   don't hand-type connection strings.
2. Add a third service from this repo (**Deploy from GitHub repo**), and
   set its **Root Directory** to the repo root (not `backend/`) — the
   backend needs the sibling `prisma/` folder, which is why
   `docker/Dockerfile.api` and the build commands below `COPY`/reference
   `prisma` from one level up.
3. This repo ships a `railway.json` at the root that builds the backend
   from `docker/Dockerfile.api` directly, rather than through Railway's
   Nixpacks auto-detection with a custom command string. **Make sure
   Settings → Build/Deploy has no manually-typed Build Command or Start
   Command left over from an earlier setup attempt** — clear both back
   to empty so `railway.json`'s Dockerfile config is the only thing in
   effect. Two disagreeing config surfaces (a UI-set command vs.
   `railway.json`) is exactly how one real regression happened during
   this project's own deployment, and relying on Nixpacks to correctly
   carry a custom multi-step build command's output into the runtime
   image is what caused another — see the troubleshooting entries below
   for both. The Dockerfile approach removes that entire class of risk:
   it's an explicit, ordinary multi-stage Docker build with nothing left
   to a platform's build-plan inference.
   - If Railway's UI shows a **Builder** setting separate from
     `railway.json` (Settings → Build → Builder), confirm it's set to
     use the Dockerfile — `railway.json`'s `"builder": "DOCKERFILE"` and
     `"dockerfilePath": "docker/Dockerfile.api"` should be picked up
     automatically once Root Directory is correctly blank, but the UI
     setting can override it if it was set manually before.
   - Migrations run automatically on every container start (the
     Dockerfile's `CMD` runs `prisma migrate deploy` before starting the
     server) — idempotent, so this is safe on every restart, and you
     never SSH in to migrate by hand.
   - Run `npm run prisma:seed` manually (via Railway's shell) once, after
     the first successful deploy — seeding on every boot would
     re-assert demo users on every restart, which is fine but noisy;
     it's a deliberate one-time step instead.
4. Environment variables to set on the backend service (Railway → Variables):
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Reference → Postgres service's `DATABASE_URL` |
   | `REDIS_URL` | Reference → Redis service's `REDIS_URL` |
   | `JWT_SECRET` | Generate a strong random value — **never** the dev default |
   | `JWT_REFRESH_EXPIRES_DAYS` | `30` (or your policy) |
   | `WEB_ORIGIN` | Your Vercel URL(s), comma-separated, e.g. `https://kam-roms.vercel.app,https://kam-roms-staging.vercel.app` |
   | `PORT` | Leave unset — Railway injects this and `main.ts` already reads `process.env.PORT` |
5. Railway gives the service a public URL (or attach a custom domain, e.g.
   `api.kamtradingandfarms.com`). That URL is what the frontend calls.
6. Swagger docs are live at `<railway-url>/api/docs` — useful for smoke-testing
   the deploy before wiring the frontend to it.

## 2. Generate the initial migration (required once, before the app can do anything useful)

**Nothing in this repo has ever generated real Prisma migration files** —
every phase of this project was built and verified in a sandbox with no
live Postgres connection, so `prisma/migrations/` doesn't exist yet.
`prisma migrate deploy` (which the Dockerfile runs on every container
start) only *applies* migration files that already exist — it never
creates them from the schema. Until this step is done, your database has
zero tables, and the app will start successfully but fail on the first
real database query.

This has to be run from a machine with real network access to your
actual Postgres instance — do it once, from your local machine, before
or right after the first successful Railway deploy:

1. Get your Postgres connection string: Railway → Postgres service →
   **Connect** tab → copy the **public** connection URL (not the
   `*.railway.internal` one — that hostname only resolves from inside
   Railway's private network, not from your laptop).
2. Install dependencies locally first — `npx prisma`/`npx ts-node`
   without a prior `npm install` will fall back to fetching whatever's
   newest from the registry instead of this project's pinned versions,
   the same class of bug that caused a Railway build regression earlier
   in this list (entry 9):
   ```bash
   npm install --include=dev
   ```
3. From your local clone of the repo, with the pinned version explicit
   as a second safety net:
   ```bash
   DATABASE_URL="<paste the public connection string>" npx prisma@5.22.0 migrate dev --name init --schema=prisma/schema.prisma
   ```
   This detects there's no migration history, generates one reflecting
   the entire current schema, and applies it directly to that database.
   If it instead reports **"Already in sync, no schema change or
   pending migration was found"** — that's unexpected for a genuinely
   empty database and worth verifying directly rather than assuming
   either way: run `npx prisma@5.22.0 migrate status --schema=prisma/schema.prisma`
   for an explicit report of what Prisma believes exists, or check
   Railway's Postgres service → **Data** tab to browse actual tables.
4. Commit the result — this is the important part, since it's what makes
   every future deploy's `migrate deploy` step actually have something
   to apply:
   ```bash
   git add prisma/migrations
   git commit -m "Add initial Prisma migration"
   git push
   ```
5. Seed demo data the same way, once:
   ```bash
   DATABASE_URL="<same connection string>" npm run prisma:seed
   ```

After this, every future schema change follows the same local pattern —
`npx prisma@5.22.0 migrate dev --name <description>` against a database
you can reach, commit the generated migration folder, push — and
Railway's `migrate deploy` on each restart just applies whatever's new.

## 3. Vercel — frontend

1. Import the repo into Vercel as a new project.
2. Set **Root Directory** to `frontend` (Project Settings → General → Root
   Directory). This is what makes a monorepo work on Vercel — it builds
   only that folder, using its own `package.json`.
3. Framework preset: Next.js (auto-detected).
4. Environment variable (Project Settings → Environment Variables):
   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<your-railway-backend-url>/api` |
   Set it for Production, Preview, and Development environments — Preview
   deploys need a reachable API too, which is exactly why `WEB_ORIGIN` on
   the Railway side should include your Vercel preview domain pattern (or
   the specific preview URLs) alongside the production one.
5. Deploy. Vercel rebuilds automatically on every push to the connected
   branch.

## 4. Connecting them correctly

- **CORS**: `backend/src/main.ts` reads `WEB_ORIGIN` (comma-separated) and
  passes it straight to `app.enableCors({ origin: ..., credentials: true })`.
  If you add a custom Vercel domain, add it to `WEB_ORIGIN` on Railway too,
  or login/every API call will fail with a CORS error in the browser
  console — that's the first thing to check if the frontend can reach
  Vercel fine but API calls fail.
- **Vercel preview deployments** get a new URL per PR
  (`kam-roms-git-<branch>-<org>.vercel.app`). Either add a wildcard-style
  allowlist by relaxing `WEB_ORIGIN` for a staging Railway environment, or
  keep previews pointed at a shared staging backend with a stable URL.
- **Cold starts**: Railway services sleep only if you're on a plan/setting
  that allows it; check your plan if the first request after idle time is
  slow — this is a Railway platform behavior, not something in this
  codebase.
- **Database migrations in CI/CD**: every push that changes
  `prisma/schema.prisma` needs a corresponding migration file committed
  (`npm run prisma:migrate` locally, which both updates the DB and writes
  the migration under `prisma/migrations/`) — Railway's `migrate deploy`
  only *applies* committed migrations, it does not generate them.

## 5. Troubleshooting: `Error: Could not load --schema from provided path 'prisma/schema.prisma': file or directory not found`

This means Railway's **Root Directory** for the backend service is set to
`backend` (or anything other than blank/repo-root) — the build command's
`--schema=prisma/schema.prisma` is relative to that setting, and `prisma/`
lives one level up, as a sibling of `backend/`, not inside it.

Fix: service → **Settings → Source → Root Directory** → clear it
completely (blank = repo root) → redeploy. A `railway.json` at the repo
root also pins the correct build/start commands as config-as-code, but it
only gets picked up once Root Directory is actually blank — the UI
setting and the file both have to agree.

## 6. Troubleshooting: `Prisma schema validation` errors citing "This line is invalid" on lines that are clearly comments

This was a real bug, not a config issue — fixed as of this delivery.
Several models in `prisma/schema.prisma` used `/** ... */` JSDoc-style
block comments for documentation. **Prisma's schema language does not
support block comments at all — only `//` line comments.** Every one of
those has been converted to `//`. If you're seeing this error, you have
an older copy of the schema; pull the latest and it's resolved.

Why this got through 13 phases undetected: this build sandbox can't
reach `binaries.prisma.sh`, so `prisma generate`/`validate` could never
actually run here — every phase's schema changes were verified
structurally (brace balance, model/field counts) but never against
Prisma's real parser. The first time the schema actually ran through
Prisma's parser was on your Railway deploy, and it caught this
immediately. This is exactly why `docs/AI_APPROACH.md`,
`docs/RESET_WORKFLOW.md`, and every phase's own status notes say
"verified by isolating errors to one documented cause" rather than
claiming full runtime verification — that limitation was real, and this
was a real, previously-unknown instance of it.

## 7. Troubleshooting: TypeScript build errors after `prisma generate` succeeds (`InventoryBalanceWhereUniqueInput`, `Decimal` type mismatches, `AgingBuckets` cannot be named)

Also real bugs, also fixed as of this delivery — the first time the
schema and code ever compiled against a genuinely generated Prisma
Client (this sandbox's network block on `binaries.prisma.sh` meant every
prior phase's "verification" was structural only, documented as such
throughout `PROJECT_PLAN.md`). Three distinct issues, all in code that
looked correct against the stub client used for local checks:

1. `InventoryBalance`'s compound unique key was explicitly named
   `"balance_key"` in the schema (`@@unique([...], name: "balance_key")`),
   but three services referenced it by Prisma's *default* auto-generated
   name (the concatenated field list) instead of the name actually given
   — an explicit `name:` always wins over the default. Fixed in
   `inventory-ledger.service.ts`, `ai-predictions.service.ts`, and
   `sales-orders.service.ts`.
2. Two call sites passed a Prisma `Decimal` value directly into
   `InventoryLedgerService.recordTransaction`, whose `quantityKg`
   parameter is typed `number | string`. Fixed by wrapping in `Number(...)`,
   consistent with how every other Decimal field is already handled
   throughout this codebase.
3. `ReceivablesService`'s `AgingBuckets` interface wasn't exported, which
   TypeScript's declaration-emission rejects once it's part of a public
   method's inferred return type. Fixed by exporting it.

All three traced to areas the real Prisma Client's generated types cover
that the local stub client either didn't have at all or typed too
loosely to catch. A proactive sweep confirmed no other instances of
either pattern exist elsewhere in the codebase.

## 8. Troubleshooting: `Type 'null' is not assignable to type 'string'` on `paddyGradeId`/`packagingSizeId`, or `Property 'id' is missing in type` on the `InventoryBalance` compound key

A structural bug, not a naming one — fixed as of this delivery, and the
permanent fix, not another patch. `InventoryBalance`'s uniqueness needs
to span three columns that are each nullable (a balance row tracks
*either* a paddy grade, *or* a bulk product, *or* a packaged product+size
— never more than one, so the other two are always null). Postgres
treats every `NULL` as distinct from every other `NULL`, so a unique
constraint — or a Prisma `findUnique`/`upsert` — spanning nullable
columns can never reliably target "the one row for this combination."
Prisma's generated types correctly reject `null` in that position, which
is what surfaced as these compile errors once a real client was
generated.

The fix: `InventoryBalance` now has a non-nullable `dimensionKey` column,
deterministically derived from whichever of the three FK fields is set
(`backend/src/inventory-ledger/balance-key.util.ts`), and the compound
unique constraint (`@@unique([locationType, locationId, dimensionKey])`)
keys on that instead. The three FK columns stay nullable for normal
filtering/joins elsewhere in the codebase — only the uniqueness lookup
itself needed the non-nullable substitute. Every call site that
constructed a `balance_key` where-clause by hand now goes through either
`InventoryLedgerService.getBalance()` (for services that already have
the ledger injected) or the shared `buildBalanceDimensionKey()` function
directly (for `AiPredictionsService`, which deliberately does NOT have
the ledger injected — see `docs/AI_APPROACH.md` — so it computes the key
itself rather than gaining a new dependency).

**If you already ran `prisma migrate dev`/`deploy` against a database
before this fix**, the new `dimension_key` column needs a migration —
running `npm run prisma:migrate` again after pulling this fix will
generate and apply it. Existing `inventory_balances` rows from before
this fix should be treated as safe to clear (re-derivable from the
ledger's transaction history) rather than backfilled, consistent with
how this system treats the ledger as the single source of truth.

## 9. Troubleshooting: `Cannot find module '.../query_engine_bg.postgresql.wasm-base64.js'` during `prisma generate`

This one was a regression I introduced myself while trying to make the
Root Directory fix more robust — worth understanding exactly, since the
same failure mode can recur with any tool if the pattern isn't avoided.

**The chain of causes:**
1. `prisma` (the CLI) used to be listed only as a devDependency.
   `@prisma/client` (the library) was a real dependency.
2. Railway installs with a production npm config (`npm warn config
   production` appears in every build log), which skips devDependencies
   by default.
3. So the `prisma` CLI binary was never actually present locally.
4. `railway.json`'s build command called `npx prisma generate` —
   unpinned. When `npx` can't find a matching local binary, it silently
   installs the *latest* version from the registry instead of failing —
   which was Prisma 6.x.
5. Prisma 6's CLI generates client code expecting a newer WASM-based
   engine file. The `@prisma/client` actually sitting in `node_modules`
   was still 5.22.0 (correctly installed, since it's a real dependency)
   — which doesn't have that file. Hence the "cannot find module" error.

An earlier, manually-typed Build Command in the Railway UI happened to
pin `prisma@5.22.0` explicitly, which is why earlier deploys worked
despite this latent issue — right up until Root Directory was fixed and
Railway started actually honoring `railway.json` instead, which didn't
have that same pin.

**The permanent fix, three layers so it can't drift again:**
1. `prisma` and `@prisma/client` are now **exact-pinned** (`5.22.0`, no
   `^` range) and both live in real `dependencies`, not
   `devDependencies`, in the root `package.json` — appropriate anyway,
   since `prisma migrate deploy` runs in the production start command,
   not just at dev time.
2. `railway.json`'s build command adds `--include=dev` to the install
   step, so no *other* devDependency-only build tool can silently have
   the same problem later.
3. Both the build and start commands in `railway.json` call
   `npx prisma@5.22.0` explicitly — even if steps 1–2 somehow didn't
   apply, this still forces the exact version.

If you had a custom Build/Start Command manually set in the Railway UI
from an earlier setup attempt, clear both back to empty (see section 3
above) so there's only one source of truth for these commands.

## 10. Troubleshooting: `Error: Cannot find module '/app/backend/dist/main.js'` even though the build appeared to succeed

Prisma itself was fine by this point — the deploy log showed a clean
connection to Postgres and `prisma migrate deploy` completing without
error. The problem was one step later: the compiled backend simply
wasn't present in the container that actually ran the start command.

The likely cause: `railway.json`'s previous `buildCommand` ran a custom
multi-step shell command through Railway's Nixpacks builder
(`npm install && prisma generate && nest build`, all as one string).
Nixpacks infers its own build plan/phases from the project, and a custom
command bolted on top of that isn't guaranteed to have its output
(`backend/dist/`) carried into the final runtime image the same way a
Dockerfile's `COPY` instructions explicitly guarantee. This was the
third distinct Nixpacks-custom-command surprise this project hit (after
the Root Directory resolution issue and the unpinned-CLI registry
fallback), which is why the permanent fix is to stop asking Nixpacks to
run a custom command at all.

**The fix:** `railway.json` now sets `"builder": "DOCKERFILE"` pointing
at `docker/Dockerfile.api`, which is an explicit, ordinary multi-stage
Docker build — every file that ends up in the runtime image is named in
a `COPY` instruction, nothing is inferred. The Dockerfile's build stage
also now fails loudly (`test -f backend/dist/main.js || exit 1`) if the
compile didn't actually produce the entrypoint, so a broken build can
never silently proceed to a broken deploy again — you'd see the failure
at build time, in the build logs, with an unambiguous message, not as a
runtime crash-loop.

If you still see this error after pulling the fix, check Railway's
Settings → Build → Builder setting isn't manually pinned to Nixpacks
from an earlier setup attempt, overriding `railway.json`.

**Update:** switching to the Dockerfile builder stopped the *cause*
(Nixpacks not carrying build output forward), but the very first
Dockerfile-based build on Railway still showed this same symptom, for a
different reason — Docker's own layer cache reused a `RUN npm run build
--workspace=backend` result marked `cached` in the build log, even
though the resulting `backend/dist/main.js` was missing. Docker caches a
`RUN` layer by the exact command text plus the content hash of every
preceding layer; if `backend/` genuinely hadn't changed since a prior
build attempt, Docker considers the layer's result still valid and
reuses it without re-executing — including a flawed result from an
earlier, broken attempt.

The safety check now does more than fail — it prints what actually
exists in `backend/dist` (or confirms it's entirely absent) so a
recurrence is diagnosable directly from the build log. If the build
steps up through `npm run build --workspace=backend` show `cached` in
the Railway build log and you have any doubt whether that cached result
reflects your latest source, trigger a build that can't reuse it: the
Dockerfile carries a `BUILD_MARKER` comment near the top — bump it (or
make any other trivial edit to `docker/Dockerfile.api`) and push. Editing
the Dockerfile itself invalidates BuildKit's cache from that point
forward unconditionally, regardless of whether `backend/` changed.

## 11. Troubleshooting: `nest build` succeeds but `backend/dist/main.js` genuinely doesn't exist — `backend/dist/src/main.js` does instead

This is the real, final answer to entry 10 above — found once the
cache-busting there produced a genuinely fresh build. The diagnostic
output added in that fix is what caught it: `backend/dist` existed, but
contained `src/` and `test/` subdirectories instead of the compiled
files directly.

**Root cause:** every standard NestJS project generated by `nest new`
ships a `tsconfig.build.json` alongside `tsconfig.json` — `nest build`
looks for it specifically and uses it instead of the plain
`tsconfig.json` if present. This project was hand-built rather than
scaffolded, and that file was simply never created. Without it,
`nest build` fell back to `tsconfig.json`, which has no `exclude` for
`test/` and no explicit `rootDir`. TypeScript compiled `src/` and
`test/` together, and since they're sibling directories, it inferred
their common parent (`backend/`) as the effective root — nesting output
as `dist/src/main.js` and `dist/test/*.js` instead of flattening `src/*`
directly into `dist/*`.

**The fix:** added `backend/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": "./src" },
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts", "**/__tests__/**"]
}
```
`tsconfig.json` itself is deliberately untouched — it stays permissive
(covers both `src/` and `test/`) since that's what's used for general
type-checking and e2e test execution (`test/jest-e2e.json` transforms
`test/*.e2e-spec.ts` independently of the build config). Only
`nest build` — which specifically looks for `tsconfig.build.json` — is
affected by this fix.

Verified directly: a real `nest build` (not just `tsc --noEmit`) now
produces `backend/dist/main.js` at the top level with no `dist/src/` or
`dist/test/` present.

## 12. Troubleshooting: `failed to calculate checksum ... "/repo/backend/node_modules": not found` during the final image copy

The previous fix (entry 11) worked completely — the build log confirmed
`OK: backend/dist/main.js present (1725 bytes)` — and immediately hit a
different, final-stage bug.

**Root cause:** the Dockerfile's runtime stage had two `COPY --from=build`
lines, one for the root `node_modules` and a second specifically for
`backend/node_modules`. npm workspaces hoists dependencies to the root
`node_modules` whenever it can — verified directly for this project (not
assumed): a clean `npm install` never creates a `backend/node_modules`
directory at all, including for backend-only packages like `argon2`.
Everything lives under the root. The second `COPY` was trying to copy a
directory that structurally never exists for this project's dependency
tree, which is an unconditional failure in Docker (`COPY --from` has no
"copy if exists" semantics).

**The fix:** removed the redundant `COPY --from=build /repo/backend/node_modules
backend/node_modules` line entirely. Node's `require()`/`import`
resolution walks up parent directories from the requiring file, so
`backend/dist/main.js` still finds every dependency via the one root
`node_modules` copy — verified directly by simulating `require.resolve()`
from `backend/dist/`'s perspective for `@nestjs/core`, `argon2`,
`@prisma/client`, `exceljs`, and `helmet`; all five resolved correctly
through the root copy alone.

## 13. Troubleshooting: container crash-loops with `Prisma failed to detect the libssl/openssl version` / `Could not parse schema engine response: SyntaxError: Unexpected token 'E', "Error load"...`

Unlike every prior entry in this list, this one didn't need detective
work — Prisma's own warning says exactly what's wrong: *"Please manually
install OpenSSL and try installing Prisma again."*

**Root cause:** `node:20-alpine` is a minimal image and doesn't ship
OpenSSL at all. Prisma's query/schema engine binaries need a real
OpenSSL runtime present to detect which binary variant to use. Without
it, the engine process itself fails to start, and its error output
(plain text, not JSON) breaks the Prisma CLI's own response parser —
that's the `SyntaxError: Unexpected token 'E', "Error load"...` on top
of the OpenSSL warning. This showed up specifically in the **deploy**
logs (container start, running `prisma migrate deploy`), in an endless
restart loop — every earlier fix in this list got the container to the
point of actually starting, and this was the next real thing blocking
it from staying up.

**The fix:** `RUN apk add --no-cache openssl` added to *both* stages of
`docker/Dockerfile.api` — the build stage (so `prisma generate` selects
the correct engine variant to bundle) and the runtime stage (where
`prisma migrate deploy` actually invokes the engine, at every container
start). This is Prisma's own documented recommendation for Alpine-based
Docker images, not a workaround specific to this project.

## 14. Troubleshooting: `TSError: Unable to compile TypeScript: error TS5109` when running `npm run prisma:seed` locally

Only shows up running the seed script locally (Section 2's initial-migration
step), never in the Railway container, since the backend's own build never
goes through this code path.

**Root cause:** `ts-node` (used to run `prisma/seed.ts` directly, without a
compile step) resolves its TypeScript config by searching for the nearest
`tsconfig.json`, walking up from the file being run. `prisma/seed.ts` has
no `tsconfig.json` in `prisma/`, and — until this fix — none existed at
the repo root either (only `backend/tsconfig.json` and
`frontend/tsconfig.json`, both inside sibling folders `ts-node` never
walks into). With nothing found, `ts-node` fell back to an internal
default that set `module` to `NodeNext` without a matching
`moduleResolution`, which newer TypeScript versions reject outright.

**The fix:** added a root-level `tsconfig.json`, scoped specifically to
`prisma/**/*.ts` (explicitly excluding `backend/`, `frontend/`, and
`packages/` so it can never interfere with either app's own build — verified
directly, not assumed: both `backend`'s and `frontend`'s own `tsc --noEmit`
checks were re-run after adding this file and are unaffected). Verified the
actual fix by running the real command, not a substitute: `npx ts-node
--transpile-only prisma/seed.ts` now gets fully past TypeScript compilation
and reaches real runtime logic, instead of failing on `TS5109`.

## 15. Secrets checklist before going live

- [ ] `JWT_SECRET` is a long random value, not the `.env.example` default
      — as of Phase 13, the app **refuses to start in production** if
      it isn't (see `backend/src/config/env.validation.ts`), so a bad
      deploy fails loudly at boot instead of running insecurely
- [ ] Demo user passwords (`prisma/seed.ts`) are **not** used in production
      — either don't run the seed script against production, or rotate
      every demo account's password immediately after
- [ ] `WEB_ORIGIN` lists only domains you control — also required at
      startup in production as of Phase 13
- [ ] Railway Postgres/Redis are on private networking to the backend
      service (Railway does this by default within a project)
- [ ] Reviewed `docs/SECURITY.md` for the full picture of what's
      hardened and what's explicitly still a gap
