import { SearchService } from '../search.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const F1 = 'f1', F2 = 'f2', W1 = 'w1', W2 = 'w2', M1 = 'm1';
type Sc = { scopeType: string; scopeId: string | null };
const GLOBAL: Sc[] = [{ scopeType: 'GLOBAL', scopeId: null }];
const actor = (id: string, role: string, perms: string[], scopes: Sc[] = GLOBAL) =>
  ({ id, firstName: 'T', lastName: id, permissionCodes: new Set(perms), roles: [{ roleId: 'r', roleCode: role, permissions: perms, scopes }] }) as unknown as AuthenticatedUser;
const order = (n: number, customer: string, by: string, wh: string | null = null) => ({ id: `o${n}`, orderNumber: `SO-2026-00000${n}`, status: 'SUBMITTED', salesOfficerId: by, submittedById: by, allocatedWarehouseId: wh, customer: { name: customer }, createdAt: new Date(2026, 9, n) });
const DATA: Record<string, any[]> = {
  salesOrder: [order(1, 'Adom Foods', 'so1'), order(2, 'Adom Rice Mill', 'so2', W1), order(3, 'Boateng Stores', 'so1', W2), ...[4, 5, 6, 7, 8, 9].map((n) => order(n, `Adom Shop ${n}`, 'so1'))],
  farm: [{ id: F1, name: 'Nkawkaw Farm', location: 'Eastern', code: 'NKW' }, { id: F2, name: 'Techiman Farm', location: 'Bono East', code: 'TCH' }],
  warehouse: [{ id: W1, name: 'Tamale Warehouse', location: 'Tamale', code: 'TML' }, { id: W2, name: 'Kumasi Warehouse', location: 'Kumasi', code: 'KSI' }],
  millingCenter: [{ id: M1, name: 'Tamale Mill', code: 'TM1' }],
};
function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, v]: [string, any]) => {
    if (k === 'AND') return (v as any[]).every((c) => matches(row, c));
    if (k === 'OR') return (v as any[]).some((c) => matches(row, c));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('contains' in v) return String(row[k] ?? '').toLowerCase().includes(String(v.contains).toLowerCase());
      if ('in' in v) return v.in.includes(row[k]);
      return matches(row[k] ?? {}, v);
    }
    return row[k] === v;
  });
}
function build() {
  const wheres: Record<string, any[]> = {};
  const table = (name: string) => ({ findMany: jest.fn(async ({ where, take }: any) => { (wheres[name] ??= []).push(where); return DATA[name].filter((r) => matches(r, where)).slice(0, take); }) });
  const prisma: any = { salesOrder: table('salesOrder'), farm: table('farm'), warehouse: table('warehouse'), millingCenter: table('millingCenter') };
  const tracking = { list: jest.fn(async () => ({ journeys: [{ id: 'farm:DS-1', ref: 'DS-1', requestRef: null, vehicle: null, driver: null, lines: [], from: { name: 'Nkawkaw Farm' }, to: { name: 'Tamale Warehouse' }, label: 'In transit' }], counts: {} })) };
  const supply = { board: jest.fn(async () => [{ id: 's1', requestNumber: 'SR-2026-000001', warehouse: { name: 'Tamale Warehouse' }, millingCenter: null, label: 'With the Farm Director' }, { id: 's2', requestNumber: 'SR-2026-000002', warehouse: { name: 'Kumasi Warehouse' }, millingCenter: null, label: 'x' }]) };
  return { service: new SearchService(prisma, tracking as any, supply as any), prisma, wheres, tracking, supply };
}
const keys = (r: { groups: { key: string }[] }) => r.groups.map((g) => g.key);
const titles = (r: { groups: { key: string; results: { title: string }[] }[] }, key: string) => r.groups.find((g) => g.key === key)?.results.map((x) => x.title) ?? [];

describe('quick search', () => {
  it('needs at least two characters, and asks the database nothing before that', async () => {
    const h = build(); const a = actor('fd', 'FINANCE_DIRECTOR', ['sales.approve']);
    expect(await h.service.search(a, 'a')).toEqual({ q: 'a', groups: [] }); expect(await h.service.search(a, '   ')).toEqual({ q: '', groups: [] });
    expect(h.prisma.salesOrder.findMany).not.toHaveBeenCalled();
  });
  it('someone whose role may see none of these records finds nothing, and nothing is searched', async () => {
    const h = build(); expect(await h.service.search(actor('x', 'FARM_MANAGER', ['paddy.create'], [{ scopeType: 'FARM', scopeId: F1 }]), 'adom')).toEqual({ q: 'adom', groups: [] });
    expect(h.prisma.salesOrder.findMany).not.toHaveBeenCalled(); expect(h.supply.board).not.toHaveBeenCalled(); expect(h.tracking.list).not.toHaveBeenCalled();
  });

  describe('orders: by order number or customer, only the ones the person could open on the Sales page', () => {
    it('a Sales Officer finds their own orders and never another officer\'s', async () => {
      const r = await build().service.search(actor('so1', 'SALES_OFFICER', ['sales.create']), 'adom foods');
      expect(titles(r, 'orders')).toEqual(['SO-2026-000001']);
      expect(titles(await build().service.search(actor('so2', 'SALES_OFFICER', ['sales.create']), 'adom'), 'orders')).toEqual(['SO-2026-000002']);
    });
    it('someone who approves sees the whole pipeline; a match on the order number works too, in any case', async () => {
      const a = actor('fd', 'FINANCE_DIRECTOR', ['sales.approve']);
      expect(titles(await build().service.search(a, 'boateng'), 'orders')).toEqual(['SO-2026-000003']);
      expect(titles(await build().service.search(a, 'so-2026-000002'), 'orders')).toEqual(['SO-2026-000002']);
    });
    it('a warehouse team member finds only the orders assigned to their own warehouse', async () => {
      const r = await build().service.search(actor('wm', 'WAREHOUSE_MANAGER', ['sales.fulfill'], [{ scopeType: 'WAREHOUSE', scopeId: W1 }]), 'adom');
      expect(titles(r, 'orders')).toEqual(['SO-2026-000002']);
    });
    it('each result says what it is and opens that order; a group shows at most five', async () => {
      const r = await build().service.search(actor('fd', 'FINANCE_DIRECTOR', ['sales.approve']), 'adom');
      expect(r.groups[0].results).toHaveLength(5);
      expect(r.groups[0].results[0]).toMatchObject({ id: expect.stringMatching(/^o/), href: expect.stringMatching(/^\/sales\?order=o/), subtitle: expect.stringContaining('submitted') });
    });
  });

  describe('places: only the person\'s own', () => {
    it('a Warehouse Manager finds their own warehouse and not the other, searching by name or by town', async () => {
      const a = actor('wm', 'WAREHOUSE_MANAGER', ['warehouse.receive'], [{ scopeType: 'WAREHOUSE', scopeId: W1 }]);
      expect(titles(await build().service.search(a, 'warehouse'), 'warehouses')).toEqual(['Tamale Warehouse']);
      expect(titles(await build().service.search(a, 'kumasi'), 'warehouses')).toEqual([]);
    });
    it('someone responsible for everything finds them all; the query goes to the database with the person\'s places in it', async () => {
      const md = actor('md', 'MD', ['farm.view', 'warehouse.view', 'milling.view']); const h = build();
      const r = await h.service.search(md, 'a');  // too short
      expect(r.groups).toEqual([]);
      const r2 = await h.service.search(md, 'ta');
      expect(titles(r2, 'warehouses')).toEqual(['Tamale Warehouse']); expect(titles(r2, 'milling-centers')).toEqual(['Tamale Mill']);
      const scoped = build(); await scoped.service.search(actor('fm', 'FARM_MANAGER', ['farm.inventory.view'], [{ scopeType: 'FARM', scopeId: F1 }]), 'farm');
      expect(scoped.wheres.farm[0].id).toEqual({ in: [F1] });
      expect(titles(await build().service.search(actor('fm', 'FARM_MANAGER', ['farm.inventory.view'], [{ scopeType: 'FARM', scopeId: F1 }]), 'farm'), 'farms')).toEqual(['Nkawkaw Farm']);
    });
  });

  describe('dispatches and paddy requests come through the services that already limit them', () => {
    it('dispatches only for someone allowed to track them, and only from three characters, asked with the person and the words', async () => {
      const h = build(); const a = actor('wm', 'WAREHOUSE_MANAGER', ['dispatch.track']);
      expect((await h.service.search(a, 'ds')).groups).toEqual([]); expect(h.tracking.list).not.toHaveBeenCalled();
      const r = await h.service.search(a, 'ds-1');
      expect(h.tracking.list).toHaveBeenCalledWith(a, { status: 'all' });   // the whole (cached) list is built once, then filtered here
      expect(r.groups[0]).toMatchObject({ key: 'dispatches', results: [{ title: 'DS-1', subtitle: 'Nkawkaw Farm to Tamale Warehouse · In transit', href: '/track-dispatch?ref=DS-1' }] });
      expect(keys(await build().service.search(actor('x', 'SALES_OFFICER', ['sales.create']), 'ds-1'))).not.toContain('dispatches');
    });
    it('paddy requests by number or place, from the same list the Paddy requests page shows', async () => {
      const h = build(); const r = await h.service.search(actor('ws', 'WAREHOUSE_SUPERVISOR', ['supply.view']), 'kumasi');
      expect(h.supply.board).toHaveBeenCalledTimes(1);
      expect(r.groups).toEqual([{ key: 'paddy-requests', label: 'Paddy requests', results: [expect.objectContaining({ title: 'SR-2026-000002', href: '/warehouse-requests?request=SR-2026-000002' })] }]);
      expect(titles(await build().service.search(actor('ws', 'WAREHOUSE_SUPERVISOR', ['supply.view']), 'sr-2026-000001'), 'paddy-requests')).toEqual(['SR-2026-000001']);
    });
  });

  it('one kind of record failing never takes the rest of the search down', async () => {
    const h = build(); h.prisma.farm.findMany.mockRejectedValueOnce(new Error('boom'));
    const r = await h.service.search(actor('md', 'MD', ['farm.view', 'warehouse.view']), 'ta');
    expect(keys(r)).toEqual(['warehouses']);
  });
  it('groups come in a fixed order, and the search words are trimmed and capped', async () => {
    const r = await build().service.search(actor('md', 'MD', ['sales.view', 'supply.view', 'farm.view', 'warehouse.view', 'dispatch.track']), '  tam  ');
    expect(r.q).toBe('tam'); expect(keys(r)).toEqual(['dispatches', 'paddy-requests', 'warehouses']);
    expect((await build().service.search(actor('md', 'MD', ['sales.view']), 'x'.repeat(200))).q).toHaveLength(60);
  });
});

describe('quick search: fast and slow parts, cached, never held up', () => {
  const md = () => actor('md', 'MD', ['sales.view', 'supply.view', 'farm.view', 'warehouse.view', 'dispatch.track']);
  it('the fast part never touches the heavy loads, and the slow part never runs the small queries', async () => {
    const h = build();
    expect(keys(await h.service.search(md(), 'tam', 'fast'))).toEqual(['warehouses']);
    expect(h.tracking.list).not.toHaveBeenCalled(); expect(h.supply.board).not.toHaveBeenCalled();
    expect(keys(await h.service.search(md(), 'tam', 'slow'))).toEqual(['dispatches', 'paddy-requests']);
    expect(h.prisma.warehouse.findMany).toHaveBeenCalledTimes(1);
  });
  it('typing more letters reuses the heavy load: built once per person, not once per keystroke', async () => {
    const h = build();
    for (const q of ['nka', 'nkaw', 'nkawk', 'nkawka']) expect(titles(await h.service.search(md(), q, 'slow'), 'dispatches')).toEqual(['DS-1']);
    expect(h.tracking.list).toHaveBeenCalledTimes(1); expect(h.supply.board).toHaveBeenCalledTimes(1);
    await h.service.search(actor('someone-else', 'MD', ['dispatch.track', 'supply.view']), 'nka', 'slow');
    expect(h.tracking.list).toHaveBeenCalledTimes(2);                      // another person gets their OWN load, never a shared one
  });
  it('the same words from the same person are answered again without new queries', async () => {
    const h = build(); await h.service.search(md(), 'tam', 'fast'); await h.service.search(md(), 'TAM ', 'fast');
    expect(h.prisma.warehouse.findMany).toHaveBeenCalledTimes(1);
  });
  it('a kind of record that hangs does not hold the others up, and the answer says what is missing', async () => {
    const h = build(); (h.service as any).timeoutMs = 30; h.tracking.list.mockImplementation(() => new Promise(() => {}));
    const r = await h.service.search(md(), 'tam');
    expect(r.incomplete).toEqual(['Dispatches']); expect(keys(r)).toEqual(['paddy-requests', 'warehouses']);
  });
  it('an answer with a gap is never reused: the next try really tries again', async () => {
    const h = build(); (h.service as any).timeoutMs = 30; h.tracking.list.mockImplementationOnce(() => new Promise(() => {}));
    await h.service.search(md(), 'tam', 'fast'); const slow1 = await h.service.search(md(), 'tam', 'slow'); expect(slow1.incomplete).toEqual(['Dispatches']);
    h.tracking.list.mockResolvedValue({ journeys: [{ id: 'j', ref: 'DS-9', requestRef: null, vehicle: null, driver: null, lines: [], from: { name: 'A' }, to: { name: 'Tamale Warehouse' }, label: 'In transit' }], counts: {} });
    (h.service as any).journeys.clear();                                    // (the stuck load is given up on after its time; clear it here instead of waiting)
    const slow2 = await h.service.search(md(), 'tam', 'slow'); expect(slow2.incomplete).toBeUndefined(); expect(titles(slow2, 'dispatches')).toEqual(['DS-9']);
  });
});
