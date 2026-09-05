import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreateDeliveryReportDto } from './dto/create-delivery-report.dto';
import { RejectDeliveryReportDto } from './dto/reject-delivery-report.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

const EDITABLE_STATUSES = ['DRAFT', 'REJECTED'] as const;

@Injectable()
export class DeliveryReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  /** There was no way to list delivery reports at all before this —
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

  /** Farm Manager prepares the delivery report against an existing order.
   * Still DRAFT — no inventory effect at all yet. */
  async create(dto: CreateDeliveryReportDto, actor: AuthenticatedUser) {
    const order = await this.prisma.deliveryOrder.findUnique({ where: { id: dto.deliveryOrderId } });
    if (!order) throw new NotFoundException('Delivery order not found.');
    assertScope(actor, 'FARM', order.farmId, 'this farm');

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
          actualKg: dto.actualKg,
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

    return this.findById(report.id, actor);
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

    return this.findById(updated.id, actor);
  }

  /** The transaction that actually moves stock: farm balance decreases,
   * an in-transit balance (LocationType.EXTERNAL, keyed by the new
   * Shipment's own id) increases by the same amount, a Shipment record is
   * created, and everything is audited — one DB transaction (spec section
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

    return this.findById(updated.id, actor);
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

    return this.findById(updated.id, actor);
  }
}
