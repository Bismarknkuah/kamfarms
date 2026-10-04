import { Logger } from '@nestjs/common';
import { SchemaCheckService } from '../schema-check.service';

function build(rows: unknown) {
  const queryRaw = jest.fn();
  if (rows instanceof Error) queryRaw.mockRejectedValue(rows); else queryRaw.mockResolvedValue(rows);
  const service = new SchemaCheckService({ $queryRaw: queryRaw } as any);
  return { service, queryRaw, all: service.expectedTables() };
}
const tables = (names: string[]) => names.map((table_name) => ({ table_name }));

describe('SchemaCheckService: does the database have every table this server needs?', () => {
  it('knows the real table name of each model, including the ones the homepage editor and the price list use', () => {
    const { all } = build([]);
    expect(all.length).toBeGreaterThan(60);
    for (const t of ['site_content', 'site_media', 'product_prices', 'system_settings']) expect(all).toContain(t);
  });

  it('says ok when every table is there (extra tables are fine)', async () => {
    const { service, all } = build([]);
    (service as any).prisma.$queryRaw.mockResolvedValue(tables([...all, '_prisma_migrations']));
    expect(await service.check()).toEqual({ state: 'ok', expected: all.length, missing: [] });
  });

  it('names the missing tables, sorted (the homepage editor failure)', async () => {
    const { service, all } = build([]);
    (service as any).prisma.$queryRaw.mockResolvedValue(tables(all.filter((t) => t !== 'site_content' && t !== 'site_media')));
    expect(await service.check()).toEqual({ state: 'missing', expected: all.length, missing: ['site_content', 'site_media'] });
  });

  it('says unknown, never "missing", when it cannot tell (an error, no rows, or an unexpected answer)', async () => {
    for (const rows of [new Error('connection lost'), [], [{ ok: 1 }], 'nonsense']) {
      expect((await build(rows).service.check()).state).toBe('unknown');
    }
  });

  it('writes one plain line to the start-up log for each outcome', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const err = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const ok = build([]); (ok.service as any).prisma.$queryRaw.mockResolvedValue(tables(ok.all));
    await ok.service.onApplicationBootstrap();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[startup\] Schema check: all \d+ tables are present\.$/));
    const bad = build([]); (bad.service as any).prisma.$queryRaw.mockResolvedValue(tables(bad.all.filter((t) => t !== 'site_media')));
    await bad.service.onApplicationBootstrap();
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/SCHEMA CHECK FAILED: the database is missing 1 of \d+ tables: site_media\./));
    await build(new Error('x')).service.onApplicationBootstrap();
    expect(warn).toHaveBeenCalledWith('[startup] Schema check could not be completed.');
    jest.restoreAllMocks();
  });
});
