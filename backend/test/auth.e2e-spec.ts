import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Requires a real Postgres reachable via DATABASE_URL (seeded via
 * `npm run prisma:migrate` + `npm run prisma:seed`), e.g. a disposable test
 * database. Run with: DATABASE_URL=postgresql://... npm run test:e2e
 * These are skipped by default in environments with no DB configured — see
 * docs/INSTALLATION.md for how to run the full suite.
 */
const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects login with wrong credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@kam.local', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('logs the seeded admin in and returns a usable /me response', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@kam.local', password: 'ChangeMe123!' });

    expect(login.status).toBe(201);
    expect(login.body.data.accessToken).toBeDefined();

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('admin@kam.local');
    expect(me.body.data.permissions.length).toBeGreaterThan(0);
  });

  it('blocks an unauthenticated request to a protected endpoint', async () => {
    const res = await request(app.getHttpServer()).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('blocks a Sales Officer (no users.manage permission) from listing users', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'sales.1@kam.local', password: 'ChangeMe123!' });

    const res = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('PERMISSION_DENIED');
  });

  it('rotates the refresh token and rejects the old one after use', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@kam.local', password: 'ChangeMe123!' });

    const refreshToken = login.body.data.refreshToken;

    const refreshed = await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken });
    expect(refreshed.status).toBe(201);
    expect(refreshed.body.data.refreshToken).not.toBe(refreshToken);

    const reused = await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken });
    expect(reused.status).toBe(401);
  });
});
