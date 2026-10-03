// Imported first by app-wiring.spec.ts: the application validates its environment when its module is imported.
Object.assign(process.env, { DATABASE_URL: 'postgresql://x:y@localhost:5432/z', JWT_SECRET: 'test-secret', WEB_ORIGIN: 'http://localhost:3000' });
