import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { getStandardBagWeightKg } from '../common/constants/bag-weight';
import { CancelPaddyTransferDto, ReceivePaddyTransferDto, SendPaddyTransferDto } from './dto/paddy-transfer.dto';
import { PaddyTransferView, TransferContext, TransferLine, bagsText, buildTransferView } from './paddy-transfer.util';

/** Beyond this many KG of difference between what was sent and what was counted in, the difference goes to be reviewed (the same rule as paddy arriving from a farm). */
const VARIANCE_TOLERANCE_KG = 5;
const isAdmin = (a: AuthenticatedUser) => a.roles.some((r: any) => r.roleCode === 'ADMIN');

/**
 * Paddy moving from one warehouse to another. Sending takes the bags out of the sender's stock into "in transit" at once (so nobody can promise them
 * twice); counting them in adds what really arrived to the receiver's stock and closes the in-transit bucket, with any difference written down for
 * review. Only bags are asked for: the kilograms are the bags at the standard bag weight (a Setting).
 */
@Injectable()
export class PaddyTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- reading
  /** Where the person may send from, what each place holds (size by size), and where it can go. */
  async places(actor: AuthenticatedUser) {
    const scope = scopedLocationIds(actor, 'WAREHOUSE');
    const all = await this.prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, location: true } });
    const mine = all.filter((w) => scope.isGlobal || scope.ids.includes(w.id));
    const grades = await this.prisma.paddyGrade.findMany({ where: { isActive: true }, orderBy: { label: 'asc' } });
    const out = [];
    for (const w of mine) {
      const have = await this.ledger.getBalancesForLocation('WAREHOUSE', w.id);
      out.push({ id: w.id, name: w.name, location: w.location ?? null, stock: grades.map((g) => ({ paddyGradeId: g.id, label: g.label, bags: have.find((b: any) => b.paddyGradeId === g.id)?.bagCount ?? 0 })) });
    }
    return { mine: out, others: all.map((w) => ({ id: w.id, name: w.name, location: w.location ?? null })) };
  }

  async list(actor: AuthenticatedUser): Promise<PaddyTransferView[]> {
    const scope = scopedLocationIds(actor, 'WAREHOUSE');
    if (!scope.isGlobal && scope.ids.length === 0) return [];
    const where = scope.isGlobal ? {} : { OR: [{ fromWarehouseId: { in: scope.ids } }, { toWarehouseId: { in: scope.ids } }] };
    const rows = await this.prisma.paddyTransfer.findMany({ where, orderBy: { sentAt: 'desc' }, take: 100 });
    return (await this.views(rows)).map((v) => ({ ...v, direction: scope.isGlobal ? 'BOTH' : scope.ids.includes(v.to.id) && scope.ids.includes(v.from.id) ? 'BOTH' : scope.ids.includes(v.to.id) ? 'IN' : 'OUT' }));
  }

  // ---------------------------------------------------------------- sending
  async send(dto: SendPaddyTransferDto, actor: AuthenticatedUser): Promise<PaddyTransferView> {
    assertScope(actor, 'WAREHOUSE', dto.fromWarehouseId, 'the warehouse sending the paddy');
    if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException('Choose a different warehouse to send the paddy to.');
    const [from, to] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: dto.fromWarehouseId } }),
      this.prisma.warehouse.findUnique({ where: { id: dto.toWarehouseId } }),
    ]);
    if (!from || !from.isActive) throw new BadRequestException('The warehouse sending the paddy was not found or is not in use.');
    if (!to || !to.isActive) throw new BadRequestException('The warehouse it is going to was not found or is not in use.');
    const ids = dto.lines.map((l) => l.paddyGradeId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A size is on the list twice. Put all of its bags on one line.');
    const grades = await this.prisma.paddyGrade.findMany({ where: { id: { in: ids } } });
    const have = await this.ledger.getBalancesForLocation('WAREHOUSE', from.id);
    const perBagKg = getStandardBagWeightKg();
    const lines = dto.lines.map((l) => {
      const g = grades.find((x) => x.id === l.paddyGradeId);
      if (!g || !g.isActive) throw new BadRequestException('One of the sizes was not found or is no longer in use.');
      const held = have.find((b: any) => b.paddyGradeId === g.id)?.bagCount ?? 0;
      if (l.bags > held) throw new BadRequestException({ message: `${from.name} has only ${held} bag${held === 1 ? '' : 's'} of ${g.label} to send.`, errorCode: 'INSUFFICIENT_STOCK' });
      return { paddyGradeId: g.id, gradeLabel: g.label, bags: l.bags, kg: l.bags * perBagKg };
    });
    let forRequest: any = null;
    if (dto.supplyRequestNumber) {
      forRequest = await this.prisma.supplyRequest.findFirst({ where: { requestNumber: dto.supplyRequestNumber } });
      if (!forRequest || forRequest.kind !== 'WAREHOUSE' || forRequest.status !== 'ASSIGNED' || forRequest.sourceWarehouseId !== from.id || forRequest.warehouseId !== to.id) {
        throw new BadRequestException('That paddy request is not waiting for this warehouse to send it to this warehouse.');
      }
      const already = await this.prisma.paddyTransfer.findFirst({ where: { supplyRequestNumber: dto.supplyRequestNumber, status: { not: 'CANCELLED' } } });
      if (already) throw new BadRequestException(`That request already has paddy on its way or delivered (${already.transferNumber}).`);
    }
    const totalBags = lines.reduce((n, l) => n + l.bags, 0);
    const row = await this.prisma.$transaction(async (tx) => {
      const transferNumber = await this.ledger.generateNumber(tx, 'PT', 'paddyTransfer');
      const created = await tx.paddyTransfer.create({
        data: {
          transferNumber, fromWarehouseId: from.id, toWarehouseId: to.id, lines: lines as any, totalBags, totalKg: totalBags * perBagKg,
          driverName: dto.driverName?.trim() || null, vehiclePlate: dto.vehiclePlate?.trim() || null, notes: dto.notes?.trim() || null,
          status: 'IN_TRANSIT', sentById: actor.id, supplyRequestNumber: dto.supplyRequestNumber ?? null,
        },
      });
      for (const l of lines) {
        await this.ledger.recordTransaction(tx, {
          type: 'PADDY_DISPATCHED', sourceLocationType: 'WAREHOUSE', sourceLocationId: from.id, destLocationType: 'EXTERNAL', destLocationId: created.id,
          paddyGradeId: l.paddyGradeId, quantityKg: l.kg, bagCount: l.bags, batchNumber: transferNumber, referenceDocument: transferNumber, userId: actor.id,
        });
        await this.ledger.adjustBalance(tx, { locationType: 'WAREHOUSE', locationId: from.id, paddyGradeId: l.paddyGradeId }, -l.kg, -l.bags);
        await this.ledger.adjustBalance(tx, { locationType: 'EXTERNAL', locationId: created.id, paddyGradeId: l.paddyGradeId }, l.kg, l.bags);
      }
      await this.audit.record({ userId: actor.id, action: 'paddy_transfer.send', entity: 'PaddyTransfer', entityId: created.id, afterValue: { transferNumber, from: from.name, to: to.name, lines, supplyRequestNumber: dto.supplyRequestNumber ?? null } }, tx);
      return created;
    });
    const view = await this.one(row);
    const detail = [bagsText(lines), [row.vehiclePlate, row.driverName].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
    await this.tell(await this.staffOf(to.id, ['WAREHOUSE_MANAGER', 'WAREHOUSE_SUPERVISOR']), row, `${from.name} is sending you ${totalBags} bag${totalBags === 1 ? '' : 's'}`, detail, actor);
    if (forRequest) await this.tell([forRequest.requestedById], { id: forRequest.id, requestNumber: forRequest.requestNumber, __supply: true }, `${from.name} has sent your paddy`, `${bagsText(lines)} · on the road to ${to.name}`, actor);
    return view;
  }

  // ---------------------------------------------------------------- receiving
  async receive(id: string, dto: ReceivePaddyTransferDto, actor: AuthenticatedUser): Promise<PaddyTransferView> {
    const row = await this.load(id);
    if (row.status !== 'IN_TRANSIT') throw new BadRequestException(row.status === 'RECEIVED' ? 'This paddy has already been counted in.' : 'This delivery was cancelled.');
    assertScope(actor, 'WAREHOUSE', row.toWarehouseId, 'the warehouse receiving the paddy');
    const sent = row.lines as unknown as (TransferLine & { kg: number })[];
    const counted = new Map<string, number>();
    for (const l of dto.lines) {
      if (!sent.some((s) => s.paddyGradeId === l.paddyGradeId)) throw new BadRequestException('That size was not on this delivery.');
      if (counted.has(l.paddyGradeId)) throw new BadRequestException('A size is on the list twice.');
      counted.set(l.paddyGradeId, l.bags);
    }
    for (const s of sent) {
      const got = counted.get(s.paddyGradeId) ?? 0;
      if (got > s.bags) throw new BadRequestException(`${s.gradeLabel}: ${s.bags} bag${s.bags === 1 ? ' was' : 's were'} sent, so ${got} cannot have arrived. Ask the sender to correct the delivery first.`);
    }
    const receivedLines: TransferLine[] = sent.map((s) => ({ paddyGradeId: s.paddyGradeId, gradeLabel: s.gradeLabel, bags: counted.get(s.paddyGradeId) ?? 0 }));
    const receivedBags = receivedLines.reduce((n, l) => n + l.bags, 0);
    const varianceBags = receivedBags - Number(row.totalBags);
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.paddyTransfer.updateMany({ where: { id, status: 'IN_TRANSIT' }, data: { status: 'RECEIVED', receivedById: actor.id, receivedAt: new Date(), receivedLines: receivedLines as any, varianceBags, receiveNote: dto.notes?.trim() || null } });
      if (claimed.count !== 1) throw new BadRequestException('This paddy has already been counted in.');
      for (const s of sent) {
        const got = counted.get(s.paddyGradeId) ?? 0;
        const perBag = s.bags > 0 ? s.kg / s.bags : getStandardBagWeightKg();
        const gotKg = got * perBag;
        if (got > 0) {
          await this.ledger.recordTransaction(tx, {
            type: 'PADDY_RECEIVED_AT_WAREHOUSE', sourceLocationType: 'EXTERNAL', sourceLocationId: row.id, destLocationType: 'WAREHOUSE', destLocationId: row.toWarehouseId,
            paddyGradeId: s.paddyGradeId, quantityKg: gotKg, bagCount: got, batchNumber: row.transferNumber, referenceDocument: row.transferNumber, userId: actor.id, reason: dto.notes,
          });
        }
        // Close the in-transit bucket entirely and credit the warehouse with exactly what arrived.
        await this.ledger.adjustBalance(tx, { locationType: 'EXTERNAL', locationId: row.id, paddyGradeId: s.paddyGradeId }, -s.kg, -s.bags);
        if (got > 0) await this.ledger.adjustBalance(tx, { locationType: 'WAREHOUSE', locationId: row.toWarehouseId, paddyGradeId: s.paddyGradeId }, gotKg, got);
        const diffKg = gotKg - s.kg;
        if (diffKg !== 0) {
          await this.ledger.recordTransaction(tx, {
            type: 'STOCK_ADJUSTMENT', sourceLocationType: 'EXTERNAL', sourceLocationId: row.id, destLocationType: 'WAREHOUSE', destLocationId: row.toWarehouseId,
            paddyGradeId: s.paddyGradeId, quantityKg: Math.abs(diffKg), batchNumber: row.transferNumber, referenceDocument: row.transferNumber, userId: actor.id,
            reason: `Delivery variance: ${s.bags} bag${s.bags === 1 ? '' : 's'} of ${s.gradeLabel} sent, ${got} counted in.`, approvalStatus: Math.abs(diffKg) > VARIANCE_TOLERANCE_KG ? 'PENDING' : 'APPROVED',
          });
        }
      }
      await this.audit.record({ userId: actor.id, action: 'paddy_transfer.receive', entity: 'PaddyTransfer', entityId: id, afterValue: { receivedLines, varianceBags } }, tx);
      return tx.paddyTransfer.findUnique({ where: { id } });
    });
    const view = await this.one(updated);
    const [fromStaff, toName] = [await this.staffOf(row.fromWarehouseId, ['WAREHOUSE_SUPERVISOR', 'WAREHOUSE_MANAGER']), view.to.name];
    await this.tell([row.sentById, ...fromStaff], row, `${toName} has counted in your paddy`, `${view.label}`, actor);
    if (row.supplyRequestNumber) {
      const req = await this.prisma.supplyRequest.findFirst({ where: { requestNumber: row.supplyRequestNumber } });
      if (req) await this.tell([req.requestedById], { id: req.id, requestNumber: req.requestNumber, __supply: true }, `Your paddy has arrived at ${toName}`, `${bagsText(receivedLines)}${varianceBags !== 0 ? ` · ${Math.abs(varianceBags)} bag${Math.abs(varianceBags) === 1 ? '' : 's'} ${varianceBags < 0 ? 'short' : 'extra'}` : ''}`, actor);
    }
    return view;
  }

  // ---------------------------------------------------------------- cancelling
  /** Sender (or the Administrator), before it is counted in: the bags go back into the sender's stock. */
  async cancel(id: string, dto: CancelPaddyTransferDto, actor: AuthenticatedUser): Promise<PaddyTransferView> {
    const row = await this.load(id);
    if (row.status !== 'IN_TRANSIT') throw new BadRequestException(row.status === 'RECEIVED' ? 'It has already been counted in, so it cannot be cancelled.' : 'This delivery is already cancelled.');
    assertScope(actor, 'WAREHOUSE', row.fromWarehouseId, 'the warehouse that sent the paddy');
    if (!isAdmin(actor) && row.sentById !== actor.id) throw new ForbiddenException('Only the person who sent this paddy can cancel it.');
    const sent = row.lines as unknown as (TransferLine & { kg: number })[];
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.paddyTransfer.updateMany({ where: { id, status: 'IN_TRANSIT' }, data: { status: 'CANCELLED', cancelReason: dto.reason?.trim() || null } });
      if (claimed.count !== 1) throw new BadRequestException('This delivery is no longer on the road.');
      for (const s of sent) {
        await this.ledger.recordTransaction(tx, {
          type: 'PADDY_RECEIVED_AT_WAREHOUSE', sourceLocationType: 'EXTERNAL', sourceLocationId: row.id, destLocationType: 'WAREHOUSE', destLocationId: row.fromWarehouseId,
          paddyGradeId: s.paddyGradeId, quantityKg: s.kg, bagCount: s.bags, batchNumber: row.transferNumber, referenceDocument: row.transferNumber, userId: actor.id, reason: `Cancelled before it arrived${dto.reason ? `: ${dto.reason}` : ''}.`,
        });
        await this.ledger.adjustBalance(tx, { locationType: 'EXTERNAL', locationId: row.id, paddyGradeId: s.paddyGradeId }, -s.kg, -s.bags);
        await this.ledger.adjustBalance(tx, { locationType: 'WAREHOUSE', locationId: row.fromWarehouseId, paddyGradeId: s.paddyGradeId }, s.kg, s.bags);
      }
      await this.audit.record({ userId: actor.id, action: 'paddy_transfer.cancel', entity: 'PaddyTransfer', entityId: id, afterValue: { reason: dto.reason ?? null } }, tx);
      return tx.paddyTransfer.findUnique({ where: { id } });
    });
    const view = await this.one(updated);
    await this.tell(await this.staffOf(row.toWarehouseId, ['WAREHOUSE_MANAGER', 'WAREHOUSE_SUPERVISOR']), row, `${view.from.name} cancelled the paddy it was sending you`, dto.reason ?? '', actor);
    return view;
  }

  // ---------------------------------------------------------------- helpers
  private async load(id: string) {
    const row = await this.prisma.paddyTransfer.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Delivery not found.');
    return row;
  }
  private async staffOf(warehouseId: string, roleCodes: string[]): Promise<string[]> {
    const people = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: { some: { role: { code: { in: roleCodes as any } }, OR: [{ scopes: { none: {} } }, { scopes: { some: { scopeType: 'GLOBAL' } } }, { scopes: { some: { scopeType: 'WAREHOUSE', scopeId: warehouseId } } }] } },
      },
      select: { id: true },
    });
    return people.map((p) => p.id);
  }
  private async tell(userIds: (string | null | undefined)[], row: any, title: string, body: string, actor: AuthenticatedUser) {
    const ids = [...new Set(userIds.filter((u): u is string => !!u && u !== actor.id))];
    if (ids.length === 0) return;
    // A person told about a paddy REQUEST opens the request; everyone else opens the delivery.
    await this.notifications?.notify(row.__supply
      ? { userIds: ids, type: 'supply.request', title, body, entityType: 'SupplyRequest', entityId: row.requestNumber }
      : { userIds: ids, type: 'paddy.transfer', title, body, entityType: 'PaddyTransfer', entityId: row.id });
  }
  private async one(row: any): Promise<PaddyTransferView> { return (await this.views([row]))[0]; }
  private async views(rows: any[]): Promise<PaddyTransferView[]> {
    if (rows.length === 0) return [];
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const [users, whs] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: uniq(rows.flatMap((r) => [r.sentById, r.receivedById])) } }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.warehouse.findMany({ where: { id: { in: uniq(rows.flatMap((r) => [r.fromWarehouseId, r.toWarehouseId])) } }, select: { id: true, name: true } }),
    ]);
    const ctx: TransferContext = { users: new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()])), warehouses: new Map(whs.map((w) => [w.id, w.name])) };
    return rows.map((r) => buildTransferView(r, ctx));
  }
}
