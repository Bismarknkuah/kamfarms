import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreateDeliveryOrderDto } from './dto/create-delivery-order.dto';
import { CreateDispatchRequestDto } from './dto/create-dispatch-request.dto';
import { dispatchNotificationBody, dispatchTaskDescription, dispatchTaskTitle, personName, totalBagsOf } from './dispatch-request.util';
import { trackingOf } from './dispatch-tracking.util';
import { buildRequestCards } from './dispatch-board.util';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { estimateKg } from '../common/constants/bag-weight';

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

    const orders = await this.prisma.deliveryOrder.findMany({
      where,
      include: { farm: true, destinationWarehouse: true, paddyGrade: true, createdBy: true, reports: { orderBy: { createdAt: 'desc' }, take: 1, include: { vehicle: true, driver: true, submittedBy: true, approvedBy: true, shipment: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // Where each order is, in words, for whoever asked for it and whoever handles it.
    return orders.map((o) => ({ ...o, tracking: trackingOf(o as any) }));
  }

  /**
   * One card per dispatch REQUEST, the same picture for the Farm Supervisor who asked and the farm manager who does it: what was asked and
   * where it goes, where it is now and whose move it is, the dispatch the manager prepared, and what the supervisor must approve.
   */
  async board(actor: AuthenticatedUser) {
    const where: Record<string, unknown> = {};
    const { isGlobal, ids } = scopedLocationIds(actor, 'FARM');
    if (!isGlobal) {
      if (ids.length === 0) return [];
      where.farmId = { in: ids };
    }
    const orders = await this.prisma.deliveryOrder.findMany({
      where,
      include: {
        farm: true, destinationWarehouse: true, paddyGrade: true, createdBy: true,
        reports: { orderBy: { createdAt: 'desc' }, include: { paddyGrade: true, vehicle: true, driver: true, submittedBy: true, approvedBy: true, shipment: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return buildRequestCards(orders as any[]);
  }

  /** The dispatch cards for some request references, whoever is asking: a warehouse that asked for paddy follows its dispatch without having farm access. */
  async cardsByRequestRefs(refs: string[]) {
    if (refs.length === 0) return new Map<string, ReturnType<typeof buildRequestCards>[number]>();
    const orders = await this.prisma.deliveryOrder.findMany({
      where: { requestRef: { in: refs } },
      include: {
        farm: true, destinationWarehouse: true, paddyGrade: true, createdBy: true,
        reports: { orderBy: { createdAt: 'desc' }, include: { paddyGrade: true, vehicle: true, driver: true, submittedBy: true, approvedBy: true, shipment: true } },
      },
    });
    return new Map(buildRequestCards(orders as any[]).filter((c) => c.requestRef).map((c) => [c.requestRef as string, c]));
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const order = await this.prisma.deliveryOrder.findUnique({
      where: { id },
      include: { farm: true, destinationWarehouse: true, paddyGrade: true, createdBy: true, reports: { orderBy: { createdAt: 'desc' }, include: { vehicle: true, driver: true, submittedBy: true, approvedBy: true, shipment: true } } },
    });
    if (!order) throw new NotFoundException('Delivery order not found.');
    assertScope(actor, 'FARM', order.farmId, 'this farm');
    return { ...order, tracking: trackingOf(order as any) };
  }

  /** Creating a delivery order does NOT move any stock - it is only a
   * request. Available inventory is checked here to give the Farm
   * Supervisor an immediate, honest signal, but the actual reduction only
   * happens when the resulting delivery report is APPROVED (spec section
   * 11: "Do NOT reduce available inventory before approval"). */
  async create(dto: CreateDeliveryOrderDto, actor: AuthenticatedUser) {
    // One size is just a request with one line: the same checks, the same task for the farm manager, the same tracking.
    const made = await this.createRequest(
      { farmId: dto.farmId, destinationWarehouseId: dto.destinationWarehouseId, requestedDate: dto.requestedDate, priority: dto.priority, notes: dto.notes, lines: [{ paddyGradeId: dto.paddyGradeId, bagCount: dto.bagCount, totalKg: dto.totalKg }] },
      actor,
    );
    return this.findById(made.orders[0].id, actor);
  }

  /**
   * A Farm Supervisor's request to a farm manager: these bags (every size, in one go) from this farm to THIS warehouse, by this date.
   * All of it is saved or none of it. It becomes one delivery order per size, tied together by one request reference, and ONE task on
   * the farm manager's list that says exactly where it goes, what to send, by when, and who to ask. Nothing moves in stock until the
   * dispatch report is approved: this only asks. The answer says who the task went to, so a farm with no manager is not a silent miss.
   */
  async createRequest(dto: CreateDispatchRequestDto, actor: AuthenticatedUser) {
    assertScope(actor, 'FARM', dto.farmId, 'this farm');

    const farm = await this.prisma.farm.findUnique({ where: { id: dto.farmId } });
    if (!farm || !farm.isActive) throw new BadRequestException('Farm not found or inactive.');

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.destinationWarehouseId }, include: { managers: { include: { user: true } } } });
    if (!warehouse || !warehouse.isActive) throw new BadRequestException('Destination warehouse not found or inactive.');

    const gradeIds = dto.lines.map((l) => l.paddyGradeId);
    let labelOf = (_id: string): string => 'this size';
    if (dto.lines.length > 1) {
      const grades = await this.prisma.paddyGrade.findMany({ where: { id: { in: gradeIds } } });
      labelOf = (id: string) => grades.find((g) => g.id === id)?.label ?? 'A size';
      const twice = gradeIds.find((id, i) => gradeIds.indexOf(id) !== i);
      if (twice) throw new BadRequestException(`${labelOf(twice)} is on the list twice. Put all of its bags on one line.`);
      const unusable = gradeIds.find((id) => !grades.some((g) => g.id === id && g.isActive));
      if (unusable) throw new BadRequestException('One of the sizes was not found or is no longer in use. Choose the size again.');
    }

    // Validated against bag count, not KG: farms track paddy in bags first, with weight often only ever an estimate, so rejecting a real
    // request over a kilogram figure nobody measured was the wrong check. Every size is checked, and ALL the shortfalls are reported.
    const balances = await this.ledger.getBalancesForLocation('FARM', dto.farmId);
    const short = dto.lines
      .map((l) => ({ id: l.paddyGradeId, wanted: l.bagCount, has: balances.find((b) => b.paddyGradeId === l.paddyGradeId)?.bagCount ?? 0 }))
      .filter((x) => x.has < x.wanted);
    if (short.length > 0) {
      const message = dto.lines.length === 1
        ? `Farm only has ${short[0].has} bag(s) available for this grade - cannot request ${short[0].wanted} bag(s).`
        : `The farm does not have enough bags: ${short.map((x) => `${labelOf(x.id)}: wanted ${x.wanted}, has ${x.has}`).join('; ')}.`;
      throw new BadRequestException({ message, errorCode: 'INSUFFICIENT_FARM_STOCK' });
    }

    const farmManagers = await this.prisma.farmManager.findMany({ where: { farmId: dto.farmId }, include: { user: true } });
    // A farm manager who asked for the dispatch themselves does not need a task telling them to do what they just asked for.
    const assignees = farmManagers.filter((m) => m.userId !== actor.id);
    const requestedByName = personName(actor as unknown as { firstName?: string; lastName?: string }) || 'the Farm Supervisor';

    const made = await this.prisma.$transaction(async (tx) => {
      const requestRef = await this.ledger.generateNumber(tx, 'RQ', 'dispatchRequest');
      const orders: { id: string; orderNumber: string; gradeLabel: string; bagCount: number; totalKg: number; totalKgEstimated: boolean }[] = [];
      for (const line of dto.lines) {
        const totalKgEstimated = line.totalKg === undefined;
        const totalKg = line.totalKg ?? estimateKg(line.bagCount);
        const orderNumber = await this.ledger.generateNumber(tx, 'DO', 'deliveryOrder');
        const created = await tx.deliveryOrder.create({
          data: {
            orderNumber, requestRef, farmId: dto.farmId, destinationWarehouseId: dto.destinationWarehouseId, requestedDate: new Date(dto.requestedDate),
            paddyGradeId: line.paddyGradeId, bagCount: line.bagCount, totalKg, totalKgEstimated, priority: dto.priority, notes: dto.notes, createdById: actor.id,
          },
          include: { paddyGrade: true },
        });
        await this.audit.record({ userId: actor.id, action: 'delivery_order.create', entity: 'DeliveryOrder', entityId: created.id, afterValue: { ...created, requestRef } }, tx);
        orders.push({ id: created.id, orderNumber: created.orderNumber ?? orderNumber, gradeLabel: created.paddyGrade?.label ?? labelOf(line.paddyGradeId), bagCount: line.bagCount, totalKg, totalKgEstimated });
      }

      const facts = {
        requestRef, farmName: farm.name ?? 'the farm', warehouseName: warehouse.name ?? 'the warehouse', warehouseLocation: warehouse.location ?? null,
        warehouseContacts: (warehouse.managers ?? []).map((m) => ({ name: personName(m.user), phone: m.user?.phone ?? null })),
        requestedDate: dto.requestedDate, priority: dto.priority ?? null, notes: dto.notes ?? null, requestedByName,
        lines: orders.map((o) => ({ gradeLabel: o.gradeLabel, bagCount: o.bagCount, totalKg: o.totalKg, totalKgEstimated: o.totalKgEstimated, orderNumber: o.orderNumber })),
      };
      const tasks: { id: string; taskNumber: string; assignedToId: string; title: string }[] = [];
      if (assignees.length > 0) {
        const prefix = `TASK-${new Date().getFullYear()}-`;
        const already = await tx.task.count({ where: { taskNumber: { startsWith: prefix } } });
        let n = 0;
        for (const m of assignees) {
          n += 1;
          const task = await tx.task.create({
            data: {
              taskNumber: `${prefix}${String(already + n).padStart(6, '0')}`,
              title: dispatchTaskTitle(facts),
              description: dispatchTaskDescription(facts),
              assignedToId: m.userId,
              farmId: dto.farmId,
              warehouseId: dto.destinationWarehouseId,
              dueDate: new Date(dto.requestedDate),
              status: 'TODO',
              createdById: actor.id,
              deliveryRequestRef: requestRef,
            },
          });
          tasks.push({ id: task.id, taskNumber: task.taskNumber, assignedToId: m.userId, title: task.title });
        }
      }
      return { requestRef, orders, tasks, facts };
    });

    // The farm manager is told, with the same detail the task carries (best effort: the request itself is already saved).
    for (const t of made.tasks) {
      try {
        await this.notifications.notify({ userIds: [t.assignedToId], type: 'task.assigned', title: `New dispatch task - ${t.taskNumber}`, body: dispatchNotificationBody(made.facts), entityType: 'Task', entityId: t.id });
      } catch {
        /* a failed notification never undoes a saved request */
      }
    }

    return {
      requestRef: made.requestRef,
      farmName: farm.name as string,
      warehouse: { id: warehouse.id as string, name: warehouse.name as string, location: (warehouse.location ?? null) as string | null, contacts: made.facts.warehouseContacts },
      requestedDate: dto.requestedDate,
      priority: dto.priority ?? 'NORMAL',
      notes: dto.notes ?? null,
      totalBags: totalBagsOf(made.orders),
      orders: made.orders,
      tasks: made.tasks.map((t) => ({ id: t.id, taskNumber: t.taskNumber, assignedTo: personName(assignees.find((m) => m.userId === t.assignedToId)?.user) })),
      managers: farmManagers.map((m) => personName(m.user)).filter(Boolean),
      /** True when nobody was given a task: the farm has no manager (or the only manager is the person asking). */
      noTaskCreated: made.tasks.length === 0,
      noManagerOnFarm: farmManagers.length === 0,
    };
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
