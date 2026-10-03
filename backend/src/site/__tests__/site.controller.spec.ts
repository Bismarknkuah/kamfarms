import { INestApplication, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import { SiteController } from '../site.controller';
import { SiteService } from '../site.service';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

/**
 * The public routes, tested over a real HTTP connection with the same security headers (Helmet) the real server
 * uses. What matters here is what a browser on ANOTHER website (the Vercel site) will and will not do.
 */
const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const BYTES = Buffer.from('0123456789abcdefghij'); // 20 bytes

describe('SiteController: the public routes over real HTTP', () => {
  let app: INestApplication;
  let api: string;
  const fake = {
    getMedia: jest.fn(async (id: string) => {
      if (id !== ID) throw new NotFoundException('Not found.');
      return { mimeType: 'video/mp4', sizeBytes: BYTES.length, data: BYTES };
    }),
    getContent: jest.fn(async () => ({ content: null, version: 0, updatedAt: null })),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ controllers: [SiteController], providers: [{ provide: SiteService, useValue: fake }] }).compile();
    app = mod.createNestApplication();
    app.use(helmet());
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    app.setGlobalPrefix('api');
    await app.listen(0);
    api = (await app.getUrl()) + '/api';
  });
  afterAll(async () => { await app.close(); });

  const get = (path: string, headers: Record<string, string> = {}) => fetch(api + path, { headers });
  const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer());

  it('serves a whole file with the headers that let another website display it', async () => {
    const r = await get(`/site/media/${ID}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.headers.get('cross-origin-resource-policy')).toBe('cross-origin'); // Helmet would otherwise say same-origin and the browser would refuse it
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(r.headers.get('etag')).toBe(`"${ID}"`);
    expect(await bytes(r)).toEqual(BYTES); // the raw bytes, not wrapped in the JSON envelope
  });

  it("relaxes that one header on the media route only: every other route keeps Helmet's same-origin", async () => {
    const r = await get('/site/content');
    expect(r.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  it('answers byte-range requests, which Safari needs before it will play a video', async () => {
    const part = await get(`/site/media/${ID}`, { Range: 'bytes=2-5' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 2-5/20');
    expect(part.headers.get('content-length')).toBe('4');
    expect((await bytes(part)).toString()).toBe('2345');
    const tail = await get(`/site/media/${ID}`, { Range: 'bytes=15-' });
    expect(tail.status).toBe(206);
    expect((await bytes(tail)).toString()).toBe('fghij');
  });

  it('refuses a range outside the file, saying how long the file is', async () => {
    const r = await get(`/site/media/${ID}`, { Range: 'bytes=50-' });
    expect(r.status).toBe(416);
    expect(r.headers.get('content-range')).toBe('bytes */20');
  });

  it('lets the browser keep its copy: a matching ETag gets 304 and no body', async () => {
    const r = await get(`/site/media/${ID}`, { 'If-None-Match': `"${ID}"` });
    expect(r.status).toBe(304);
    expect((await bytes(r)).length).toBe(0);
  });

  it('says not found, in the normal JSON shape, for an unknown file', async () => {
    const r = await get('/site/media/00000000-0000-4000-8000-000000000000');
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ success: false });
  });

  it('returns the homepage content in the normal envelope, always revalidated so an edit shows straight away', async () => {
    const r = await get('/site/content');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-cache');
    expect(await r.json()).toMatchObject({ success: true, data: { content: null, version: 0 } });
  });
});

describe('SiteController: who may do what', () => {
  const reflector = new Reflector();
  const proto = SiteController.prototype as unknown as Record<string, () => unknown>;
  const meta = (key: string, method: string) => reflector.get(key, proto[method]);

  it.each(['getContent', 'media'])('%s is open to everyone, and asks for no permission', (m) => {
    expect(meta(IS_PUBLIC_KEY, m)).toBe(true);
    expect(meta(PERMISSION_KEY, m)).toBeUndefined();
  });
  it.each(['getAdminContent', 'saveContent', 'resetContent', 'listMedia', 'uploadMedia', 'deleteMedia'])('%s is NOT public and needs site.manage', (m) => {
    expect(meta(IS_PUBLIC_KEY, m)).toBeUndefined();
    expect(meta(PERMISSION_KEY, m)).toBe('site.manage');
  });
});
