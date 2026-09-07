import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../strategies/jwt.strategy';

function buildStrategy(userRecord: Record<string, unknown> | null) {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(userRecord) } };
  const config = { get: jest.fn((_key: string, fallback?: string) => fallback) } as unknown as ConfigService;
  const strategy = new JwtStrategy(config, prisma as any);
  return strategy;
}

const baseUser = {
  id: 'user-1',
  email: 'new.hire@kam.local',
  firstName: 'New',
  lastName: 'Hire',
  status: 'ACTIVE',
  deletedAt: null,
  roles: [],
};

describe('JwtStrategy.validate - mustChangePassword threading', () => {
  it('carries mustChangePassword: true through for a freshly created account - the real fix behind the forced password-change flow', async () => {
    const strategy = buildStrategy({ ...baseUser, mustChangePassword: true });

    const result = await strategy.validate({ sub: 'user-1' } as any);

    expect(result.mustChangePassword).toBe(true);
  });

  it('carries mustChangePassword: false through once the person has changed it', async () => {
    const strategy = buildStrategy({ ...baseUser, mustChangePassword: false });

    const result = await strategy.validate({ sub: 'user-1' } as any);

    expect(result.mustChangePassword).toBe(false);
  });

  it('still rejects a deleted or inactive account exactly as before - this fix did not touch that check', async () => {
    const strategy = buildStrategy({ ...baseUser, mustChangePassword: false, status: 'DISABLED' });

    await expect(strategy.validate({ sub: 'user-1' } as any)).rejects.toThrow(UnauthorizedException);
  });
});
