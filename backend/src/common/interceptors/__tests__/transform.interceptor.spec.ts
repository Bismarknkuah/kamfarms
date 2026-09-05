import { of } from 'rxjs';
import { TransformInterceptor } from '../transform.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor();

  function run(returnValue: unknown): Promise<any> {
    const handler: CallHandler = { handle: () => of(returnValue) };
    return new Promise((resolve) => {
      interceptor.intercept({} as ExecutionContext, handler).subscribe((result) => resolve(result));
    });
  }

  it('wraps a raw array response in the standard envelope', async () => {
    const result = await run([{ id: 'farm-1' }, { id: 'farm-2' }]);

    expect(result).toEqual({
      success: true,
      message: null,
      errorCode: null,
      data: [{ id: 'farm-1' }, { id: 'farm-2' }],
    });
  });

  it('wraps a raw plain object response in the standard envelope', async () => {
    const result = await run({ totalPaddyAvailableKg: 105000 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ totalPaddyAvailableKg: 105000 });
  });

  it('does not double-wrap a response a controller already built the envelope for by hand', async () => {
    const alreadyWrapped = { success: true, message: 'Login successful.', errorCode: null, data: { token: 'abc' } };

    const result = await run(alreadyWrapped);

    expect(result).toEqual(alreadyWrapped);
  });

  it('strips passwordHash from a directly-returned user object', async () => {
    const result = await run({ id: 'u1', email: 'a@kam.local', passwordHash: 'super-secret-hash' });

    expect(result.data.passwordHash).toBeUndefined();
    expect(result.data.email).toBe('a@kam.local');
  });

  it('strips passwordHash and mfaSecret from a user nested arbitrarily deep — the exact real-world shape a task\'s assignedTo relation produces', async () => {
    const result = await run({
      id: 'task-1',
      title: 'Fix the leak',
      assignedTo: {
        id: 'u1',
        firstName: 'Ama',
        passwordHash: 'super-secret-hash',
        mfaSecret: 'topsecret',
      },
      comments: [
        { id: 'c1', author: { id: 'u2', passwordHash: 'another-secret' } },
      ],
    });

    expect(result.data.assignedTo.passwordHash).toBeUndefined();
    expect(result.data.assignedTo.mfaSecret).toBeUndefined();
    expect(result.data.assignedTo.firstName).toBe('Ama');
    expect(result.data.comments[0].author.passwordHash).toBeUndefined();
  });

  it('strips tokenHash from a refresh/reset token record', async () => {
    const result = await run({ id: 't1', tokenHash: 'hashed-token-value', expiresAt: '2026-01-01' });

    expect(result.data.tokenHash).toBeUndefined();
    expect(result.data.expiresAt).toBe('2026-01-01');
  });

  it('leaves an array of users all individually redacted', async () => {
    const result = await run([
      { id: 'u1', passwordHash: 'a' },
      { id: 'u2', passwordHash: 'b' },
    ]);

    expect(result.data[0].passwordHash).toBeUndefined();
    expect(result.data[1].passwordHash).toBeUndefined();
    expect(result.data[0].id).toBe('u1');
  });

  it('does not choke on Date objects or null values while redacting', async () => {
    const result = await run({ id: 'x', createdAt: new Date('2026-01-01T00:00:00Z'), deletedAt: null });

    expect(result.data.createdAt).toBeInstanceOf(Date);
    expect(result.data.deletedAt).toBeNull();
  });

  describe('Decimal handling — a real, confirmed bug this fixes', () => {
    // Real decimal.js, not a mock — this is exactly what Prisma's
    // Decimal actually is under the hood. Reproduced independently
    // outside this test suite first: 0 + (this object walked the old,
    // broken way) literally evaluates to the string "0[object Object]",
    // matching a real screenshot of a Farm Manager's dashboard.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Decimal } = require('decimal.js');

    it('converts a Decimal field to a real number instead of corrupting it into {s, e, d}', async () => {
      const result = await run({ id: 'pe-1', weightKg: new Decimal('1500.500') });

      expect(result.data.weightKg).toBe(1500.5);
      expect(typeof result.data.weightKg).toBe('number');
    });

    it('converts Decimal fields nested inside an array of records — the real list-endpoint shape', async () => {
      const result = await run([
        { id: 'pe-1', weightKg: new Decimal('1500.5') },
        { id: 'pe-2', weightKg: new Decimal('980') },
      ]);

      expect(result.data[0].weightKg).toBe(1500.5);
      expect(result.data[1].weightKg).toBe(980);
      // The actual client-side bug this caused: summing raw Decimal-shaped
      // values that had been corrupted into plain objects.
      const total = result.data.reduce((sum: number, e: { weightKg: number }) => sum + e.weightKg, 0);
      expect(total).toBe(2480.5);
    });

    it('converts a Decimal nested deep inside a relation, alongside redacting a sensitive field at the same depth', async () => {
      const result = await run({
        id: 'order-1',
        totalAmount: new Decimal('4200.00'),
        salesOfficer: { id: 'u1', passwordHash: 'secret' },
      });

      expect(result.data.totalAmount).toBe(4200);
      expect(result.data.salesOfficer.passwordHash).toBeUndefined();
    });
  });
});
