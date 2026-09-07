import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreateWarehouseEquipmentDto } from './dto/create-warehouse-equipment.dto';
import { UpdateWarehouseEquipmentDto } from './dto/update-warehouse-equipment.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class WarehouseEquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(actor: AuthenticatedUser, warehouseId?: string) {
    const { isGlobal, ids } = scopedLocationIds(actor, 'WAREHOUSE');
    const where: Record<string, unknown> = warehouseId ? { warehouseId } : {};
    if (!isGlobal) {
      if (ids.length === 0) return Promise.resolve([]);
      where.warehouseId = warehouseId && ids.includes(warehouseId) ? warehouseId : { in: ids };
    }
    return this.prisma.warehouseEquipment.findMany({
      where,
      include: { warehouse: true, addedBy: true, updatedBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateWarehouseEquipmentDto, actor: AuthenticatedUser) {
    assertScope(actor, 'WAREHOUSE', dto.warehouseId, 'this warehouse');

    const created = await this.prisma.warehouseEquipment.create({
      data: { warehouseId: dto.warehouseId, name: dto.name, status: dto.status ?? 'WORKING', notes: dto.notes, addedById: actor.id },
      include: { warehouse: true, addedBy: true, updatedBy: true },
    });
    await this.audit.record({ userId: actor.id, action: 'warehouse_equipment.create', entity: 'WarehouseEquipment', entityId: created.id, afterValue: created });
    return created;
  }

  async update(id: string, dto: UpdateWarehouseEquipmentDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.warehouseEquipment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Equipment not found.');
    assertScope(actor, 'WAREHOUSE', existing.warehouseId, 'this warehouse');

    const updated = await this.prisma.warehouseEquipment.update({
      where: { id },
      data: { status: dto.status, name: dto.name, notes: dto.notes, updatedById: actor.id },
      include: { warehouse: true, addedBy: true, updatedBy: true },
    });
    await this.audit.record({
      userId: actor.id,
      action: 'warehouse_equipment.update',
      entity: 'WarehouseEquipment',
      entityId: id,
      beforeValue: { status: existing.status },
      afterValue: { status: updated.status, notes: updated.notes },
    });
    return updated;
  }
}
