import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthenticatedUser } from './types/authenticated-user';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async issueTokenPair(userId: string, email: string, meta: RequestMeta, deviceLabel?: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.get<string>('JWT_SECRET', 'dev-secret-change-me'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES', '15m'),
      },
    );

    const rawRefreshToken = crypto.randomBytes(48).toString('hex');
    const refreshExpiresDays = parseInt(this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS', '30'), 10);
    const expiresAt = new Date(Date.now() + refreshExpiresDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawRefreshToken),
        deviceLabel,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken, expiresAt };
  }

  async login(dto: LoginDto, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });

    if (!user || user.deletedAt) {
      await this.recordAttempt(null, dto.email, false, meta, 'USER_NOT_FOUND');
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.recordAttempt(user.id, dto.email, false, meta, 'ACCOUNT_LOCKED');
      throw new ForbiddenException({
        message: `Account is temporarily locked. Try again after ${user.lockedUntil.toISOString()}.`,
        errorCode: 'ACCOUNT_LOCKED',
      });
    }

    if (user.status !== 'ACTIVE') {
      await this.recordAttempt(user.id, dto.email, false, meta, 'ACCOUNT_NOT_ACTIVE');
      throw new ForbiddenException({ message: 'Account is not active.', errorCode: 'ACCOUNT_NOT_ACTIVE' });
    }

    const passwordOk = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordOk) {
      const failedCount = user.failedLoginCount + 1;
      const shouldLock = failedCount >= MAX_FAILED_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: shouldLock ? 0 : failedCount,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : user.lockedUntil,
        },
      });
      await this.recordAttempt(user.id, dto.email, false, meta, 'BAD_PASSWORD');
      if (shouldLock) {
        throw new ForbiddenException({
          message: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
          errorCode: 'ACCOUNT_LOCKED',
        });
      }
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.recordAttempt(user.id, dto.email, true, meta, null);

    const tokens = await this.issueTokenPair(user.id, user.email, meta, dto.deviceLabel);
    await this.audit.record({
      userId: user.id,
      action: 'auth.login',
      entity: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      ...tokens,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    };
  }

  async refresh(rawRefreshToken: string, meta: RequestMeta) {
    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }
    if (!existing.user || existing.user.status !== 'ACTIVE' || existing.user.deletedAt) {
      throw new UnauthorizedException('Account is not active.');
    }

    // Rotation: revoke the presented token, issue a brand-new pair.
    const tokens = await this.issueTokenPair(existing.userId, existing.user.email, meta, existing.deviceLabel ?? undefined);
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedByHash: this.hashToken(tokens.refreshToken) },
    });

    return tokens;
  }

  /** Logout from the current device only. */
  async logout(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true, message: 'Logged out.', errorCode: null, data: null };
  }

  /** Logout from all devices — revokes every active refresh token for the user. */
  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({ userId, action: 'auth.logout_all', entity: 'User', entityId: userId });
    return { success: true, message: 'Logged out from all devices.', errorCode: null, data: null };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    const newHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, mustChangePassword: false },
    });
    // Force re-authentication everywhere after a password change.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({ userId, action: 'auth.change_password', entity: 'User', entityId: userId });
    return { success: true, message: 'Password changed. Please log in again.', errorCode: null, data: null };
  }

  /** Self-service profile update — deliberately the ONLY user-editing
   * path that isn't gated by users.manage. Scoped tightly on purpose:
   * only the caller's own record (there's no id parameter at all — the
   * DTO can't name a different user to edit), and only firstName/
   * lastName/phone. Email, status, role, and department all stay behind
   * Admin's PATCH /users/:id, since those carry real security or
   * organizational implications a self-service edit shouldn't have.
   */
  async updateProfile(actor: AuthenticatedUser, dto: UpdateProfileDto) {
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    const updated = await this.prisma.user.update({
      where: { id: actor.id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
    });
    await this.audit.record({
      userId: actor.id,
      action: 'auth.update_profile',
      entity: 'User',
      entityId: actor.id,
      beforeValue: { firstName: before.firstName, lastName: before.lastName, phone: before.phone },
      afterValue: { firstName: updated.firstName, lastName: updated.lastName, phone: updated.phone },
    });
    return {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      phone: updated.phone,
    };
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Always respond the same way whether or not the account exists, to avoid
    // leaking which emails are registered.
    if (!user) {
      return { success: true, message: 'If that account exists, a reset link has been sent.', errorCode: null, data: null };
    }
    const rawToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    // Real SMTP delivery is architected via the EMAIL_* env vars (see
    // .env.example) but not wired to an actual provider yet. Until it is,
    // the reset link is written to the server's own logs — on Railway,
    // Admin can find it under the backend service's Deploy Logs — so the
    // flow is genuinely usable for pilot/demo purposes rather than
    // silently discarding the only copy of the token, which is what this
    // method used to do before this fix.
    const webOrigin = this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000').split(',')[0];
    const resetUrl = `${webOrigin}/reset-password?token=${rawToken}`;
    // eslint-disable-next-line no-console
    console.log(`[auth] Password reset requested for ${user.email}. Reset link (valid 1 hour): ${resetUrl}`);
    await this.audit.record({ userId: user.id, action: 'auth.request_password_reset', entity: 'User', entityId: user.id });
    return { success: true, message: 'If that account exists, a reset link has been sent.', errorCode: null, data: null };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Reset link is invalid or expired.');
    }
    const newHash = await argon2.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash: newHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.record({ userId: record.userId, action: 'auth.reset_password', entity: 'User', entityId: record.userId });
    return { success: true, message: 'Password reset. Please log in.', errorCode: null, data: null };
  }

  private async recordAttempt(
    userId: string | null,
    email: string,
    success: boolean,
    meta: RequestMeta,
    reason: string | null,
  ) {
    await this.prisma.loginAttempt.create({
      data: {
        userId,
        email: email.toLowerCase(),
        success,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        reason,
      },
    });
  }
}
