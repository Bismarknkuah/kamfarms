import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreateDeliveryReportDto } from './dto/create-delivery-report.dto';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { UpdateDeliveryReportDto } from './dto/update-delivery-report.dto';
import { RejectDeliveryReportDto } from './dto/reject-delivery-report.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { estimateKg } from '../common/constants/bag-weight';
import { NotificationsService } from '../notifications/notifications.service';
import { bagsLabel, personName } from './dispatch-request.util';

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
/** An order with a report in any of these states already has a dispatch under way. */
/** A whole dispatch (every size) is saved or approved in ONE transaction, which touches several tables per size: more room than the 5 second default. */
const TRIP_TRANSACTION = { timeout: 20000, maxWait: 5000 };
const IN_FLIGHT = ['SUBMITTED', 'SUPERVISOR_REVIEW', 'APPROVED', 'IN_TRANSIT', 'ARRIVED', 'RECONCILED'];

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
  private async afterReportStep(reports: any, step: 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED', actor: AuthenticatedUser) {
    try {
      const list: any[] = Array.isArray(reports) ? reports : [reports];
      const lead = list[0];
      const order = lead?.deliveryOrder ?? null;
      const ref: string | null = order?.requestRef ?? null;
      const trip: string | null = lead?.dispatchRef ?? null; // set when it is one dispatch: a truck with every size on it
      const orderNumber = order?.orderNumber ?? 'the order';
      const farm = lead?.farm?.name ?? 'the farm';
      const warehouse = lead?.destinationWarehouse?.name ?? 'the warehouse';
      const bags = list.reduce((n, r) => n + Number(r?.actualBagCount ?? 0), 0);
      const what = list.length === 1 ? `${bagsLabel(bags)} of ${lead?.paddyGrade?.label ?? 'paddy'}` : `${bagsLabel(bags)} (${list.map((r) => `${r?.paddyGrade?.label ?? 'paddy'} ${Number(r?.actualBagCount ?? 0)}`).join(', ')})`;
      const askers = list.map((r) => r?.deliveryOrder?.createdById);
      const notify = async (userIds: (string | null | undefined)[], title: string, body: string) => {
        const ids = [...new Set(userIds.filter((u): u is string => !!u && u !== actor.id))];
        if (ids.length > 0) await this.notifications?.notify({ userIds: ids, type: 'delivery_report.update', title, body, entityType: 'DeliveryReport', entityId: lead.id });
      };
      if ((step === 'CREATED' || step === 'SUBMITTED') && ref) {
        await this.prisma.task.updateMany({ where: { deliveryRequestRef: ref, status: 'TODO' }, data: { status: 'IN_PROGRESS' } });
      }
      if (step === 'SUBMITTED') {
        await notify(
          askers,
          trip ? `Dispatch ready for approval: ${trip}` : `Dispatch report ready: ${lead.reportNumber}`,
          trip ? `${farm}'s manager has loaded ${what} for ${warehouse}. Open the Dispatch desk to approve it.` : `${farm}'s manager has loaded ${what} for ${warehouse} (order ${orderNumber}). Open Dispatch to approve it.`,
        );
      }
      if (step === 'REJECTED') {
        await notify(
          [lead.submittedById],
          trip ? `Dispatch sent back: ${trip}` : `Dispatch report sent back: ${lead.reportNumber}`,
          trip ? `Reason: ${lead.rejectionReason ?? 'not recorded'}. Prepare it again from the Dispatch desk.` : `Reason: ${lead.rejectionReason ?? 'not recorded'}. Fix it and submit it again.`,
        );
      }
      if (step === 'APPROVED') {
        if (ref) {
          const siblings = await this.prisma.deliveryOrder.findMany({ where: { requestRef: ref }, include: { reports: { select: { status: true } } } });
          const allOut = siblings.length > 0 && siblings.every((o) => o.reports.some((r) => ['APPROVED', 'IN_TRANSIT', 'RECONCILED'].includes(r.status as string)));
          if (allOut) {
            await this.prisma.task.updateMany({
              where: { deliveryRequestRef: ref, status: { notIn: ['COMPLETED', 'CANCELLED'] as any } },
              data: { status: 'COMPLETED', completedAt: new Date(), completedById: lead.submittedById, completionEvidence: `Dispatched: ${trip ?? lead.reportNumber} was approved and the bags are on their way to ${warehouse}.` },
            });
          }
        }
        const road = [lead?.driver?.name && `driver ${lead.driver.name}`, lead?.vehicle?.plateNumber && `vehicle ${lead.vehicle.plateNumber}`].filter(Boolean).join(', ');
        await notify(askers, trip ? `Dispatched: ${trip}` : `Dispatched: order ${orderNumber}`, `${what} left ${farm} for ${warehouse}${road ? ` (${road})` : ''}. Track it under Dispatch.`);
        const receivers = await this.prisma.warehouseManager.findMany({ where: { warehouseId: lead.destinationWarehouseId }, select: { userId: true } });
        await notify(receivers.map((m) => m.userId), `Incoming: ${what}`, `From ${farm}${road ? ` (${road})` : ''}. Receive it under Shipments when it arrives.`);
      }
    } catch (err) {
      this.log.warn(`The follow-up to dispatch ${(Array.isArray(reports) ? reports[0] : reports)?.dispatchRef ?? (Array.isArray(reports) ? reports[0] : reports)?.reportNumber ?? ''} did not complete: ${err instanceof Error ? err.message : String(err)}`);
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
  /** Moves stock for ONE report (one size): the farm balance down, the in-transit balance up, a shipment created. Runs inside the caller's
   * transaction, so a whole dispatch (every size) is approved together or not at all. */
  private async approveInTx(tx: any, report: any, actor: AuthenticatedUser) {
    const shipmentNumber = await this.ledger.generateNumber(tx, 'SH', 'shipment');

    await tx.deliveryReport.update({
      where: { id: report.id },
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

    const finalReport = await tx.deliveryReport.update({ where: { id: report.id }, data: { status: 'IN_TRANSIT' } });

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
        entityId: report.id,
        afterValue: { status: 'IN_TRANSIT', shipmentNumber },
      },
      tx,
    );

    return finalReport;
  }

  async approve(id: string, actor: AuthenticatedUser) {
    const report = await this.findById(id, actor);
    if (report.status !== 'SUPERVISOR_REVIEW') {
      throw new BadRequestException(`Only reports awaiting supervisor review can be approved (current status: ${report.status}).`);
    }
    if (report.submittedById === actor.id) {
      throw new ForbiddenException('You cannot approve your own delivery report.');
    }

    const updated = await this.prisma.$transaction((tx) => this.approveInTx(tx, report, actor));

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

  private async dispatchReports(ref: string, actor: AuthenticatedUser) {
    const reports = await this.prisma.deliveryReport.findMany({
      where: { dispatchRef: ref },
      include: { deliveryOrder: true, farm: true, destinationWarehouse: true, paddyGrade: true, vehicle: true, driver: true, submittedBy: true, approvedBy: true, shipment: true },
      orderBy: { reportNumber: 'asc' },
    });
    if (reports.length === 0) throw new NotFoundException('Dispatch not found.');
    assertScope(actor, 'FARM', reports[0].farmId, 'this farm');
    return reports;
  }

  private dispatchSummary(reports: any[], submitted: boolean) {
    const lead = reports[0];
    return {
      dispatchRef: lead.dispatchRef as string,
      status: lead.status as string,
      submitted,
      farmName: (lead.farm?.name ?? '') as string,
      warehouse: { name: (lead.destinationWarehouse?.name ?? '') as string, location: (lead.destinationWarehouse?.location ?? null) as string | null },
      totalBags: reports.reduce((n, r) => n + Number(r.actualBagCount), 0),
      totalKg: reports.reduce((n, r) => n + Number(r.actualKg), 0),
      anyKgEstimated: reports.some((r) => !!r.actualKgEstimated),
      lines: reports.map((r) => ({ reportNumber: r.reportNumber as string, orderNumber: (r.deliveryOrder?.orderNumber ?? null) as string | null, gradeLabel: (r.paddyGrade?.label ?? '') as string, bags: Number(r.actualBagCount), kg: Number(r.actualKg), kgEstimated: !!r.actualKgEstimated })),
      driverName: (lead.driver?.name ?? null) as string | null,
      vehiclePlate: (lead.vehicle?.plateNumber ?? null) as string | null,
      totalCost: reports.reduce((n, r) => n + Number(r.totalDeliveryCost ?? 0), 0),
    };
  }

  /**
   * ONE dispatch: one truck, one trip, with every size on it (e.g. 17 bags of Size 4 and 3 bags of Size 5), prepared by the farm manager in
   * one go and approved by the supervisor in one go. Stock is per size, so each size is still its own report, tied together by one dispatch
   * reference; they are saved, submitted, approved or sent back together, all or none. The trip's costs are recorded once (on the first
   * report) so they are never counted twice. A draft the same person left on these orders the old one-size-at-a-time way is replaced.
   */
  async createDispatch(dto: CreateDispatchDto, actor: AuthenticatedUser) {
    const ids = dto.lines.map((l) => l.deliveryOrderId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('The same order is on the list twice. Put all of its bags on one line.');
    const orders = await this.prisma.deliveryOrder.findMany({ where: { id: { in: ids } }, include: { paddyGrade: true, reports: { select: { id: true, status: true } } } });
    if (orders.length !== ids.length) throw new NotFoundException('One of the orders was not found.');
    const byId = new Map(orders.map((o) => [o.id, o]));
    const first = orders[0];
    assertScope(actor, 'FARM', first.farmId, 'this farm');
    if (orders.some((o) => o.farmId !== first.farmId)) throw new BadRequestException('These orders are from different farms: one dispatch leaves one farm.');
    if (orders.some((o) => o.destinationWarehouseId !== first.destinationWarehouseId)) {
      throw new BadRequestException('These orders go to different warehouses: one truck goes to one warehouse. Make a separate dispatch for each warehouse.');
    }
    for (const o of orders) {
      if (o.status === 'CANCELLED') throw new BadRequestException(`${o.orderNumber} was cancelled.`);
      if ((o.reports ?? []).some((r) => IN_FLIGHT.includes(r.status as string))) throw new BadRequestException(`${o.orderNumber} already has a dispatch under way.`);
    }

    const submit = dto.submit !== false;
    const labourCost = dto.labourCost ?? 0;
    const transportationFee = dto.transportationFee ?? 0;
    const otherCosts = dto.otherCosts ?? 0;
    const totalDeliveryCost = labourCost + transportationFee + otherCosts;

    const made = await this.prisma.$transaction(async (tx) => {
      const dispatchRef = await this.ledger.generateNumber(tx, 'DS', 'dispatch');
      const vehicleId = await this.upsertVehicle(tx, dto.vehiclePlateNumber, dto.vehicleType);
      const driverId = await this.upsertDriver(tx, dto.driverName, dto.driverPhone, dto.driverLicenseNumber);
      await tx.deliveryReport.updateMany({ where: { deliveryOrderId: { in: ids }, status: 'DRAFT', submittedById: actor.id }, data: { status: 'CANCELLED' } });
      const rows: { id: string }[] = [];
      for (const [i, line] of dto.lines.entries()) {
        const order = byId.get(line.deliveryOrderId)!;
        const perBag = Number(order.bagCount) > 0 ? Number(order.totalKg) / Number(order.bagCount) : undefined;
        const actualKgEstimated = line.actualKg === undefined;
        const actualKg = line.actualKg ?? estimateKg(line.actualBagCount, perBag);
        const lead = i === 0;
        const reportNumber = await this.ledger.generateNumber(tx, 'DR', 'deliveryReport');
        const row = await tx.deliveryReport.create({
          data: {
            reportNumber, dispatchRef, deliveryOrderId: order.id, farmId: order.farmId, destinationWarehouseId: order.destinationWarehouseId, paddyGradeId: order.paddyGradeId,
            actualBagCount: line.actualBagCount, actualKg, actualKgEstimated,
            labourCost: lead ? labourCost : 0, numberOfLabourers: lead ? dto.numberOfLabourers : undefined, costPerLabourer: lead ? dto.costPerLabourer : undefined,
            transportationFee: lead ? transportationFee : 0, otherCosts: lead ? otherCosts : 0, otherCostsDescription: lead ? dto.otherCostsDescription : undefined,
            totalDeliveryCost: lead ? totalDeliveryCost : 0,
            vehicleId, driverId,
            departureDate: dto.departureDate ? new Date(dto.departureDate) : null, departureTime: dto.departureTime, expectedArrivalTime: dto.expectedArrivalTime,
            loadingLocation: dto.loadingLocation, destinationLocationText: dto.destinationLocationText, remarks: dto.remarks,
            status: submit ? 'SUPERVISOR_REVIEW' : 'DRAFT', submittedAt: submit ? new Date() : null, submittedById: actor.id,
          },
        });
        await this.audit.record({ userId: actor.id, action: submit ? 'delivery_report.create_and_submit' : 'delivery_report.create', entity: 'DeliveryReport', entityId: row.id, afterValue: { ...row, dispatchRef } }, tx);
        rows.push(row);
      }
      return { dispatchRef, rows };
    }, TRIP_TRANSACTION);

    const fresh = await this.dispatchReports(made.dispatchRef, actor);
    await this.afterReportStep(fresh, submit ? 'SUBMITTED' : 'CREATED', actor);
    return this.dispatchSummary(fresh, submit);
  }

  /** Sends a prepared (or sent-back) dispatch to the supervisor: every size together. Only the person who prepared it can. */
  async submitDispatch(ref: string, actor: AuthenticatedUser) {
    const reports = await this.dispatchReports(ref, actor);
    if (reports.some((r) => r.submittedById !== actor.id)) throw new ForbiddenException('Only the person who prepared this dispatch can send it for approval.');
    const bad = reports.find((r) => !['DRAFT', 'REJECTED'].includes(r.status as string));
    if (bad) throw new BadRequestException(`This dispatch cannot be sent for approval while it is ${String(bad.status).replace(/_/g, ' ').toLowerCase()}.`);
    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryReport.updateMany({ where: { dispatchRef: ref }, data: { status: 'SUPERVISOR_REVIEW', submittedAt: new Date(), rejectionReason: null } });
      for (const r of reports) await this.audit.record({ userId: actor.id, action: 'delivery_report.submit', entity: 'DeliveryReport', entityId: r.id, afterValue: { dispatchRef: ref, status: 'SUPERVISOR_REVIEW' } }, tx);
    });
    const fresh = await this.dispatchReports(ref, actor);
    await this.afterReportStep(fresh, 'SUBMITTED', actor);
    return this.dispatchSummary(fresh, true);
  }

  /** The supervisor approves the whole dispatch: every size leaves the farm, together, in one transaction (all or none). */
  async approveDispatch(ref: string, actor: AuthenticatedUser) {
    const reports = await this.dispatchReports(ref, actor);
    const bad = reports.find((r) => r.status !== 'SUPERVISOR_REVIEW');
    if (bad) throw new BadRequestException(`Only a dispatch waiting for approval can be approved (it is ${String(bad.status).replace(/_/g, ' ').toLowerCase()}).`);
    if (reports.some((r) => r.submittedById === actor.id)) throw new ForbiddenException('You cannot approve a dispatch you prepared yourself.');
    await this.prisma.$transaction(async (tx) => {
      for (const r of reports) await this.approveInTx(tx, r, actor);
    }, TRIP_TRANSACTION);
    const fresh = await this.dispatchReports(ref, actor);
    await this.afterReportStep(fresh, 'APPROVED', actor);
    return this.dispatchSummary(fresh, true);
  }

  /** The supervisor sends the whole dispatch back, with the reason. The farm manager prepares it again. */
  async rejectDispatch(ref: string, dto: RejectDeliveryReportDto, actor: AuthenticatedUser) {
    const reports = await this.dispatchReports(ref, actor);
    const bad = reports.find((r) => r.status !== 'SUPERVISOR_REVIEW');
    if (bad) throw new BadRequestException(`Only a dispatch waiting for approval can be sent back (it is ${String(bad.status).replace(/_/g, ' ').toLowerCase()}).`);
    if (reports.some((r) => r.submittedById === actor.id)) throw new ForbiddenException('You cannot send back a dispatch you prepared yourself.');
    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryReport.updateMany({ where: { dispatchRef: ref }, data: { status: 'REJECTED', rejectionReason: dto.reason } });
      for (const r of reports) await this.audit.record({ userId: actor.id, action: 'delivery_report.reject', entity: 'DeliveryReport', entityId: r.id, afterValue: { dispatchRef: ref, status: 'REJECTED', reason: dto.reason }, reason: dto.reason }, tx);
    });
    const fresh = await this.dispatchReports(ref, actor);
    await this.afterReportStep(fresh, 'REJECTED', actor);
    return this.dispatchSummary(fresh, true);
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
