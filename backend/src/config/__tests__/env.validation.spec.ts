import { validateEnv, EnvValidationError } from '../env.validation';

describe('validateEnv', () => {
  it('passes development config through unchanged even with the dev-default JWT secret', () => {
    const config = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://localhost/dev', JWT_SECRET: 'dev-secret-change-me' };

    expect(validateEnv(config)).toEqual(config);
  });

  it('rejects any environment missing DATABASE_URL, regardless of NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).toThrow(EnvValidationError);
  });

  it('refuses to start in production with the documented dev-default JWT secret', () => {
    const config = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod/db',
      JWT_SECRET: 'dev-secret-change-me',
      WEB_ORIGIN: 'https://kam-roms.vercel.app',
    };

    expect(() => validateEnv(config)).toThrow(/development default/);
  });

  it('refuses to start in production with a JWT secret shorter than 32 characters, even if not the literal default', () => {
    const config = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod/db',
      JWT_SECRET: 'too-short',
      WEB_ORIGIN: 'https://kam-roms.vercel.app',
    };

    expect(() => validateEnv(config)).toThrow(/at least 32 characters/);
  });

  it('refuses to start in production without WEB_ORIGIN set', () => {
    const config = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod/db',
      JWT_SECRET: 'a'.repeat(40),
    };

    expect(() => validateEnv(config)).toThrow(/WEB_ORIGIN/);
  });

  it('accepts a genuinely production-ready configuration', () => {
    const config = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod/db',
      JWT_SECRET: 'a'.repeat(40),
      WEB_ORIGIN: 'https://kam-roms.vercel.app',
    };

    expect(() => validateEnv(config)).not.toThrow();
  });

  it('reports every problem at once, not just the first one found', () => {
    try {
      validateEnv({ NODE_ENV: 'production' });
      fail('expected validateEnv to throw');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('JWT_SECRET');
      expect(message).toContain('WEB_ORIGIN');
    }
  });
});
