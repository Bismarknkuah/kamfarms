import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MillDispatchService } from '../mill-dispatch.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { setStandardBagWeightKg } from '../../common/constants/bag-weight';

const W1 = 'w1', W2 = 'w2', M1 = 'm1', M2 = 'm2', G4 = 'g4', G5 = 'g5', RICE = 'p-rice', BROKEN = 'p-broken', HULL = 'p-hull', S25 = 's25';
type Sc = { scopeType: string; scopeId: string | null };
const GLOBAL: Sc[] = [{ scopeType: 'GLOBAL', scopeId: null }];
const U = [
  { id: 'wm1', n: 'Kwabena Adjei', roles: ['WAREHOUSE_MANAGER'], scopes: [{ scopeType: 'WAREHOUSE', scopeId: W1 }] }, { id: 'wm2', n: 'Esi Quaye', roles: ['WAREHOUSE_MANAGER'], scopes: [{ scopeType: 'WAREHOUSE', scopeId: W2 }] },
  { id: 'ws1', n: 'Abena Osei', roles: ['WAREHOUSE_SUPERVISOR'], scopes: [{ scopeType: 'WAREHOUSE', scopeId: W1 }] }, { id: 'ws2', n: 'Yaw Boateng', roles: ['WAREHOUSE_SUPERVISOR'], scopes: [{ scopeType: 'WAREHOUSE', scopeId: W2 }] },
  { id: 'oo1', n: 'Ama Frimpong', roles: ['OPERATIONS_OFFICER'], scopes: [{ scopeType: 'MILLING_CENTER', scopeId: M1 }] }, { id: 'oo2', n: 'Kojo Darko', roles: ['OPERATIONS_OFFICER'], scopes: [{ scopeType: 'MILLING_CENTER', scopeId: M2 }] },
  { id: 'om1', n: 'Kwame Asare', roles: ['OPERATIONS_MANAGER'], scopes: GLOBAL }, { id: 'md1', n: 'Nana Addo', roles: ['MD'], scopes: GLOBAL }, { id: 'ad1', n: 'Admin User', roles: ['ADMIN'], scopes: GLOBAL },
  { id: 'both', n: 'Both Hats', roles: ['WAREHOUSE_MANAGER', 'WAREHOUSE_SUPERVISOR'], scopes: [{ scopeType: 'WAREHOUSE', scopeId: W1 }] }, { id: 'nobody', n: 'No Place', roles: ['WAREHOUSE_MANAGER'], scopes: [] as Sc[] },
];
const actor = (id: string) => { const u = U.find((x) => x.id === id)!; return { id, firstName: u.n.split(' ')[0], lastName: u.n.split(' ')[1], permissionCodes: new Set<string>(), roles: u.roles.map((r) => ({ roleId: r, roleCode: r, permissions: [], scopes: u.scopes })) } as unknown as AuthenticatedUser; };
const NAMES: Record<string, any> = { [W1]: { id: W1, name: 'Tamale Warehouse', isActive: true }, [W2]: { id: W2, name: 'Kumasi Warehouse', isActive: true }, [M1]: { id: M1, name: 'Tamale Mill', warehouseId: W1, isActive: true }, [M2]: { id: M2, name: 'Kumasi Mill', warehouseId: W2, isActive: true }, 'm-off': { id: 'm-off', name: 'Closed Mill', warehouseId: W1, isActive: false } };
const GRADES = [{ id: G4, label: 'Size 4', isActive: true }, { id: G5, label: 'Size 5', isActive: true }];
const PRODUCTS = [{ id: RICE, name: 'Premium Rice' }, { id: BROKEN, name: 'Broken Rice' }, { id: HULL, name: 'Rice Hull' }];

const dim = (k: any) => `${k.paddyGradeId ?? ''}|${k.productId ?? ''}|${k.packagingSizeId ?? ''}`;
function build(opts: { noBroken?: boolean; failReceipt?: boolean } = {}) {
  let seq = 0;
  const state = {
    rows: [] as any[], txns: [] as any[],
    stock: {
      [`WAREHOUSE:${W1}`]: { [`${G4}||`]: { bags: 100, kg: 5000 }, [`${G5}||`]: { bags: 80, kg: 4000 } }, [`WAREHOUSE:${W2}`]: { [`${G4}||`]: { bags: 10, kg: 500 } },
      [`MILLING_CENTER:${M1}`]: { [`|${RICE}|${S25}`]: { bags: 40, kg: 1000 }, [`|${BROKEN}|`]: { bags: 0, kg: 300 }, [`|${HULL}|`]: { bags: 0, kg: 500 } },
    } as Record<string, Record<string, { bags: number; kg: number }>>,
  };
  const at = (k: any) => ((state.stock[`${k.locationType}:${k.locationId}`] ??= {})[dim(k)] ??= { bags: 0, kg: 0 });
  const ledger = {
    generateNumber: jest.fn(async (_t: unknown, prefix: string) => `${prefix}-2026-${String(++seq).padStart(6, '0')}`),
    getBalance: jest.fn(async (_db: unknown, k: any) => { const b = state.stock[`${k.locationType}:${k.locationId}`]?.[dim(k)]; return b ? { bagCount: b.bags, quantityKg: b.kg } : null; }),
    getBalancesForLocation: jest.fn(async (type: string, id: string) => Object.entries(state.stock[`${type}:${id}`] ?? {}).map(([d, b]) => { const [g, p, s] = d.split('|'); return { paddyGradeId: g || null, productId: p || null, packagingSizeId: s || null, bagCount: b.bags, quantityKg: b.kg }; })),
    recordTransaction: jest.fn(async (_tx: unknown, t: any) => { state.txns.push(t); }),
    adjustBalance: jest.fn(async (_tx: unknown, k: any, kg: number, bags = 0) => { const b = at(k); if (b.kg + kg < -0.001 || b.bags + bags < 0) throw new BadRequestException({ message: 'negative inventory', errorCode: 'NEGATIVE_INVENTORY_REJECTED' }); b.kg += kg; b.bags += bags; }),
  };
  const hasRole = (row: any, codes: string[], scopeType: string, scopeId: string) => row.roles.some((r: string) => codes.includes(r)) && (row.scopes.length === 0 || row.scopes.some((s: Sc) => s.scopeType === 'GLOBAL' || (s.scopeType === scopeType && s.scopeId === scopeId)));
  const prisma: any = {
    millingCenter: { findUnique: jest.fn(async ({ where }: any) => (NAMES[where.id]?.warehouseId ? NAMES[where.id] : null)), findMany: jest.fn(async ({ where }: any) => Object.values(NAMES).filter((m: any) => m.warehouseId && m.isActive && (where.id?.in ? where.id.in.includes(m.id) : where.warehouseId?.in ? where.warehouseId.in.includes(m.warehouseId) : true))) },
    warehouse: { findUnique: jest.fn(async ({ where }: any) => (NAMES[where.id] && !NAMES[where.id].warehouseId ? NAMES[where.id] : null)), findMany: jest.fn(async ({ where }: any) => [W1, W2].map((i) => NAMES[i]).filter((w) => (where.id?.in ? where.id.in.includes(w.id) : true))) },
    paddyGrade: { findUnique: jest.fn(async ({ where }: any) => GRADES.find((g) => g.id === where.id) ?? null), findMany: jest.fn(async () => GRADES) },
    product: { findUnique: jest.fn(async ({ where }: any) => PRODUCTS.find((p) => p.id === where.id) ?? null), findFirst: jest.fn(async ({ where }: any) => (opts.noBroken && where.name === 'Broken Rice' ? null : PRODUCTS.find((p) => p.name === where.name) ?? null)), findMany: jest.fn(async () => PRODUCTS) },
    packagingSize: { findUnique: jest.fn(async ({ where }: any) => (where.id === S25 ? { id: S25, label: '25 kg', sizeKg: 25 } : null)), findMany: jest.fn(async () => [{ id: S25, label: '25 kg' }]) },
    user: { findMany: jest.fn(async ({ where }: any) => {
      if (where.id) return U.filter((u) => where.id.in.includes(u.id)).map((u) => ({ id: u.id, firstName: u.n.split(' ')[0], lastName: u.n.split(' ')[1] }));
      const some = where.roles.some; const sc = some.OR[2].scopes.some;
      return U.filter((u) => hasRole(u, some.role.code.in, sc.scopeType, sc.scopeId)).map((u) => ({ id: u.id }));
    }) },
    millTransfer: {
      create: jest.fn(async ({ data }: any) => { const r = { id: `mt${state.rows.length + 1}`, requestedAt: new Date('2026-10-06T08:00:00Z'), approvedById: null, approvedAt: null, decisionNote: null, receivedById: null, receivedAt: null, receivedLines: null, receiveNote: null, varianceKg: null, ...data }; state.rows.push(r); return r; }),
      findUnique: jest.fn(async ({ where }: any) => state.rows.find((r) => r.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }: any = {}) => state.rows.filter((r) => !where || !where.OR || where.OR.some((c: any) => Object.entries(c).every(([k, v]: any) => v.in.includes(r[k]))))),
      updateMany: jest.fn(async ({ where, data }: any) => { const r = state.rows.find((x) => x.id === where.id && x.status === where.status); if (!r) return { count: 0 }; Object.assign(r, data); return { count: 1 }; }),
    },
    $transaction: jest.fn(async (cb: any) => {
      const snap = JSON.stringify({ rows: state.rows, txns: state.txns, stock: state.stock });
      try { return await cb(prisma); } catch (e) { const s = JSON.parse(snap); state.rows.splice(0, state.rows.length, ...s.rows); state.txns.splice(0, state.txns.length, ...s.txns); state.stock = s.stock; throw e; }
    }),
  };
  const notifications = { notify: jest.fn() };
  const millReceipts = { create: jest.fn(async () => { if (opts.failReceipt) throw new Error('log down'); return {}; }) };
  const service = new MillDispatchService(prisma, { record: jest.fn() } as any, ledger as any, notifications as any, millReceipts as any);
  return { service, state, notifications, millReceipts, ledger, prisma };
}
const paddy = (g4 = 20, g5 = 10) => ({ direction: 'TO_MILL', millingCenterId: M1, lines: [{ kind: 'PADDY', paddyGradeId: G4, bags: g4 }, { kind: 'PADDY', paddyGradeId: G5, bags: g5 }], vehiclePlate: 'GT-1-21', driverName: 'Kofi' }) as any;
const products = (over: Record<string, unknown> = {}) => ({ direction: 'TO_WAREHOUSE', millingCenterId: M1, lines: [{ kind: 'PACKAGED_RICE', productId: RICE, packagingSizeId: S25, bags: 30 }, { kind: 'BROKEN_RICE', kg: 200 }, { kind: 'RICE_HULL', kg: 400 }], ...over }) as any;
const told = (n: jest.Mock) => n.mock.calls.map(([a]: any[]) => ({ ...a, userIds: [...a.userIds].sort() }));
const bal = (h: ReturnType<typeof build>, loc: string, id: string, d: string) => h.state.stock[`${loc}:${id}`]?.[d] ?? { bags: 0, kg: 0 };
beforeEach(() => setStandardBagWeightKg(50));

describe('the warehouse asks to send paddy to its mill', () => {
  it('is saved for the Warehouse Supervisor to approve, with the kilograms from the bag weight, and nothing moves yet', async () => {
    const h = build(); const v = await h.service.request(paddy(), actor('wm1'));
    expect(v).toMatchObject({ transferNumber: 'MT-2026-000001', direction: 'TO_MILL', status: 'PENDING_APPROVAL', label: 'Waiting for the Warehouse Supervisor to approve', from: 'Tamale Warehouse', to: 'Tamale Mill', totalBags: 30, totalKg: 1500, requestedBy: 'Kwabena Adjei', approverRole: 'Warehouse Supervisor', receiverRole: 'Operations Officer' });
    expect(v.lines.map((l) => [l.label, l.bags, l.kg])).toEqual([['Size 4', 20, 1000], ['Size 5', 10, 500]]);
    expect(bal(h, 'WAREHOUSE', W1, `${G4}||`)).toEqual({ bags: 100, kg: 5000 }); expect(h.state.txns).toEqual([]);
  });
  it('tells only the supervisors of THAT warehouse (anyone holding that role there, never the person who asked, nor another warehouse\'s supervisor)', async () => {
    const h = build(); await h.service.request(paddy(), actor('wm1'));
    expect(told(h.notifications.notify)).toEqual([expect.objectContaining({ userIds: ['both', 'ws1'], type: 'mill.dispatch', entityType: 'MillDispatch', entityId: 'mt1', title: 'Tamale Warehouse wants to send paddy to Tamale Mill', body: 'Size 4: 20, Size 5: 10. It needs your approval.' })]);
  });
  it('only the Warehouse Manager of that warehouse may ask: not another warehouse\'s, not a supervisor, not the mill', async () => {
    for (const who of ['wm2', 'ws1', 'oo1', 'om1']) await expect(build().service.request(paddy(), actor(who))).rejects.toThrow(ForbiddenException);
    await expect(build().service.request(paddy(), actor('ad1'))).resolves.toMatchObject({ status: 'PENDING_APPROVAL' });
  });
  it('refuses more than the warehouse holds, naming how many it has, and a size listed twice, and anything but paddy', async () => {
    await expect(build().service.request(paddy(101, 1), actor('wm1'))).rejects.toThrow('Tamale Warehouse has only 100 bags of Size 4 to send.');
    await expect(build().service.request({ ...paddy(), lines: [{ kind: 'PADDY', paddyGradeId: G4, bags: 1 }, { kind: 'PADDY', paddyGradeId: G4, bags: 2 }] }, actor('wm1'))).rejects.toThrow('twice');
    await expect(build().service.request({ ...paddy(), lines: [{ kind: 'BROKEN_RICE', kg: 5 }] }, actor('wm1'))).rejects.toThrow('Only paddy is sent to the mill');
  });
  it('the mill must be in use', async () => { await expect(build().service.request({ ...paddy(), millingCenterId: 'm-off' }, actor('wm1'))).rejects.toThrow('not found or not in use'); });
});

describe('the supervisor approves: the paddy leaves the warehouse and is on the way', () => {
  it('takes the paddy out of the warehouse stock at once into "on the way", in bags and kilograms', async () => {
    const h = build(); const r = await h.service.request(paddy(), actor('wm1')); h.notifications.notify.mockClear();
    const v = await h.service.approve(r.id, {}, actor('ws1'));
    expect(v).toMatchObject({ status: 'IN_TRANSIT', label: 'On the way to Tamale Mill', approvedBy: 'Abena Osei' });
    expect(bal(h, 'WAREHOUSE', W1, `${G4}||`)).toEqual({ bags: 80, kg: 4000 }); expect(bal(h, 'WAREHOUSE', W1, `${G5}||`)).toEqual({ bags: 70, kg: 3500 });
    expect(bal(h, 'EXTERNAL', r.id, `${G4}||`)).toEqual({ bags: 20, kg: 1000 });
    expect(h.state.txns.map((t) => [t.type, t.sourceLocationType, t.destLocationType, t.paddyGradeId, t.bagCount, t.quantityKg])).toEqual([['PADDY_DISPATCHED', 'WAREHOUSE', 'EXTERNAL', G4, 20, 1000], ['PADDY_DISPATCHED', 'WAREHOUSE', 'EXTERNAL', G5, 10, 500]]);
  });
  it('tells the person who asked, and the mill that is to receive it', async () => {
    const h = build(); const r = await h.service.request(paddy(), actor('wm1')); h.notifications.notify.mockClear(); await h.service.approve(r.id, {}, actor('ws1'));
    expect(told(h.notifications.notify).map((n) => [n.userIds, n.title])).toEqual([[['wm1'], 'Your dispatch was approved'], [['oo1'], 'Size 4: 20, Size 5: 10 is on the way to Tamale Mill']]);
  });
  it('only the Warehouse Supervisor of that warehouse approves; the manager, the mill and another warehouse\'s supervisor cannot', async () => {
    const h = build(); const r = await h.service.request(paddy(), actor('wm1'));
    for (const who of ['wm1', 'oo1', 'ws2', 'om1']) await expect(h.service.approve(r.id, {}, actor(who))).rejects.toThrow(ForbiddenException);
    expect(h.state.rows[0].status).toBe('PENDING_APPROVAL');
  });
  it('nobody approves their own request, even holding both roles', async () => {
    const h = build(); const r = await h.service.request(paddy(), actor('both'));
    await expect(h.service.approve(r.id, {}, actor('both'))).rejects.toThrow('cannot approve your own request');
    await expect(h.service.reject(r.id, { reason: 'no' + 'pe' }, actor('both'))).rejects.toThrow('cannot decide your own request');
    expect(h.state.rows[0].status).toBe('PENDING_APPROVAL'); expect(h.state.txns).toEqual([]);
  });
  it('is checked against the stock again at approval: if it has gone down since, it is refused and nothing at all moves', async () => {
    const h = build(); const r = await h.service.request(paddy(60, 10), actor('wm1'));
    bal(h, 'WAREHOUSE', W1, `${G4}||`).bags = 50; bal(h, 'WAREHOUSE', W1, `${G4}||`).kg = 2500; // sold or sent elsewhere meanwhile
    await expect(h.service.approve(r.id, {}, actor('ws1'))).rejects.toThrow('Tamale Warehouse now has only 50 bags of Size 4, so this cannot be approved yet.');
    expect(h.state.rows[0].status).toBe('PENDING_APPROVAL'); expect(h.state.txns).toEqual([]); expect(bal(h, 'WAREHOUSE', W1, `${G5}||`)).toEqual({ bags: 80, kg: 4000 });
  });
  it('a second press does nothing more', async () => {
    const h = build(); const r = await h.service.request(paddy(), actor('wm1')); await h.service.approve(r.id, {}, actor('ws1'));
    await expect(h.service.approve(r.id, {}, actor('ws1'))).rejects.toThrow('already been decided'); expect(bal(h, 'WAREHOUSE', W1, `${G4}||`).bags).toBe(80);
  });
});

describe('refusing and cancelling', () => {
  it('the supervisor refuses with a reason, nothing moves, and the person who asked is told why', async () => {
    const h = build(); const r = await h.service.request(paddy(), actor('wm1')); h.notifications.notify.mockClear();
    const v = await h.service.reject(r.id, { reason: 'The mill is closed this week' }, actor('ws1'));
    expect(v).toMatchObject({ status: 'REJECTED', label: 'Not approved', decisionNote: 'The mill is closed this week' }); expect(h.state.txns).toEqual([]);
    expect(told(h.notifications.notify)).toEqual([expect.objectContaining({ userIds: ['wm1'], title: 'Your dispatch was not approved', body: 'The mill is closed this week' })]);
  });
  it('before approval the person who asked, or the approver, may cancel it; nobody else', async () => {
    const h = build(); const r = await h.service.request(paddy(), actor('wm1'));
    await expect(h.service.cancel(r.id, {}, actor('wm2'))).rejects.toThrow(ForbiddenException); await expect(h.service.cancel(r.id, {}, actor('oo1'))).rejects.toThrow(ForbiddenException);
    await expect(h.service.cancel(r.id, { note: 'wrong mill' }, actor('wm1'))).resolves.toMatchObject({ status: 'CANCELLED' });
    const r2 = await h.service.request(paddy(), actor('wm1')); await expect(h.service.cancel(r2.id, {}, actor('ws1'))).resolves.toMatchObject({ status: 'CANCELLED' });
  });
  it('once it is on the way only the approver may cancel, and the stock goes back where it came from', async () => {
    const h = build(); const r = await h.service.request(paddy(), actor('wm1')); await h.service.approve(r.id, {}, actor('ws1'));
    await expect(h.service.cancel(r.id, {}, actor('wm1'))).rejects.toThrow('only the one who approves');
    await h.service.cancel(r.id, { note: 'truck broke down' }, actor('ws1'));
    expect(bal(h, 'WAREHOUSE', W1, `${G4}||`)).toEqual({ bags: 100, kg: 5000 }); expect(bal(h, 'EXTERNAL', r.id, `${G4}||`)).toEqual({ bags: 0, kg: 0 }); expect(h.state.rows[0].status).toBe('CANCELLED');
  });
  it('after it has been counted in it can no longer be cancelled', async () => {
    const h = build(); const r = await h.service.request(paddy(), actor('wm1')); await h.service.approve(r.id, {}, actor('ws1'));
    await h.service.receive(r.id, { lines: [{ key: `PADDY:${G4}`, bags: 20 }, { key: `PADDY:${G5}`, bags: 10 }] }, actor('oo1'));
    await expect(h.service.cancel(r.id, {}, actor('ws1'))).rejects.toThrow('can no longer be cancelled');
  });
});

describe('the mill counts the paddy in', () => {
  const sent = async (h = build()) => { const r = await h.service.request(paddy(), actor('wm1')); await h.service.approve(r.id, {}, actor('ws1')); h.notifications.notify.mockClear(); return { h, id: r.id }; };
  const all = [{ key: `PADDY:${G4}`, bags: 20 }, { key: `PADDY:${G5}`, bags: 10 }];
  it('puts what arrived into the MILL\'s stock, closes "on the way", writes the mill\'s own received-paddy record, and tells the warehouse', async () => {
    const { h, id } = await sent(); const v = await h.service.receive(id, { lines: all, notes: 'Good' }, actor('oo1'));
    expect(v).toMatchObject({ status: 'RECEIVED', label: 'Received at Tamale Mill', receivedBy: 'Ama Frimpong', varianceKg: 0 });
    expect(bal(h, 'MILLING_CENTER', M1, `${G4}||`)).toEqual({ bags: 20, kg: 1000 }); expect(bal(h, 'MILLING_CENTER', M1, `${G5}||`)).toEqual({ bags: 10, kg: 500 }); expect(bal(h, 'EXTERNAL', id, `${G4}||`)).toEqual({ bags: 0, kg: 0 });
    expect(h.state.txns.filter((t) => t.type === 'PADDY_RECEIVED_AT_MILL').map((t) => [t.paddyGradeId, t.bagCount, t.quantityKg, t.destLocationType])).toEqual([[G4, 20, 1000, 'MILLING_CENTER'], [G5, 10, 500, 'MILLING_CENTER']]);
    expect(h.millReceipts.create).toHaveBeenCalledTimes(1); expect((h.millReceipts.create as jest.Mock).mock.calls[0][0]).toMatchObject({ millingCenterId: M1, lines: [{ paddyGradeId: G4, bagCount: 20 }, { paddyGradeId: G5, bagCount: 10 }] });
    expect(told(h.notifications.notify)).toEqual([expect.objectContaining({ userIds: ['wm1', 'ws1'], title: 'Tamale Mill has counted in your dispatch', body: 'Size 4: 20, Size 5: 10: all of it arrived.' })]);
    expect(v.steps.map((s) => [s.label, s.state])).toEqual([['Asked', 'done'], ['Approved', 'done'], ['On the way', 'done'], ['Counted in at the mill', 'done']]);
  });
  it('a shortage is credited as counted, written down for review (held for approval beyond 5 kg), and said plainly', async () => {
    const { h, id } = await sent(); const v = await h.service.receive(id, { lines: [{ key: `PADDY:${G4}`, bags: 19 }, { key: `PADDY:${G5}`, bags: 10 }] }, actor('oo1'));
    expect(v.label).toBe('Received at Tamale Mill: less than sent arrived'); expect(v.varianceKg).toBe(-50);
    expect(bal(h, 'MILLING_CENTER', M1, `${G4}||`)).toEqual({ bags: 19, kg: 950 }); expect(bal(h, 'EXTERNAL', id, `${G4}||`)).toEqual({ bags: 0, kg: 0 });
    expect(h.state.txns.filter((t) => t.type === 'STOCK_ADJUSTMENT')).toEqual([expect.objectContaining({ paddyGradeId: G4, quantityKg: 50, approvalStatus: 'PENDING', reason: 'Dispatch difference: 20 bags of Size 4 sent, 19 counted in.' })]);
  });
  it('cannot count in more than was sent, must say how many of every item, and nothing that was not on it', async () => {
    const { h, id } = await sent();
    await expect(h.service.receive(id, { lines: [{ key: `PADDY:${G4}`, bags: 21 }, { key: `PADDY:${G5}`, bags: 10 }] }, actor('oo1'))).rejects.toThrow('20 bags were sent, so 21 cannot have arrived');
    await expect(h.service.receive(id, { lines: [{ key: `PADDY:${G4}`, bags: 20 }] }, actor('oo1'))).rejects.toThrow('Say how much arrived of every item');
    await expect(h.service.receive(id, { lines: [{ key: 'PADDY:g9', bags: 1 }] }, actor('oo1'))).rejects.toThrow('not on this dispatch');
    await expect(h.service.receive(id, { lines: [...all, all[0]] }, actor('oo1'))).rejects.toThrow('twice');
    expect(h.state.rows[0].status).toBe('IN_TRANSIT');
  });
  it('only the mill\'s Operations Officer counts paddy in: not the warehouse, not another mill; and only once; and only after approval', async () => {
    const { h, id } = await sent();
    for (const who of ['wm1', 'ws1', 'oo2', 'om1']) await expect(h.service.receive(id, { lines: all }, actor(who))).rejects.toThrow(ForbiddenException);
    await h.service.receive(id, { lines: all }, actor('oo1')); await expect(h.service.receive(id, { lines: all }, actor('oo1'))).rejects.toThrow('already been counted in');
    const h2 = build(); const r = await h2.service.request(paddy(), actor('wm1')); await expect(h2.service.receive(r.id, { lines: all }, actor('oo1'))).rejects.toThrow('not on the way');
  });
  it('the mill\'s received-paddy record failing never undoes the count', async () => {
    const h = build({ failReceipt: true }); const r = await h.service.request(paddy(), actor('wm1')); await h.service.approve(r.id, {}, actor('ws1'));
    await expect(h.service.receive(r.id, { lines: all }, actor('oo1'))).resolves.toMatchObject({ status: 'RECEIVED' }); expect(bal(h, 'MILLING_CENTER', M1, `${G4}||`).bags).toBe(20);
  });
});

describe('the mill sends finished products to the warehouse: the Operations Officer asks, the Operations Manager approves, the warehouse counts them in', () => {
  it('packaged rice, broken rice and hull are asked for, with the kilograms of packaged rice from its pack size', async () => {
    const h = build(); const v = await h.service.request(products(), actor('oo1'));
    expect(v).toMatchObject({ direction: 'TO_WAREHOUSE', status: 'PENDING_APPROVAL', label: 'Waiting for the Operations Manager to approve', from: 'Tamale Mill', to: 'Tamale Warehouse', totalBags: 30, totalKg: 1350, approverRole: 'Operations Manager', receiverRole: 'Warehouse Manager' });
    expect(v.lines.map((l) => [l.label, l.bags, l.kg])).toEqual([['Premium Rice 25 kg', 30, 750], ['Broken rice', 0, 200], ['Rice hull', 0, 400]]);
    expect(told(h.notifications.notify)).toEqual([expect.objectContaining({ userIds: ['om1'], title: 'Tamale Mill wants to send finished products to Tamale Warehouse' })]);
  });
  it('only the Operations Officer of that mill asks; paddy cannot go this way; more than the mill holds is refused', async () => {
    for (const who of ['oo2', 'wm1', 'ws1', 'om1']) await expect(build().service.request(products(), actor(who))).rejects.toThrow(ForbiddenException);
    await expect(build().service.request({ ...products(), lines: [{ kind: 'PADDY', paddyGradeId: G4, bags: 1 }] }, actor('oo1'))).rejects.toThrow('go to the warehouse; paddy goes to the mill');
    await expect(build().service.request(products({ lines: [{ kind: 'PACKAGED_RICE', productId: RICE, packagingSizeId: S25, bags: 41 }] }), actor('oo1'))).rejects.toThrow('Tamale Mill has only 40 bags of Premium Rice 25 kg to send.');
    await expect(build().service.request(products({ lines: [{ kind: 'RICE_HULL', kg: 500.5 }] }), actor('oo1'))).rejects.toThrow('Tamale Mill has only 500 kg of Rice hull to send.');
    await expect(build({ noBroken: true }).service.request(products({ lines: [{ kind: 'BROKEN_RICE', kg: 1 }] }), actor('oo1'))).rejects.toThrow('no broken rice to send yet');
  });
  it('only the Operations Manager approves it (not the officer who asked, not the warehouse side); then the products leave the MILL', async () => {
    const h = build(); const r = await h.service.request(products(), actor('oo1'));
    for (const who of ['oo1', 'wm1', 'ws1']) await expect(h.service.approve(r.id, {}, actor(who))).rejects.toThrow(ForbiddenException);
    await h.service.approve(r.id, {}, actor('om1'));
    expect(bal(h, 'MILLING_CENTER', M1, `|${RICE}|${S25}`)).toEqual({ bags: 10, kg: 250 });
    expect(bal(h, 'MILLING_CENTER', M1, `|${BROKEN}|`)).toEqual({ bags: 0, kg: 100 }); expect(bal(h, 'MILLING_CENTER', M1, `|${HULL}|`)).toEqual({ bags: 0, kg: 100 });
    expect(h.state.txns.map((t) => [t.type, t.productId])).toEqual([['PACKAGED_RICE_DISPATCHED', RICE], ['STOCK_TRANSFER', BROKEN], ['STOCK_TRANSFER', HULL]]);
  });
  it('the warehouse manager counts them in: packaged rice, broken rice and hull land in the WAREHOUSE\'s stock, and the mill does not count it', async () => {
    const h = build(); const r = await h.service.request(products(), actor('oo1')); await h.service.approve(r.id, {}, actor('om1')); h.notifications.notify.mockClear();
    const keys = ['PACKAGED_RICE:' + RICE + ':' + S25, 'BROKEN_RICE', 'RICE_HULL'];
    await expect(h.service.receive(r.id, { lines: [{ key: keys[0], bags: 30 }, { key: keys[1], kg: 200 }, { key: keys[2], kg: 400 }] }, actor('oo1'))).rejects.toThrow(ForbiddenException);
    const v = await h.service.receive(r.id, { lines: [{ key: keys[0], bags: 30 }, { key: keys[1], kg: 195 }, { key: keys[2], kg: 400 }] }, actor('wm1'));
    expect(v).toMatchObject({ status: 'RECEIVED', label: 'Received at Tamale Warehouse: less than sent arrived', varianceKg: -5 });
    expect(bal(h, 'WAREHOUSE', W1, `|${RICE}|${S25}`)).toEqual({ bags: 30, kg: 750 }); expect(bal(h, 'WAREHOUSE', W1, `|${BROKEN}|`)).toEqual({ bags: 0, kg: 195 }); expect(bal(h, 'WAREHOUSE', W1, `|${HULL}|`)).toEqual({ bags: 0, kg: 400 });
    expect(bal(h, 'EXTERNAL', r.id, `|${BROKEN}|`)).toEqual({ bags: 0, kg: 0 }); expect(h.millReceipts.create).not.toHaveBeenCalled();
    expect(h.state.txns.filter((t) => t.type === 'STOCK_ADJUSTMENT')).toEqual([expect.objectContaining({ productId: BROKEN, quantityKg: 5, approvalStatus: 'APPROVED' })]); // within 5 kg: accepted
  });
  it('kilograms cannot exceed what was sent, and kilogram items need kilograms', async () => {
    const h = build(); const r = await h.service.request(products(), actor('oo1')); await h.service.approve(r.id, {}, actor('om1'));
    await expect(h.service.receive(r.id, { lines: [{ key: 'PACKAGED_RICE:' + RICE + ':' + S25, bags: 30 }, { key: 'BROKEN_RICE', kg: 201 }, { key: 'RICE_HULL', kg: 400 }] }, actor('wm1'))).rejects.toThrow('200 kg were sent, so 201 kg cannot have arrived');
    await expect(h.service.receive(r.id, { lines: [{ key: 'PACKAGED_RICE:' + RICE + ':' + S25, bags: 30 }, { key: 'BROKEN_RICE', bags: 5 }, { key: 'RICE_HULL', kg: 400 }] }, actor('wm1'))).rejects.toThrow('how many kilograms of Broken rice');
  });
});

describe('who sees which dispatches, what each person may do, and the forms', () => {
  const setup = async () => { const h = build(); const a = await h.service.request(paddy(), actor('wm1')); const b = await h.service.request(products(), actor('oo1')); return { h, a, b }; };
  it('each person sees only the dispatches of their own warehouse or mill; management sees all; someone with no place sees none', async () => {
    const { h } = await setup(); h.state.rows.push({ ...h.state.rows[0], id: 'mt-other', warehouseId: W2, millingCenterId: M2, transferNumber: 'MT-OTHER' });
    const ids = async (who: string) => (await h.service.list(actor(who))).map((v) => v.id).sort();
    expect(await ids('wm1')).toEqual(['mt1', 'mt2']); expect(await ids('oo1')).toEqual(['mt1', 'mt2']); expect(await ids('ws1')).toEqual(['mt1', 'mt2']);
    expect(await ids('wm2')).toEqual(['mt-other']); expect(await ids('oo2')).toEqual(['mt-other']);
    expect(await ids('md1')).toEqual(['mt-other', 'mt1', 'mt2']); expect(await ids('om1')).toEqual(['mt-other', 'mt1', 'mt2']); expect(await ids('nobody')).toEqual([]);
  });
  it('each view says what the person looking may do about it right now', async () => {
    const { h, a, b } = await setup(); await h.service.approve(a.id, {}, actor('ws1'));
    const flags = async (who: string, id: string) => { const v = (await h.service.list(actor(who))).find((x) => x.id === id)!; return [v.canApprove, v.canReceive, v.canCancel]; };
    expect(await flags('oo1', a.id)).toEqual([false, true, false]);   // the mill counts the paddy in
    expect(await flags('ws1', a.id)).toEqual([false, false, true]);   // the supervisor may still cancel it on the way
    expect(await flags('wm1', a.id)).toEqual([false, false, false]);
    expect(await flags('om1', b.id)).toEqual([true, false, true]);    // the Operations Manager decides the mill's products
    expect(await flags('oo1', b.id)).toEqual([false, false, true]);   // the officer who asked may cancel their own request
    expect(await flags('md1', b.id)).toEqual([false, false, false]);  // management watches only
  });
  it('the forms: a Warehouse Manager is offered their own warehouse\'s paddy, an Operations Officer their own mill\'s finished products, nobody else either', async () => {
    const h = build();
    const wm = await h.service.options(actor('wm1')); expect(wm.toWarehouse).toBeNull();
    expect(wm.toMill.places).toEqual([{ warehouse: { id: W1, name: 'Tamale Warehouse' }, mills: [{ id: M1, name: 'Tamale Mill' }], paddy: [{ paddyGradeId: G4, label: 'Size 4', bags: 100 }, { paddyGradeId: G5, label: 'Size 5', bags: 80 }] }]);
    const oo = await h.service.options(actor('oo1')); expect(oo.toMill).toBeNull();
    expect(oo.toWarehouse.mills).toEqual([{ id: M1, name: 'Tamale Mill', warehouse: { id: W1, name: 'Tamale Warehouse' }, packaged: [{ productId: RICE, packagingSizeId: S25, label: 'Premium Rice 25 kg', bags: 40, kg: 1000 }], broken: { productId: BROKEN, kg: 300 }, hull: { productId: HULL, kg: 500 } }]);
    const both = await h.service.options(actor('ad1')); expect(both.toMill.places).toHaveLength(2); expect(both.toWarehouse.mills).toHaveLength(2);
    const none = await h.service.options(actor('ws1')); expect(none).toEqual({ toMill: null, toWarehouse: null });
  });
});
