import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreateDeliveryOrderDto } from './dto/create-delivery-order.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class DeliveryOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async list(actor: AuthenticatedUser, filters: { farmId?: string; warehouseId?: string }) {
    const where: Record<string, unknown> = {};

    if (filters.farmId) {
      assertScope(actor, 'FARM', filters.farmId, 'this farm');
      where.farmId = filters.farmId;
    } else {
      const { isGlobal, ids } = scopedLocationIds(actor, 'FARM');
      if (!isGlobal) {
        if (ids.length === 0) return [];
        where.farmId = { in: ids };
      }
    }

    if (filters.warehouseId) {
      assertScope(actor, 'WAREHOUSE', filters.warehouseId, 'this warehouse');
      where.destinationWarehouseId = filters.warehouseId;
    }

    return this.prisma.deliveryOrder.findMany({
      where,
      include: { farm: true, destinationWarehouse: true, paddyGrade: true, createdBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const order = await this.prisma.deliveryOrder.findUnique({
      where: { id },
      include: { farm: true, destinationWarehouse: true, paddyGrade: true, createdBy: true, reports: true },
    });
    if (!order) throw new NotFoundException('Delivery order not found.');
    assertScope(actor, 'FARM', order.farmId, 'this farm');
    return order;
  }

  /** Creating a delivery order does NOT move any stock — it is only a
   * request. Available inventory is checked here to give the Farm
   * Supervisor an immediate, honest signal, but the actual reduction only
   * happens when the resulting delivery report is APPROVED (spec section
   * 11: "Do NOT reduce available inventory before approval"). */
  async create(dto: CreateDeliveryOrderDto, actor: AuthenticatedUser) {
    assertScope(actor, 'FARM', dto.farmId, 'this farm');

    const farm = await this.prisma.farm.findUnique({ where: { id: dto.farmId } });
    if (!farm || !farm.isActive) throw new BadRequestException('Farm not found or inactive.');

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.destinationWarehouseId } });
    if (!warehouse || !warehouse.isActive) throw new BadRequestException('Destination warehouse not found or inactive.');

    const balances = await this.ledger.getBalancesForLocation('FARM', dto.farmId);
    const available = balances.find((b) => b.paddyGradeId === dto.paddyGradeId);
    if (!available || Number(available.quantityKg) < dto.totalKg) {
      throw new BadRequestException({
        message: `Farm only has ${available ? Number(available.quantityKg).toFixed(2) : '0'} KG available for this grade — cannot request ${dto.totalKg} KG.`,
        errorCode: 'INSUFFICIENT_FARM_STOCK',
      });
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.ledger.generateNumber(tx, 'DO', 'deliveryOrder');
      const created = await tx.deliveryOrder.create({
        data: {
          orderNumber,
          farmId: dto.farmId,
          destinationWarehouseId: dto.destinationWarehouseId,
          requestedDate: new Date(dto.requestedDate),
          paddyGradeId: dto.paddyGradeId,
          bagCount: dto.bagCount,
          totalKg: dto.totalKg,
          priority: dto.priority,
          notes: dto.notes,
          createdById: actor.id,
        },
      });
      await this.audit.record(
        { userId: actor.id, action: 'delivery_order.create', entity: 'DeliveryOrder', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    return this.findById(order.id, actor);
  }
}
