import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiEnvelope<T> {
  success: boolean;
  message: string | null;
  errorCode: string | null;
  data: T;
}

function isAlreadyEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    'data' in value &&
    'errorCode' in value
  );
}

// Every field name across the schema that must never leave this server,
// regardless of which service's Prisma `include` happened to pull in a
// related User/RefreshToken/PasswordResetToken record. This exists
// because auditing found the same real exposure risk in at least 14
// services that `include: { assignedTo: true }` (or createdBy,
// approvedBy, submittedBy, etc.) without an explicit `select` — Prisma's
// bare `true` include fetches every scalar column on the related model
// by default, which means passwordHash and mfaSecret would otherwise
// ride along in the JSON response for anything that includes a User
// relation. Redacting here, once, protects every endpoint uniformly —
// present and future — instead of relying on every individual service
// remembering to select fields explicitly.
const SENSITIVE_FIELD_NAMES = new Set(['passwordHash', 'mfaSecret', 'tokenHash']);

/** Duck-typed on purpose, not `instanceof Prisma.Decimal` — that import
 * depends on Prisma's generated client types, and this file (like every
 * file that imports generated Prisma types) is untestable in an
 * environment where the client hasn't been generated. decimal.js's
 * `toNumber` is a distinctive enough signature that nothing else
 * flowing through this system's responses would plausibly have it. */
function isDecimalLike(value: object): value is { toNumber: () => number } {
  return typeof (value as { toNumber?: unknown }).toNumber === 'function';
}

function redactSensitiveFields<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value;

  // A real, confirmed bug this fixes: Prisma's Decimal (every weightKg,
  // totalAmount, unitPrice, consumption, moisturePercent, etc. across
  // the schema) is a genuine object at runtime, not a plain number.
  // Without this check, the generic object-walk below recurses into its
  // *internal* sign/exponent/digit representation via Object.entries()
  // and rebuilds a plain {s, e, d} object — destroying toString/toJSON
  // entirely. Reproduced directly: 0 + (a Decimal corrupted this way)
  // literally evaluates to the string "0[object Object]" — precisely
  // the bug a Farm Manager's dashboard displayed. Converting to a real
  // Number here, once, means every field across every endpoint is
  // guaranteed a genuine JS number matching the frontend's own types —
  // not a string (Decimal's default toJSON() behavior, which is just as
  // broken for arithmetic as the corrupted-object case) and not
  // something every individual service has to remember to convert
  // itself.
  if (isDecimalLike(value)) return value.toNumber() as unknown as T;
  if (value instanceof Date) return value;

  if (seen.has(value as object)) return value; // guard against any circular structure
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_FIELD_NAMES.has(key)) continue; // drop it entirely, don't just null it out
    result[key] = redactSensitiveFields(val, seen);
  }
  return result as T;
}

/**
 * Wraps every controller response in the {success, message, errorCode,
 * data} envelope documented and assumed throughout this project's own
 * frontend (api-client.ts's request() helper). Before this interceptor
 * existed, only a handful of hand-written controllers (auth, some
 * notification/backup/reset actions) actually constructed that envelope
 * by hand — every other endpoint (including Farms, live since Phase 2)
 * just returned raw service results directly, which the frontend's
 * request() helper would have silently misread as { data: undefined }.
 * This interceptor makes the envelope a real, universal guarantee
 * instead of a per-controller convention that was never actually
 * followed everywhere.
 *
 * It also strips passwordHash/mfaSecret/tokenHash from every response,
 * at any nesting depth — the second real, systemic gap the same audit
 * that found the envelope inconsistency also turned up. See
 * SENSITIVE_FIELD_NAMES above.
 *
 * Controllers that already build the full envelope by hand are detected
 * and passed through unchanged (still redacted), never double-wrapped.
 * Controllers that bypass the normal response pipeline entirely via
 * @Res() (the reports module's CSV/Excel export path) are unaffected —
 * they've already sent the HTTP response directly by the time this
 * would run.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<T>> {
    return next.handle().pipe(
      map((data) => {
        const redacted = redactSensitiveFields(data);
        if (isAlreadyEnvelope(redacted)) {
          return redacted as ApiEnvelope<T>;
        }
        return { success: true, message: null, errorCode: null, data: redacted };
      }),
    );
  }
}
