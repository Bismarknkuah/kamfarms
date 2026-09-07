import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreateFarmEquipmentDto } from './dto/create-farm-equipment.dto';
import { UpdateFarmEquipmentDto } from './dto/update-farm-equipment.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class FarmEquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(actor: AuthenticatedUser, farmId?: string) {
    const { isGlobal, ids } = scopedLocationIds(actor, 'FARM');
    const where: Record<string, unknown> = farmId ? { farmId } : {};
    if (!isGlobal) {
      if (ids.length === 0) return Promise.resolve([]);
      where.farmId = farmId && ids.includes(farmId) ? farmId : { in: ids };
    }
    return this.prisma.farmEquipment.findMany({
      where,
      include: { farm: true, addedBy: true, updatedBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateFarmEquipmentDto, actor: AuthenticatedUser) {
    assertScope(actor, 'FARM', dto.farmId, 'this farm');

    const created = await this.prisma.farmEquipment.create({
      data: { farmId: dto.farmId, name: dto.name, status: dto.status ?? 'WORKING', notes: dto.notes, addedById: actor.id },
      include: { farm: true, addedBy: true, updatedBy: true },
    });
    await this.audit.record({ userId: actor.id, action: 'farm_equipment.create', entity: 'FarmEquipment', entityId: created.id, afterValue: created });
    return created;
  }

  async update(id: string, dto: UpdateFarmEquipmentDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.farmEquipment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Equipment not found.');
    assertScope(actor, 'FARM', existing.farmId, 'this farm');

    const updated = await this.prisma.farmEquipment.update({
      where: { id },
      data: { status: dto.status, name: dto.name, notes: dto.notes, updatedById: actor.id },
      include: { farm: true, addedBy: true, updatedBy: true },
    });
    await this.audit.record({
      userId: actor.id,
      action: 'farm_equipment.update',
      entity: 'FarmEquipment',
      entityId: id,
      beforeValue: { status: existing.status },
      afterValue: { status: updated.status, notes: updated.notes },
    });
    return updated;
  }
}
