import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { RoleAccessService } from '../access/role-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { scopedLocationIds } from '../common/utils/scope.util';
import { SupplyRequestsService } from '../supply/supply-requests.service';
import { orderVisibility, visibilityWhere } from '../sales/order-visibility';
import { CONTROL_CENTER_ROLES, TILES, TileKey } from './control-center.catalog';

interface Scope { isGlobal: boolean; ids: string[] }
interface Ctx { actor: AuthenticatedUser; roles: string[]; prisma: PrismaService; farms: Scope; warehouses: Scope; mills: Scope; supply: () => Promise<{ waiting: number; open: number }> }

export interface ControlCenterTile { key: string; label: string; hint: string; href: string; count: number; tone: 'warn' | 'plain' }
export interface Named { id: string; name: string }
export interface ControlCenterView {
  /** The role this control center is for (the first of the person's roles that has one). */
  role: string;
  /** The places the figures cover. For someone responsible for everything, `everything` is true and the lists are empty. */
  jurisdiction: { everything: boolean; farms: Named[]; warehouses: Named[]; millingCenters: Named[] };
  tiles: ControlCenterTile[];
}

/** A filter on one column that keeps only the person's own places (nothing at all when they have none), or no filter for someone responsible for everything. */
const only = (scope: Scope, field: string): Record<string, unknown> => (scope.isGlobal ? {} : { [field]: { in: scope.ids } });
/** The same rule the Expenses list applies: someone responsible for everything sees all; anyone else sees their own farms' and warehouses' expenses. */
function expenseScope(c: Ctx): Record<string, unknown> {
  if (c.farms.isGlobal) return {};
  const or: Record<string, unknown>[] = [];
  if (c.farms.ids.length) or.push({ farmId: { in: c.farms.ids } });
  if (c.warehouses.ids.length) or.push({ warehouseId: { in: c.warehouses.ids } });
  return or.length ? { OR: or } : { id: '00000000-0000-0000-0000-000000000000' };
}

/**
 * How many of each kind of work are waiting for the person. Every figure uses the SAME status the matching page treats as "waiting" (an order is
 * waiting for the Finance Director while it is SUBMITTED, for the Managing Director while it is APPROVED, and so on), so a figure here is never
 * different from the list it opens.
 */
const COUNT: Record<TileKey, (c: Ctx) => Promise<number>> = {
  'orders-approve': (c) => c.prisma.salesOrder.count({ where: { AND: [visibilityWhere(orderVisibility(c.actor)), { status: 'SUBMITTED' }] } as any }),
  'orders-release': (c) => c.prisma.salesOrder.count({ where: { AND: [visibilityWhere(orderVisibility(c.actor)), { status: 'APPROVED' }] } as any }),
  'orders-assign': (c) => c.prisma.salesOrder.count({ where: { AND: [visibilityWhere(orderVisibility(c.actor)), { status: 'RELEASED' }] } as any }),
  'orders-prepare': (c) => c.prisma.salesOrder.count({ where: { status: { in: ['RESERVED', 'PROCESSING'] }, ...only(c.warehouses, 'allocatedWarehouseId') } as any }),
  'payments-verify': (c) => c.prisma.payment.count({ where: { status: 'PENDING_VERIFICATION' } }),
  'expenses-decide': (c) => c.prisma.expense.count({ where: { status: 'PENDING', submittedById: { not: c.actor.id }, ...expenseScope(c) } as any }),
  'expenses-director': async (c) => {
    const directors = await c.prisma.user.findMany({ where: { roles: { some: { role: { code: 'FINANCE_DIRECTOR' } } } }, select: { id: true } });
    if (directors.length === 0) return 0;
    return c.prisma.expense.count({ where: { status: 'PENDING', submittedById: { in: directors.map((u) => u.id) }, ...expenseScope(c) } as any });
  },
  'paddy-entries': (c) => c.prisma.paddyEntry.count({ where: { status: 'SUBMITTED', ...only(c.farms, 'farmId') } as any }),
  'dispatch-approvals': (c) => c.prisma.deliveryReport.count({ where: { status: 'SUPERVISOR_REVIEW', ...only(c.farms, 'farmId') } as any }),
  'stock-corrections': async (c) => {
    if (c.farms.isGlobal) return c.prisma.inventoryAdjustment.count({ where: { status: 'PENDING' } });
    const or: Record<string, unknown>[] = [];
    if (c.farms.ids.length) or.push({ locationType: 'FARM', locationId: { in: c.farms.ids } });
    if (c.warehouses.ids.length) or.push({ locationType: 'WAREHOUSE', locationId: { in: c.warehouses.ids } });
    return or.length ? c.prisma.inventoryAdjustment.count({ where: { status: 'PENDING', OR: or } as any }) : 0;
  },
  'production-approve': (c) => c.prisma.productionRecord.count({ where: { status: 'SUBMITTED', ...only(c.mills, 'millingCenterId') } as any }),
  'receipts-review': (c) => c.prisma.receiptReview.count({ where: { status: 'PENDING', ...only(c.warehouses, 'warehouseId') } as any }),
  'mill-paddy-coming': (c) => c.prisma.millTransfer.count({ where: { direction: 'TO_MILL', status: 'IN_TRANSIT', ...only(c.mills, 'millingCenterId') } as any }),
  'mill-products-ready': (c) => c.prisma.inventoryBalance.count({ where: { locationType: 'MILLING_CENTER', productId: { not: null }, OR: [{ bagCount: { gt: 0 } }, { quantityKg: { gt: 0 } }], ...only(c.mills, 'locationId') } as any }),
  // The Warehouse Supervisor approves paddy going to the mill; the Operations Manager approves finished products coming back.
  'mill-approvals': async (c) => {
    const or: Record<string, unknown>[] = [];
    if (c.roles.includes('WAREHOUSE_SUPERVISOR')) or.push({ direction: 'TO_MILL', ...only(c.warehouses, 'warehouseId') });
    if (c.roles.includes('OPERATIONS_MANAGER')) or.push({ direction: 'TO_WAREHOUSE', ...only(c.mills, 'millingCenterId') });
    return or.length ? c.prisma.millTransfer.count({ where: { status: 'PENDING_APPROVAL', OR: or } as any }) : 0;
  },
  'milled-rice-coming': (c) => c.prisma.millTransfer.count({ where: { direction: 'TO_WAREHOUSE', status: 'IN_TRANSIT', ...only(c.warehouses, 'warehouseId') } as any }),
  'supply-waiting': async (c) => (await c.supply()).waiting,
  'supply-open': async (c) => (await c.supply()).open,
  'trucks-coming': (c) => c.prisma.shipment.count({ where: { receivedAt: null, ...only(c.warehouses, 'warehouseId') } as any }),
  'transfers-coming': (c) => c.prisma.paddyTransfer.count({ where: { status: 'IN_TRANSIT', ...only(c.warehouses, 'toWarehouseId') } as any }),
  'rice-coming': (c) => c.prisma.stockTransfer.count({ where: { status: 'DISPATCHED', ...only(c.warehouses, 'destWarehouseId') } as any }),
  'my-tasks': (c) => c.prisma.task.count({ where: { assignedToId: c.actor.id, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } } }),
};

@Injectable()
export class ControlCenterService {
  constructor(private readonly prisma: PrismaService, private readonly supply: SupplyRequestsService, @Optional() private readonly access?: RoleAccessService) {}

  /** The control center for the person asking. Only people whose role has one (and the Administrator) may ask. */
  async forActor(actor: AuthenticatedUser): Promise<ControlCenterView> {
    const codes = actor.roles.map((r) => r.roleCode as string);
    const role: string | null = CONTROL_CENTER_ROLES.find((c) => codes.includes(c)) ?? (codes.includes('ADMIN') ? 'ADMIN' : null);
    if (!role) throw new ForbiddenException('Your role does not have a control center.');
    if (this.access && (await this.access.hiddenFor(actor.roles.map((r: any) => r.roleCode))).includes('control-center')) throw new ForbiddenException('Your Administrator has turned the control center off for your role.');

    let supply: Promise<{ waiting: number; open: number }> | null = null;
    const ctx: Ctx = {
      actor, roles: codes, prisma: this.prisma, farms: scopedLocationIds(actor, 'FARM'), warehouses: scopedLocationIds(actor, 'WAREHOUSE'), mills: scopedLocationIds(actor, 'MILLING_CENTER'),
      supply: () => (supply ??= this.supply.counts(actor)),
    };
    const holds = (p: string) => actor.permissionCodes?.has(p) ?? false;
    const shown = TILES.filter((t) => (t.anyOf.length === 0 || t.anyOf.some(holds)) && !(t.unlessAny ?? []).some(holds) && (!t.onlyRoles || t.onlyRoles.some((r) => codes.includes(r))));
    const counts = await Promise.all(shown.map((t) => COUNT[t.key](ctx)));
    return {
      role,
      jurisdiction: await this.jurisdiction(ctx),
      tiles: shown.map((t, i) => ({ key: t.key, label: t.label, hint: t.hint, href: t.href, count: counts[i], tone: t.decision && counts[i] > 0 ? 'warn' : 'plain' })),
    };
  }

  private async jurisdiction(c: Ctx): Promise<ControlCenterView['jurisdiction']> {
    if (c.farms.isGlobal) return { everything: true, farms: [], warehouses: [], millingCenters: [] };
    const names = async (ids: string[], load: (ids: string[]) => Promise<Named[]>) => (ids.length ? load(ids) : []);
    const [farms, warehouses, millingCenters] = await Promise.all([
      names(c.farms.ids, (ids) => this.prisma.farm.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })),
      names(c.warehouses.ids, (ids) => this.prisma.warehouse.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })),
      names(c.mills.ids, (ids) => this.prisma.millingCenter.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })),
    ]);
    return { everything: false, farms, warehouses, millingCenters };
  }
}
