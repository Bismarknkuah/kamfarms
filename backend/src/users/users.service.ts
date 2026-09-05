import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

// Who each line-manager role is allowed to see as "their team" — enforced
// here, server-side, not just hidden in the frontend. A Farm Director
// holding tasks.assign (but not users.manage) can list Farm Managers to
// assign work to them, and nothing else company-wide; a Warehouse
// Supervisor sees only Warehouse Managers; an Operations Manager sees
// only Operations Officers. This mapping is intentionally narrow — it's
// what "manage the farm managers, have more control on them" concretely
// means without handing out the same broad user-directory access an
// Admin has.
const TEAM_VISIBILITY: Record<string, string[]> = {
  FARM_DIRECTOR: ['FARM_MANAGER'],
  WAREHOUSE_SUPERVISOR: ['WAREHOUSE_MANAGER'],
  OPERATIONS_MANAGER: ['OPERATIONS_OFFICER'],
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** A deliberately minimal, broadly-accessible endpoint — separate
   * from list() on purpose. list() is the sensitive user-management
   * view (full detail, restricted to Admin or a line manager's own
   * subordinates). Messaging needs the opposite shape: almost anyone
   * who can send a message needs to find almost anyone else to send it
   * to (spec: "the Director can send messages to everyone"), but they
   * have no business seeing email, status, or full role/scope detail
   * for a colleague outside their team. This returns just enough to
   * pick a sensible recipient. */
  async directory() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        roles: { select: { role: { select: { code: true, name: true } } } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      roleCode: u.roles[0]?.role.code ?? null,
      roleName: u.roles[0]?.role.name ?? null,
    }));
  }

  async list(
    query: { search?: string; status?: string; page?: number; pageSize?: number },
    actor?: AuthenticatedUser,
  ) {    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 20;

    const where: Record<string, unknown> = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Anyone without users.manage only ever sees their defined
    // subordinate role(s), regardless of what they asked for — this is
    // the actual security boundary, not a suggestion the frontend
    // happens to follow.
    if (actor && !actor.permissionCodes.has('users.manage')) {
      const visibleRoleCodes = actor.roles.flatMap((r) => TEAM_VISIBILITY[r.roleCode] ?? []);
      if (visibleRoleCodes.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
      where.roles = { some: { role: { code: { in: visibleRoleCodes } } } };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { roles: { include: { role: true, scopes: true } }, department: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => this.sanitize(u)),
      total,
      page,
      pageSize,
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { roles: { include: { role: true, scopes: true } }, department: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    return this.sanitize(user);
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser, meta: { ipAddress?: string; userAgent?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException('A user with this email already exists.');

    const passwordHash = await argon2.hash(dto.temporaryPassword);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email.toLowerCase(),
          phone: dto.phone,
          employeeNumber: dto.employeeNumber,
          departmentId: dto.departmentId,
          passwordHash,
          mustChangePassword: true,
        },
      });

      if (dto.roleCodes?.length) {
        for (const code of dto.roleCodes) {
          const role = await tx.role.findUnique({ where: { code } });
          if (!role) throw new BadRequestException(`Unknown role code: ${code}`);
          await tx.userRole.create({ data: { userId: created.id, roleId: role.id, grantedBy: actor.id } });
        }
      }

      await this.audit.record(
        {
          userId: actor.id,
          action: 'user.create',
          entity: 'User',
          entityId: created.id,
          afterValue: { email: created.email, roleCodes: dto.roleCodes ?? [] },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
        tx,
      );

      return created;
    });

    return this.findById(user.id);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser, meta: { ipAddress?: string; userAgent?: string }) {
    if (id === actor.id && dto.status) {
      throw new BadRequestException('You cannot change your own account status.');
    }
    const before = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('User not found.');

    const updated = await this.prisma.user.update({ where: { id }, data: dto });

    await this.audit.record({
      userId: actor.id,
      action: 'user.update',
      entity: 'User',
      entityId: id,
      beforeValue: before,
      afterValue: updated,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return this.findById(id);
  }

  async assignRole(userId: string, dto: AssignRoleDto, actor: AuthenticatedUser) {
    if (userId === actor.id) {
      throw new BadRequestException('You cannot modify your own roles or permissions.');
    }
    const role = await this.prisma.role.findUnique({ where: { code: dto.roleCode } });
    if (!role) throw new NotFoundException('Role not found.');

    const userRole = await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id, grantedBy: actor.id },
      update: {},
    });

    if (dto.scopes?.length) {
      await this.prisma.userScope.deleteMany({ where: { userRoleId: userRole.id } });
      await this.prisma.userScope.createMany({
        data: dto.scopes.map((s) => ({ userRoleId: userRole.id, scopeType: s.scopeType, scopeId: s.scopeId ?? null })),
      });
    }

    await this.audit.record({
      userId: actor.id,
      action: 'user.assign_role',
      entity: 'User',
      entityId: userId,
      afterValue: { roleCode: dto.roleCode, scopes: dto.scopes },
    });

    return this.findById(userId);
  }

  async removeRole(userId: string, roleCode: string, actor: AuthenticatedUser) {
    if (userId === actor.id) {
      throw new BadRequestException('You cannot modify your own roles or permissions.');
    }
    const role = await this.prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) throw new NotFoundException('Role not found.');

    await this.prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });

    await this.audit.record({
      userId: actor.id,
      action: 'user.remove_role',
      entity: 'User',
      entityId: userId,
      afterValue: { removedRoleCode: roleCode },
    });

    return this.findById(userId);
  }

  private sanitize(user: Record<string, unknown>) {
    const { passwordHash: _hash, mfaSecret: _mfa, ...rest } = user as { passwordHash?: string; mfaSecret?: string };
    return rest;
  }
}
