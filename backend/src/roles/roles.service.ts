import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { CloneRoleDto } from './dto/clone-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findByCode(code: string) {
    const role = await this.prisma.role.findUnique({
      where: { code },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found.');
    return role;
  }

  async create(dto: CreateRoleDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.role.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('A role with this code already exists.');

    const permissions = dto.permissionCodes?.length
      ? await this.prisma.permission.findMany({ where: { code: { in: dto.permissionCodes } } })
      : [];
    if (dto.permissionCodes?.length && permissions.length !== dto.permissionCodes.length) {
      throw new BadRequestException('One or more permission codes are unknown.');
    }

    const role = await this.prisma.role.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        isSystemRole: false,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'role.create',
      entity: 'Role',
      entityId: role.id,
      afterValue: dto,
    });

    return this.findByCode(role.code);
  }

  async clone(sourceCode: string, dto: CloneRoleDto, actor: AuthenticatedUser) {
    const source = await this.findByCode(sourceCode);
    const existing = await this.prisma.role.findUnique({ where: { code: dto.newCode } });
    if (existing) throw new ConflictException('A role with this code already exists.');

    const clone = await this.prisma.role.create({
      data: {
        code: dto.newCode,
        name: dto.newName,
        description: `Cloned from ${source.code}`,
        isSystemRole: false,
        permissions: { create: source.permissions.map((rp) => ({ permissionId: rp.permissionId })) },
      },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'role.clone',
      entity: 'Role',
      entityId: clone.id,
      afterValue: { sourceCode, newCode: dto.newCode },
    });

    return this.findByCode(clone.code);
  }

  async updatePermissions(code: string, dto: UpdateRolePermissionsDto, actor: AuthenticatedUser) {
    const role = await this.findByCode(code);
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: dto.permissionCodes } } });
    if (permissions.length !== dto.permissionCodes.length) {
      throw new BadRequestException('One or more permission codes are unknown.');
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      }),
    ]);

    await this.audit.record({
      userId: actor.id,
      action: 'role.update_permissions',
      entity: 'Role',
      entityId: role.id,
      beforeValue: role.permissions.map((rp) => rp.permission.code),
      afterValue: dto.permissionCodes,
    });

    return this.findByCode(code);
  }

  async delete(code: string, actor: AuthenticatedUser) {
    const role = await this.findByCode(code);
    if (role.isSystemRole) {
      throw new BadRequestException('Built-in system roles cannot be deleted.');
    }
    await this.prisma.role.delete({ where: { id: role.id } });
    await this.audit.record({ userId: actor.id, action: 'role.delete', entity: 'Role', entityId: role.id });
    return { success: true, message: 'Role deleted.', errorCode: null, data: null };
  }
}
