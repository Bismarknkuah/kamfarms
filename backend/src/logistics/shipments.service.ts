import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { scopedLocationIds } from '../common/utils/scope.util';
import { ReceiveShipmentDto } from './dto/receive-shipment.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

/** Anything beyond this many KG of variance is flagged for supervisor
 * attention rather than silently accepted - spec section 13: "Variance may
 * require approval." Configurable later via system_settings (Phase 12);
 * a fixed constant for now, documented rather than hidden. */
const VARIANCE_TOLERANCE_KG = 5;

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  /** "On the Way" list for the Warehouse Supervisor / destination Warehouse
   * Manager (spec section 14). */
  async list(actor: AuthenticatedUser, filters: { warehouseId?: string; farmId?: string; inTransitOnly?: boolean }) {
    const where: Record<string, unknown> = {};

    // A Farm Manager (FARM-scoped, no warehouse scope at all) needs to
    // see their own farm's shipments to actually track what they
    // dispatched - the previous version checked WAREHOUSE scope only,
    // which meant a farm-only actor's ids list was always empty and
    // they got an unconditional empty result, never their own farm's
    // shipments. Real, confirmed bug: a Farm Manager could dispatch
    // paddy and then never be able to see it again. Fixed the same way
    // as every other dual-location entity this session - OR across
    // both scope types, not just one. The optional farmId/warehouseId
    // filters below are deliberately not scope-asserted on their own:
    // a Warehouse Manager narrowing by farmId (to see incoming
    // shipments from one specific farm) isn't a scope violation, it's
    // a legitimate filter within what the OR clause already allows  - 
    // asserting scope on the filter itself would incorrectly block
    // that, since they hold no farm scope at all.
    const farmScope = scopedLocationIds(actor, 'FARM');
    const warehouseScope = scopedLocationIds(actor, 'WAREHOUSE');
    const isGlobal = farmScope.isGlobal; // same value regardless of scope type passed in

    if (!isGlobal) {
      const or: Record<string, unknown>[] = [];
      if (farmScope.ids.length) or.push({ farmId: filters.farmId && farmScope.ids.includes(filters.farmId) ? filters.farmId : { in: farmScope.ids } });
      if (warehouseScope.ids.length) or.push({ warehouseId: filters.warehouseId && warehouseScope.ids.includes(filters.warehouseId) ? filters.warehouseId : { in: warehouseScope.ids } });
      if (or.length === 0) return [];
      where.OR = or;
    } else {
      if (filters.warehouseId) where.warehouseId = filters.warehouseId;
      if (filters.farmId) where.farmId = filters.farmId;
    }

    if (filters.inTransitOnly) where.receivedAt = null;

    return this.prisma.shipment.findMany({
      where,
      include: {
        farm: true,
        warehouse: true,
        paddyGrade: true,
        deliveryReport: { include: { vehicle: true, driver: true } },
        // receivedBy was missing entirely - meant no page could ever
        // show who actually received a shipment, or let a Warehouse
        // Manager see their own personal receiving activity.
        receivedBy: true,
      },
      orderBy: { departedAt: 'desc' },
    });
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: {
        farm: true,
        warehouse: true,
        paddyGrade: true,
        deliveryReport: { include: { vehicle: true, driver: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!shipment) throw new NotFoundException('Shipment not found.');

    // Same OR fix as list() - a Farm Manager needs to reach their own
    // farm's shipment by id (e.g. clicking through from a list), not
    // just a Warehouse Manager reaching theirs.
    const farmScope = scopedLocationIds(actor, 'FARM');
    const warehouseScope = scopedLocationIds(actor, 'WAREHOUSE');
    if (!farmScope.isGlobal) {
      const okViaFarm = farmScope.ids.includes(shipment.farmId);
      const okViaWarehouse = warehouseScope.ids.includes(shipment.warehouseId);
      if (!okViaFarm && !okViaWarehouse) {
        throw new ForbiddenException({ message: 'You are not authorized for this shipment.', errorCode: 'SCOPE_DENIED' });
      }
    }
    return shipment;
  }

  /** Closes out the in-transit balance entirely and credits the destination
   * warehouse with the ACTUAL received quantity - the two need not match,
   * and the difference (spec section 13's "variance record") is captured
   * as an explicit STOCK_ADJUSTMENT ledger transaction with a reason, never
   * silently absorbed. All inside one DB transaction. */
  async receive(id: string, dto: ReceiveShipmentDto, actor: AuthenticatedUser) {
    const shipment = await this.findById(id, actor);
    if (shipment.receivedAt) {
      throw new BadRequestException('This shipment has already been received.');
    }

    const varianceKg = dto.receivedKg - Number(shipment.expectedKg);
    const requiresApproval = Math.abs(varianceKg) > VARIANCE_TOLERANCE_KG;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.shipment.update({
        where: { id },
        data: {
          receivedKg: dto.receivedKg,
          receivedBags: dto.receivedBags,
          varianceKg,
          varianceRequiresApproval: requiresApproval,
          receivedCondition: dto.receivedCondition,
          receivedMoisturePercent: dto.receivedMoisturePercent,
          receivedAt: new Date(),
          receivedById: actor.id,
        },
      });

      await tx.deliveryReport.update({ where: { id: shipment.deliveryReportId }, data: { status: 'RECONCILED' } });

      // Close the in-transit bucket entirely (the full expected amount
      // leaves EXTERNAL, regardless of what actually arrived) and credit
      // the warehouse with exactly what arrived.
      await this.ledger.recordTransaction(tx, {
        type: 'PADDY_RECEIVED_AT_WAREHOUSE',
        sourceLocationType: LocationType.EXTERNAL,
        sourceLocationId: shipment.id,
        destLocationType: LocationType.WAREHOUSE,
        destLocationId: shipment.warehouseId,
        paddyGradeId: shipment.paddyGradeId,
        quantityKg: dto.receivedKg,
        bagCount: dto.receivedBags,
        batchNumber: shipment.shipmentNumber,
        referenceDocument: shipment.shipmentNumber,
        userId: actor.id,
        reason: dto.notes,
      });

      await this.ledger.adjustBalance(
        tx,
        { locationType: LocationType.EXTERNAL, locationId: shipment.id, paddyGradeId: shipment.paddyGradeId },
        -Number(shipment.expectedKg),
        -shipment.expectedBags,
      );
      await this.ledger.adjustBalance(
        tx,
        { locationType: LocationType.WAREHOUSE, locationId: shipment.warehouseId, paddyGradeId: shipment.paddyGradeId },
        dto.receivedKg,
        dto.receivedBags,
      );

      if (varianceKg !== 0) {
        await this.ledger.recordTransaction(tx, {
          type: 'STOCK_ADJUSTMENT',
          sourceLocationType: LocationType.EXTERNAL,
          sourceLocationId: shipment.id,
          destLocationType: LocationType.WAREHOUSE,
          destLocationId: shipment.warehouseId,
          paddyGradeId: shipment.paddyGradeId,
          quantityKg: Math.abs(varianceKg),
          batchNumber: shipment.shipmentNumber,
          referenceDocument: shipment.shipmentNumber,
          userId: actor.id,
          reason: `Delivery variance: expected ${shipment.expectedKg} KG, received ${dto.receivedKg} KG.`,
          approvalStatus: requiresApproval ? 'PENDING' : 'APPROVED',
        });
      }

      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          eventType: varianceKg === 0 ? 'RECEIVED' : 'RECEIVED_WITH_VARIANCE',
          notes: varianceKg !== 0 ? `Variance: ${varianceKg.toFixed(2)} KG` : dto.notes,
          createdById: actor.id,
        },
      });

      await this.audit.record(
        {
          userId: actor.id,
          action: 'shipment.receive',
          entity: 'Shipment',
          entityId: id,
          afterValue: { receivedKg: dto.receivedKg, receivedBags: dto.receivedBags, varianceKg },
        },
        tx,
      );

      return result;
    });

    return this.findById(updated.id, actor);
  }

  /** Section "trace the paddy rice" - a Farm Supervisor following up on
   * a dispatch can post exactly where it currently is, visible to
   * everyone who can already see this shipment (both the Farm Manager
   * who dispatched it and the destination Warehouse Manager, via the
   * same OR-scoped findById check above - not a new visibility rule,
   * just new data on an already-shared record). */
  async addLocationUpdate(id: string, notes: string, actor: AuthenticatedUser) {
    const shipment = await this.findById(id, actor);
    if (shipment.receivedAt) {
      throw new BadRequestException('This shipment has already been received - no further location updates needed.');
    }

    await this.prisma.shipmentEvent.create({
      data: { shipmentId: id, eventType: 'LOCATION_UPDATE', notes, createdById: actor.id },
    });
    await this.audit.record({ userId: actor.id, action: 'shipment.location_update', entity: 'Shipment', entityId: id, afterValue: { notes } });
    return this.findById(id, actor);
  }
}
