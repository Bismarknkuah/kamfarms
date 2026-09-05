import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Requires a real Postgres reachable via DATABASE_URL, seeded via
 * `npm run prisma:migrate` + `npm run prisma:seed` (the seed's demo
 * users are what this spec logs in as). Run with:
 * DATABASE_URL=postgresql://... npm run test:e2e
 *
 * This spec proves server-side authorization end-to-end over real HTTP
 * — not just that the guard classes exist, but that a real request from
 * a real (if under-privileged) authenticated user actually gets
 * rejected by the live server, and that a properly-scoped user's
 * request actually succeeds. Complements the guard unit tests, which
 * only prove the guard logic in isolation.
 */
const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('RBAC (e2e)', () => {
  let app: INestApplication;
  let salesOfficerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const salesLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'sales.1@kam.local', password: 'KamRoms#2026Dev' });
    salesOfficerToken = salesLogin.body.data.accessToken;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@kam.local', password: 'KamRoms#2026Dev' });
    adminToken = adminLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unauthenticated request to a protected endpoint with 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('rejects a properly-authenticated Sales Officer from a users.manage-gated endpoint with 403, not 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${salesOfficerToken}`);

    // 403, not 401 — the token IS valid, the permission just isn't held.
    // Confirms PermissionGuard is actually being reached and evaluated,
    // not just that auth failed earlier in the chain.
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('PERMISSION_DENIED');
  });

  it('allows the same endpoint for an Admin, who does hold users.manage', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects a Sales Officer attempting to create a farm (farm.create) even though they are authenticated', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/farms')
      .set('Authorization', `Bearer ${salesOfficerToken}`)
      .send({ code: 'FARM_Z', name: 'Should Not Be Created' });

    expect(res.status).toBe(403);
  });
});
