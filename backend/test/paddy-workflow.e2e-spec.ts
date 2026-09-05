import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Requires a real Postgres, seeded (same requirement as auth.e2e-spec.ts
 * and rbac.e2e-spec.ts). Run with:
 * DATABASE_URL=postgresql://... npm run test:e2e
 *
 * This is the one end-to-end test in this project that exercises a full
 * business workflow over real HTTP, not just auth/RBAC plumbing: create
 * a paddy entry as the seeded Farm A manager, submit it, approve it as
 * the Farm Director, and confirm the farm's inventory endpoint reflects
 * the approval — proving the whole chain (API -> service -> DB
 * transaction -> inventory ledger -> read-back) actually works end to
 * end against a real database, not just that each layer's unit tests
 * pass in isolation.
 */
const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('Paddy entry workflow (e2e)', () => {
  let app: INestApplication;
  let farmManagerToken: string;
  let farmDirectorToken: string;
  let farmAId: string;
  let size4GradeId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const managerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'farmmanager.a@kam.local', password: 'KamRoms#2026Dev' });
    farmManagerToken = managerLogin.body.data.accessToken;

    const directorLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'farmdirector@kam.local', password: 'KamRoms#2026Dev' });
    farmDirectorToken = directorLogin.body.data.accessToken;

    const farms = await request(app.getHttpServer()).get('/api/farms').set('Authorization', `Bearer ${farmManagerToken}`);
    farmAId = farms.body.find((f: { code: string }) => f.code === 'FARM_A').id;

    const grades = await request(app.getHttpServer())
      .get('/api/master-data/paddy-grades')
      .set('Authorization', `Bearer ${farmManagerToken}`);
    size4GradeId = grades.body.find((g: { code: string }) => g.code === 'SIZE_4').id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('takes a paddy entry from creation through approval and reflects it in real-time farm inventory', async () => {
    const before = await request(app.getHttpServer())
      .get(`/api/farms/${farmAId}/inventory`)
      .set('Authorization', `Bearer ${farmManagerToken}`);
    const beforeTotalKg = before.body.totalKg;

    const created = await request(app.getHttpServer())
      .post('/api/paddy-entries')
      .set('Authorization', `Bearer ${farmManagerToken}`)
      .send({
        farmId: farmAId,
        entryDate: new Date().toISOString().slice(0, 10),
        paddyGradeId: size4GradeId,
        weightKg: 5000,
        bagCount: 100,
      });
    expect(created.status).toBe(201);
    const entryId = created.body.id;

    const submitted = await request(app.getHttpServer())
      .post(`/api/paddy-entries/${entryId}/submit`)
      .set('Authorization', `Bearer ${farmManagerToken}`);
    expect(submitted.body.status).toBe('SUBMITTED');

    // The Farm Manager who created and submitted it cannot approve their
    // own entry — this should be rejected with 403, not silently allowed.
    const selfApproveAttempt = await request(app.getHttpServer())
      .post(`/api/paddy-entries/${entryId}/approve`)
      .set('Authorization', `Bearer ${farmManagerToken}`);
    expect(selfApproveAttempt.status).toBe(403);

    const approved = await request(app.getHttpServer())
      .post(`/api/paddy-entries/${entryId}/approve`)
      .set('Authorization', `Bearer ${farmDirectorToken}`);
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe('APPROVED');

    const after = await request(app.getHttpServer())
      .get(`/api/farms/${farmAId}/inventory`)
      .set('Authorization', `Bearer ${farmManagerToken}`);

    expect(after.body.totalKg).toBe(beforeTotalKg + 5000);
  });
});
