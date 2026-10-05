import { Injectable, Logger, Optional } from '@nestjs/common';
import { RoleAccessService } from '../access/role-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { scopedLocationIds } from '../common/utils/scope.util';
import { orderVisibility, visibilityWhere } from '../sales/order-visibility';
import { SupplyRequestsService } from '../supply/supply-requests.service';
import { DispatchTrackingService, journeyMatches } from '../dispatch-tracking/dispatch-tracking.service';
import { TtlCache } from '../common/utils/ttl-cache';

export interface SearchResult { id: string; title: string; subtitle: string; href: string }
export interface SearchGroup { key: string; label: string; results: SearchResult[] }
/** `incomplete` names the kinds of record that could not be searched this time (too slow, or failed), so the screen can say so instead of looking empty. */
export interface SearchResponse { q: string; groups: SearchGroup[]; incomplete?: string[] }
export type SearchScope = 'fast' | 'slow';

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
  /** The two heavy loads (every dispatch journey, every paddy request) are built once per person and kept for a few seconds, then filtered in memory as they type. */
  private readonly journeys = new TtlCache<Awaited<ReturnType<DispatchTrackingService['list']>>['journeys']>(25_000, 100);
  private readonly boards = new TtlCache<Awaited<ReturnType<SupplyRequestsService['board']>>>(25_000, 100);
  private readonly answers = new TtlCache<SearchResponse>(15_000, 300);
  /** No kind of record may hold the search up longer than this. */
  protected timeoutMs = 4_000;
  constructor(private readonly prisma: PrismaService, private readonly tracking: DispatchTrackingService, private readonly supply: SupplyRequestsService, @Optional() private readonly access?: RoleAccessService) {}

  private journeysOf(actor: AuthenticatedUser) { return this.journeys.get(actor.id, async () => (await this.tracking.list(actor, { status: 'all' })).journeys); }
  private boardOf(actor: AuthenticatedUser) { return this.boards.get(actor.id, () => this.supply.board(actor)); }
  private within<T>(work: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout;
    const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`took longer than ${this.timeoutMs} ms`)), this.timeoutMs); });
    return Promise.race([work, late]).finally(() => clearTimeout(timer));
  }

  /**
   * `scope` lets the website ask in two parts: `fast` (orders, farms, warehouses, mills: one small query each) shows at once; `slow` (dispatches and paddy
   * requests, which are assembled from many tables) follows. With no scope, everything is searched in one answer.
   */
  async search(actor: AuthenticatedUser, raw: string, scope?: SearchScope): Promise<SearchResponse> {
    const q = (raw ?? '').trim().slice(0, MAX_LENGTH);
    if (q.length < MIN_LENGTH) return { q, groups: [] };
    if (this.access && (await this.access.hiddenFor(actor.roles.map((r: any) => r.roleCode))).includes('quick-search')) return { q, groups: [] };   // switched off for their role
    const cacheKey = `${actor.id}|${scope ?? 'all'}|${q.toLowerCase()}`;
    const again = this.answers.peek(cacheKey); if (again) return again;
    const farms = scopedLocationIds(actor, 'FARM'); const warehouses = scopedLocationIds(actor, 'WAREHOUSE'); const mills = scopedLocationIds(actor, 'MILLING_CENTER');
    const inScope = (s: { isGlobal: boolean; ids: string[] }) => (s.isGlobal ? {} : { id: { in: s.ids } });
    const sources: { key: string; label: string; allowed: boolean; slow?: boolean; run: () => Promise<SearchResult[]> }[] = [
      {
        key: 'orders', label: 'Orders', allowed: has(actor, ['sales.view', 'sales.create', 'sales.approve', 'sales.release', 'sales.assign', 'sales.fulfill']),
        run: async () => (await this.prisma.salesOrder.findMany({
          where: { AND: [visibilityWhere(orderVisibility(actor)), { OR: [{ orderNumber: like(q) }, { customer: { name: like(q) } }] }] } as any,
          orderBy: { createdAt: 'desc' }, take: PER_GROUP, select: { id: true, orderNumber: true, status: true, customer: { select: { name: true } } },
        })).map((o) => ({ id: o.id, title: o.orderNumber, subtitle: `${o.customer?.name ?? 'Customer'} · ${String(o.status).replace(/_/g, ' ').toLowerCase()}`, href: `/sales?order=${o.id}` })),
      },
      {
        key: 'dispatches', slow: true, label: 'Dispatches', allowed: has(actor, ['dispatch.track']) && q.length >= 3,
        run: async () => (await this.journeysOf(actor)).filter((j) => journeyMatches(j, q.toLowerCase())).slice(0, PER_GROUP).map((j) => ({ id: j.id, title: j.ref, subtitle: `${j.from.name} to ${j.to.name} · ${j.label}`, href: `/track-dispatch?ref=${encodeURIComponent(j.ref)}` })),
      },
      {
        key: 'paddy-requests', slow: true, label: 'Paddy requests', allowed: has(actor, ['supply.view']),
        run: async () => {
          const needle = q.toLowerCase();
          return (await this.boardOf(actor))
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
    const incomplete: string[] = [];
    const groups = await Promise.all(sources.filter((s) => s.allowed && (!scope || (scope === 'slow') === !!s.slow)).map(async (s) => {
      const began = Date.now();
      try { return { key: s.key, label: s.label, results: await this.within(s.run()) }; }
      catch (e) { this.log.warn(`Search in ${s.key} failed: ${(e as Error).message}`); incomplete.push(s.label); return { key: s.key, label: s.label, results: [] }; } // one kind failing, or being slow, never takes the rest down
      finally { const took = Date.now() - began; if (took > 1500) this.log.warn(`Search in ${s.key} was slow: ${took} ms`); }
    }));
    const answer: SearchResponse = { q, groups: groups.filter((g) => g.results.length > 0), ...(incomplete.length ? { incomplete } : {}) };
    if (incomplete.length === 0) this.answers.set(cacheKey, answer);   // an answer with a gap is never reused: the next try should really try again
    return answer;
  }
}
