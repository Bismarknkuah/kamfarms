import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ACCESS_FEATURES } from './access-features';
import { CONTROL_CENTER_ROLES } from '../control-center/control-center.catalog';

const TTL_MS = 15_000;
const ADMIN = 'ADMIN';

/**
 * What the Administrator has switched off, per role. It is kept in its OWN table, apart from each role's permissions, because the permissions of the built-in
 * roles are rebuilt from the code every time the system is updated; a restriction kept there would be wiped at the next deploy. Here it survives.
 * It is applied on every request (see JwtStrategy), so a change takes effect within seconds, and the System Administrator is never restricted.
 */
@Injectable()
export class RoleAccessService {
  private readonly log = new Logger(RoleAccessService.name);
  private cached: { at: number; map: Map<string, Set<string>> } | null = null;
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit?: AuditService) {}

  /** roleCode -> the feature keys switched off for it. If the table cannot be read, nobody is restricted: a settings problem must never lock people out. */
  private async denials(): Promise<Map<string, Set<string>>> {
    if (this.cached && Date.now() - this.cached.at < TTL_MS) return this.cached.map;
    try {
      const map = new Map<string, Set<string>>();
      for (const r of await this.prisma.roleFeatureDenial.findMany({ select: { roleCode: true, featureKey: true } })) {
        if (!map.has(r.roleCode)) map.set(r.roleCode, new Set());
        map.get(r.roleCode)!.add(r.featureKey);
      }
      this.cached = { at: Date.now(), map };
      return map;
    } catch (e) {
      this.log.warn(`Could not read the role restrictions, so none are applied: ${(e as Error).message}`);
      return new Map();
    }
  }
  invalidate(): void { this.cached = null; }

  /** Take away, from each role, the permissions of the features switched off for it. */
  async restrict<R extends { roleCode: string; permissions: string[] }>(roles: R[]): Promise<R[]> {
    if (roles.every((r) => r.roleCode === ADMIN)) return roles;
    const map = await this.denials();
    if (map.size === 0) return roles;
    return roles.map((r) => {
      const off = map.get(r.roleCode);
      if (r.roleCode === ADMIN || !off || off.size === 0) return r;
      const gone = new Set(ACCESS_FEATURES.filter((f) => off.has(f.key)).flatMap((f) => f.permissions));
      return gone.size === 0 ? r : { ...r, permissions: r.permissions.filter((p) => !gone.has(p)) };
    });
  }

  /** The menu-and-screen features hidden from this person: switched off for EVERY role they hold (and never for the Administrator). */
  async hiddenFor(roleCodes: string[]): Promise<string[]> {
    const mine = roleCodes.filter((c) => c !== ADMIN);
    if (mine.length === 0 || mine.length < roleCodes.length) return [];
    const map = await this.denials();
    if (map.size === 0) return [];
    return ACCESS_FEATURES.filter((f) => f.ui && mine.every((c) => map.get(c)?.has(f.key))).map((f) => f.key);
  }

  /** For the settings screen: every feature, every role (except the Administrator), which features the role has by default, and which are switched off. */
  async matrix() {
    const roles = await this.prisma.role.findMany({ where: { code: { not: ADMIN } } as any, include: { permissions: { include: { permission: true } } }, orderBy: { name: 'asc' } });
    const map = await this.denials();
    return {
      features: ACCESS_FEATURES.map(({ key, label, description, pages, ui }) => ({ key, label, description, pages, ui: !!ui })),
      roles: roles.map((r: any) => {
        const have = new Set<string>(r.permissions.map((p: any) => p.permission.code));
        const held = ACCESS_FEATURES.filter((f) => (f.key === 'control-center' ? (CONTROL_CENTER_ROLES as readonly string[]).includes(r.code) : f.permissions.length === 0 ? true : f.permissions.some((p) => have.has(p)))).map((f) => f.key);
        return { code: r.code as string, name: r.name as string, held, denied: [...(map.get(r.code) ?? [])].sort() };
      }),
    };
  }

  async setForRole(roleCode: string, denied: string[], actor: AuthenticatedUser) {
    if (roleCode === ADMIN) throw new BadRequestException('The System Administrator always keeps every feature.');
    const role = await this.prisma.role.findFirst({ where: { code: roleCode } as any, select: { code: true } });
    if (!role) throw new NotFoundException('That role was not found.');
    const known = new Set(ACCESS_FEATURES.map((f) => f.key));
    const unknown = denied.filter((k) => !known.has(k));
    if (unknown.length > 0) throw new BadRequestException(`Not a feature that can be switched off: ${unknown.join(', ')}.`);
    const keys = [...new Set(denied)].sort();
    const before = [...((await this.denials()).get(roleCode) ?? [])].sort();
    await this.prisma.$transaction([
      this.prisma.roleFeatureDenial.deleteMany({ where: { roleCode } }),
      this.prisma.roleFeatureDenial.createMany({ data: keys.map((featureKey) => ({ roleCode, featureKey, updatedById: actor.id })) }),
    ]);
    this.invalidate();
    await this.audit?.record({ userId: actor.id, action: 'access.features.update', entity: 'Role', entityId: roleCode, afterValue: { switchedOff: keys, wasSwitchedOff: before } });
    return { code: roleCode, denied: keys };
  }
}
