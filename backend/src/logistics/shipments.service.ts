import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { scopedLocationIds, assertScope } from '../common/utils/scope.util';
import { ReceiveDispatchDto } from './dto/receive-dispatch.dto';
import { ReceiveShipmentDto } from './dto/receive-shipment.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { SettingsService, settingNumber } from '../settings/settings.service';
import { estimateKg } from '../common/constants/bag-weight';
import { NotificationsService } from '../notifications/notifications.service';
import { bagsLabel } from './dispatch-request.util';

/** Anything beyond this many KG of variance is flagged for supervisor
 * attention rather than silently accepted - spec section 13: "Variance may
 * require approval." Configurable later via system_settings (Phase 12);
 * a fixed constant for now, documented rather than hidden. */

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
    @Optional() private readonly settings?: SettingsService,
    @Optional() private readonly notifications?: NotificationsService,
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
        deliveryReport: { include: { vehicle: true, driver: true, deliveryOrder: true } },
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

  private readonly log = new Logger(ShipmentsService.name);

  /** The Farm Supervisor who asked for this dispatch, and the farm's manager, are told it arrived, how many bags, and if the count differs. */
  private async afterReceive(shipment: any, got: { bags: number; requiresApproval: boolean }, actor: AuthenticatedUser) {
    try {
      const order = shipment?.deliveryReport?.deliveryOrder ?? null;
      const sent = Number(shipment?.expectedBags ?? 0);
      const diff = got.bags - sent;
      const warehouse = shipment?.warehouse?.name ?? 'the warehouse';
      const farm = shipment?.farm?.name ?? 'the farm';
      const farmManagers = await this.prisma.farmManager.findMany({ where: { farmId: shipment.farmId }, select: { userId: true } });
      const ids = [...new Set([order?.createdById, ...farmManagers.map((m) => m.userId)].filter((u): u is string => !!u && u !== actor.id))];
      if (ids.length === 0) return;
      await this.notifications?.notify({
        userIds: ids,
        type: 'shipment.received',
        title: `Arrived at ${warehouse}: ${order?.orderNumber ?? shipment.shipmentNumber}`,
        body: `${bagsLabel(got.bags)} of ${shipment?.paddyGrade?.label ?? 'paddy'} from ${farm} received${diff === 0 ? ', as sent.' : `, ${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'bag' : 'bags'} ${diff < 0 ? 'fewer' : 'more'} than the ${bagsLabel(sent)} that left.`}${got.requiresApproval ? ' The difference needs approval.' : ''}`,
        entityType: 'Shipment',
        entityId: shipment.id,
      });
    } catch (err) {
      this.log.warn(`The arrival notice for ${shipment?.shipmentNumber ?? 'a shipment'} did not complete: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Closes out the in-transit balance entirely and credits the destination
   * warehouse with the ACTUAL received quantity - the two need not match,
   * and the difference (spec section 13's "variance record") is captured
   * as an explicit STOCK_ADJUSTMENT ledger transaction with a reason, never
   * silently absorbed. All inside one DB transaction. */
  /**
   * The warehouse counts in a WHOLE truck at once: one count per size. Everything is checked before anything is changed; each size is then counted in
   * with the ordinary receive, so stock moves exactly as it always has. A size that was already counted in is left alone, so if something fails half
   * way, pressing it again finishes the rest instead of counting anything twice.
   */
  async receiveDispatch(ref: string, dto: ReceiveDispatchDto, actor: AuthenticatedUser) {
    const shipments = await this.prisma.shipment.findMany({ where: { deliveryReport: { OR: [{ dispatchRef: ref }, { reportNumber: ref }] } } as any, orderBy: { createdAt: 'asc' } });
    if (shipments.length === 0) throw new NotFoundException('No truck was found with that reference.');
    for (const s of shipments) assertScope(actor, 'WAREHOUSE', s.warehouseId, 'the warehouse this truck is going to');
    const todo = shipments.filter((s) => !s.receivedAt);
    if (todo.length === 0) throw new BadRequestException('This truck has already been counted in.');
    const counts = new Map(dto.lines.map((l) => [l.paddyGradeId, l.receivedBags]));
    if (counts.size !== dto.lines.length) throw new BadRequestException('A size is on the list twice.');
    for (const id of counts.keys()) if (!shipments.some((s) => s.paddyGradeId === id)) throw new BadRequestException('That size was not on this truck.');
    for (const s of todo) if (!counts.has(s.paddyGradeId)) throw new BadRequestException('Say how many bags arrived for every size on the truck.');
    const counted: string[] = [];
    for (const s of todo) {
      await this.receive(s.id, { receivedBags: counts.get(s.paddyGradeId) as number, receivedCondition: dto.receivedCondition, notes: dto.notes } as ReceiveShipmentDto, actor);
      counted.push(s.id);
    }
    return { dispatchRef: ref, countedIn: counted.length, alreadyCountedIn: shipments.length - todo.length };
  }

  async receive(id: string, dto: ReceiveShipmentDto, actor: AuthenticatedUser) {
    const shipment = await this.findById(id, actor);
    if (shipment.receivedAt) {
      throw new BadRequestException('This shipment has already been received.');
    }

    // No scale at the warehouse: the bags are counted, and the kilograms are worked out at the weight per bag the shipment left with, so a
    // shipment that arrives with every bag shows no variance, and a missing bag shows up as its share of the weight.
    const receivedKgEstimated = dto.receivedKg === undefined;
    const expectedKgPerBag = Number(shipment.expectedBags) > 0 ? Number(shipment.expectedKg) / Number(shipment.expectedBags) : undefined;
    const receivedKg = dto.receivedKg ?? estimateKg(dto.receivedBags, expectedKgPerBag);
    const varianceKg = receivedKg - Number(shipment.expectedKg);
    const toleranceKg = await settingNumber(this.settings, 'logistics.variance_tolerance_kg');
    const requiresApproval = Math.abs(varianceKg) > toleranceKg;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.shipment.update({
        where: { id },
        data: {
          receivedKg,
          receivedKgEstimated,
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
        quantityKg: receivedKg,
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
        receivedKg,
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
          reason: `Delivery variance: expected ${shipment.expectedKg} KG, received ${receivedKg} KG${receivedKgEstimated ? ' (worked out from the bags, not weighed)' : ''}.`,
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
          afterValue: { receivedKg: receivedKg, receivedBags: dto.receivedBags, varianceKg },
        },
        tx,
      );

      return result;
    });

    const fresh = await this.findById(updated.id, actor);
    await this.afterReceive(fresh, { bags: dto.receivedBags, requiresApproval }, actor);
    return fresh;
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
