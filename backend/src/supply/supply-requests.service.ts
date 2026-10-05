import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliveryOrdersService } from '../logistics/delivery-orders.service';
import { PaddyMillingReceiptsService } from '../production/paddy-milling-receipts.service';
import { longDate } from '../logistics/dispatch-request.util';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { PERMISSIONS } from '../common/constants/permissions';
import { AssignSupplyRequestDto, CreateSupplyRequestDto, DeclineSupplyRequestDto, ForwardSupplyRequestDto, ReadySupplyRequestDto, ReceivedAtMillDto } from './dto/supply-request.dto';
import { SupplyContext, SupplyLine, SupplyView, buildSupplyView, sizesText } from './supply-board.util';

const isAdmin = (a: AuthenticatedUser) => a.roles.some((r: any) => r.roleCode === 'ADMIN');
const holds = (a: AuthenticatedUser, code: string) => !!a.permissionCodes?.has(code);
const rolesOf = (a: AuthenticatedUser) => a.roles.map((r: any) => r.roleCode as string);
/** Who sends a request on: a warehouse's request goes through its Warehouse Supervisor; a mill's through the Operations Manager. */
const mayReview = (a: AuthenticatedUser, kind: string) => isAdmin(a) || rolesOf(a).includes(kind === 'WAREHOUSE' ? 'WAREHOUSE_SUPERVISOR' : 'OPERATIONS_MANAGER');
/** Who answers it: a warehouse's request by the Farm Director (from the farms' stock); a mill's by the Warehouse Supervisor (from the warehouse's stock). */
const maySupply = (a: AuthenticatedUser, kind: string) => isAdmin(a) || rolesOf(a).includes(kind === 'WAREHOUSE' ? 'FARM_DIRECTOR' : 'WAREHOUSE_SUPERVISOR');

/**
 * Paddy requests, passed up the chain so each person only does their own part:
 *   a WAREHOUSE asks -> the Warehouse Supervisor sends it on -> the Farm Director checks the farms' stock and asks a farm manager to dispatch
 *     (from there the Dispatch desk tracks it to the warehouse);
 *   a MILLING CENTER asks -> the Operations Manager sends it on -> the Warehouse Supervisor of the mill's warehouse checks the stock and either
 *     says the paddy is ready, or asks the Farm Director for what is short (which starts the first chain for that warehouse).
 * Every hand-off gives the next person a short task and a notification, with a link to the request.
 */
@Injectable()
export class SupplyRequestsService {
  private readonly log = new Logger(SupplyRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: InventoryLedgerService,
    private readonly deliveryOrders: DeliveryOrdersService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly millReceipts?: PaddyMillingReceiptsService,
  ) {}

  // ---------------------------------------------------------------- who sees what
  private visibleWhere(actor: AuthenticatedUser): Record<string, unknown> | null {
    const codes = actor.roles.map((r: any) => r.roleCode as string);
    if (codes.some((c) => ['ADMIN', 'MD', 'CEO', 'AUDITOR'].includes(c))) return {};
    const clauses: Record<string, unknown>[] = [{ requestedById: actor.id }];
    if (codes.includes('FARM_DIRECTOR')) clauses.push({ kind: 'WAREHOUSE' });
    if (codes.includes('OPERATIONS_MANAGER')) clauses.push({ kind: 'MILL' });
    if (codes.includes('OPERATIONS_OFFICER')) {
      const m = scopedLocationIds(actor, 'MILLING_CENTER');
      clauses.push(m.isGlobal ? { kind: 'MILL' } : m.ids.length ? { kind: 'MILL', millingCenterId: { in: m.ids } } : { requestedById: actor.id });
    }
    // A Warehouse Supervisor sees everything for their warehouses (including the mill that draws from them, which they answer); a Warehouse
    // Manager sees their warehouse's own requests for paddy, not the mill's.
    if (codes.includes('WAREHOUSE_SUPERVISOR')) {
      const w = scopedLocationIds(actor, 'WAREHOUSE');
      if (w.isGlobal) return {};
      if (w.ids.length) clauses.push({ warehouseId: { in: w.ids } }, { sourceWarehouseId: { in: w.ids } });
    }
    if (codes.includes('WAREHOUSE_MANAGER')) {
      const w = scopedLocationIds(actor, 'WAREHOUSE');
      if (w.isGlobal) clauses.push({ kind: 'WAREHOUSE' });
      else if (w.ids.length) clauses.push({ kind: 'WAREHOUSE', warehouseId: { in: w.ids } });
    }
    return clauses.length === 1 ? clauses[0] : { OR: clauses };
  }

  async board(actor: AuthenticatedUser): Promise<SupplyView[]> {
    const where = this.visibleWhere(actor);
    if (where === null) return [];
    const rows = await this.prisma.supplyRequest.findMany({ where: where as any, orderBy: { createdAt: 'desc' }, take: 200 });
    return this.toViews(rows);
  }

  // ---------------------------------------------------------------- asking
  async create(dto: CreateSupplyRequestDto, actor: AuthenticatedUser) {
    let kind: 'WAREHOUSE' | 'MILL';
    let warehouseId: string;
    let millingCenterId: string | undefined;
    if (dto.millingCenterId) {
      const center = await this.prisma.millingCenter.findUnique({ where: { id: dto.millingCenterId } });
      if (!center || !center.isActive) throw new BadRequestException('Milling center not found or not in use.');
      assertScope(actor, 'MILLING_CENTER', center.id, 'this milling center');
      kind = 'MILL';
      warehouseId = center.warehouseId;
      millingCenterId = center.id;
    } else if (dto.warehouseId) {
      const wh = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
      if (!wh || !wh.isActive) throw new BadRequestException('Warehouse not found or not in use.');
      assertScope(actor, 'WAREHOUSE', wh.id, 'this warehouse');
      kind = 'WAREHOUSE';
      warehouseId = wh.id;
    } else {
      throw new BadRequestException('Choose the warehouse or the mill that needs the paddy.');
    }

    const ids = dto.lines.map((l) => l.paddyGradeId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A size is on the list twice. Put all of its bags on one line.');
    const grades = await this.prisma.paddyGrade.findMany({ where: { id: { in: ids } } });
    const lines: SupplyLine[] = dto.lines.map((l) => {
      const g = grades.find((x) => x.id === l.paddyGradeId);
      if (!g || !g.isActive) throw new BadRequestException('One of the sizes was not found or is no longer in use.');
      return { paddyGradeId: g.id, gradeLabel: g.label, bags: l.bagCount };
    });

    // Someone who is themselves the first reviewer (a Warehouse Supervisor asking for their warehouse, the Operations Manager asking for a mill)
    // does not send it to themselves first: it goes straight on.
    const selfReview = holds(actor, PERMISSIONS.SUPPLY_FORWARD);
    const row = await this.prisma.$transaction(async (tx) => {
      const requestNumber = await this.ledger.generateNumber(tx, 'SR', 'supplyRequest');
      const created = await tx.supplyRequest.create({
        data: {
          requestNumber, kind, warehouseId, millingCenterId, lines: lines as any, totalBags: lines.reduce((n, l) => n + l.bags, 0),
          neededBy: dto.neededBy ? new Date(dto.neededBy) : null, notes: dto.notes, requestedById: actor.id,
          status: selfReview ? 'FORWARDED' : 'SUBMITTED', ...(selfReview ? { forwardedById: actor.id, forwardedAt: new Date() } : {}),
        },
      });
      await this.audit.record({ userId: actor.id, action: 'supply_request.create', entity: 'SupplyRequest', entityId: created.id, afterValue: created }, tx);
      return created;
    });
    await this.afterStep(row, selfReview ? 'FORWARDED' : 'ASKED', actor);
    return this.one(row);
  }

  // ---------------------------------------------------------------- the first reviewer
  async forward(id: string, dto: ForwardSupplyRequestDto, actor: AuthenticatedUser) {
    const row = await this.load(id);
    if (row.status !== 'SUBMITTED') throw new BadRequestException('This request has already been sent on.');
    if (!mayReview(actor, row.kind)) throw new ForbiddenException('This request is waiting for someone else to send on.');
    if (row.kind === 'WAREHOUSE') assertScope(actor, 'WAREHOUSE', row.warehouseId, 'this warehouse');
    const updated = await this.prisma.supplyRequest.update({ where: { id }, data: { status: 'FORWARDED', forwardedById: actor.id, forwardedAt: new Date(), forwardNote: dto.note } });
    await this.audit.record({ userId: actor.id, action: 'supply_request.forward', entity: 'SupplyRequest', entityId: id, afterValue: { status: 'FORWARDED' } });
    await this.afterStep(updated, 'FORWARDED', actor);
    return this.one(updated);
  }

  /** Either side may decline, with a reason the person who asked will read. */
  async decline(id: string, dto: DeclineSupplyRequestDto, actor: AuthenticatedUser) {
    const row = await this.load(id);
    if (!['SUBMITTED', 'FORWARDED'].includes(row.status)) throw new BadRequestException('This request can no longer be declined.');
    const atFirst = row.status === 'SUBMITTED';
    if (atFirst) {
      if (!mayReview(actor, row.kind)) throw new ForbiddenException('This request is waiting for someone else to decide.');
      if (row.kind === 'WAREHOUSE') assertScope(actor, 'WAREHOUSE', row.warehouseId, 'this warehouse');
    } else {
      if (!maySupply(actor, row.kind)) throw new ForbiddenException('This request is waiting for someone else to decide.');
      if (row.kind === 'MILL') assertScope(actor, 'WAREHOUSE', row.warehouseId, 'this warehouse');
    }
    const updated = await this.prisma.supplyRequest.update({ where: { id }, data: { status: 'DECLINED', decidedById: actor.id, decidedAt: new Date(), decisionNote: dto.reason } });
    await this.audit.record({ userId: actor.id, action: 'supply_request.decline', entity: 'SupplyRequest', entityId: id, afterValue: { status: 'DECLINED', reason: dto.reason }, reason: dto.reason });
    await this.afterStep(updated, 'DECLINED', actor);
    return this.one(updated);
  }

  // ---------------------------------------------------------------- the supplier side
  /** What each farm (or, for a mill, its warehouse) holds of the sizes asked for, so the decision is made on the stock, not on a guess. */
  async sources(id: string, actor: AuthenticatedUser) {
    const row = await this.load(id);
    if (!mayReview(actor, row.kind) && !maySupply(actor, row.kind)) throw new ForbiddenException('You do not decide where this paddy comes from.');
    const needs = row.lines as unknown as SupplyLine[];
    const rate = (balances: { paddyGradeId?: string | null; bagCount: number }[]) =>
      needs.map((n) => {
        const has = balances.find((b) => b.paddyGradeId === n.paddyGradeId)?.bagCount ?? 0;
        return { paddyGradeId: n.paddyGradeId, label: n.gradeLabel, needed: n.bags, has, enough: has >= n.bags };
      });
    if (row.kind === 'WAREHOUSE') {
      const farms = await this.prisma.farm.findMany({ where: { isActive: true }, include: { managers: { include: { user: true } } }, orderBy: { name: 'asc' } });
      const out = [];
      for (const f of farms) {
        const bySize = rate(await this.ledger.getBalancesForLocation('FARM', f.id));
        out.push({
          farmId: f.id, farmName: f.name, managers: (f.managers ?? []).map((m: any) => `${m.user?.firstName ?? ''} ${m.user?.lastName ?? ''}`.trim()).filter(Boolean),
          bySize, canCover: bySize.every((s) => s.enough), totalHas: bySize.reduce((n, s) => n + s.has, 0),
        });
      }
      out.sort((a, b) => Number(b.canCover) - Number(a.canCover) || b.totalHas - a.totalHas);
      const others = await this.prisma.warehouse.findMany({ where: { isActive: true, id: { not: row.warehouseId } }, orderBy: { name: 'asc' } });
      const warehouses = [];
      for (const w of others) {
        const bySize = rate(await this.ledger.getBalancesForLocation('WAREHOUSE', w.id));
        const totalHas = bySize.reduce((n, s) => n + s.has, 0);
        if (totalHas <= 0) continue;
        warehouses.push({ warehouseId: w.id, warehouseName: w.name, supervisors: (await this.peopleWith(['WAREHOUSE_SUPERVISOR'], w.id)).map((p: any) => `${p.firstName} ${p.lastName}`.trim()), bySize, canCover: bySize.every((s) => s.enough), totalHas });
      }
      warehouses.sort((a, b) => Number(b.canCover) - Number(a.canCover) || b.totalHas - a.totalHas);
      return { kind: 'WAREHOUSE' as const, farms: out, warehouses };
    }
    assertScope(actor, 'WAREHOUSE', row.warehouseId, 'this warehouse');
    const wh = await this.prisma.warehouse.findUnique({ where: { id: row.warehouseId } });
    const bySize = rate(await this.ledger.getBalancesForLocation('WAREHOUSE', row.warehouseId));
    return { kind: 'MILL' as const, warehouse: { id: row.warehouseId, name: wh?.name ?? 'the warehouse' }, bySize, canCover: bySize.every((s) => s.enough) };
  }

  /** Farm Director: this farm will send it. The farm manager is asked to dispatch (on the Dispatch desk), and the Dispatch desk tracks it from here. */
  async assign(id: string, dto: AssignSupplyRequestDto, actor: AuthenticatedUser) {
    const row = await this.load(id);
    if (row.kind !== 'WAREHOUSE') throw new BadRequestException('A mill request is answered by its warehouse, not by a farm.');
    if (row.status !== 'FORWARDED') throw new BadRequestException('This request is not waiting for a farm to be chosen.');
    if (!maySupply(actor, 'WAREHOUSE')) throw new ForbiddenException('Only the Farm Director chooses the farm.');
    if (!!dto.sourceFarmId === !!dto.sourceWarehouseId) throw new BadRequestException('Choose one farm or one warehouse to send it.');
    if (dto.sourceWarehouseId) return this.assignToWarehouse(row, dto, actor);
    assertScope(actor, 'FARM', dto.sourceFarmId as string, 'this farm');
    const n = await this.names(row);
    const lines = row.lines as unknown as SupplyLine[];
    const needBy = row.neededBy ? new Date(row.neededBy) : new Date(Date.now() + 2 * 86400000);
    // The farm's own stock is checked here, size by size: asking a farm for paddy it does not have fails with the shortfall named.
    const made = await this.deliveryOrders.createRequest(
      { farmId: dto.sourceFarmId as string, destinationWarehouseId: row.warehouseId, requestedDate: needBy.toISOString().slice(0, 10), notes: dto.note ? dto.note.slice(0, 480) : undefined, lines: lines.map((l) => ({ paddyGradeId: l.paddyGradeId, bagCount: l.bags })) } as any,
      actor,
    );
    const updated = await this.prisma.supplyRequest.update({ where: { id }, data: { status: 'ASSIGNED', sourceFarmId: dto.sourceFarmId, dispatchRequestRef: made.requestRef, decidedById: actor.id, decidedAt: new Date(), decisionNote: dto.note } });
    await this.audit.record({ userId: actor.id, action: 'supply_request.assign', entity: 'SupplyRequest', entityId: id, afterValue: { status: 'ASSIGNED', sourceFarmId: dto.sourceFarmId, dispatchRequestRef: made.requestRef } });
    await this.afterStep(updated, 'ASSIGNED', actor, { farmName: made.farmName });
    return this.one(updated);
  }

  /** Farm Director: another warehouse will send it. Its Warehouse Supervisor is asked to send the paddy (on the Deliveries desk, where this request follows it). */
  private async assignToWarehouse(row: any, dto: AssignSupplyRequestDto, actor: AuthenticatedUser) {
    const src = await this.prisma.warehouse.findUnique({ where: { id: dto.sourceWarehouseId as string } });
    if (!src || !src.isActive) throw new BadRequestException('That warehouse was not found or is not in use.');
    if (src.id === row.warehouseId) throw new BadRequestException('The paddy cannot come from the warehouse that is asking for it.');
    const n = await this.names(row);
    const lines = row.lines as unknown as SupplyLine[];
    const updated = await this.prisma.supplyRequest.update({ where: { id: row.id }, data: { status: 'ASSIGNED', sourceWarehouseId: src.id, decidedById: actor.id, decidedAt: new Date(), decisionNote: dto.note } });
    await this.audit.record({ userId: actor.id, action: 'supply_request.assign', entity: 'SupplyRequest', entityId: row.id, afterValue: { status: 'ASSIGNED', sourceWarehouseId: src.id } });
    await this.finishTasks(row, actor); // the Farm Director's own "choose where it comes from" task is done
    const staff = (await this.peopleWith(['WAREHOUSE_SUPERVISOR'], src.id)).map((p: any) => p.id as string);
    await this.giveTask(staff, row, `Send ${row.totalBags} bags to ${n.warehouse}`, actor);
    await this.tell(staff, row, `${n.warehouse} needs paddy from you`, `${sizesText(lines)}${row.neededBy ? ` · by ${longDate(row.neededBy)}` : ''}`, actor);
    await this.tell([row.requestedById], row, `${src.name} will send your paddy`, sizesText(lines), actor);
    return this.one(updated);
  }
  /** Operations Officer (or Manager): the paddy has reached the mill. Writes the mill's own record of paddy received (the one the Production page keeps) and closes the request. */
  async receivedAtMill(id: string, dto: ReceivedAtMillDto, actor: AuthenticatedUser) {
    const row = await this.load(id);
    if (row.kind !== 'MILL') throw new BadRequestException('Only a milling center confirms paddy it has received.');
    if (row.status !== 'READY') throw new BadRequestException(row.status === 'RECEIVED' ? 'The mill has already confirmed this paddy.' : 'This paddy is not ready yet.');
    if (!(isAdmin(actor) || rolesOf(actor).some((r) => ['OPERATIONS_OFFICER', 'OPERATIONS_MANAGER'].includes(r)))) throw new ForbiddenException('Only the mill confirms that the paddy has reached it.');
    assertScope(actor, 'MILLING_CENTER', row.millingCenterId as string, 'this milling center');
    if (!this.millReceipts) throw new BadRequestException('Recording paddy received at the mill is not available right now.');
    const claimed = await this.prisma.supplyRequest.updateMany({ where: { id, status: 'READY' }, data: { status: 'RECEIVED', receivedById: actor.id, receivedAt: new Date() } });
    if (claimed.count !== 1) throw new BadRequestException('The mill has already confirmed this paddy.');
    const lines = row.lines as unknown as SupplyLine[];
    try {
      await this.millReceipts.create({ millingCenterId: row.millingCenterId as string, date: new Date().toISOString().slice(0, 10), lines: lines.map((l) => ({ paddyGradeId: l.paddyGradeId, bagCount: l.bags })), notes: `Paddy request ${row.requestNumber}${dto.note ? `: ${dto.note}` : ''}` } as any, actor);
    } catch (e) {
      await this.prisma.supplyRequest.update({ where: { id }, data: { status: 'READY', receivedById: null, receivedAt: null } }); // nothing is half done
      throw e;
    }
    const updated = await this.load(id);
    await this.finishTasks(row, actor);
    await this.audit.record({ userId: actor.id, action: 'supply_request.received_at_mill', entity: 'SupplyRequest', entityId: id, afterValue: { status: 'RECEIVED' } });
    const n = await this.names(row);
    const people = [...(await this.peopleWith(['WAREHOUSE_SUPERVISOR'], row.warehouseId)), ...(await this.peopleWith(['OPERATIONS_MANAGER']))].map((p: any) => p.id as string);
    await this.tell(people, row, `${n.center ?? 'The mill'} has received the paddy`, sizesText(lines), actor);
    return this.one(updated);
  }
  private async shortfall(row: any) {
    const have = await this.ledger.getBalancesForLocation('WAREHOUSE', row.warehouseId);
    return (row.lines as unknown as SupplyLine[])
      .map((l) => ({ paddyGradeId: l.paddyGradeId, label: l.gradeLabel, needed: l.bags, has: have.find((b: any) => b.paddyGradeId === l.paddyGradeId)?.bagCount ?? 0 }))
      .map((s) => ({ ...s, short: Math.max(0, s.needed - s.has) }))
      .filter((s) => s.short > 0);
  }

  /** Warehouse Supervisor, for a mill: the paddy is in the warehouse. Only possible if the stock really is there. */
  async ready(id: string, dto: ReadySupplyRequestDto, actor: AuthenticatedUser) {
    const row = await this.load(id);
    if (row.kind !== 'MILL') throw new BadRequestException('Only a mill request is answered like this.');
    if (row.status !== 'FORWARDED') throw new BadRequestException('This request is not waiting for the warehouse.');
    if (!maySupply(actor, 'MILL')) throw new ForbiddenException('Only the Warehouse Supervisor answers a mill request.');
    assertScope(actor, 'WAREHOUSE', row.warehouseId, 'this warehouse');
    const short = await this.shortfall(row);
    if (short.length > 0) {
      const n = await this.names(row);
      throw new BadRequestException(`Not enough in ${n.warehouse}: ${short.map((s) => `${s.label} needs ${s.needed}, has ${s.has}`).join('; ')}. Ask the Farm Director for the rest.`);
    }
    const updated = await this.prisma.supplyRequest.update({ where: { id }, data: { status: 'READY', decidedById: actor.id, decidedAt: new Date(), decisionNote: dto.note } });
    await this.audit.record({ userId: actor.id, action: 'supply_request.ready', entity: 'SupplyRequest', entityId: id, afterValue: { status: 'READY' } });
    await this.afterStep(updated, 'READY', actor);
    return this.one(updated);
  }

  /** Warehouse Supervisor, for a mill that is short: ask the Farm Director for exactly what is missing. */
  async askFarmDirector(id: string, dto: ReadySupplyRequestDto, actor: AuthenticatedUser) {
    const row = await this.load(id);
    if (row.kind !== 'MILL') throw new BadRequestException('Only a mill request is answered like this.');
    if (row.status !== 'FORWARDED') throw new BadRequestException('This request is not waiting for the warehouse.');
    if (!maySupply(actor, 'MILL')) throw new ForbiddenException('Only the Warehouse Supervisor answers a mill request.');
    assertScope(actor, 'WAREHOUSE', row.warehouseId, 'this warehouse');
    const open = await this.prisma.supplyRequest.findFirst({ where: { parentRequestId: id, status: { notIn: ['DECLINED', 'CANCELLED'] as any } } });
    if (open) throw new BadRequestException(`You already asked the Farm Director (${open.requestNumber}).`);
    const short = await this.shortfall(row);
    if (short.length === 0) throw new BadRequestException('There is enough paddy in the warehouse already. Press "Paddy is ready".');
    const lines: SupplyLine[] = short.map((s) => ({ paddyGradeId: s.paddyGradeId, gradeLabel: s.label, bags: s.short }));
    const child = await this.prisma.$transaction(async (tx) => {
      const requestNumber = await this.ledger.generateNumber(tx, 'SR', 'supplyRequest');
      const created = await tx.supplyRequest.create({
        data: {
          requestNumber, kind: 'WAREHOUSE', warehouseId: row.warehouseId, lines: lines as any, totalBags: lines.reduce((n, l) => n + l.bags, 0), neededBy: row.neededBy,
          notes: `For the mill (${row.requestNumber})${dto.note ? `. ${dto.note}` : ''}`.slice(0, 300), requestedById: actor.id, status: 'FORWARDED',
          forwardedById: actor.id, forwardedAt: new Date(), parentRequestId: id,
        },
      });
      await this.audit.record({ userId: actor.id, action: 'supply_request.create', entity: 'SupplyRequest', entityId: created.id, afterValue: created }, tx);
      return created;
    });
    await this.afterStep(child, 'FORWARDED', actor);
    await this.afterStep(row, 'ESCALATED', actor, { childNumber: child.requestNumber, short: lines });
    return this.one(row);
  }

  async cancel(id: string, actor: AuthenticatedUser) {
    const row = await this.load(id);
    if (row.requestedById !== actor.id && !isAdmin(actor)) throw new ForbiddenException('Only the person who asked can cancel this request.');
    if (!['SUBMITTED', 'FORWARDED'].includes(row.status)) throw new BadRequestException('This request can no longer be cancelled.');
    const updated = await this.prisma.supplyRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.record({ userId: actor.id, action: 'supply_request.cancel', entity: 'SupplyRequest', entityId: id, afterValue: { status: 'CANCELLED' } });
    await this.afterStep(updated, 'CANCELLED', actor);
    return this.one(updated);
  }

  // ---------------------------------------------------------------- hand-offs: a short task and a notification, with a link
  private async load(id: string) {
    const row = await this.prisma.supplyRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Request not found.');
    return row;
  }

  private async peopleWith(codes: string[], warehouseId?: string) {
    return this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: {
          some: {
            role: { code: { in: codes as any } },
            ...(warehouseId ? { OR: [{ scopes: { none: {} } }, { scopes: { some: { scopeType: 'GLOBAL' } } }, { scopes: { some: { scopeType: 'WAREHOUSE', scopeId: warehouseId } } }] } : {}),
          },
        },
      },
      select: { id: true, firstName: true, lastName: true },
    });
  }

  private async names(row: any) {
    const [wh, center] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: row.warehouseId } }),
      row.millingCenterId ? this.prisma.millingCenter.findUnique({ where: { id: row.millingCenterId } }) : null,
    ]);
    return { warehouse: (wh?.name ?? 'the warehouse') as string, center: (center?.name ?? null) as string | null };
  }

  private async tell(userIds: (string | null | undefined)[], row: any, title: string, body: string, actor: AuthenticatedUser) {
    const ids = [...new Set(userIds.filter((u): u is string => !!u && u !== actor.id))];
    if (ids.length > 0) await this.notifications?.notify({ userIds: ids, type: 'supply.request', title, body, entityType: 'SupplyRequest', entityId: row.requestNumber });
  }

  private async giveTask(userIds: string[], row: any, title: string, actor: AuthenticatedUser) {
    const ids = [...new Set(userIds)].filter((id) => id !== actor.id);
    if (ids.length === 0) return;
    const prefix = `TASK-${new Date().getFullYear()}-`;
    const already = await this.prisma.task.count({ where: { taskNumber: { startsWith: prefix } } });
    let n = 0;
    for (const id of ids) {
      n += 1;
      await this.prisma.task.create({
        data: { taskNumber: `${prefix}${String(already + n).padStart(6, '0')}`, title, assignedToId: id, warehouseId: row.warehouseId, dueDate: row.neededBy ?? undefined, status: 'TODO', createdById: actor.id, supplyRequestNumber: row.requestNumber } as any,
      });
    }
  }

  private async finishTasks(row: any, actor: AuthenticatedUser) {
    await this.prisma.task.updateMany({ where: { supplyRequestNumber: row.requestNumber, status: { in: ['TODO', 'IN_PROGRESS'] as any } }, data: { status: 'COMPLETED', completedAt: new Date(), completedById: actor.id } });
  }

  /** Best effort: the request itself is already saved, so a failed notification is logged and never undoes it. */
  private async afterStep(row: any, step: 'ASKED' | 'FORWARDED' | 'ASSIGNED' | 'READY' | 'DECLINED' | 'CANCELLED' | 'ESCALATED', actor: AuthenticatedUser, extra: { farmName?: string; childNumber?: string; short?: SupplyLine[] } = {}) {
    try {
      const n = await this.names(row);
      const asker = n.center ?? n.warehouse;
      const lines = row.lines as unknown as SupplyLine[];
      const needs = `${sizesText(lines)}${row.neededBy ? ` · by ${longDate(row.neededBy)}` : ''}`;
      const title = `${asker} needs paddy`;
      if (step === 'ASKED') {
        const reviewers = row.kind === 'WAREHOUSE' ? await this.peopleWith(['WAREHOUSE_SUPERVISOR'], row.warehouseId) : await this.peopleWith(['OPERATIONS_MANAGER']);
        await this.giveTask(reviewers.map((p) => p.id), row, title, actor);
        await this.tell(reviewers.map((p) => p.id), row, title, needs, actor);
      }
      if (step === 'FORWARDED') {
        await this.finishTasks(row, actor);
        const supplier = row.kind === 'WAREHOUSE' ? await this.peopleWith(['FARM_DIRECTOR']) : await this.peopleWith(['WAREHOUSE_SUPERVISOR'], row.warehouseId);
        const alsoTold = row.kind === 'WAREHOUSE' ? await this.peopleWith(['MD', 'CEO']) : [];
        await this.giveTask(supplier.map((p) => p.id), row, title, actor);
        await this.tell([...supplier, ...alsoTold].map((p) => p.id), row, title, needs, actor);
        await this.tell([row.requestedById], row, 'Your request was sent on', needs, actor);
      }
      if (step === 'ASSIGNED') {
        await this.finishTasks(row, actor);
        await this.tell([row.requestedById, row.forwardedById], row, `${extra.farmName ?? 'A farm'} will send your paddy`, needs, actor);
      }
      if (step === 'READY') {
        await this.finishTasks(row, actor);
        await this.tell([row.requestedById, row.forwardedById], row, `Paddy is ready at ${n.warehouse}`, needs, actor);
      }
      if (step === 'ESCALATED') {
        await this.tell([row.requestedById, row.forwardedById], row, 'Asked the Farm Director for more', `${sizesText(extra.short ?? [])} (${extra.childNumber})`, actor);
      }
      if (step === 'DECLINED') {
        await this.finishTasks(row, actor);
        await this.tell([row.requestedById, row.forwardedById], row, `Not possible: ${asker}`, row.decisionNote ?? 'No reason was given.', actor);
      }
      if (step === 'CANCELLED') await this.finishTasks(row, actor);
    } catch (err) {
      this.log.warn(`The follow-up to paddy request ${row?.requestNumber ?? ''} did not complete: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---------------------------------------------------------------- the picture
  private async one(row: any): Promise<SupplyView> {
    return (await this.toViews([row]))[0];
  }

  private async toViews(rows: any[]): Promise<SupplyView[]> {
    if (rows.length === 0) return [];
    const children = await this.prisma.supplyRequest.findMany({ where: { parentRequestId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: 'desc' } });
    const all = [...rows, ...children];
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const [users, whs, centers, farms, cards, parents] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: uniq(all.flatMap((r) => [r.requestedById, r.forwardedById, r.decidedById, r.receivedById])) } }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.warehouse.findMany({ where: { id: { in: uniq(all.flatMap((r) => [r.warehouseId, r.sourceWarehouseId])) } }, select: { id: true, name: true, location: true } }),
      this.prisma.millingCenter.findMany({ where: { id: { in: uniq(all.map((r) => r.millingCenterId)) } }, select: { id: true, name: true } }),
      this.prisma.farm.findMany({ where: { id: { in: uniq(all.map((r) => r.sourceFarmId)) } }, select: { id: true, name: true } }),
      this.deliveryOrders.cardsByRequestRefs(uniq(all.map((r) => r.dispatchRequestRef))),
      this.prisma.supplyRequest.findMany({ where: { id: { in: uniq(all.map((r) => r.parentRequestId)) } }, select: { id: true, requestNumber: true } }),
    ]);
    const sent = await this.prisma.paddyTransfer.findMany({ where: { supplyRequestNumber: { in: uniq(all.filter((r) => r.sourceWarehouseId).map((r) => r.requestNumber)) }, status: { not: 'CANCELLED' } }, orderBy: { sentAt: 'desc' } });
    const transfers = new Map<string, any>();
    for (const x of sent) if (x.supplyRequestNumber && !transfers.has(x.supplyRequestNumber)) transfers.set(x.supplyRequestNumber, x);
    const kids = new Map<string, any>();
    for (const c of children) { const key = c.parentRequestId as string; const keep = kids.get(key); if (!keep || (['DECLINED', 'CANCELLED'].includes(keep.status) && !['DECLINED', 'CANCELLED'].includes(c.status))) kids.set(key, c); }
    const ctx: SupplyContext = {
      users: new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()])),
      warehouses: new Map(whs.map((w) => [w.id, { name: w.name, location: w.location ?? null }])),
      centers: new Map(centers.map((c) => [c.id, c.name])), farms: new Map(farms.map((f) => [f.id, f.name])),
      cards, parents: new Map(parents.map((p) => [p.id, p.requestNumber])), children: kids, transfers,
    };
    return rows.map((r) => buildSupplyView(r, ctx));
  }
}
