import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { scopedLocationIds } from '../common/utils/scope.util';
import { orderVisibility, visibilityWhere } from '../sales/order-visibility';
import { SupplyRequestsService } from '../supply/supply-requests.service';
import { DispatchTrackingService } from '../dispatch-tracking/dispatch-tracking.service';

export interface SearchResult { id: string; title: string; subtitle: string; href: string }
export interface SearchGroup { key: string; label: string; results: SearchResult[] }
export interface SearchResponse { q: string; groups: SearchGroup[] }

const PER_GROUP = 5;
const MIN_LENGTH = 2;
const MAX_LENGTH = 60;
const has = (a: AuthenticatedUser, codes: string[]) => codes.some((c) => a.permissionCodes?.has(c));
const like = (q: string) => ({ contains: q, mode: 'insensitive' as const });

/**
 * One search box for the whole system. Each kind of record is searched only if the person's role may see that kind, and only within the places they
 * are responsible for, using the SAME rules as the page that lists them: so a search can never show someone a record they could not open.
 * (Pages are matched on the website, from the menu the person is already offered.)
 */
@Injectable()
export class SearchService {
  private readonly log = new Logger(SearchService.name);
  constructor(private readonly prisma: PrismaService, private readonly tracking: DispatchTrackingService, private readonly supply: SupplyRequestsService) {}

  async search(actor: AuthenticatedUser, raw: string): Promise<SearchResponse> {
    const q = (raw ?? '').trim().slice(0, MAX_LENGTH);
    if (q.length < MIN_LENGTH) return { q, groups: [] };
    const farms = scopedLocationIds(actor, 'FARM'); const warehouses = scopedLocationIds(actor, 'WAREHOUSE'); const mills = scopedLocationIds(actor, 'MILLING_CENTER');
    const inScope = (s: { isGlobal: boolean; ids: string[] }) => (s.isGlobal ? {} : { id: { in: s.ids } });
    const sources: { key: string; label: string; allowed: boolean; run: () => Promise<SearchResult[]> }[] = [
      {
        key: 'orders', label: 'Orders', allowed: has(actor, ['sales.view', 'sales.create', 'sales.approve', 'sales.release', 'sales.assign', 'sales.fulfill']),
        run: async () => (await this.prisma.salesOrder.findMany({
          where: { AND: [visibilityWhere(orderVisibility(actor)), { OR: [{ orderNumber: like(q) }, { customer: { name: like(q) } }] }] } as any,
          orderBy: { createdAt: 'desc' }, take: PER_GROUP, select: { id: true, orderNumber: true, status: true, customer: { select: { name: true } } },
        })).map((o) => ({ id: o.id, title: o.orderNumber, subtitle: `${o.customer?.name ?? 'Customer'} · ${String(o.status).replace(/_/g, ' ').toLowerCase()}`, href: `/sales?order=${o.id}` })),
      },
      {
        key: 'dispatches', label: 'Dispatches', allowed: has(actor, ['dispatch.track']) && q.length >= 3,
        run: async () => (await this.tracking.list(actor, { q, status: 'all' })).journeys.slice(0, PER_GROUP).map((j) => ({ id: j.id, title: j.ref, subtitle: `${j.from.name} to ${j.to.name} · ${j.label}`, href: `/track-dispatch?ref=${encodeURIComponent(j.ref)}` })),
      },
      {
        key: 'paddy-requests', label: 'Paddy requests', allowed: has(actor, ['supply.view']),
        run: async () => {
          const needle = q.toLowerCase();
          return (await this.supply.board(actor))
            .filter((v) => [v.requestNumber, v.warehouse.name, v.millingCenter?.name].some((x) => x && x.toLowerCase().includes(needle)))
            .slice(0, PER_GROUP).map((v) => ({ id: v.id, title: v.requestNumber, subtitle: `${v.millingCenter?.name ?? v.warehouse.name} needs paddy · ${v.label}`, href: `/warehouse-requests?request=${encodeURIComponent(v.requestNumber)}` }));
        },
      },
      {
        key: 'farms', label: 'Farms', allowed: has(actor, ['farm.view', 'farm.inventory.view']),
        run: async () => (await this.prisma.farm.findMany({ where: { ...inScope(farms), OR: [{ name: like(q) }, { location: like(q) }, { code: like(q) }] } as any, orderBy: { name: 'asc' }, take: PER_GROUP, select: { id: true, name: true, location: true } }))
          .map((f) => ({ id: f.id, title: f.name, subtitle: f.location ?? 'Farm', href: '/farms' })),
      },
      {
        key: 'warehouses', label: 'Warehouses', allowed: has(actor, ['warehouse.view', 'warehouse.inventory.view', 'warehouse.receive']),
        run: async () => (await this.prisma.warehouse.findMany({ where: { ...inScope(warehouses), OR: [{ name: like(q) }, { location: like(q) }, { code: like(q) }] } as any, orderBy: { name: 'asc' }, take: PER_GROUP, select: { id: true, name: true, location: true } }))
          .map((w) => ({ id: w.id, title: w.name, subtitle: w.location ?? 'Warehouse', href: '/warehouses' })),
      },
      {
        key: 'milling-centers', label: 'Milling centers', allowed: has(actor, ['milling.view']),
        run: async () => (await this.prisma.millingCenter.findMany({ where: { ...inScope(mills), OR: [{ name: like(q) }, { code: like(q) }] } as any, orderBy: { name: 'asc' }, take: PER_GROUP, select: { id: true, name: true } }))
          .map((m) => ({ id: m.id, title: m.name, subtitle: 'Milling center', href: '/production' })),
      },
    ];
    const groups = await Promise.all(sources.filter((s) => s.allowed).map(async (s) => {
      try { return { key: s.key, label: s.label, results: await s.run() }; }
      catch (e) { this.log.warn(`Search in ${s.key} failed: ${(e as Error).message}`); return { key: s.key, label: s.label, results: [] }; } // one source failing never takes the whole search down
    }));
    return { q, groups: groups.filter((g) => g.results.length > 0) };
  }
}
