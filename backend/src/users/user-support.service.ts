import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RoleAccessService } from '../access/role-access.service';
import { ACCESS_FEATURES } from '../access/access-features';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

/** The scope each role needs before it can see anything: a Farm Manager with no farm assigned sees an empty system, which looks like "broken". */
const NEEDS_PLACE: Record<string, { type: 'FARM' | 'WAREHOUSE' | 'MILLING_CENTER'; word: string }> = {
  FARM_MANAGER: { type: 'FARM', word: 'a farm' },
  WAREHOUSE_MANAGER: { type: 'WAREHOUSE', word: 'a warehouse' },
  OPERATIONS_OFFICER: { type: 'MILLING_CENTER', word: 'a milling center' },
};

export interface SupportProblem { code: string; text: string; fix: string }

/** For the System Administrator: find out why a person is stuck, and put it right without touching the database. */
@Injectable()
export class UserSupportService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, @Optional() private readonly access?: RoleAccessService) {}

  async accessCheck(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } }, scopes: true } } } });
    if (!user) throw new NotFoundException('User not found.');
    const now = new Date();
    const problems: SupportProblem[] = [];
    if (user.status !== 'ACTIVE') problems.push({ code: 'NOT_ACTIVE', text: `The account is ${String(user.status).toLowerCase()}, so they cannot sign in.`, fix: 'Make the account active on the Users page.' });
    if (user.lockedUntil && user.lockedUntil > now) problems.push({ code: 'LOCKED', text: `The account is locked after too many wrong passwords, until ${user.lockedUntil.toISOString().slice(0, 16).replace('T', ' ')} UTC.`, fix: 'Unlock the account here.' });
    if (user.mustChangePassword) problems.push({ code: 'TEMP_PASSWORD', text: 'They are still on a temporary password and are asked to change it.', fix: 'Nothing is wrong: they choose a new password when they sign in.' });
    if (user.roles.length === 0) problems.push({ code: 'NO_ROLE', text: 'They have no role, so they can see nothing.', fix: 'Give them a role on the Users page.' });

    const roles = [];
    for (const ur of user.roles) {
      const code = ur.role.code;
      const stored = ur.role.permissions.map((rp: any) => rp.permission.code);
      const kept = this.access ? (await this.access.restrict([{ roleCode: code, permissions: stored }]))[0].permissions : stored;
      const removed = new Set(stored.filter((p: string) => !kept.includes(p)));
      const off = ACCESS_FEATURES.filter((f) => f.permissions.length > 0 && f.permissions.every((p) => !stored.includes(p) || removed.has(p)) && f.permissions.some((p) => removed.has(p))).map((f) => f.label);
      const scopes = ur.scopes.map((s: any) => ({ type: s.scopeType, id: s.scopeId }));
      const need = NEEDS_PLACE[code];
      if (need && !scopes.some((s) => s.type === need.type || s.type === 'GLOBAL')) problems.push({ code: 'NO_PLACE', text: `${ur.role.name} is not assigned to ${need.word}, so they see no figures and no records.`, fix: `Assign ${need.word} to this person on the Users page.` });
      if (off.length > 0) problems.push({ code: 'FEATURE_OFF', text: `For the ${ur.role.name} role the Administrator has switched off: ${off.join(', ')}.`, fix: 'Switch it back on in Settings, then Role features, if the role should have it.' });
      roles.push({ code, name: ur.role.name, scopes, permissionCount: kept.length, switchedOff: off });
    }
    const recent = await this.prisma.loginAttempt.findMany({ where: { userId, success: false }, orderBy: { createdAt: 'desc' }, take: 5, select: { createdAt: true, reason: true } });
    return {
      user: { id: user.id, name: `${user.firstName} ${user.lastName}`, email: user.email, status: user.status, mustChangePassword: user.mustChangePassword, lockedUntil: user.lockedUntil, failedLoginCount: user.failedLoginCount, lastLoginAt: user.lastLoginAt },
      roles, problems, recentFailedSignIns: recent.map((r: any) => ({ at: r.createdAt, reason: r.reason ?? 'Wrong password' })),
    };
  }

  async unlock(userId: string, actor: AuthenticatedUser, meta: { ipAddress?: string; userAgent?: string }) {
    const before = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true, failedLoginCount: true, lockedUntil: true } });
    if (!before) throw new NotFoundException('User not found.');
    await this.prisma.user.update({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil: null } });
    await this.audit.record({ userId: actor.id, action: 'user.unlock', entity: 'User', entityId: userId, beforeValue: before, afterValue: { failedLoginCount: 0, lockedUntil: null }, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
    return { unlocked: true };
  }

  async resetPassword(userId: string, temporaryPassword: string, actor: AuthenticatedUser, meta: { ipAddress?: string; userAgent?: string }) {
    if (userId === actor.id) throw new BadRequestException('Use Change Password for your own account.');
    if (!temporaryPassword || temporaryPassword.length < 8) throw new BadRequestException('The temporary password must be at least 8 characters.');
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found.');
    const passwordHash = await argon2.hash(temporaryPassword);
    await this.prisma.$transaction(async (tx: any) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    await this.audit.record({ userId: actor.id, action: 'user.password_reset', entity: 'User', entityId: userId, beforeValue: null, afterValue: { mustChangePassword: true, signedOutEverywhere: true }, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
    return { reset: true };
  }
}
