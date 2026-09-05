# Security — What's Actually Implemented, and Where

This consolidates security measures built across all 13 phases into one
reference, rather than leaving them scattered. Every item below points to
the actual code, not a claim.

## Authentication & session security

| Measure | Where |
|---|---|
| Argon2 password hashing (not bcrypt/plaintext) | `auth/auth.service.ts` |
| JWT access tokens (short-lived, default 15m) + rotating refresh tokens | `auth/auth.service.ts` -- every refresh revokes the presented token and issues a new one |
| Per-account lockout: 5 failed attempts -> 15 min lock | `auth/auth.service.ts` |
| Per-IP rate limiting on login/forgot-password/reset-password, tighter than the global default | `auth/auth.controller.ts` -- added in Phase 13 |
| Global rate limiting (100 req/min) on every other endpoint | `app.module.ts` (`ThrottlerModule` + `ThrottlerGuard` as `APP_GUARD`) |
| Logout-all revokes every active refresh token for the account | `auth/auth.service.ts` |
| Password change / reset both force a full re-login (revoke all sessions) | `auth/auth.service.ts` |
| Password reset doesn't leak whether an email is registered | `auth/auth.service.ts` -- `requestPasswordReset` returns the identical response either way |

## Authorization

| Measure | Where |
|---|---|
| Every endpoint authenticated by default; `@Public()` is opt-out, not opt-in | `common/guards/jwt-auth.guard.ts`, wired as `APP_GUARD` |
| Every sensitive endpoint requires an explicit permission | `common/guards/permission.guard.ts` + `@RequirePermission()` |
| Scope enforcement for both route-param and request-body cases | `common/guards/scope.guard.ts` + `common/utils/scope.util.ts` |
| Self-approval blocked on every approval workflow in the system | Checked directly in each service -- paddy, delivery, production, sales, payment, expense, and the reset workflow's two-stage approval |
| Role escalation blocked: a user cannot modify their own role/scope | `users/users.service.ts` |
| AI predictions structurally cannot touch inventory or financial records | `ai/ai-predictions.service.ts` / `ai/ai-assistant.service.ts` never have a write-capable service injected -- proven by a unit test reading constructor metadata, not just documented |

## Input validation & data integrity

| Measure | Where |
|---|---|
| Every DTO validated with `class-validator`, `whitelist: true` + `forbidNonWhitelisted: true` globally | `main.ts` |
| Negative inventory rejected at the service layer with a clear error | `inventory-ledger/inventory-ledger.service.ts` |
| Financial amounts stored as Postgres `Decimal`, never floats | Every money/KG field in `prisma/schema.prisma` |
| Mandatory rejection reasons on every rejection action | Enforced via `@MinLength` on each `Reject*Dto` |
| Impossible production data rejected outright; abnormal-but-possible data flagged, not silently accepted | `production/production-records.service.ts` |

## Transport & headers

| Measure | Where |
|---|---|
| `helmet()` security headers on every response | `main.ts` |
| CORS locked to explicit origins from `WEB_ORIGIN`, not a wildcard | `main.ts` |
| Production startup fails fast if `JWT_SECRET` is missing, the documented dev default, or under 32 characters -- or if `DATABASE_URL`/`WEB_ORIGIN` are missing | `config/env.validation.ts`, wired via `ConfigModule.forRoot({ validate })` -- added in Phase 13 with a real passing test suite |

## Secrets & sensitive data

| Measure | Where |
|---|---|
| Password hashes and MFA secrets stripped from every API response | `users/users.service.ts` -- `sanitize()` |
| Refresh tokens stored as SHA-256 hashes, never in plaintext | `auth/auth.service.ts` |
| Password reset tokens likewise stored hashed, single-use, 1-hour expiry | `auth/auth.service.ts` |
| `.env.example` ships no real secrets, only documented placeholder values | repo root |

## Audit trail

| Measure | Where |
|---|---|
| Append-only `AuditLog`, written by every mutating action across every module | `audit/audit.service.ts`, injected globally |
| Read-only, filterable audit viewer for Admin/Auditor | `audit-viewer/` (Phase 12) |
| System reset execution captures pre/post row-count snapshots on the request itself, in addition to the audit log entry | `system-reset/system-reset.service.ts` |

## What's explicitly NOT done (documented gaps, not silent ones)

- **No CSRF protection layer.** This is a pure JSON REST API using Bearer
  tokens in an `Authorization` header, not cookies -- CSRF is a
  cookie-session-specific attack class that doesn't apply here.
- **No WAF / DDoS protection at the application layer** -- that's a
  platform concern (Railway/Vercel's own infrastructure), not something
  a NestJS app should try to reimplement.
- **No automated dependency vulnerability scanning wired into CI.**
  `npm audit` and Dependabot (or equivalent) should be added to whatever
  CI pipeline gets set up around this repo -- this codebase doesn't
  include a CI config at all yet.
- **No penetration test or third-party security review has been
  performed.** Everything above is what was deliberately built in; it is
  not a substitute for an actual security audit before handling real
  production data.
