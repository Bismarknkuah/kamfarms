import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreateDeliveryReportDto } from './dto/create-delivery-report.dto';
import { UpdateDeliveryReportDto } from './dto/update-delivery-report.dto';
import { RejectDeliveryReportDto } from './dto/reject-delivery-report.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { estimateKg } from '../common/constants/bag-weight';
import { NotificationsService } from '../notifications/notifications.service';
import { bagsLabel } from './dispatch-request.util';

// Only APPROVED (and the shipment-lifecycle statuses beyond it) locks
// editing - the exact same real bug already found and fixed once this
// session for PaddyEntry: this previously only allowed DRAFT/REJECTED,
// meaning a Farm Manager's report became permanently frozen the moment
// they submitted it, directly contradicting "edit submitted reports
// unless it has been approved." Confirmed safe to widen: no ledger
// transaction happens until approve() specifically, so nothing here
// touches inventory before that point regardless of which of these
// earlier statuses the report is in.
const EDITABLE_STATUSES = ['DRAFT', 'SUBMITTED', 'SUPERVISOR_REVIEW', 'REJECTED'] as const;

@Injectable()
export class DeliveryReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** There was no way to list delivery reports at all before this  - 
   * only fetch-by-ID existed, which meant the Farm Director had no way
   * to actually discover which reports were waiting for approval.
   * Scoping matches the sibling delivery-orders.service.ts exactly. */
  async list(actor: AuthenticatedUser, filters: { farmId?: string; warehouseId?: string; status?: string }) {
    const where: Record<string, unknown> = { status: filters.status as any };

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

    return this.prisma.deliveryReport.findMany({
      where,
      include: {
        farm: true,
        destinationWarehouse: true,
        paddyGrade: true,
        vehicle: true,
        driver: true,
        deliveryOrder: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const report = await this.prisma.deliveryReport.findUnique({
      where: { id },
      include: {
        deliveryOrder: true,
        farm: true,
        destinationWarehouse: true,
        paddyGrade: true,
        vehicle: true,
        driver: true,
        submittedBy: true,
        approvedBy: true,
        shipment: true,
      },
    });
    if (!report) throw new NotFoundException('Delivery report not found.');
    assertScope(actor, 'FARM', report.farmId, 'this farm');
    return report;
  }

  private async upsertVehicle(tx: any, plateNumber?: string, vehicleType?: string) {
    if (!plateNumber) return null;
    const vehicle = await tx.vehicle.upsert({
      where: { plateNumber },
      update: { vehicleType: vehicleType ?? undefined },
      create: { plateNumber, vehicleType },
    });
    return vehicle.id as string;
  }

  private async upsertDriver(tx: any, name?: string, phone?: string, licenseNumber?: string) {
    if (!name) return null;
    if (licenseNumber) {
      const driver = await tx.driver.upsert({
        where: { licenseNumber },
        update: { name, phone: phone ?? undefined },
        create: { name, phone, licenseNumber },
      });
      return driver.id as string;
    }
    const driver = await tx.driver.create({ data: { name, phone } });
    return driver.id as string;
  }

  private readonly log = new Logger(DeliveryReportsService.name);

  /**
   * What follows each step of a dispatch, around the report itself: the farm manager's TASK follows the work (in progress when the report is
   * started, done once every size of the request is on its way), and the Farm Supervisor who asked for it is told at each step, so they can
   * follow it without chasing anyone. Best effort: the report is already saved, so a failure here is logged and never undoes it.
   */
  private async afterReportStep(report: any, step: 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED', actor: AuthenticatedUser) {
    try {
      const order = report?.deliveryOrder ?? null;
      const ref: string | null = order?.requestRef ?? null;
      const orderNumber = order?.orderNumber ?? 'the order';
      const farm = report?.farm?.name ?? 'the farm';
      const warehouse = report?.destinationWarehouse?.name ?? 'the warehouse';
      const grade = report?.paddyGrade?.label ?? 'paddy';
      const bags = Number(report?.actualBagCount ?? 0);
      const notify = async (userIds: (string | null | undefined)[], title: string, body: string) => {
        const ids = [...new Set(userIds.filter((u): u is string => !!u && u !== actor.id))];
        if (ids.length > 0) await this.notifications?.notify({ userIds: ids, type: 'delivery_report.update', title, body, entityType: 'DeliveryReport', entityId: report.id });
      };
      if (step === 'CREATED' && ref) {
        await this.prisma.task.updateMany({ where: { deliveryRequestRef: ref, status: 'TODO' }, data: { status: 'IN_PROGRESS' } });
      }
      if (step === 'SUBMITTED') {
        await notify([order?.createdById], `Dispatch report ready: ${report.reportNumber}`, `${farm}'s manager has loaded ${bagsLabel(bags)} of ${grade} for ${warehouse} (order ${orderNumber}). Open Dispatch to approve it.`);
      }
      if (step === 'REJECTED') {
        await notify([report.submittedById], `Dispatch report sent back: ${report.reportNumber}`, `Reason: ${report.rejectionReason ?? 'not recorded'}. Fix it and submit it again.`);
      }
      if (step === 'APPROVED') {
        if (ref) {
          const siblings = await this.prisma.deliveryOrder.findMany({ where: { requestRef: ref }, include: { reports: { select: { status: true } } } });
          const allOut = siblings.length > 0 && siblings.every((o) => o.reports.some((r) => ['APPROVED', 'IN_TRANSIT', 'RECONCILED'].includes(r.status as string)));
          if (allOut) {
            await this.prisma.task.updateMany({
              where: { deliveryRequestRef: ref, status: { notIn: ['COMPLETED', 'CANCELLED'] as any } },
              data: { status: 'COMPLETED', completedAt: new Date(), completedById: report.submittedById, completionEvidence: `Dispatched: report ${report.reportNumber} was approved and the bags are on their way to ${warehouse}.` },
            });
          }
        }
        const trip = [report?.driver?.name && `driver ${report.driver.name}`, report?.vehicle?.plateNumber && `vehicle ${report.vehicle.plateNumber}`].filter(Boolean).join(', ');
        await notify([order?.createdById], `Dispatched: order ${orderNumber}`, `${bagsLabel(bags)} of ${grade} left ${farm} for ${warehouse}${trip ? ` (${trip})` : ''}. Track it under Dispatch.`);
        const receivers = await this.prisma.warehouseManager.findMany({ where: { warehouseId: report.destinationWarehouseId }, select: { userId: true } });
        await notify(receivers.map((m) => m.userId), `Incoming: ${bagsLabel(bags)} of ${grade}`, `From ${farm}${trip ? ` (${trip})` : ''}. Receive it under Shipments when it arrives.`);
      }
    } catch (err) {
      this.log.warn(`The follow-up to dispatch report ${report?.reportNumber ?? ''} did not complete: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Farm Manager prepares the delivery report against an existing order.
   * Still DRAFT - no inventory effect at all yet. */
  async create(dto: CreateDeliveryReportDto, actor: AuthenticatedUser) {
    const order = await this.prisma.deliveryOrder.findUnique({ where: { id: dto.deliveryOrderId } });
    if (!order) throw new NotFoundException('Delivery order not found.');
    assertScope(actor, 'FARM', order.farmId, 'this farm');

    // Most farms have no scale: the bags are counted, and with no kilograms given they are worked out from the order's own weight per bag
    // and marked as an estimate, never passed off as a measurement.
    const orderKgPerBag = Number(order.bagCount) > 0 ? Number(order.totalKg) / Number(order.bagCount) : undefined;
    const actualKgEstimated = dto.actualKg === undefined;
    const actualKg = dto.actualKg ?? estimateKg(dto.actualBagCount, orderKgPerBag);

    const labourCost = dto.labourCost ?? 0;
    const transportationFee = dto.transportationFee ?? 0;
    const otherCosts = dto.otherCosts ?? 0;
    const totalDeliveryCost = labourCost + transportationFee + otherCosts;

    const report = await this.prisma.$transaction(async (tx) => {
      const reportNumber = await this.ledger.generateNumber(tx, 'DR', 'deliveryReport');
      const vehicleId = await this.upsertVehicle(tx, dto.vehiclePlateNumber, dto.vehicleType);
      const driverId = await this.upsertDriver(tx, dto.driverName, dto.driverPhone, dto.driverLicenseNumber);

      const created = await tx.deliveryReport.create({
        data: {
          reportNumber,
          deliveryOrderId: order.id,
          farmId: order.farmId,
          destinationWarehouseId: order.destinationWarehouseId,
          paddyGradeId: order.paddyGradeId,
          actualBagCount: dto.actualBagCount,
          actualKg,
          actualKgEstimated,
          labourCost,
          numberOfLabourers: dto.numberOfLabourers,
          costPerLabourer: dto.costPerLabourer,
          transportationFee,
          otherCosts,
          otherCostsDescription: dto.otherCostsDescription,
          totalDeliveryCost,
          vehicleId,
          driverId,
          departureDate: dto.departureDate ? new Date(dto.departureDate) : null,
          departureTime: dto.departureTime,
          expectedArrivalTime: dto.expectedArrivalTime,
          loadingLocation: dto.loadingLocation,
          destinationLocationText: dto.destinationLocationText,
          remarks: dto.remarks,
          status: 'DRAFT',
          submittedById: actor.id,
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'delivery_report.create', entity: 'DeliveryReport', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    const fresh = await this.findById(report.id, actor);
    await this.afterReportStep(fresh, 'CREATED', actor);
    return fresh;
  }

  async submit(id: string, actor: AuthenticatedUser) {
    const report = await this.findById(id, actor);
    if (!EDITABLE_STATUSES.includes(report.status as any)) {
      throw new BadRequestException(`Delivery report cannot be submitted while ${report.status}.`);
    }
    if (report.submittedById !== actor.id) {
      throw new ForbiddenException('Only the original submitter can submit this report.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.deliveryReport.update({
        where: { id },
        data: { status: 'SUPERVISOR_REVIEW', submittedAt: new Date(), rejectionReason: null },
      });
      await this.audit.record(
        { userId: actor.id, action: 'delivery_report.submit', entity: 'DeliveryReport', entityId: id, afterValue: result },
        tx,
      );
      return result;
    });

    const fresh = await this.findById(updated.id, actor);
    await this.afterReportStep(fresh, 'SUBMITTED', actor);
    return fresh;
  }

  /** The transaction that actually moves stock: farm balance decreases,
   * an in-transit balance (LocationType.EXTERNAL, keyed by the new
   * Shipment's own id) increases by the same amount, a Shipment record is
   * created, and everything is audited - one DB transaction (spec section
   * 90), matching the section 69 example steps 10–12 exactly. */
  async approve(id: string, actor: AuthenticatedUser) {
    const report = await this.findById(id, actor);
    if (report.status !== 'SUPERVISOR_REVIEW') {
      throw new BadRequestException(`Only reports awaiting supervisor review can be approved (current status: ${report.status}).`);
    }
    if (report.submittedById === actor.id) {
      throw new ForbiddenException('You cannot approve your own delivery report.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const shipmentNumber = await this.ledger.generateNumber(tx, 'SH', 'shipment');

      await tx.deliveryReport.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() },
      });

      const shipment = await tx.shipment.create({
        data: {
          shipmentNumber,
          deliveryReportId: report.id,
          farmId: report.farmId,
          warehouseId: report.destinationWarehouseId,
          paddyGradeId: report.paddyGradeId,
          expectedKg: report.actualKg,
          expectedBags: report.actualBagCount,
        },
      });

      const finalReport = await tx.deliveryReport.update({ where: { id }, data: { status: 'IN_TRANSIT' } });

      await this.ledger.recordTransaction(tx, {
        type: 'PADDY_DISPATCHED',
        sourceLocationType: LocationType.FARM,
        sourceLocationId: report.farmId,
        destLocationType: LocationType.EXTERNAL,
        destLocationId: shipment.id,
        paddyGradeId: report.paddyGradeId,
        quantityKg: Number(report.actualKg),
        bagCount: report.actualBagCount,
        batchNumber: shipmentNumber,
        referenceDocument: report.reportNumber,
        userId: actor.id,
      });

      await this.ledger.adjustBalance(
        tx,
        { locationType: LocationType.FARM, locationId: report.farmId, paddyGradeId: report.paddyGradeId },
        -Number(report.actualKg),
        -report.actualBagCount,
      );
      await this.ledger.adjustBalance(
        tx,
        { locationType: LocationType.EXTERNAL, locationId: shipment.id, paddyGradeId: report.paddyGradeId },
        Number(report.actualKg),
        report.actualBagCount,
      );

      await tx.shipmentEvent.create({
        data: { shipmentId: shipment.id, eventType: 'DEPARTED', createdById: actor.id },
      });

      await this.audit.record(
        {
          userId: actor.id,
          action: 'delivery_report.approve',
          entity: 'DeliveryReport',
          entityId: id,
          afterValue: { status: 'IN_TRANSIT', shipmentNumber },
        },
        tx,
      );

      return finalReport;
    });

    const fresh = await this.findById(updated.id, actor);
    await this.afterReportStep(fresh, 'APPROVED', actor);
    return fresh;
  }

  async reject(id: string, dto: RejectDeliveryReportDto, actor: AuthenticatedUser) {
    const report = await this.findById(id, actor);
    if (report.status !== 'SUPERVISOR_REVIEW') {
      throw new BadRequestException(`Only reports awaiting supervisor review can be rejected (current status: ${report.status}).`);
    }
    if (report.submittedById === actor.id) {
      throw new ForbiddenException('You cannot reject your own delivery report.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.deliveryReport.update({
        where: { id },
        data: { status: 'REJECTED', rejectionReason: dto.reason },
      });
      await this.audit.record(
        {
          userId: actor.id,
          action: 'delivery_report.reject',
          entity: 'DeliveryReport',
          entityId: id,
          afterValue: { status: 'REJECTED', reason: dto.reason },
          reason: dto.reason,
        },
        tx,
      );
      return result;
    });

    const fresh = await this.findById(updated.id, actor);
    await this.afterReportStep(fresh, 'REJECTED', actor);
    return fresh;
  }

  /** The genuinely missing piece: this service could create and submit
   * a report, but had no way to actually edit one at all - meaning
   * "edit submitted reports unless approved" wasn't possible even
   * though the status-based rule existed elsewhere. */
  async update(id: string, dto: UpdateDeliveryReportDto, actor: AuthenticatedUser) {
    const before = await this.findById(id, actor);
    if (!EDITABLE_STATUSES.includes(before.status as (typeof EDITABLE_STATUSES)[number])) {
      throw new BadRequestException(`Delivery report cannot be edited while ${before.status}.`);
    }
    if (before.submittedById !== actor.id) {
      throw new ForbiddenException('Only the original submitter can edit this report.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const vehicleId = dto.vehiclePlateNumber !== undefined
        ? await this.upsertVehicle(tx, dto.vehiclePlateNumber, dto.vehicleType)
        : undefined;
      const driverId = dto.driverName !== undefined
        ? await this.upsertDriver(tx, dto.driverName, dto.driverPhone, dto.driverLicenseNumber)
        : undefined;

      const totalDeliveryCost =
        (dto.labourCost ?? Number(before.labourCost ?? 0)) +
        (dto.transportationFee ?? Number(before.transportationFee ?? 0)) +
        (dto.otherCosts ?? Number(before.otherCosts ?? 0));

      // Kilograms typed in are a measurement. Otherwise, if the earlier figure was only worked out from the bags, it is worked out again for
      // the new bag count (at the same weight per bag), and stays marked as an estimate.
      let kgPatch: { actualKg?: number; actualKgEstimated?: boolean } = {};
      if (dto.actualKg !== undefined) kgPatch = { actualKg: dto.actualKg, actualKgEstimated: false };
      else if ((before as { actualKgEstimated?: boolean }).actualKgEstimated && dto.actualBagCount !== undefined) {
        const perBag = Number(before.actualBagCount) > 0 ? Number(before.actualKg) / Number(before.actualBagCount) : undefined;
        kgPatch = { actualKg: estimateKg(dto.actualBagCount, perBag), actualKgEstimated: true };
      }

      const result = await tx.deliveryReport.update({
        where: { id },
        data: {
          actualBagCount: dto.actualBagCount,
          ...kgPatch,
          labourCost: dto.labourCost,
          numberOfLabourers: dto.numberOfLabourers,
          costPerLabourer: dto.costPerLabourer,
          transportationFee: dto.transportationFee,
          otherCosts: dto.otherCosts,
          otherCostsDescription: dto.otherCostsDescription,
          vehicleId,
          driverId,
          departureDate: dto.departureDate ? new Date(dto.departureDate) : undefined,
          departureTime: dto.departureTime,
          expectedArrivalTime: dto.expectedArrivalTime,
          loadingLocation: dto.loadingLocation,
          destinationLocationText: dto.destinationLocationText,
          remarks: dto.remarks,
          totalDeliveryCost,
        },
      });
      await this.audit.record(
        { userId: actor.id, action: 'delivery_report.update', entity: 'DeliveryReport', entityId: id, beforeValue: before, afterValue: result },
        tx,
      );
      return result;
    });

    return this.findById(updated.id, actor);
  }
}
