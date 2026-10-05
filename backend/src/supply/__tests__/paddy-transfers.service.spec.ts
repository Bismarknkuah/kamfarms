import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaddyTransfersService } from '../paddy-transfers.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { setStandardBagWeightKg } from '../../common/constants/bag-weight';

const WH1 = 'wh-1', WH2 = 'wh-2', WH3 = 'wh-3', G4 = 'g4', G5 = 'g5';
const USERS = [
  { id: 'ws-1', firstName: 'Abena', lastName: 'Osei', role: 'WAREHOUSE_SUPERVISOR', scopes: [{ type: 'WAREHOUSE', id: WH1 }] },
  { id: 'wm-1', firstName: 'Kofi', lastName: 'Mensah', role: 'WAREHOUSE_MANAGER', scopes: [{ type: 'WAREHOUSE', id: WH1 }] },
  { id: 'ws-2', firstName: 'Yaw', lastName: 'Boateng', role: 'WAREHOUSE_SUPERVISOR', scopes: [{ type: 'WAREHOUSE', id: WH2 }] },
  { id: 'wm-2', firstName: 'Esi', lastName: 'Quaye', role: 'WAREHOUSE_MANAGER', scopes: [{ type: 'WAREHOUSE', id: WH2 }] },
  { id: 'ws-3', firstName: 'Kwabena', lastName: 'Ofori', role: 'WAREHOUSE_SUPERVISOR', scopes: [{ type: 'WAREHOUSE', id: WH3 }] },
  { id: 'ad-1', firstName: 'Admin', lastName: 'User', role: 'ADMIN', scopes: [{ type: 'GLOBAL', id: null }] },
  { id: 'md-1', firstName: 'Nana', lastName: 'Addo', role: 'MD', scopes: [{ type: 'GLOBAL', id: null }] },
];
const actor = (id: string) => {
  const u = USERS.find((x) => x.id === id)!;
  return { id, firstName: u.firstName, lastName: u.lastName, permissionCodes: new Set(), roles: [{ roleId: 'r', roleCode: u.role, permissions: [], scopes: u.scopes.map((s) => ({ scopeType: s.type, scopeId: s.id })) }] } as unknown as AuthenticatedUser;
};
const WAREHOUSES: Record<string, any> = {
  [WH1]: { id: WH1, name: 'Tamale Warehouse', location: 'Tamale', isActive: true }, [WH2]: { id: WH2, name: 'Kumasi Warehouse', location: 'Kumasi', isActive: true },
  [WH3]: { id: WH3, name: 'Bolga Warehouse', location: 'Bolgatanga', isActive: true }, 'wh-off': { id: 'wh-off', name: 'Closed Warehouse', location: null, isActive: false },
};
const GRADES = [{ id: G4, label: 'Size 4', isActive: true }, { id: G5, label: 'Size 5', isActive: true }];

function build(supplyRows: any[] = []) {
  let seq = 0;
  const stock: Record<string, Record<string, Record<string, number>>> = { WAREHOUSE: { [WH1]: { [G4]: 120, [G5]: 80 }, [WH2]: { [G4]: 10, [G5]: 0 } }, EXTERNAL: {} };
  const kg: Record<string, number> = {};
  const txns: any[] = [];
  const rows: any[] = [];
  const bump = (type: string, id: string, grade: string, bags: number, kgs: number) => { stock[type] ??= {}; stock[type][id] ??= {}; stock[type][id][grade] = (stock[type][id][grade] ?? 0) + bags; kg[`${type}:${id}:${grade}`] = (kg[`${type}:${id}:${grade}`] ?? 0) + kgs; };
  const ledger = {
    generateNumber: jest.fn(async (_t: unknown, prefix: string) => `${prefix}-2026-${String(++seq).padStart(6, '0')}`),
    getBalancesForLocation: jest.fn(async (type: string, id: string) => Object.entries(stock[type]?.[id] ?? {}).map(([paddyGradeId, bagCount]) => ({ paddyGradeId, bagCount }))),
    recordTransaction: jest.fn(async (_tx: unknown, t: any) => { txns.push(t); }),
    adjustBalance: jest.fn(async (_tx: unknown, k: any, kgs: number, bags: number) => bump(k.locationType, k.locationId, k.paddyGradeId, bags, kgs)),
  };
  const matchRow = (r: any, w: any): boolean => !w || Object.entries(w).every(([k, v]: any) => (k === 'OR' ? v.some((c: any) => matchRow(r, c)) : v && typeof v === 'object' && 'in' in v ? v.in.includes(r[k]) : v && typeof v === 'object' && 'not' in v ? r[k] !== v.not : r[k] === v));
  const prisma: any = {
    warehouse: {
      findUnique: jest.fn(async ({ where }: any) => WAREHOUSES[where.id] ?? null),
      findMany: jest.fn(async ({ where }: any) => Object.values(WAREHOUSES).filter((w: any) => (where?.id?.in ? where.id.in.includes(w.id) : w.isActive))),
    },
    paddyGrade: { findMany: jest.fn(async ({ where }: any) => GRADES.filter((g) => (where.id?.in ? where.id.in.includes(g.id) : g.isActive))) },
    paddyTransfer: {
      create: jest.fn(async ({ data }: any) => { const r = { id: `pt${rows.length + 1}`, sentAt: new Date('2026-10-06T07:00:00Z'), receivedById: null, receivedAt: null, receivedLines: null, varianceBags: null, receiveNote: null, cancelReason: null, ...data }; rows.push(r); return r; }),
      findUnique: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
      findFirst: jest.fn(async ({ where }: any) => rows.find((r) => matchRow(r, where)) ?? null),
      findMany: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matchRow(r, where))),
      updateMany: jest.fn(async ({ where, data }: any) => { const r = rows.find((x) => x.id === where.id && x.status === where.status); if (!r) return { count: 0 }; Object.assign(r, data); return { count: 1 }; }),
    },
    supplyRequest: { findFirst: jest.fn(async ({ where }: any) => supplyRows.find((r) => r.requestNumber === where.requestNumber) ?? null) },
    user: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where.id) return USERS.filter((u) => where.id.in.includes(u.id));
        const some = where.roles.some; const codes = some.role.code.in; const wh = some.OR?.[2]?.scopes?.some?.scopeId;
        return USERS.filter((u) => codes.includes(u.role) && (u.scopes.length === 0 || u.scopes.some((s) => s.type === 'GLOBAL' || (s.type === 'WAREHOUSE' && s.id === wh))));
      }),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  prisma.paddyTransfer.create.mockImplementation(prisma.paddyTransfer.create.getMockImplementation());
  const notifications = { notify: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new PaddyTransfersService(prisma, audit as any, ledger as any, notifications as any);
  return { service, stock, kg, txns, rows, prisma, notifications, audit, ledger };
}
const send = (over: Record<string, unknown> = {}) => ({ fromWarehouseId: WH1, toWarehouseId: WH2, lines: [{ paddyGradeId: G4, bags: 20 }, { paddyGradeId: G5, bags: 10 }], driverName: 'Kojo Asante', vehiclePlate: 'GT-1234-21', ...over }) as any;
const told = (n: jest.Mock) => n.mock.calls.map(([a]: any[]) => ({ ...a, userIds: [...a.userIds].sort() })); // who is told, not in what order
beforeEach(() => setStandardBagWeightKg(50));

describe('sending paddy to another warehouse', () => {
  it('takes the bags out of the sender\'s stock into "in transit" at once, in bags only, the kilograms following the standard bag weight', async () => {
    const h = build();
    const v = await h.service.send(send(), actor('ws-1'));
    expect(h.stock.WAREHOUSE[WH1]).toEqual({ [G4]: 100, [G5]: 70 });
    expect(h.stock.EXTERNAL.pt1).toEqual({ [G4]: 20, [G5]: 10 });
    expect(h.kg[`WAREHOUSE:${WH1}:${G4}`]).toBe(-1000); expect(h.kg[`EXTERNAL:pt1:${G5}`]).toBe(500);
    expect(h.txns.map((t) => [t.type, t.paddyGradeId, t.bagCount, t.quantityKg, t.sourceLocationType, t.destLocationType])).toEqual([['PADDY_DISPATCHED', G4, 20, 1000, 'WAREHOUSE', 'EXTERNAL'], ['PADDY_DISPATCHED', G5, 10, 500, 'WAREHOUSE', 'EXTERNAL']]);
    expect(v).toMatchObject({ transferNumber: 'PT-2026-000001', status: 'IN_TRANSIT', label: 'On the road to Kumasi Warehouse', totalBags: 30, driverName: 'Kojo Asante', vehiclePlate: 'GT-1234-21', sentBy: 'Abena Osei' });
    expect(v.from).toEqual({ id: WH1, name: 'Tamale Warehouse' }); expect(v.to).toEqual({ id: WH2, name: 'Kumasi Warehouse' });
    expect(h.rows[0].totalKg).toBe(1500);
  });

  it('follows the bag weight in Settings', async () => {
    setStandardBagWeightKg(60);
    const h = build(); await h.service.send(send({ lines: [{ paddyGradeId: G4, bags: 5 }] }), actor('ws-1'));
    expect(h.rows[0].totalKg).toBe(300); expect(h.txns[0].quantityKg).toBe(300);
  });

  it('tells the destination\'s manager and supervisor (and nobody at the sender)', async () => {
    const h = build(); await h.service.send(send(), actor('ws-1'));
    expect(told(h.notifications.notify)).toEqual([expect.objectContaining({ userIds: ['wm-2', 'ws-2'], type: 'paddy.transfer', title: 'Tamale Warehouse is sending you 30 bags', body: 'Size 4: 20, Size 5: 10 · GT-1234-21 · Kojo Asante', entityType: 'PaddyTransfer', entityId: 'pt1' })]);
  });

  it('refuses more bags than the warehouse holds, naming how many it has, and moves nothing', async () => {
    const h = build();
    await expect(h.service.send(send({ lines: [{ paddyGradeId: G4, bags: 20 }, { paddyGradeId: G5, bags: 81 }] }), actor('ws-1'))).rejects.toThrow('Tamale Warehouse has only 80 bags of Size 5 to send.');
    expect(h.stock.WAREHOUSE[WH1]).toEqual({ [G4]: 120, [G5]: 80 }); expect(h.rows).toHaveLength(0); expect(h.txns).toHaveLength(0);
  });

  it('refuses sending to itself, to a warehouse that is closed or unknown, and a size listed twice', async () => {
    const h = build();
    await expect(h.service.send(send({ toWarehouseId: WH1 }), actor('ws-1'))).rejects.toThrow('different warehouse');
    await expect(h.service.send(send({ toWarehouseId: 'wh-off' }), actor('ws-1'))).rejects.toThrow('not found or is not in use');
    await expect(h.service.send(send({ toWarehouseId: 'nowhere' }), actor('ws-1'))).rejects.toThrow('not found or is not in use');
    await expect(h.service.send(send({ lines: [{ paddyGradeId: G4, bags: 1 }, { paddyGradeId: G4, bags: 2 }] }), actor('ws-1'))).rejects.toThrow('twice');
    expect(h.rows).toHaveLength(0);
  });

  it('only someone who looks after the sending warehouse can send from it; the Administrator can send from any', async () => {
    const h = build();
    await expect(h.service.send(send(), actor('ws-2'))).rejects.toThrow(ForbiddenException);
    await expect(h.service.send(send(), actor('ws-3'))).rejects.toThrow(ForbiddenException);
    expect(h.rows).toHaveLength(0);
    await expect(h.service.send(send(), actor('ad-1'))).resolves.toMatchObject({ status: 'IN_TRANSIT' });
  });

  describe('for a paddy request the Farm Director gave to this warehouse', () => {
    const REQ = { id: 'sr1', requestNumber: 'SR-2026-000007', kind: 'WAREHOUSE', status: 'ASSIGNED', sourceWarehouseId: WH1, warehouseId: WH2, requestedById: 'wm-2' };
    it('is tied to the request, and the person who asked is told it is on its way', async () => {
      const h = build([REQ]);
      const v = await h.service.send(send({ supplyRequestNumber: 'SR-2026-000007' }), actor('ws-1'));
      expect(v.supplyRequestNumber).toBe('SR-2026-000007');
      expect(told(h.notifications.notify).find((n) => n.entityType === 'SupplyRequest')).toMatchObject({ userIds: ['wm-2'], entityId: 'SR-2026-000007', title: 'Tamale Warehouse has sent your paddy', body: 'Size 4: 20, Size 5: 10 · on the road to Kumasi Warehouse' });
    });
    it('only when the request is assigned to THIS warehouse and is for THAT destination', async () => {
      await expect(build([{ ...REQ, sourceWarehouseId: WH3 }]).service.send(send({ supplyRequestNumber: 'SR-2026-000007' }), actor('ws-1'))).rejects.toThrow('not waiting for this warehouse');
      await expect(build([{ ...REQ, warehouseId: WH3 }]).service.send(send({ supplyRequestNumber: 'SR-2026-000007' }), actor('ws-1'))).rejects.toThrow('not waiting for this warehouse');
      await expect(build([{ ...REQ, status: 'FORWARDED' }]).service.send(send({ supplyRequestNumber: 'SR-2026-000007' }), actor('ws-1'))).rejects.toThrow('not waiting for this warehouse');
      await expect(build().service.send(send({ supplyRequestNumber: 'SR-2026-999999' }), actor('ws-1'))).rejects.toThrow('not waiting for this warehouse');
    });
    it('only once, unless the first delivery was cancelled', async () => {
      const h = build([REQ]);
      const first = await h.service.send(send({ supplyRequestNumber: 'SR-2026-000007', lines: [{ paddyGradeId: G4, bags: 5 }] }), actor('ws-1'));
      await expect(h.service.send(send({ supplyRequestNumber: 'SR-2026-000007', lines: [{ paddyGradeId: G4, bags: 5 }] }), actor('ws-1'))).rejects.toThrow('already has paddy on its way');
      await h.service.cancel(first.id, {}, actor('ws-1'));
      await expect(h.service.send(send({ supplyRequestNumber: 'SR-2026-000007', lines: [{ paddyGradeId: G4, bags: 5 }] }), actor('ws-1'))).resolves.toMatchObject({ status: 'IN_TRANSIT' });
    });
  });
});

describe('counting paddy in at the other end', () => {
  const sent = async (h = build()) => ({ h, v: await h.service.send(send(), actor('ws-1')) });
  const got = (g4: number, g5: number, over: Record<string, unknown> = {}) => ({ lines: [{ paddyGradeId: G4, bags: g4 }, { paddyGradeId: G5, bags: g5 }], ...over }) as any;

  it('credits the receiver with what arrived, closes the in-transit bucket completely, and the stock adds up', async () => {
    const { h, v } = await sent();
    const done = await h.service.receive(v.id, got(20, 10), actor('wm-2'));
    expect(done).toMatchObject({ status: 'RECEIVED', label: 'Arrived at Kumasi Warehouse', varianceBags: 0, receivedBy: 'Esi Quaye' });
    expect(h.stock.WAREHOUSE[WH2]).toEqual({ [G4]: 30, [G5]: 10 });
    expect(h.stock.EXTERNAL.pt1).toEqual({ [G4]: 0, [G5]: 0 });
    expect(h.stock.WAREHOUSE[WH1]).toEqual({ [G4]: 100, [G5]: 70 }); // total across places: 120 + 80 + 10 before, the same after
    expect(h.txns.filter((t) => t.type === 'PADDY_RECEIVED_AT_WAREHOUSE').map((t) => [t.paddyGradeId, t.bagCount, t.quantityKg])).toEqual([[G4, 20, 1000], [G5, 10, 500]]);
    expect(h.txns.some((t) => t.type === 'STOCK_ADJUSTMENT')).toBe(false); // nothing to review
  });

  it('a shortage is credited as counted, written down for review, and the sender is told', async () => {
    const { h, v } = await sent();
    const done = await h.service.receive(v.id, got(19, 10, { notes: 'One bag was torn' }), actor('ws-2'));
    expect(done).toMatchObject({ varianceBags: -1, label: 'Arrived at Kumasi Warehouse: 1 bag short', receiveNote: 'One bag was torn' });
    expect(done.receivedLines).toEqual([{ paddyGradeId: G4, gradeLabel: 'Size 4', bags: 19 }, { paddyGradeId: G5, gradeLabel: 'Size 5', bags: 10 }]);
    expect(h.stock.WAREHOUSE[WH2][G4]).toBe(29); expect(h.stock.EXTERNAL.pt1[G4]).toBe(0); // the missing bag is not left floating
    const adj = h.txns.filter((t) => t.type === 'STOCK_ADJUSTMENT'); expect(adj).toHaveLength(1);
    expect(adj[0]).toMatchObject({ paddyGradeId: G4, quantityKg: 50, approvalStatus: 'PENDING', reason: 'Delivery variance: 20 bags of Size 4 sent, 19 counted in.' });
    const n = told(h.notifications.notify).filter((x) => x.title === 'Kumasi Warehouse has counted in your paddy');
    expect(n).toEqual([expect.objectContaining({ userIds: ['wm-1', 'ws-1'], body: 'Arrived at Kumasi Warehouse: 1 bag short' })]);
  });

  it('a size that did not arrive at all is counted as 0, and left off the credits', async () => {
    const { h, v } = await sent();
    const done = await h.service.receive(v.id, { lines: [{ paddyGradeId: G4, bags: 20 }] } as any, actor('wm-2'));
    expect(done.varianceBags).toBe(-10);
    expect(h.stock.WAREHOUSE[WH2][G5]).toBe(0);
    expect(h.txns.filter((t) => t.type === 'PADDY_RECEIVED_AT_WAREHOUSE').map((t) => t.paddyGradeId)).toEqual([G4]);
  });

  it('cannot count in more than was sent, or a size that was not on the delivery', async () => {
    const { h, v } = await sent();
    await expect(h.service.receive(v.id, got(21, 10), actor('wm-2'))).rejects.toThrow('20 bags were sent, so 21 cannot have arrived');
    await expect(h.service.receive(v.id, { lines: [{ paddyGradeId: 'g9', bags: 1 }] } as any, actor('wm-2'))).rejects.toThrow('not on this delivery');
    expect(h.rows[0].status).toBe('IN_TRANSIT'); expect(h.stock.WAREHOUSE[WH2]).toEqual({ [G4]: 10, [G5]: 0 });
  });

  it('only once: a second count is refused and moves nothing', async () => {
    const { h, v } = await sent();
    await h.service.receive(v.id, got(20, 10), actor('wm-2'));
    await expect(h.service.receive(v.id, got(20, 10), actor('wm-2'))).rejects.toThrow('already been counted in');
    expect(h.stock.WAREHOUSE[WH2][G4]).toBe(30);
  });

  it('only the receiving warehouse\'s people (or the Administrator), not the sender and not another warehouse', async () => {
    const { h, v } = await sent();
    await expect(h.service.receive(v.id, got(20, 10), actor('ws-1'))).rejects.toThrow(ForbiddenException);
    await expect(h.service.receive(v.id, got(20, 10), actor('ws-3'))).rejects.toThrow(ForbiddenException);
    await expect(h.service.receive('nope', got(1, 1), actor('wm-2'))).rejects.toThrow(NotFoundException);
    await expect(h.service.receive(v.id, got(20, 10), actor('ad-1'))).resolves.toMatchObject({ status: 'RECEIVED' });
  });

  it('tells the person who asked for it (when it was for a paddy request) that it has arrived, and any shortage', async () => {
    const h = build([{ id: 'sr1', requestNumber: 'SR-2026-000007', kind: 'WAREHOUSE', status: 'ASSIGNED', sourceWarehouseId: WH1, warehouseId: WH2, requestedById: 'wm-2' }]);
    const v = await h.service.send(send({ supplyRequestNumber: 'SR-2026-000007' }), actor('ws-1'));
    h.notifications.notify.mockClear();
    await h.service.receive(v.id, got(20, 9), actor('ws-2'));
    expect(told(h.notifications.notify).find((n) => n.entityType === 'SupplyRequest')).toMatchObject({ userIds: ['wm-2'], entityId: 'SR-2026-000007', title: 'Your paddy has arrived at Kumasi Warehouse', body: 'Size 4: 20, Size 5: 9 · 1 bag short' });
  });
});

describe('cancelling before it arrives', () => {
  it('the sender can: the bags go back into their stock, in-transit is emptied, and the other end is told', async () => {
    const h = build(); const v = await h.service.send(send(), actor('ws-1')); h.notifications.notify.mockClear();
    const done = await h.service.cancel(v.id, { reason: 'Truck broke down' }, actor('ws-1'));
    expect(done).toMatchObject({ status: 'CANCELLED', label: 'Cancelled', cancelReason: 'Truck broke down' });
    expect(h.stock.WAREHOUSE[WH1]).toEqual({ [G4]: 120, [G5]: 80 }); expect(h.stock.EXTERNAL.pt1).toEqual({ [G4]: 0, [G5]: 0 });
    expect(told(h.notifications.notify)).toEqual([expect.objectContaining({ userIds: ['wm-2', 'ws-2'], title: 'Tamale Warehouse cancelled the paddy it was sending you', body: 'Truck broke down' })]);
  });
  it('not by someone else, not by the receiver, and not once it has been counted in (or already cancelled)', async () => {
    const h = build(); const v = await h.service.send(send(), actor('ws-1'));
    await expect(h.service.cancel(v.id, {}, actor('ws-2'))).rejects.toThrow(ForbiddenException);
    await h.service.cancel(v.id, {}, actor('ws-1'));
    await expect(h.service.cancel(v.id, {}, actor('ws-1'))).rejects.toThrow('already cancelled');
    const h2 = build(); const v2 = await h2.service.send(send(), actor('ws-1')); await h2.service.receive(v2.id, { lines: [{ paddyGradeId: G4, bags: 20 }, { paddyGradeId: G5, bags: 10 }] } as any, actor('wm-2'));
    await expect(h2.service.cancel(v2.id, {}, actor('ws-1'))).rejects.toThrow('already been counted in');
  });
});

describe('who sees what', () => {
  it('each person sees the deliveries to or from their own warehouses, marked IN or OUT; the Administrator and MD see everything', async () => {
    const h = build(); await h.service.send(send(), actor('ws-1')); // Tamale -> Kumasi
    await h.service.send(send({ fromWarehouseId: WH2, toWarehouseId: WH3, lines: [{ paddyGradeId: G4, bags: 3 }] }), actor('ad-1')); // Kumasi -> Bolga
    const dirs = async (id: string) => (await h.service.list(actor(id))).map((v) => `${v.transferNumber}:${v.direction}`).sort();
    expect(await dirs('ws-1')).toEqual(['PT-2026-000001:OUT']);
    expect(await dirs('wm-2')).toEqual(['PT-2026-000001:IN', 'PT-2026-000002:OUT']);
    expect(await dirs('ws-3')).toEqual(['PT-2026-000002:IN']);
    expect(await dirs('ad-1')).toEqual(['PT-2026-000001:BOTH', 'PT-2026-000002:BOTH']);
    expect(await dirs('md-1')).toEqual(['PT-2026-000001:BOTH', 'PT-2026-000002:BOTH']);
  });
  it('the places a person may send from show the stock size by size; any active warehouse can be sent to', async () => {
    const h = build();
    const p = await h.service.places(actor('ws-1'));
    expect(p.mine).toEqual([{ id: WH1, name: 'Tamale Warehouse', location: 'Tamale', stock: [{ paddyGradeId: G4, label: 'Size 4', bags: 120 }, { paddyGradeId: G5, label: 'Size 5', bags: 80 }] }]);
    expect(p.others.map((w) => w.name)).toEqual(expect.arrayContaining(['Tamale Warehouse', 'Kumasi Warehouse', 'Bolga Warehouse'])); expect(p.others.map((w) => w.name)).not.toContain('Closed Warehouse');
    expect((await h.service.places(actor('ad-1'))).mine).toHaveLength(3);
  });
});
