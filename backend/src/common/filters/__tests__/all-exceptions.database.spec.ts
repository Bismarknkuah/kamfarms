import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from '../all-exceptions.filter';

function run(exception: unknown) {
  const out: { status?: number; body?: any } = {};
  const res = { status: (s: number) => { out.status = s; return { json: (b: unknown) => { out.body = b; } }; } };
  const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method: 'GET', url: '/api/site/admin/content' }) }) } as any;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  new AllExceptionsFilter().catch(exception, host);
  return out;
}
const known = (code: string, meta?: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError('internal sql detail', { code, clientVersion: '5.22.0', meta });

describe('AllExceptionsFilter: database failures say what is wrong', () => {
  afterEach(() => jest.restoreAllMocks());

  it('says which table is missing, in words, instead of "An unexpected error occurred" (the homepage editor 500)', () => {
    const { status, body } = run(known('P2021', { table: 'public.site_content' }));
    expect(status).toBe(503);
    expect(body).toMatchObject({ success: false, errorCode: 'DATABASE_NEEDS_UPDATE' });
    expect(body.message).toMatch(/missing a table this version of the system needs \(site_content\)/);
    expect(body.message).toMatch(/Ask the System Administrator to open the Control center/);
  });

  it('says which column is missing', () => {
    const { status, body } = run(known('P2022', { column: 'unit_price' }));
    expect(status).toBe(503);
    expect(body.message).toMatch(/missing a column this version of the system needs \(unit_price\)/);
  });

  it('copes when the database does not say which', () => {
    expect(run(known('P2021')).body.message).toMatch(/missing a table this version of the system needs\. /);
  });

  it('says the database did not answer, for every way of not reaching it', () => {
    for (const code of ['P1001', 'P1002', 'P1008', 'P1017']) {
      const r = run(known(code));
      expect([r.status, r.body.errorCode]).toEqual([503, 'DATABASE_UNREACHABLE']);
      expect(r.body.message).toBe('The database did not answer. Please wait a minute and try again.');
    }
    const init = run(new Prisma.PrismaClientInitializationError('cannot connect', '5.22.0', 'P1001'));
    expect([init.status, init.body.errorCode]).toEqual([503, 'DATABASE_UNREACHABLE']);
  });

  it('turns a duplicate into a conflict and a vanished record into a not-found, rather than a server error', () => {
    expect(run(known('P2002')).status).toBe(409);
    expect(run(known('P2025')).status).toBe(404);
  });

  it('never shows SQL or internal detail, and keeps the generic message for a database error it does not recognise', () => {
    const r = run(known('P2003'));
    expect(r.status).toBe(500);
    expect(r.body.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(run(known('P2021', { table: 'public.x' })).body)).not.toMatch(/internal sql detail/);
  });

  it('leaves everything else exactly as before', () => {
    expect(run(new Error('boom')).body).toEqual({ success: false, message: 'An unexpected error occurred.', errorCode: 'INTERNAL_ERROR', data: null });
    const bad = run(new BadRequestException({ message: 'Nope.', errorCode: 'X' }));
    expect([bad.status, bad.body.message, bad.body.errorCode]).toEqual([400, 'Nope.', 'X']);
  });
});
