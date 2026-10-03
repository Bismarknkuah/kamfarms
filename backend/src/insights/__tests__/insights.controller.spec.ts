import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { InsightsController } from '../insights.controller';
import { InsightsService } from '../insights.service';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('InsightsController', () => {
  let app: INestApplication;
  let api: string;
  const empty = { generatedAt: '2026-10-03T12:00:00.000Z', windowDays: 30, summary: { high: 0, medium: 0, low: 0, total: 0, placesToInvestigate: 0 }, signals: [], locations: [] };
  const fake = { watchlist: jest.fn(async () => empty) };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ controllers: [InsightsController], providers: [{ provide: InsightsService, useValue: fake }] }).compile();
    app = mod.createNestApplication();
    app.useGlobalInterceptors(new TransformInterceptor());
    app.setGlobalPrefix('api');
    await app.listen(0);
    api = (await app.getUrl()) + '/api';
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => fake.watchlist.mockClear());

  it('passes the requested number of days to the service, and returns the result in the normal envelope, never cached', async () => {
    const r = await fetch(`${api}/insights/watchlist?days=14`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(fake.watchlist).toHaveBeenCalledWith('14');
    expect(await r.json()).toMatchObject({ success: true, data: { windowDays: 30, signals: [] } });
  });

  it('lets the service choose the default when no period is given', async () => {
    await fetch(`${api}/insights/watchlist`);
    expect(fake.watchlist).toHaveBeenCalledWith(undefined);
  });

  it('is not public, and needs insights.view (held by the MD and CEO only)', () => {
    const reflector = new Reflector();
    const handler = InsightsController.prototype.watchlist;
    expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
    expect(reflector.get(PERMISSION_KEY, handler)).toBe('insights.view');
  });
});
