import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreateDeliveryOrderDto } from './dto/create-delivery-order.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class DeliveryOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
    private readonly notifications: NotificationsService,
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

  /** Creating a delivery order does NOT move any stock - it is only a
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

    // Same estimation standard as PaddyEntry - bag count is always
    // known even without a scale on hand; weight can be estimated
    // from it rather than blocking the dispatch order entirely.
    const STANDARD_PADDY_BAG_WEIGHT_KG = 50;
    const totalKgEstimated = dto.totalKg === undefined;
    const totalKg = dto.totalKg ?? dto.bagCount * STANDARD_PADDY_BAG_WEIGHT_KG;

    const balances = await this.ledger.getBalancesForLocation('FARM', dto.farmId);
    const available = balances.find((b) => b.paddyGradeId === dto.paddyGradeId);
    // Validated against bag count, not KG - a real fix, not a cosmetic
    // one: farms track and report paddy in bags first, with weight
    // often only ever an estimate (STANDARD_PADDY_BAG_WEIGHT_KG above),
    // so rejecting a real request over a KG figure nobody actually
    // measured was the wrong check to begin with. KG stays available
    // for anyone who does have a scale, but bags is what's actually
    // enforced.
    if (!available || available.bagCount < dto.bagCount) {
      throw new BadRequestException({
        message: `Farm only has ${available ? available.bagCount : 0} bag(s) available for this grade - cannot request ${dto.bagCount} bag(s).`,
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
          totalKg,
          totalKgEstimated,
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

    // Only meaningful when someone other than the farm's own manager
    // created this - a Farm Supervisor ordering a farm to dispatch.
    // The farm's manager(s) would otherwise have no way to know an
    // order now exists against their farm at all, short of manually
    // checking My Office.
    const farmManagers = await this.prisma.farmManager.findMany({ where: { farmId: dto.farmId }, select: { userId: true } });
    const recipientIds = farmManagers.map((m) => m.userId).filter((id) => id !== actor.id);
    if (recipientIds.length > 0) {
      await this.notifications.notify({
        userIds: recipientIds,
        type: 'delivery_order.assigned',
        title: `Dispatch order - ${order.orderNumber}`,
        body: `Your Farm Supervisor has ordered ${dto.bagCount} bags (${totalKg} KG) dispatched to a warehouse.`,
        entityType: 'DeliveryOrder',
        entityId: order.id,
      });
    }

    return this.findById(order.id, actor);
  }

  /** "Track to know the state of the dispatch" - a single, human-
   * readable timeline across the whole chain (order → report →
   * shipment → location updates → receipt), searched by the order
   * number a person would actually have on hand, rather than making
   * them separately check three different pages and mentally stitch
   * the story together themselves. */
  async getFullTrace(orderNumber: string, actor: AuthenticatedUser) {
    const order = await this.prisma.deliveryOrder.findUnique({
      where: { orderNumber },
      include: {
        farm: true,
        destinationWarehouse: true,
        paddyGrade: true,
        reports: {
          include: {
            vehicle: true,
            driver: true,
            shipment: { include: { events: { orderBy: { createdAt: 'asc' } } } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('No dispatch order found with that number.');
    assertScope(actor, 'FARM', order.farmId, 'this farm');

    // An order can in principle have more than one report attempt
    // (e.g. a rejected-and-resubmitted report), so this surfaces the
    // most recently created one as the one that actually matters for
    // "where is this dispatch right now."
    const latestReport = order.reports.length > 0
      ? order.reports.reduce((a, b) => (a.createdAt > b.createdAt ? a : b))
      : null;
    const shipment = latestReport?.shipment ?? null;

    return {
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        farmName: order.farm.name,
        warehouseName: order.destinationWarehouse.name,
        gradeLabel: order.paddyGrade.label,
        bagCount: order.bagCount,
        totalKg: Number(order.totalKg),
        totalKgEstimated: order.totalKgEstimated,
        requestedDate: order.requestedDate,
      },
      report: latestReport
        ? {
            reportNumber: latestReport.reportNumber,
            status: latestReport.status,
            actualBagCount: latestReport.actualBagCount,
            actualKg: Number(latestReport.actualKg),
            driverName: latestReport.driver?.name ?? null,
            vehiclePlateNumber: latestReport.vehicle?.plateNumber ?? null,
            departureDate: latestReport.departureDate,
          }
        : null,
      shipment: shipment
        ? {
            shipmentNumber: shipment.shipmentNumber,
            departedAt: shipment.departedAt,
            receivedAt: shipment.receivedAt,
            receivedKg: shipment.receivedKg ? Number(shipment.receivedKg) : null,
            receivedBags: shipment.receivedBags,
            varianceKg: shipment.varianceKg ? Number(shipment.varianceKg) : null,
            varianceRequiresApproval: shipment.varianceRequiresApproval,
            receivedCondition: shipment.receivedCondition,
            events: shipment.events.map((e) => ({ eventType: e.eventType, notes: e.notes, createdAt: e.createdAt })),
          }
        : null,
    };
  }
}
