/**
 * Validates process.env at application startup, via `ConfigModule.forRoot({ validate })`.
 *
 * The goal is narrow and specific: catch the mistakes that turn "secure
 * by design" into "insecure in practice" — running production with the
 * documented dev-only JWT secret, or without a database URL at all —
 * and fail loudly at boot rather than accept requests with a broken or
 * dangerous configuration.
 *
 * This is NOT a general schema validator for every env var; it checks
 * the handful of variables where a wrong value is a security problem,
 * not just a broken feature.
 */

const DEV_DEFAULT_JWT_SECRET = 'dev-secret-change-me';
const MIN_PRODUCTION_SECRET_LENGTH = 32;

export class EnvValidationError extends Error {}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const nodeEnv = (config.NODE_ENV as string | undefined) ?? 'development';
  const isProduction = nodeEnv === 'production';

  if (!config.DATABASE_URL) {
    errors.push('DATABASE_URL is required.');
  }

  const jwtSecret = config.JWT_SECRET as string | undefined;
  if (isProduction) {
    if (!jwtSecret) {
      errors.push('JWT_SECRET is required in production.');
    } else if (jwtSecret === DEV_DEFAULT_JWT_SECRET) {
      errors.push(
        `JWT_SECRET is still set to the development default ("${DEV_DEFAULT_JWT_SECRET}"). ` +
          'This must be changed to a unique, random value before running in production — ' +
          'anyone who knows this default could forge valid access tokens.',
      );
    } else if (jwtSecret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      errors.push(`JWT_SECRET must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production (got ${jwtSecret.length}).`);
    }

    if (!config.WEB_ORIGIN) {
      errors.push(
        'WEB_ORIGIN is required in production — without it, CORS falls back to allowing only ' +
          'http://localhost:3000, which will silently break the deployed frontend rather than ' +
          'accidentally opening CORS too wide. Set it to your real frontend URL(s).',
      );
    }
  }

  if (errors.length > 0) {
    throw new EnvValidationError(
      `Refusing to start with an invalid environment configuration:\n- ${errors.join('\n- ')}`,
    );
  }

  return config;
}
