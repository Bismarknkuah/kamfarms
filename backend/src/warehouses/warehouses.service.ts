import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { scopedLocationIds } from '../common/utils/scope.util';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { AssignWarehouseManagerDto } from './dto/assign-warehouse-manager.dto';
import { CreateMillingCenterDto } from './dto/create-milling-center.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  /** Same real leak as FarmsService.list() had: previously returned
   * every warehouse to every caller regardless of scope. A Warehouse
   * Manager scoped to Warehouse 1 could see Warehouse 2 and 3's name,
   * code, location, managers, and milling centers here. */
  list(actor: AuthenticatedUser, includeInactive = false) {
    const where: Record<string, unknown> = includeInactive ? {} : { isActive: true };
    const { isGlobal, ids } = scopedLocationIds(actor, 'WAREHOUSE');
    if (!isGlobal) {
      if (ids.length === 0) return [];
      where.id = { in: ids };
    }
    return this.prisma.warehouse.findMany({
      where,
      include: { managers: { include: { user: true } }, millingCenters: true },
      orderBy: { code: 'asc' },
    });
  }

  async findById(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { managers: { include: { user: true } }, millingCenters: true },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found.');
    return warehouse;
  }

  /** Warehouses are never hard-coded — Admin/Warehouse Supervisor can add a
   * 4th, 5th, etc. warehouse here without a code change. */
  async create(dto: CreateWarehouseDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.warehouse.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('A warehouse with this code already exists.');

    const warehouse = await this.prisma.warehouse.create({ data: dto });
    await this.audit.record({
      userId: actor.id,
      action: 'warehouse.create',
      entity: 'Warehouse',
      entityId: warehouse.id,
      afterValue: warehouse,
    });
    return warehouse;
  }

  async update(id: string, dto: UpdateWarehouseDto, actor: AuthenticatedUser) {
    const before = await this.findById(id);
    const updated = await this.prisma.warehouse.update({ where: { id }, data: dto });
    await this.audit.record({
      userId: actor.id,
      action: 'warehouse.update',
      entity: 'Warehouse',
      entityId: id,
      beforeValue: before,
      afterValue: updated,
    });
    return updated;
  }

  /** Deactivates rather than hard-deletes — warehouses will carry inventory
   * and transaction history from Phase 4 onward. */
  async deactivate(id: string, actor: AuthenticatedUser) {
    const before = await this.findById(id);
    const updated = await this.prisma.warehouse.update({ where: { id }, data: { isActive: false } });
    await this.audit.record({
      userId: actor.id,
      action: 'warehouse.deactivate',
      entity: 'Warehouse',
      entityId: id,
      beforeValue: before,
      afterValue: updated,
    });
    return updated;
  }

  async assignManager(warehouseId: string, dto: AssignWarehouseManagerDto, actor: AuthenticatedUser) {
    const warehouse = await this.findById(warehouseId);
    const user = await this.prisma.user.findFirst({ where: { id: dto.userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found.');

    const link = await this.prisma.warehouseManager.upsert({
      where: { warehouseId_userId: { warehouseId: warehouse.id, userId: user.id } },
      update: {},
      create: { warehouseId: warehouse.id, userId: user.id },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'warehouse.assign_manager',
      entity: 'Warehouse',
      entityId: warehouseId,
      afterValue: { managerUserId: user.id },
    });

    return { ...link, note: 'Manager link created. Grant the WAREHOUSE_MANAGER role with a matching WAREHOUSE scope via /users/:id/roles for full access.' };
  }

  async removeManager(warehouseId: string, userId: string, actor: AuthenticatedUser) {
    await this.prisma.warehouseManager.deleteMany({ where: { warehouseId, userId } });
    await this.audit.record({
      userId: actor.id,
      action: 'warehouse.remove_manager',
      entity: 'Warehouse',
      entityId: warehouseId,
      afterValue: { removedManagerUserId: userId },
    });
    return { success: true, message: 'Manager removed.', errorCode: null, data: null };
  }

  async createMillingCenter(warehouseId: string, dto: CreateMillingCenterDto, actor: AuthenticatedUser) {
    await this.findById(warehouseId);
    const existing = await this.prisma.millingCenter.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('A milling center with this code already exists.');

    const center = await this.prisma.millingCenter.create({ data: { ...dto, warehouseId } });
    await this.audit.record({
      userId: actor.id,
      action: 'milling_center.create',
      entity: 'MillingCenter',
      entityId: center.id,
      afterValue: center,
    });
    return center;
  }

  async deactivateMillingCenter(id: string, actor: AuthenticatedUser) {
    const before = await this.prisma.millingCenter.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Milling center not found.');
    const updated = await this.prisma.millingCenter.update({ where: { id }, data: { isActive: false } });
    await this.audit.record({
      userId: actor.id,
      action: 'milling_center.deactivate',
      entity: 'MillingCenter',
      entityId: id,
      beforeValue: before,
      afterValue: updated,
    });
    return updated;
  }

  /** Real-time warehouse paddy inventory, computed from the ledger — same
   * pattern as FarmsService.getInventory. Packaged-rice-by-size, broken
   * rice, and hull balances join this once Phases 5–6 (milling/packaging)
   * populate them; this endpoint already returns whatever balances exist
   * for the warehouse regardless of material type. */
  async getInventory(warehouseId: string) {
    await this.findById(warehouseId);
    const balances = await this.ledger.getBalancesForLocation(LocationType.WAREHOUSE, warehouseId);

    const paddyByGrade = balances
      .filter((b) => b.paddyGrade)
      .map((b) => ({
        gradeCode: b.paddyGrade!.code,
        gradeLabel: b.paddyGrade!.label,
        bagCount: b.bagCount,
        totalKg: Number(b.quantityKg),
      }));

    const packagedByProduct = balances
      .filter((b) => b.product && b.packagingSize)
      .map((b) => ({
        productName: b.product!.name,
        packageLabel: b.packagingSize!.label,
        bagCount: b.bagCount,
        totalKg: Number(b.quantityKg),
      }));

    return {
      warehouseId,
      paddyByGrade,
      paddyTotalKg: paddyByGrade.reduce((s, g) => s + g.totalKg, 0),
      packagedByProduct,
    };
  }
}
