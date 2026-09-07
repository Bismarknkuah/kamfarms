import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService } from '../auth.service';
import { AuditService } from '../../audit/audit.service';
import { EmailService } from '../../email/email.service';

describe('AuthService.login', () => {
  const basePrisma = () => ({
    user: { findUnique: jest.fn(), update: jest.fn() },
    loginAttempt: { create: jest.fn() },
    refreshToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  });

  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') } as unknown as JwtService;
  const config = { get: jest.fn((_key: string, fallback?: string) => fallback) } as unknown as ConfigService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const email = { sendPasswordReset: jest.fn() } as unknown as EmailService;

  it('rejects an unknown email without revealing whether the account exists', async () => {
    const prisma = basePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    const service = new AuthService(prisma as any, jwt, config, audit, email);

    await expect(
      service.login({ email: 'nobody@kam.local', password: 'whatever123' }, {}),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.loginAttempt.create).toHaveBeenCalled();
  });

  it('locks the account after 5 consecutive failed attempts', async () => {
    const prisma = basePrisma();
    const passwordHash = await argon2.hash('correct-password-123');
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@kam.local',
      passwordHash,
      status: 'ACTIVE',
      lockedUntil: null,
      failedLoginCount: 4, // this attempt is the 5th
      deletedAt: null,
    });
    const service = new AuthService(prisma as any, jwt, config, audit, email);

    await expect(
      service.login({ email: 'user@kam.local', password: 'wrong-password' }, {}),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: expect.any(Date) }),
      }),
    );
  });

  it('rejects login while the account is still within its lockout window', async () => {
    const prisma = basePrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@kam.local',
      passwordHash: 'irrelevant',
      status: 'ACTIVE',
      lockedUntil: new Date(Date.now() + 60_000),
      failedLoginCount: 5,
      deletedAt: null,
    });
    const service = new AuthService(prisma as any, jwt, config, audit, email);

    await expect(
      service.login({ email: 'user@kam.local', password: 'anything' }, {}),
    ).rejects.toThrow(ForbiddenException);
  });

  it('issues an access + refresh token pair on successful login', async () => {
    const prisma = basePrisma();
    const passwordHash = await argon2.hash('correct-password-123');
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@kam.local',
      firstName: 'Test',
      lastName: 'User',
      passwordHash,
      status: 'ACTIVE',
      lockedUntil: null,
      failedLoginCount: 0,
      deletedAt: null,
    });
    const service = new AuthService(prisma as any, jwt, config, audit, email);

    const result = await service.login({ email: 'user@kam.local', password: 'correct-password-123' }, {});

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(typeof result.refreshToken).toBe('string');
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }) }),
    );
  });
});

describe('AuthService.requestPasswordReset', () => {
  const jwt = { signAsync: jest.fn() } as unknown as JwtService;
  const config = { get: jest.fn((_key: string, fallback?: string) => fallback) } as unknown as ConfigService;
  const audit = { record: jest.fn() } as unknown as AuditService;

  it('actually sends the reset email - the real fix behind this flow, not just generating a token nobody receives', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', email: 'real.person@kam.local' }) },
      passwordResetToken: { create: jest.fn() },
    };
    const email = { sendPasswordReset: jest.fn() } as unknown as EmailService;
    const service = new AuthService(prisma as any, jwt, config, audit, email);

    await service.requestPasswordReset('real.person@kam.local');

    expect(email.sendPasswordReset).toHaveBeenCalledTimes(1);
    const [toEmail, resetUrl] = (email.sendPasswordReset as jest.Mock).mock.calls[0];
    expect(toEmail).toBe('real.person@kam.local');
    expect(resetUrl).toContain('/reset-password?token=');
  });

  it('does NOT send an email or reveal anything for an unknown address - avoids leaking which emails are registered', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      passwordResetToken: { create: jest.fn() },
    };
    const email = { sendPasswordReset: jest.fn() } as unknown as EmailService;
    const service = new AuthService(prisma as any, jwt, config, audit, email);

    const result = await service.requestPasswordReset('nobody@kam.local');

    expect(email.sendPasswordReset).not.toHaveBeenCalled();
    expect(result.message).toBe('If that account exists, a reset link has been sent.');
  });
});
