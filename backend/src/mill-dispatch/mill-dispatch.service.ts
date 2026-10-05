import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaddyMillingReceiptsService } from '../production/paddy-milling-receipts.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { getStandardBagWeightKg } from '../common/constants/bag-weight';
import { CreateMillDispatchDto, DecideMillDispatchDto, ReceiveMillDispatchDto, RejectMillDispatchDto } from './dto/mill-dispatch.dto';

export type Direction = 'TO_MILL' | 'TO_WAREHOUSE';
export type LineKind = 'PADDY' | 'PACKAGED_RICE' | 'BROKEN_RICE' | 'RICE_HULL';
export interface MillLine { key: string; kind: LineKind; paddyGradeId?: string | null; productId?: string | null; packagingSizeId?: string | null; label: string; bags: number; kg: number }
type Step = 'request' | 'approve' | 'receive';
type Place = 'WAREHOUSE' | 'MILLING_CENTER';

/** Beyond this many kilograms between what was sent and what was counted in, the difference goes to be reviewed (the same rule as paddy between warehouses). */
const VARIANCE_TOLERANCE_KG = 5;
const BROKEN = 'Broken Rice';
const HULL = 'Rice Hull';
const isAdmin = (a: AuthenticatedUser) => a.roles.some((r: any) => r.roleCode === 'ADMIN');
const rolesOf = (a: AuthenticatedUser) => a.roles.map((r: any) => r.roleCode as string);

/** Who does each step, in each direction, and which of their places the dispatch must be in. */
const RULES: Record<Direction, Record<Step, { roles: string[]; place: Place }>> = {
  // A warehouse sends paddy to its mill: the Warehouse Manager asks, the Warehouse Supervisor approves, the mill (Operations Officer) counts it in.
  TO_MILL: { request: { roles: ['WAREHOUSE_MANAGER'], place: 'WAREHOUSE' }, approve: { roles: ['WAREHOUSE_SUPERVISOR'], place: 'WAREHOUSE' }, receive: { roles: ['OPERATIONS_OFFICER'], place: 'MILLING_CENTER' } },
  // The mill sends finished products to its warehouse: the Operations Officer asks, the Operations Manager approves, the Warehouse Manager counts them in.
  TO_WAREHOUSE: { request: { roles: ['OPERATIONS_OFFICER'], place: 'MILLING_CENTER' }, approve: { roles: ['OPERATIONS_MANAGER'], place: 'MILLING_CENTER' }, receive: { roles: ['WAREHOUSE_MANAGER'], place: 'WAREHOUSE' } },
};
const WHO: Record<Direction, Record<Step, string>> = {
  TO_MILL: { request: 'Warehouse Manager', approve: 'Warehouse Supervisor', receive: 'Operations Officer' },
  TO_WAREHOUSE: { request: 'Operations Officer', approve: 'Operations Manager', receive: 'Warehouse Manager' },
};
const dispatchType = (l: MillLine) => (l.kind === 'PADDY' ? 'PADDY_DISPATCHED' : l.kind === 'PACKAGED_RICE' ? 'PACKAGED_RICE_DISPATCHED' : 'STOCK_TRANSFER');
const receiveType = (l: MillLine) => (l.kind === 'PADDY' ? 'PADDY_RECEIVED_AT_MILL' : 'STOCK_TRANSFER');
const unitOf = (l: MillLine) => (l.kind === 'BROKEN_RICE' || l.kind === 'RICE_HULL' ? 'kg' : 'bags');
const keyOf = (l: MillLine) => (l.kind === 'PADDY' ? { paddyGradeId: l.paddyGradeId } : l.kind === 'PACKAGED_RICE' ? { productId: l.productId, packagingSizeId: l.packagingSizeId } : { productId: l.productId, packagingSizeId: null });

export interface MillDispatchView {
  id: string; transferNumber: string; direction: Direction; status: string; label: string;
  warehouse: { id: string; name: string }; millingCenter: { id: string; name: string }; from: string; to: string;
  lines: { key: string; kind: LineKind; label: string; bags: number; kg: number; receivedBags: number | null; receivedKg: number | null }[];
  totalBags: number; totalKg: number; driverName: string | null; vehiclePlate: string | null; notes: string | null;
  requestedBy: string; requestedAt: string; approvedBy: string | null; approvedAt: string | null; decisionNote: string | null; receivedBy: string | null; receivedAt: string | null; receiveNote: string | null; varianceKg: number | null;
  approverRole: string; receiverRole: string;
  /** What the person looking may do about it right now. */
  canApprove: boolean; canReceive: boolean; canCancel: boolean;
  steps: { label: string; who: string | null; at: string | null; state: 'done' | 'current' | 'upcoming' | 'stopped' }[];
}

/**
 * Paddy sent from a warehouse to its milling center, and finished products (packaged rice, broken rice, rice hull) sent from the mill to its warehouse. Each needs
 * the supervisor's approval before anything leaves; stock leaves the source when it is approved ("on the way") and joins the destination when it is counted in.
 */
@Injectable()
export class MillDispatchService {
  private readonly log = new Logger(MillDispatchService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly millReceipts?: PaddyMillingReceiptsService,
  ) {}

  // ---------------------------------------------------------------- who may do what
  private may(actor: AuthenticatedUser, dir: Direction, step: Step, ids: { warehouseId: string; millingCenterId: string }): boolean {
    const rule = RULES[dir][step];
    if (!(isAdmin(actor) || rolesOf(actor).some((r) => rule.roles.includes(r)))) return false;
    const scope = scopedLocationIds(actor, rule.place);
    return scope.isGlobal || scope.ids.includes(rule.place === 'WAREHOUSE' ? ids.warehouseId : ids.millingCenterId);
  }
  private assertMay(actor: AuthenticatedUser, dir: Direction, step: Step, row: { warehouseId: string; millingCenterId: string }) {
    const rule = RULES[dir][step];
    if (!(isAdmin(actor) || rolesOf(actor).some((r) => rule.roles.includes(r)))) throw new ForbiddenException(`Only the ${WHO[dir][step]} ${step === 'request' ? 'asks for this' : step === 'approve' ? 'approves or refuses this' : 'counts this in'}.`);
    assertScope(actor, rule.place, rule.place === 'WAREHOUSE' ? row.warehouseId : row.millingCenterId, rule.place === 'WAREHOUSE' ? 'this warehouse' : 'this milling center');
  }

  // ---------------------------------------------------------------- the forms: where from, what is there to send
  async options(actor: AuthenticatedUser) {
    const roles = rolesOf(actor); const admin = isAdmin(actor);
    const out: { toMill: any; toWarehouse: any } = { toMill: null, toWarehouse: null };
    if (admin || roles.includes('WAREHOUSE_MANAGER')) {
      const sc = scopedLocationIds(actor, 'WAREHOUSE');
      const whs = await this.prisma.warehouse.findMany({ where: { isActive: true, ...(sc.isGlobal ? {} : { id: { in: sc.ids } }) } as any, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      const mills = await this.prisma.millingCenter.findMany({ where: { isActive: true, warehouseId: { in: whs.map((w) => w.id) } }, select: { id: true, name: true, warehouseId: true }, orderBy: { name: 'asc' } });
      const grades = await this.prisma.paddyGrade.findMany({ where: { isActive: true }, orderBy: { label: 'asc' } });
      const places = [];
      for (const w of whs) {
        const ms = mills.filter((m) => m.warehouseId === w.id); if (ms.length === 0) continue;
        const have = await this.ledger.getBalancesForLocation('WAREHOUSE', w.id);
        places.push({ warehouse: { id: w.id, name: w.name }, mills: ms.map((m) => ({ id: m.id, name: m.name })), paddy: grades.map((g) => ({ paddyGradeId: g.id, label: g.label, bags: have.find((b: any) => b.paddyGradeId === g.id)?.bagCount ?? 0 })) });
      }
      out.toMill = { places };
    }
    if (admin || roles.includes('OPERATIONS_OFFICER')) {
      const sc = scopedLocationIds(actor, 'MILLING_CENTER');
      const mills = await this.prisma.millingCenter.findMany({ where: { isActive: true, ...(sc.isGlobal ? {} : { id: { in: sc.ids } }) } as any, select: { id: true, name: true, warehouseId: true }, orderBy: { name: 'asc' } });
      const whs = await this.prisma.warehouse.findMany({ where: { id: { in: mills.map((m) => m.warehouseId) } }, select: { id: true, name: true } });
      const products = await this.prisma.product.findMany({ select: { id: true, name: true } });
      const sizes = await this.prisma.packagingSize.findMany({ select: { id: true, label: true } });
      const brokenId = products.find((p) => p.name === BROKEN)?.id ?? null; const hullId = products.find((p) => p.name === HULL)?.id ?? null;
      const list = [];
      for (const m of mills) {
        const have = (await this.ledger.getBalancesForLocation('MILLING_CENTER', m.id)) as any[];
        list.push({
          id: m.id, name: m.name, warehouse: { id: m.warehouseId, name: whs.find((w) => w.id === m.warehouseId)?.name ?? 'the warehouse' },
          packaged: have.filter((b) => b.productId && b.packagingSizeId && b.bagCount > 0).map((b) => ({ productId: b.productId, packagingSizeId: b.packagingSizeId, label: `${products.find((p) => p.id === b.productId)?.name ?? 'Rice'} ${sizes.find((s) => s.id === b.packagingSizeId)?.label ?? ''}`.trim(), bags: b.bagCount, kg: Number(b.quantityKg) })),
          broken: brokenId ? { productId: brokenId, kg: Number(have.find((b) => b.productId === brokenId && !b.packagingSizeId)?.quantityKg ?? 0) } : null,
          hull: hullId ? { productId: hullId, kg: Number(have.find((b) => b.productId === hullId && !b.packagingSizeId)?.quantityKg ?? 0) } : null,
        });
      }
      out.toWarehouse = { mills: list };
    }
    return out;
  }

  // ---------------------------------------------------------------- reading
  async list(actor: AuthenticatedUser): Promise<MillDispatchView[]> {
    const wide = isAdmin(actor) || rolesOf(actor).some((r) => ['MD', 'CEO'].includes(r));
    let where: Record<string, unknown> = {};
    if (!wide) {
      const wh = scopedLocationIds(actor, 'WAREHOUSE'); const mills = scopedLocationIds(actor, 'MILLING_CENTER');
      if (!wh.isGlobal && !mills.isGlobal) {
        const or: Record<string, unknown>[] = [];
        if (wh.ids.length) or.push({ warehouseId: { in: wh.ids } });
        if (mills.ids.length) or.push({ millingCenterId: { in: mills.ids } });
        if (or.length === 0) return [];
        where = { OR: or };
      }
    }
    const rows = await this.prisma.millTransfer.findMany({ where: where as any, orderBy: { requestedAt: 'desc' }, take: 150 });
    return this.views(rows, actor);
  }

  // ---------------------------------------------------------------- asking
  async request(dto: CreateMillDispatchDto, actor: AuthenticatedUser): Promise<MillDispatchView> {
    const center = await this.prisma.millingCenter.findUnique({ where: { id: dto.millingCenterId } });
    if (!center || !center.isActive) throw new BadRequestException('Milling center not found or not in use.');
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: center.warehouseId } });
    if (!warehouse || !warehouse.isActive) throw new BadRequestException('The mill\'s warehouse was not found or is not in use.');
    const ids = { warehouseId: warehouse.id, millingCenterId: center.id };
    this.assertMay(actor, dto.direction, 'request', ids);
    const lines = await this.buildLines(dto);
    const src = dto.direction === 'TO_MILL' ? { place: 'WAREHOUSE' as Place, id: warehouse.id, name: warehouse.name } : { place: 'MILLING_CENTER' as Place, id: center.id, name: center.name };
    for (const l of lines) this.assertEnough(l, await this.balance(this.prisma, src.place, src.id, l), src.name, false); // checked again when it is approved
    const totalBags = lines.reduce((n, l) => n + l.bags, 0); const totalKg = lines.reduce((n, l) => n + l.kg, 0);
    const row = await this.prisma.$transaction(async (tx) => {
      const transferNumber = await this.ledger.generateNumber(tx, 'MT', 'millTransfer');
      const created = await tx.millTransfer.create({
        data: { transferNumber, direction: dto.direction, warehouseId: warehouse.id, millingCenterId: center.id, lines: lines as any, totalBags, totalKg, driverName: dto.driverName?.trim() || null, vehiclePlate: dto.vehiclePlate?.trim() || null, notes: dto.notes?.trim() || null, status: 'PENDING_APPROVAL', requestedById: actor.id },
      });
      await this.audit.record({ userId: actor.id, action: 'mill_dispatch.request', entity: 'MillTransfer', entityId: created.id, afterValue: { transferNumber, direction: dto.direction, lines } }, tx);
      return created;
    });
    const what = this.wording(lines);
    await this.tell(await this.peopleAt(RULES[dto.direction].approve.roles, RULES[dto.direction].approve.place, RULES[dto.direction].approve.place === 'WAREHOUSE' ? warehouse.id : center.id), row,
      dto.direction === 'TO_MILL' ? `${warehouse.name} wants to send paddy to ${center.name}` : `${center.name} wants to send finished products to ${warehouse.name}`, `${what}. It needs your approval.`, actor);
    return (await this.views([row], actor))[0];
  }

  // ---------------------------------------------------------------- deciding
  /** The approver says yes: the stock leaves the source now and is "on the way". */
  async approve(id: string, dto: DecideMillDispatchDto, actor: AuthenticatedUser): Promise<MillDispatchView> {
    const row = await this.load(id);
    if (row.status !== 'PENDING_APPROVAL') throw new BadRequestException('This has already been decided.');
    this.assertMay(actor, row.direction as Direction, 'approve', row);
    if (row.requestedById === actor.id) throw new ForbiddenException('You cannot approve your own request. Someone else must.');
    const lines = row.lines as unknown as MillLine[]; const src = await this.source(row);
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.millTransfer.updateMany({ where: { id, status: 'PENDING_APPROVAL' }, data: { status: 'IN_TRANSIT', approvedById: actor.id, approvedAt: new Date(), decisionNote: dto.note?.trim() || null } });
      if (claimed.count !== 1) throw new BadRequestException('This has already been decided.');
      for (const l of lines) {
        this.assertEnough(l, await this.balance(tx, src.place, src.id, l), src.name, true);
        await this.ledger.recordTransaction(tx, { type: dispatchType(l) as any, sourceLocationType: src.place as any, sourceLocationId: src.id, destLocationType: 'EXTERNAL', destLocationId: id, ...keyOf(l), quantityKg: l.kg, bagCount: l.bags || undefined, batchNumber: row.transferNumber, referenceDocument: row.transferNumber, userId: actor.id } as any);
        await this.ledger.adjustBalance(tx, { locationType: src.place as any, locationId: src.id, ...keyOf(l) } as any, -l.kg, -l.bags);
        await this.ledger.adjustBalance(tx, { locationType: 'EXTERNAL', locationId: id, ...keyOf(l) } as any, l.kg, l.bags);
      }
      await this.audit.record({ userId: actor.id, action: 'mill_dispatch.approve', entity: 'MillTransfer', entityId: id, afterValue: { status: 'IN_TRANSIT' } }, tx);
      return tx.millTransfer.findUnique({ where: { id } });
    });
    const n = await this.names(row); const dest = row.direction === 'TO_MILL' ? n.mill : n.warehouse;
    await this.tell([row.requestedById], row, 'Your dispatch was approved', `${this.wording(lines)} is on the way to ${dest}.`, actor);
    const receive = RULES[row.direction as Direction].receive;
    await this.tell(await this.peopleAt(receive.roles, receive.place, receive.place === 'WAREHOUSE' ? row.warehouseId : row.millingCenterId), row, `${this.wording(lines)} is on the way to ${dest}`, 'Count it in when it arrives.', actor);
    return (await this.views([updated], actor))[0];
  }

  async reject(id: string, dto: RejectMillDispatchDto, actor: AuthenticatedUser): Promise<MillDispatchView> {
    const row = await this.load(id);
    if (row.status !== 'PENDING_APPROVAL') throw new BadRequestException('This has already been decided.');
    this.assertMay(actor, row.direction as Direction, 'approve', row);
    if (row.requestedById === actor.id) throw new ForbiddenException('You cannot decide your own request. Someone else must.');
    const claimed = await this.prisma.millTransfer.updateMany({ where: { id, status: 'PENDING_APPROVAL' }, data: { status: 'REJECTED', approvedById: actor.id, approvedAt: new Date(), decisionNote: dto.reason.trim() } });
    if (claimed.count !== 1) throw new BadRequestException('This has already been decided.');
    await this.audit.record({ userId: actor.id, action: 'mill_dispatch.reject', entity: 'MillTransfer', entityId: id, afterValue: { status: 'REJECTED', reason: dto.reason } });
    await this.tell([row.requestedById], row, 'Your dispatch was not approved', dto.reason.trim(), actor);
    return (await this.views([await this.load(id)], actor))[0];
  }

  /** Before it is approved, the person who asked (or the approver) may cancel it. Once it is on the way only the approver may, and the stock goes back. */
  async cancel(id: string, dto: DecideMillDispatchDto, actor: AuthenticatedUser): Promise<MillDispatchView> {
    const row = await this.load(id);
    if (!['PENDING_APPROVAL', 'IN_TRANSIT'].includes(row.status)) throw new BadRequestException('This can no longer be cancelled.');
    const dir = row.direction as Direction; const approver = this.may(actor, dir, 'approve', row);
    if (row.status === 'PENDING_APPROVAL' ? !(row.requestedById === actor.id || approver) : !approver) throw new ForbiddenException(row.status === 'PENDING_APPROVAL' ? 'Only the person who asked, or the one who approves, may cancel this.' : 'Once it is on the way, only the one who approves may cancel it.');
    const lines = row.lines as unknown as MillLine[]; const src = await this.source(row); const wasOnTheWay = row.status === 'IN_TRANSIT';
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.millTransfer.updateMany({ where: { id, status: row.status as any }, data: { status: 'CANCELLED', decisionNote: dto.note?.trim() || null } });
      if (claimed.count !== 1) throw new BadRequestException('This has already changed.');
      if (wasOnTheWay) {
        for (const l of lines) {
          await this.ledger.recordTransaction(tx, { type: 'STOCK_TRANSFER', sourceLocationType: 'EXTERNAL', sourceLocationId: id, destLocationType: src.place as any, destLocationId: src.id, ...keyOf(l), quantityKg: l.kg, bagCount: l.bags || undefined, batchNumber: row.transferNumber, referenceDocument: row.transferNumber, userId: actor.id, reason: `Cancelled before it arrived${dto.note ? `: ${dto.note}` : ''}.` } as any);
          await this.ledger.adjustBalance(tx, { locationType: 'EXTERNAL', locationId: id, ...keyOf(l) } as any, -l.kg, -l.bags);
          await this.ledger.adjustBalance(tx, { locationType: src.place as any, locationId: src.id, ...keyOf(l) } as any, l.kg, l.bags);
        }
      }
      await this.audit.record({ userId: actor.id, action: 'mill_dispatch.cancel', entity: 'MillTransfer', entityId: id, afterValue: { status: 'CANCELLED' } }, tx);
    });
    const others = [row.requestedById, row.approvedById].filter((x): x is string => !!x);
    await this.tell(others, row, 'A dispatch was cancelled', `${this.wording(lines)}${dto.note ? `: ${dto.note}` : ''}`, actor);
    return (await this.views([await this.load(id)], actor))[0];
  }

  // ---------------------------------------------------------------- counting in
  async receive(id: string, dto: ReceiveMillDispatchDto, actor: AuthenticatedUser): Promise<MillDispatchView> {
    const row = await this.load(id);
    if (row.status !== 'IN_TRANSIT') throw new BadRequestException(row.status === 'RECEIVED' ? 'This has already been counted in.' : 'This is not on the way.');
    const dir = row.direction as Direction;
    this.assertMay(actor, dir, 'receive', row);
    const lines = row.lines as unknown as MillLine[];
    const given = new Map<string, { bags?: number; kg?: number }>();
    for (const l of dto.lines) { if (given.has(l.key)) throw new BadRequestException('An item is on the list twice.'); if (!lines.some((x) => x.key === l.key)) throw new BadRequestException('That item was not on this dispatch.'); given.set(l.key, l); }
    const counted = lines.map((l) => {
      const g = given.get(l.key); if (!g) throw new BadRequestException('Say how much arrived of every item.');
      if (unitOf(l) === 'kg') {
        if (g.kg === undefined) throw new BadRequestException(`Say how many kilograms of ${l.label} arrived.`);
        if (g.kg > l.kg + 0.001) throw new BadRequestException(`${l.label}: ${l.kg} kg were sent, so ${g.kg} kg cannot have arrived. Ask the sender to correct it first.`);
        return { key: l.key, bags: 0, kg: g.kg };
      }
      if (g.bags === undefined) throw new BadRequestException(`Say how many bags of ${l.label} arrived.`);
      if (g.bags > l.bags) throw new BadRequestException(`${l.label}: ${l.bags} bag${l.bags === 1 ? ' was' : 's were'} sent, so ${g.bags} cannot have arrived. Ask the sender to correct it first.`);
      return { key: l.key, bags: g.bags, kg: l.bags > 0 ? (g.bags * l.kg) / l.bags : 0 };
    });
    const dest = { place: (dir === 'TO_MILL' ? 'MILLING_CENTER' : 'WAREHOUSE') as Place, id: dir === 'TO_MILL' ? row.millingCenterId : row.warehouseId };
    const varianceKg = counted.reduce((n, c, i) => n + (c.kg - lines[i].kg), 0);
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.millTransfer.updateMany({ where: { id, status: 'IN_TRANSIT' }, data: { status: 'RECEIVED', receivedById: actor.id, receivedAt: new Date(), receivedLines: counted as any, receiveNote: dto.notes?.trim() || null, varianceKg } });
      if (claimed.count !== 1) throw new BadRequestException('This has already been counted in.');
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]; const c = counted[i];
        if (c.kg > 0 || c.bags > 0) {
          await this.ledger.recordTransaction(tx, { type: receiveType(l) as any, sourceLocationType: 'EXTERNAL', sourceLocationId: id, destLocationType: dest.place as any, destLocationId: dest.id, ...keyOf(l), quantityKg: c.kg, bagCount: c.bags || undefined, batchNumber: row.transferNumber, referenceDocument: row.transferNumber, userId: actor.id, reason: dto.notes } as any);
        }
        // Close the in-transit bucket completely and credit the destination with exactly what arrived.
        await this.ledger.adjustBalance(tx, { locationType: 'EXTERNAL', locationId: id, ...keyOf(l) } as any, -l.kg, -l.bags);
        if (c.kg > 0 || c.bags > 0) await this.ledger.adjustBalance(tx, { locationType: dest.place as any, locationId: dest.id, ...keyOf(l) } as any, c.kg, c.bags);
        const diff = c.kg - l.kg;
        if (Math.abs(diff) > 0.001) {
          await this.ledger.recordTransaction(tx, { type: 'STOCK_ADJUSTMENT', sourceLocationType: 'EXTERNAL', sourceLocationId: id, destLocationType: dest.place as any, destLocationId: dest.id, ...keyOf(l), quantityKg: Math.abs(diff), batchNumber: row.transferNumber, referenceDocument: row.transferNumber, userId: actor.id, reason: `Dispatch difference: ${l.kind === 'PADDY' || l.kind === 'PACKAGED_RICE' ? `${l.bags} bags of ${l.label} sent, ${c.bags} counted in` : `${l.kg} kg of ${l.label} sent, ${c.kg} kg counted in`}.`, approvalStatus: Math.abs(diff) > VARIANCE_TOLERANCE_KG ? 'PENDING' : 'APPROVED' } as any);
        }
      }
      await this.audit.record({ userId: actor.id, action: 'mill_dispatch.receive', entity: 'MillTransfer', entityId: id, afterValue: { counted, varianceKg } }, tx);
      return tx.millTransfer.findUnique({ where: { id } });
    });
    // The mill's own record of paddy received (the one the Production page keeps): a log only, so a failure here never undoes the count.
    if (dir === 'TO_MILL' && this.millReceipts) {
      try {
        const paddy = lines.map((l, i) => ({ paddyGradeId: l.paddyGradeId as string, bagCount: counted[i].bags })).filter((x) => x.bagCount > 0);
        if (paddy.length > 0) await this.millReceipts.create({ millingCenterId: row.millingCenterId, date: new Date().toISOString().slice(0, 10), lines: paddy, notes: `Dispatch ${row.transferNumber}${dto.notes ? `: ${dto.notes}` : ''}` } as any, actor);
      } catch (e) { this.log.warn(`The mill's received-paddy record for ${row.transferNumber} could not be written: ${(e as Error).message}`); }
    }
    const n = await this.names(row); const where = dir === 'TO_MILL' ? n.mill : n.warehouse;
    await this.tell([row.requestedById, row.approvedById], row, `${where} has counted in your dispatch`, `${this.wording(lines)}${Math.abs(varianceKg) > 0.001 ? `. ${varianceKg < 0 ? 'Less' : 'More'} than sent arrived: that has been written down for review.` : ': all of it arrived.'}`, actor);
    return (await this.views([updated], actor))[0];
  }

  // ---------------------------------------------------------------- helpers
  private async load(id: string) {
    const row = await this.prisma.millTransfer.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Dispatch not found.');
    return row;
  }
  private async names(row: { warehouseId: string; millingCenterId: string }) {
    const [w, m] = await Promise.all([this.prisma.warehouse.findUnique({ where: { id: row.warehouseId } }), this.prisma.millingCenter.findUnique({ where: { id: row.millingCenterId } })]);
    return { warehouse: w?.name ?? 'the warehouse', mill: m?.name ?? 'the mill' };
  }
  /** Where the stock comes from: the warehouse when paddy goes to the mill, the mill when finished products go to the warehouse. */
  private async source(row: { direction: string; warehouseId: string; millingCenterId: string }) {
    const n = await this.names(row);
    return row.direction === 'TO_MILL' ? { place: 'WAREHOUSE' as Place, id: row.warehouseId, name: n.warehouse } : { place: 'MILLING_CENTER' as Place, id: row.millingCenterId, name: n.mill };
  }
  private async balance(db: any, place: Place, id: string, l: MillLine) {
    const b = await this.ledger.getBalance(db, { locationType: place as any, locationId: id, ...keyOf(l) } as any);
    return { bags: b?.bagCount ?? 0, kg: Number(b?.quantityKg ?? 0) };
  }
  private assertEnough(l: MillLine, have: { bags: number; kg: number }, where: string, atApproval: boolean) {
    const perBag = l.bags > 0 ? l.kg / l.bags : 0;
    const available = unitOf(l) === 'kg' ? have.kg : Math.min(have.bags, perBag > 0 ? Math.floor((have.kg + 0.001) / perBag) : have.bags);
    const need = unitOf(l) === 'kg' ? l.kg : l.bags;
    if (need > available + 0.001) {
      const unit = unitOf(l) === 'kg' ? 'kg' : available === 1 ? 'bag' : 'bags';
      throw new BadRequestException({ message: `${where} ${atApproval ? 'now ' : ''}has only ${unitOf(l) === 'kg' ? Math.floor(available * 100) / 100 : available} ${unit} of ${l.label}${atApproval ? ', so this cannot be approved yet' : ' to send'}.`, errorCode: 'INSUFFICIENT_STOCK' });
    }
  }
  private wording(lines: MillLine[]) { return lines.map((l) => (unitOf(l) === 'kg' ? `${l.label}: ${l.kg} kg` : `${l.label}: ${l.bags}`)).join(', '); }

  private async buildLines(dto: CreateMillDispatchDto): Promise<MillLine[]> {
    const lines: MillLine[] = []; const seen = new Set<string>();
    const add = (l: MillLine) => { if (seen.has(l.key)) throw new BadRequestException('An item is on the list twice. Put all of it on one line.'); seen.add(l.key); lines.push(l); };
    const perBag = getStandardBagWeightKg();
    for (const l of dto.lines) {
      if (dto.direction === 'TO_MILL' && l.kind !== 'PADDY') throw new BadRequestException('Only paddy is sent to the mill.');
      if (dto.direction === 'TO_WAREHOUSE' && l.kind === 'PADDY') throw new BadRequestException('Finished products (packaged rice, broken rice, rice hull) go to the warehouse; paddy goes to the mill.');
      if (l.kind === 'PADDY') {
        if (!l.paddyGradeId || !l.bags) throw new BadRequestException('Give the size of paddy and the number of bags.');
        const g = await this.prisma.paddyGrade.findUnique({ where: { id: l.paddyGradeId } });
        if (!g || !g.isActive) throw new BadRequestException('One of the sizes was not found or is no longer in use.');
        add({ key: `PADDY:${g.id}`, kind: 'PADDY', paddyGradeId: g.id, label: g.label, bags: l.bags, kg: l.bags * perBag });
      } else if (l.kind === 'PACKAGED_RICE') {
        if (!l.productId || !l.packagingSizeId || !l.bags) throw new BadRequestException('Give the rice, its pack size and the number of bags.');
        const [p, s] = await Promise.all([this.prisma.product.findUnique({ where: { id: l.productId } }), this.prisma.packagingSize.findUnique({ where: { id: l.packagingSizeId } })]);
        if (!p || !s) throw new BadRequestException('That rice or pack size was not found.');
        add({ key: `PACKAGED_RICE:${p.id}:${s.id}`, kind: 'PACKAGED_RICE', productId: p.id, packagingSizeId: s.id, label: `${p.name} ${s.label}`.trim(), bags: l.bags, kg: l.bags * Number(s.sizeKg) });
      } else {
        if (!l.kg) throw new BadRequestException(`Give the kilograms of ${l.kind === 'BROKEN_RICE' ? 'broken rice' : 'rice hull'}.`);
        const name = l.kind === 'BROKEN_RICE' ? BROKEN : HULL;
        const p = await this.prisma.product.findFirst({ where: { name } });
        if (!p) throw new BadRequestException(`There is no ${name.toLowerCase()} to send yet: it is created when the first production run is approved.`);
        add({ key: l.kind, kind: l.kind, productId: p.id, label: l.kind === 'BROKEN_RICE' ? 'Broken rice' : 'Rice hull', bags: 0, kg: l.kg });
      }
    }
    return lines;
  }

  private async peopleAt(roleCodes: string[], scopeType: string, scopeId: string): Promise<string[]> {
    const people = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { code: { in: roleCodes as any } }, OR: [{ scopes: { none: {} } }, { scopes: { some: { scopeType: 'GLOBAL' } } }, { scopes: { some: { scopeType: scopeType as any, scopeId } } }] } } },
      select: { id: true },
    });
    return people.map((p) => p.id);
  }
  private async tell(userIds: (string | null | undefined)[], row: any, title: string, body: string, actor: AuthenticatedUser) {
    const ids = [...new Set(userIds.filter((u): u is string => !!u && u !== actor.id))];
    if (ids.length > 0) await this.notifications?.notify({ userIds: ids, type: 'mill.dispatch', title, body, entityType: 'MillDispatch', entityId: row.id });
  }

  private async views(rows: any[], actor: AuthenticatedUser): Promise<MillDispatchView[]> {
    if (rows.length === 0) return [];
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const [users, whs, mills] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: uniq(rows.flatMap((r) => [r.requestedById, r.approvedById, r.receivedById])) } }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.warehouse.findMany({ where: { id: { in: uniq(rows.map((r) => r.warehouseId)) } }, select: { id: true, name: true } }),
      this.prisma.millingCenter.findMany({ where: { id: { in: uniq(rows.map((r) => r.millingCenterId)) } }, select: { id: true, name: true } }),
    ]);
    const who = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()])); const wn = new Map(whs.map((w) => [w.id, w.name])); const mn = new Map(mills.map((m) => [m.id, m.name]));
    return rows.map((r) => {
      const dir = r.direction as Direction; const lines = r.lines as MillLine[]; const got = (r.receivedLines ?? null) as { key: string; bags: number; kg: number }[] | null;
      const warehouse = wn.get(r.warehouseId) ?? 'the warehouse'; const mill = mn.get(r.millingCenterId) ?? 'the mill'; const to = dir === 'TO_MILL' ? mill : warehouse;
      const v = Number(r.varianceKg ?? 0);
      const label = r.status === 'PENDING_APPROVAL' ? `Waiting for the ${WHO[dir].approve} to approve` : r.status === 'IN_TRANSIT' ? `On the way to ${to}` : r.status === 'RECEIVED' ? `Received at ${to}${Math.abs(v) > 0.001 ? (v < 0 ? ': less than sent arrived' : ': more than sent arrived') : ''}` : r.status === 'REJECTED' ? 'Not approved' : 'Cancelled';
      const stopped = r.status === 'REJECTED' || r.status === 'CANCELLED';
      const st = (done: boolean, current: boolean) => (stopped && !done ? 'stopped' : done ? 'done' : current ? 'current' : 'upcoming') as 'done' | 'current' | 'upcoming' | 'stopped';
      const approved = ['IN_TRANSIT', 'RECEIVED'].includes(r.status) || (r.status === 'CANCELLED' && !!r.approvedAt);
      return {
        id: r.id, transferNumber: r.transferNumber, direction: dir, status: r.status, label, warehouse: { id: r.warehouseId, name: warehouse }, millingCenter: { id: r.millingCenterId, name: mill },
        from: dir === 'TO_MILL' ? warehouse : mill, to,
        lines: lines.map((l) => { const g = got?.find((x) => x.key === l.key); return { key: l.key, kind: l.kind, label: l.label, bags: l.bags, kg: l.kg, receivedBags: g ? g.bags : null, receivedKg: g ? g.kg : null }; }),
        totalBags: Number(r.totalBags), totalKg: Number(r.totalKg), driverName: r.driverName ?? null, vehiclePlate: r.vehiclePlate ?? null, notes: r.notes ?? null,
        requestedBy: who.get(r.requestedById) ?? '', requestedAt: new Date(r.requestedAt).toISOString(), approvedBy: who.get(r.approvedById) ?? null, approvedAt: r.approvedAt ? new Date(r.approvedAt).toISOString() : null,
        decisionNote: r.decisionNote ?? null, receivedBy: who.get(r.receivedById) ?? null, receivedAt: r.receivedAt ? new Date(r.receivedAt).toISOString() : null, receiveNote: r.receiveNote ?? null, varianceKg: r.varianceKg === null || r.varianceKg === undefined ? null : v,
        approverRole: WHO[dir].approve, receiverRole: WHO[dir].receive,
        canApprove: r.status === 'PENDING_APPROVAL' && r.requestedById !== actor.id && this.may(actor, dir, 'approve', r),
        canReceive: r.status === 'IN_TRANSIT' && this.may(actor, dir, 'receive', r),
        canCancel: r.status === 'PENDING_APPROVAL' ? r.requestedById === actor.id || this.may(actor, dir, 'approve', r) : r.status === 'IN_TRANSIT' && this.may(actor, dir, 'approve', r),
        steps: [
          { label: 'Asked', who: who.get(r.requestedById) ?? null, at: new Date(r.requestedAt).toISOString(), state: 'done' },
          { label: r.status === 'REJECTED' ? 'Not approved' : 'Approved', who: who.get(r.approvedById) ?? null, at: r.approvedAt ? new Date(r.approvedAt).toISOString() : null, state: r.status === 'REJECTED' ? 'stopped' : st(approved, r.status === 'PENDING_APPROVAL') },
          { label: 'On the way', who: null, at: r.status === 'IN_TRANSIT' || r.status === 'RECEIVED' ? (r.approvedAt ? new Date(r.approvedAt).toISOString() : null) : null, state: st(r.status === 'RECEIVED', r.status === 'IN_TRANSIT') },
          { label: `Counted in at the ${dir === 'TO_MILL' ? 'mill' : 'warehouse'}`, who: who.get(r.receivedById) ?? null, at: r.receivedAt ? new Date(r.receivedAt).toISOString() : null, state: st(r.status === 'RECEIVED', false) },
        ],
      };
    });
  }
}
