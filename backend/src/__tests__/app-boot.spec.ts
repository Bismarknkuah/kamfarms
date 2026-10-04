import './wiring-env';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { configureApp, setupDocs } from '../app.setup';

/**
 * Actually starts the whole server, the same way main.ts does (only the database is a stand-in), and calls it over
 * HTTP the way the website does. The wiring test only builds the dependency graph; this proves the server comes up
 * and answers, with the headers the browser needs. A server that is down, or answers without them, shows up in the
 * browser as the CORS error at the sign-in screen.
 */
describe('the server really starts and answers the website', () => {
  // What the stand-in database says it has: every table the schema needs, less the ones a test removes.
  let missingTables: string[] = [];
  const tableRows = () => Prisma.dmmf.datamodel.models.map((m) => m.dbName ?? m.name).filter((t) => !missingTables.includes(t)).map((table_name) => ({ table_name }));
  let app: INestApplication;
  let base: string;
  const WEBSITE = 'https://kamfarms.vercel.app';
  const get = (path: string, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { headers });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn(), onModuleInit: jest.fn(), onModuleDestroy: jest.fn(), $queryRaw: jest.fn(async (strings: TemplateStringsArray) => (String(strings?.join?.('')).includes('information_schema') ? tableRows() : [{ ok: 1 }])) })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    setupDocs(app);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  }, 90_000);
  afterAll(async () => { await app?.close(); });

  it('answers the health check, which is what the host uses to decide a new version is ready', async () => {
    const res = await get('/api/health');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.status).toBe('healthy');
    expect(body.data.version).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
    expect(body.data.features).toEqual(expect.arrayContaining(['admin-access', 'ai-predictions', 'site-content', 'system-overview']));
  });

  it('says on the health route whether the database has every table, and still answers 200 when it does not', async () => {
    expect((await (await get('/api/health')).json()).data).toMatchObject({ status: 'healthy', schema: { state: 'ok', missing: [] } });
    missingTables = ['site_content', 'site_media'];
    const res = await get('/api/health');
    const body = await res.json();
    missingTables = [];
    expect(res.status).toBe(200); // a missing table must not make the host restart-loop the server
    expect(body.data).toMatchObject({ status: 'degraded', schema: { state: 'missing', missing: ['site_content', 'site_media'] }, checks: { schema: 'error' } });
  });

  it('lets the live website call it, with the headers the browser looks for', async () => {
    const res = await get('/api/health', { Origin: WEBSITE });
    expect(res.headers.get('access-control-allow-origin')).toBe(WEBSITE);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('answers the browser\'s pre-flight for signing in', async () => {
    const res = await fetch(`${base}/api/auth/login`, { method: 'OPTIONS', headers: { Origin: WEBSITE, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(WEBSITE);
    expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/);
    expect(res.headers.get('access-control-allow-headers')).toMatch(/content-type/i);
  });

  it('also lets a Vercel preview of this project and the local site call it, and nobody else', async () => {
    const allowed = async (origin: string) => (await get('/api/health', { Origin: origin })).headers.get('access-control-allow-origin');
    expect(await allowed('https://kamfarms-git-main-bismarks-projects.vercel.app')).toBe('https://kamfarms-git-main-bismarks-projects.vercel.app');
    expect(await allowed('http://localhost:3000')).toBe('http://localhost:3000');
    expect(await allowed('https://evil.example.com')).toBeNull();
    expect(await allowed('https://not-kamfarms.vercel.app')).toBeNull();
  });

  it('gives a normal JSON error, with the website still allowed to read it, for a route that does not exist', async () => {
    const res = await get('/api/no-such-route', { Origin: WEBSITE });
    expect(res.status).toBe(404);
    expect(res.headers.get('access-control-allow-origin')).toBe(WEBSITE);
    expect((await res.json()).success).toBe(false);
  });

  it('has the newest routes mounted, and refuses them without a sign-in rather than not finding them', async () => {
    for (const path of ['/api/product-prices/effective', '/api/ai/insights', '/api/ai/feedback', '/api/system/overview', '/api/settings/registry', '/api/reports/catalog', '/api/site/admin/content']) {
      expect((await get(path)).status).toBe(401);
    }
    expect((await fetch(`${base}/api/ai/predict-from-energy`, { method: 'POST' })).status).toBe(401);
  });

  it('builds the interactive API documentation, which reads every route and request shape', async () => {
    const res = await get('/api/docs-json');
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/api/ai/insights', '/api/ai/predict-from-energy', '/api/ai/predict-from-paddy', '/api/ai/feedback', '/api/ai/assistant/ask']));
    expect((await get('/api/docs')).status).toBe(200);
  });
});
