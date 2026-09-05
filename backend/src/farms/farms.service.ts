import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { AssignFarmManagerDto } from './dto/assign-farm-manager.dto';
import { CreateFarmManagerDto } from './dto/create-farm-manager.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class FarmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  /** Was returning every farm to every caller regardless of scope — a
   * Farm Manager scoped to Farm A could see Farm B, C, D... E, F's
   * name, code, location, and manager here, even though drilling into
   * any of them individually was already correctly blocked by
   * @RequireScope on the :id routes. The list itself was the actual
   * leak. GLOBAL-scoped roles (Admin, MD, CEO, Farm Director) are
   * unaffected — this only narrows what a location-scoped caller sees. */
  list(actor: AuthenticatedUser, includeInactive = false) {
    const where: Record<string, unknown> = includeInactive ? {} : { isActive: true };
    const { isGlobal, ids } = scopedLocationIds(actor, 'FARM');
    if (!isGlobal) {
      if (ids.length === 0) return [];
      where.id = { in: ids };
    }
    return this.prisma.farm.findMany({
      where,
      include: { managers: { include: { user: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async findById(id: string) {
    const farm = await this.prisma.farm.findUnique({
      where: { id },
      include: { managers: { include: { user: true } } },
    });
    if (!farm) throw new NotFoundException('Farm not found.');
    return farm;
  }

  /** Farms are never hard-coded — Admin (or Farm Director) can add Farm G,
   * H, etc. here at any time without a code change. */
  async create(dto: CreateFarmDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.farm.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('A farm with this code already exists.');

    const farm = await this.prisma.farm.create({ data: dto });
    await this.audit.record({
      userId: actor.id,
      action: 'farm.create',
      entity: 'Farm',
      entityId: farm.id,
      afterValue: farm,
    });
    return farm;
  }

  async update(id: string, dto: UpdateFarmDto, actor: AuthenticatedUser) {
    const before = await this.findById(id);
    const updated = await this.prisma.farm.update({ where: { id }, data: dto });
    await this.audit.record({
      userId: actor.id,
      action: 'farm.update',
      entity: 'Farm',
      entityId: id,
      beforeValue: before,
      afterValue: updated,
    });
    return updated;
  }

  /** Deactivates rather than hard-deletes: farms will be referenced by
   * paddy/inventory records from Phase 3 onward, and history must never be
   * destroyed by a delete action (spec rule: soft-delete, not destructive). */
  async deactivate(id: string, actor: AuthenticatedUser) {
    const before = await this.findById(id);
    const updated = await this.prisma.farm.update({ where: { id }, data: { isActive: false } });
    await this.audit.record({
      userId: actor.id,
      action: 'farm.deactivate',
      entity: 'Farm',
      entityId: id,
      beforeValue: before,
      afterValue: updated,
    });
    return updated;
  }

  async assignManager(farmId: string, dto: AssignFarmManagerDto, actor: AuthenticatedUser) {
    const farm = await this.findById(farmId);
    const user = await this.prisma.user.findFirst({ where: { id: dto.userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found.');

    const link = await this.prisma.farmManager.upsert({
      where: { farmId_userId: { farmId: farm.id, userId: user.id } },
      update: {},
      create: { farmId: farm.id, userId: user.id },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'farm.assign_manager',
      entity: 'Farm',
      entityId: farmId,
      afterValue: { managerUserId: user.id },
    });

    return { ...link, note: 'Manager link created. Grant the FARM_MANAGER role with a matching FARM scope via /users/:id/roles for full access.' };
  }

  /** Closes exactly the gap assignManager's own note above flags: that
   * method links an *existing* user as a farm's manager but grants no
   * actual login access on its own. This creates the account outright —
   * a real user, with the FARM_MANAGER role and a FARM scope tied to
   * this specific farm, and a temporary password the Farm Supervisor
   * can hand to them directly. Deliberately its own endpoint rather than
   * broadening what assignManager or the general user-creation endpoint
   * can do: a Farm Supervisor should be able to onboard a manager for a
   * farm they oversee, and nothing more — never a different role, never
   * a farm outside their oversight (assertScope below enforces that,
   * same as every other farm-scoped write in this service). */
  async createManager(farmId: string, dto: CreateFarmManagerDto, actor: AuthenticatedUser) {
    assertScope(actor, 'FARM', farmId, 'this farm');
    const farm = await this.findById(farmId);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException('A user with this email already exists.');

    const role = await this.prisma.role.findUnique({ where: { code: 'FARM_MANAGER' } });
    if (!role) throw new NotFoundException('FARM_MANAGER role not found — check the role seed.');

    // Random, not chosen by the Farm Supervisor — same reasoning as the
    // interim password-reset flow: a real secret, shown once, never
    // logged in plaintext beyond this one response.
    const temporaryPassword = crypto.randomBytes(9).toString('base64url'); // 12 chars, well past the 10-char minimum
    const passwordHash = await argon2.hash(temporaryPassword);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email.toLowerCase(),
          phone: dto.phone,
          passwordHash,
          mustChangePassword: true,
        },
      });

      const userRole = await tx.userRole.create({ data: { userId: created.id, roleId: role.id, grantedBy: actor.id } });
      await tx.userScope.create({ data: { userRoleId: userRole.id, scopeType: 'FARM', scopeId: farm.id } });
      await tx.farmManager.create({ data: { farmId: farm.id, userId: created.id } });

      await this.audit.record(
        {
          userId: actor.id,
          action: 'farm.create_manager',
          entity: 'User',
          entityId: created.id,
          afterValue: { email: created.email, farmId: farm.id },
        },
        tx,
      );

      return created;
    });

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      temporaryPassword,
    };
  }

  async removeManager(farmId: string, userId: string, actor: AuthenticatedUser) {
    await this.prisma.farmManager.deleteMany({ where: { farmId, userId } });
    await this.audit.record({
      userId: actor.id,
      action: 'farm.remove_manager',
      entity: 'Farm',
      entityId: farmId,
      afterValue: { removedManagerUserId: userId },
    });
    return { success: true, message: 'Manager removed.', errorCode: null, data: null };
  }

  /** Real-time farm inventory, computed from the ledger's materialized
   * balances — never a stored/mutable "current stock" field (spec section
   * 9 example: bags + KG per grade, plus a total). */
  async getInventory(farmId: string) {
    await this.findById(farmId);
    const balances = await this.ledger.getBalancesForLocation(LocationType.FARM, farmId);

    const byGrade = balances
      .filter((b) => b.paddyGrade)
      .map((b) => ({
        gradeCode: b.paddyGrade!.code,
        gradeLabel: b.paddyGrade!.label,
        bagCount: b.bagCount,
        totalKg: Number(b.quantityKg),
      }));

    const totalKg = byGrade.reduce((sum, g) => sum + g.totalKg, 0);
    const totalBags = byGrade.reduce((sum, g) => sum + g.bagCount, 0);

    return { farmId, byGrade, totalKg, totalBags };
  }
}
