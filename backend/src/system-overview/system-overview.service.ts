import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchemaCheckService } from '../prisma/schema-check.service';
import { SettingsService } from '../settings/settings.service';
import { buildInfo } from '../common/build-info';

/** A reset request that is still moving, or approved and waiting to be carried out. */
export const OPEN_RESET_STATUSES = ['REQUESTED', 'FINANCE_APPROVED', 'MD_APPROVED', 'APPROVED'];

/**
 * Everything the System Administrator's control center shows, in one call. Each figure is fetched on its own and a
 * failure leaves just that figure empty (null) instead of failing the page: a dashboard that goes blank when one
 * count fails is worse than one that says "unavailable" for that count.
 */
@Injectable()
export class SystemOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: SettingsService,
    @Optional() private readonly schemaCheck?: SchemaCheckService,
  ) {}

  async overview(now: Date = new Date()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = this.prisma as any;
    const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch {
        return null;
      }
    };
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
    const live = { deletedAt: null };

    const started = Date.now();
    const databaseOk = (await safe(async () => { await db.$queryRaw`SELECT 1`; return true; })) === true;
    const databaseMs = Date.now() - started;

    const [total, active, disabled, locked, mustChange, neverSignedIn, roleRows] = await Promise.all([
      safe(() => db.user.count({ where: live })),
      safe(() => db.user.count({ where: { ...live, status: 'ACTIVE' } })),
      safe(() => db.user.count({ where: { ...live, status: 'DISABLED' } })),
      safe(() => db.user.count({ where: { ...live, lockedUntil: { gt: now } } })),
      safe(() => db.user.count({ where: { ...live, mustChangePassword: true } })),
      safe(() => db.user.count({ where: { ...live, status: 'ACTIVE', lastLoginAt: null } })),
      safe(() => db.role.findMany({ select: { code: true, name: true, isSystemRole: true, _count: { select: { userRoles: true } } }, orderBy: { name: 'asc' } })),
    ]);
    const [farms, warehouses, millingCenters, machines, customers, permissions, openResets] = await Promise.all([
      safe(() => db.farm.count({ where: { isActive: true } })),
      safe(() => db.warehouse.count({ where: { isActive: true } })),
      safe(() => db.millingCenter.count({ where: { isActive: true } })),
      safe(() => db.machine.count({ where: { isActive: true } })),
      safe(() => db.customer.count({ where: { isActive: true } })),
      safe(() => db.permission.count()),
      safe(() => db.resetRequest.count({ where: { status: { in: OPEN_RESET_STATUSES } } })),
    ]);
    const [last24h, last7d, recent, homepage, files, effective] = await Promise.all([
      safe(() => db.auditLog.count({ where: { createdAt: { gte: hoursAgo(24) } } })),
      safe(() => db.auditLog.count({ where: { createdAt: { gte: hoursAgo(24 * 7) } } })),
      safe(() => db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { createdAt: true, action: true, entity: true, user: { select: { firstName: true, lastName: true } } } })),
      safe<{ version: number; updatedAt: Date } | null>(() => db.siteContent.findUnique({ where: { id: 'home' }, select: { version: true, updatedAt: true } })),
      safe(() => db.siteMedia.count()),
      safe(() => (this.settings ? this.settings.effective() : Promise.resolve([]))),
    ]);

    const roles = (roleRows as { code: string; name: string; isSystemRole: boolean; _count: { userRoles: number } }[] | null)?.map((r) => ({
      code: r.code, name: r.name, isSystemRole: r.isSystemRole, members: r._count?.userRoles ?? 0,
    })) ?? null;

    return {
      generatedAt: now.toISOString(),
      api: { ...buildInfo(), databaseOk, databaseMs, schema: await this.schemaStatus() },
      people: { total, active, disabled, lockedNow: locked, mustChangePassword: mustChange, neverSignedIn, roles },
      organization: { farms, warehouses, millingCenters, machines, customers },
      access: { roles: roles ? roles.length : null, permissions },
      pending: { resetRequests: openResets },
      activity: {
        last24h,
        last7d,
        recent: (recent as { createdAt: Date; action: string; entity: string; user: { firstName: string; lastName: string } | null }[] | null)?.map((a) => ({
          at: new Date(a.createdAt).toISOString(), who: a.user ? `${a.user.firstName} ${a.user.lastName}` : 'The system', action: a.action, entity: a.entity,
        })) ?? null,
      },
      homepage: homepage ? { saved: true, version: homepage.version, updatedAt: new Date(homepage.updatedAt).toISOString(), files } : { saved: false, version: 0, updatedAt: null, files },
      settings: { total: effective ? effective.length : null, changedFromDefault: effective ? effective.filter((e: { isDefault: boolean }) => !e.isDefault).length : null },
    };
  }

  /** Which tables, if any, the database is missing: shown on the Administrator's Control center. */
  private async schemaStatus() {
    const s = (await this.schemaCheck?.check()) ?? { state: 'unknown' as const, expected: 0, missing: [] as string[] };
    return { state: s.state, missing: s.missing };
  }
}
