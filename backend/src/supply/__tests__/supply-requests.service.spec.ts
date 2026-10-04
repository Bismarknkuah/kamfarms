import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupplyRequestsService } from '../supply-requests.service';
import { buildSupplyView } from '../supply-board.util';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const WH1 = 'wh-1', WH2 = 'wh-2', MC1 = 'mc-1', FARM_A = 'farm-a', FARM_B = 'farm-b', G4 = 'g4', G5 = 'g5';
type Sc = { type: string; id: string | null };
const USERS: { id: string; firstName: string; lastName: string; role: string; scopes: Sc[] }[] = [
  { id: 'wm-1', firstName: 'Kofi', lastName: 'Mensah', role: 'WAREHOUSE_MANAGER', scopes: [{ type: 'WAREHOUSE', id: WH1 }] },
  { id: 'ws-1', firstName: 'Abena', lastName: 'Osei', role: 'WAREHOUSE_SUPERVISOR', scopes: [{ type: 'WAREHOUSE', id: WH1 }] },
  { id: 'ws-2', firstName: 'Yaw', lastName: 'Boateng', role: 'WAREHOUSE_SUPERVISOR', scopes: [{ type: 'WAREHOUSE', id: WH2 }] },
  { id: 'fd-1', firstName: 'Efua', lastName: 'Mensah', role: 'FARM_DIRECTOR', scopes: [{ type: 'GLOBAL', id: null }] },
  { id: 'md-1', firstName: 'Nana', lastName: 'Addo', role: 'MD', scopes: [{ type: 'GLOBAL', id: null }] },
  { id: 'om-1', firstName: 'Kwame', lastName: 'Asare', role: 'OPERATIONS_MANAGER', scopes: [{ type: 'GLOBAL', id: null }] },
  { id: 'oo-1', firstName: 'Ama', lastName: 'Frimpong', role: 'OPERATIONS_OFFICER', scopes: [{ type: 'MILLING_CENTER', id: MC1 }] },
  { id: 'ad-1', firstName: 'Admin', lastName: 'User', role: 'ADMIN', scopes: [{ type: 'GLOBAL', id: null }] },
];
const PERMS: Record<string, string[]> = {
  WAREHOUSE_MANAGER: ['supply.view', 'supply.request'],
  WAREHOUSE_SUPERVISOR: ['supply.view', 'supply.request', 'supply.forward', 'supply.fulfil'],
  FARM_DIRECTOR: ['supply.view', 'supply.fulfil'], MD: ['supply.view'],
  OPERATIONS_MANAGER: ['supply.view', 'supply.request', 'supply.forward'], OPERATIONS_OFFICER: ['supply.view', 'supply.request'],
  ADMIN: ['supply.view', 'supply.request', 'supply.forward', 'supply.fulfil'],
};
const actor = (id: string) => {
  const u = USERS.find((x) => x.id === id)!;
  return { id, firstName: u.firstName, lastName: u.lastName, permissionCodes: new Set(PERMS[u.role]), roles: [{ roleId: 'r', roleCode: u.role, permissions: PERMS[u.role], scopes: u.scopes.map((s) => ({ scopeType: s.type, scopeId: s.id })) }] } as unknown as AuthenticatedUser;
};
const WAREHOUSES: Record<string, any> = { [WH1]: { id: WH1, name: 'Tamale Warehouse', location: 'Tamale', isActive: true }, [WH2]: { id: WH2, name: 'Kumasi Warehouse', location: 'Kumasi', isActive: true } };
const GRADES = [{ id: G4, label: 'Size 4', isActive: true }, { id: G5, label: 'Size 5', isActive: true }];
const match = (r: any, w: any): boolean => !w || Object.entries(w).every(([k, v]: any) => (k === 'OR' ? v.some((c: any) => match(r, c)) : v && typeof v === 'object' && 'in' in v ? v.in.includes(r[k]) : v && typeof v === 'object' && 'notIn' in v ? !v.notIn.includes(r[k]) : r[k] === v));

function build(opts: { stock?: Record<string, Record<string, Record<string, number>>>; cards?: Map<string, any> } = {}) {
  let seq = 0;
  const rows: any[] = [];
  const tasks: any[] = [];
  const STOCK = opts.stock ?? { FARM: { [FARM_A]: { [G4]: 50, [G5]: 10 }, [FARM_B]: { [G4]: 5, [G5]: 0 } }, WAREHOUSE: { [WH1]: { [G4]: 12, [G5]: 3 } } };
  const cards = opts.cards ?? new Map<string, any>();
  const tx = {
    supplyRequest: { create: jest.fn(async ({ data }: any) => { const row = { id: `sr${rows.length + 1}`, createdAt: new Date(`2026-10-0${rows.length + 1}T08:00:00Z`), forwardedAt: null, decidedAt: null, forwardedById: null, decidedById: null, sourceFarmId: null, dispatchRequestRef: null, parentRequestId: null, millingCenterId: null, ...data }; rows.push(row); return row; }) },
  };
  const prisma = {
    supplyRequest: {
      ...tx.supplyRequest,
      findUnique: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }: any = {}) => rows.filter((r) => match(r, where))),
      findFirst: jest.fn(async ({ where }: any) => rows.find((r) => match(r, where)) ?? null),
      update: jest.fn(async ({ where, data }: any) => { const r = rows.find((x) => x.id === where.id)!; Object.assign(r, data); return r; }),
    },
    user: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where.id) return USERS.filter((u) => where.id.in.includes(u.id));
        const some = where.roles.some; const codes = some.role.code.in; const wh = some.OR?.[2]?.scopes?.some?.scopeId;
        return USERS.filter((u) => codes.includes(u.role) && (!some.OR || u.scopes.length === 0 || u.scopes.some((s) => s.type === 'GLOBAL' || (s.type === 'WAREHOUSE' && s.id === wh))));
      }),
    },
    warehouse: { findUnique: jest.fn(async ({ where }: any) => WAREHOUSES[where.id] ?? null), findMany: jest.fn(async ({ where }: any) => Object.values(WAREHOUSES).filter((w: any) => where.id.in.includes(w.id))) },
    millingCenter: { findUnique: jest.fn(async ({ where }: any) => (where.id === MC1 ? { id: MC1, name: 'Tamale Mill', warehouseId: WH1, isActive: true } : null)), findMany: jest.fn(async ({ where }: any) => (where.id.in.includes(MC1) ? [{ id: MC1, name: 'Tamale Mill' }] : [])) },
    farm: {
      findMany: jest.fn(async ({ where }: any) => {
        const all = [{ id: FARM_A, name: 'Nkawkaw Farm', isActive: true, managers: [{ user: { firstName: 'Yaa', lastName: 'Owusu' } }] }, { id: FARM_B, name: 'Techiman Farm', isActive: true, managers: [] }];
        return where.isActive ? all : all.filter((f) => where.id.in.includes(f.id));
      }),
    },
    paddyGrade: { findMany: jest.fn(async ({ where }: any) => GRADES.filter((g) => where.id.in.includes(g.id))) },
    task: {
      count: jest.fn(async () => tasks.length),
      create: jest.fn(async ({ data }: any) => { tasks.push({ id: `t${tasks.length + 1}`, ...data }); return tasks[tasks.length - 1]; }),
      updateMany: jest.fn(async ({ where, data }: any) => { tasks.filter((t) => t.supplyRequestNumber === where.supplyRequestNumber && where.status.in.includes(t.status)).forEach((t) => Object.assign(t, data)); }),
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const ledger = { generateNumber: jest.fn(async (_t: unknown, prefix: string) => `${prefix}-2026-${String(++seq).padStart(6, '0')}`), getBalancesForLocation: jest.fn(async (type: string, id: string) => Object.entries((STOCK as any)[type]?.[id] ?? {}).map(([paddyGradeId, bagCount]) => ({ paddyGradeId, bagCount }))) };
  const deliveryOrders = { createRequest: jest.fn(async () => ({ requestRef: 'RQ-2026-000001', farmName: 'Nkawkaw Farm' })), cardsByRequestRefs: jest.fn(async () => cards) };
  const notifications = { notify: jest.fn() };
  const service = new SupplyRequestsService(prisma as any, { record: jest.fn() } as any, ledger as any, deliveryOrders as any, notifications as any);
  return { service, rows, tasks, prisma, notifications, deliveryOrders, cards };
}
const ask = (over: Record<string, unknown> = {}) => ({ warehouseId: WH1, lines: [{ paddyGradeId: G4, bagCount: 17 }, { paddyGradeId: G5, bagCount: 3 }], neededBy: '2026-10-09', ...over }) as any;
const toldTo = (n: jest.Mock) => n.mock.calls.map(([a]: any[]) => a);
const NEEDS = 'Size 4: 17, Size 5: 3 · by Fri 9 Oct 2026';

describe('a warehouse asks for paddy: Warehouse Supervisor, then the Farm Director', () => {
  it('the request is saved with both sizes, labelled, and waits with the Warehouse Supervisor', async () => {
    const { service, rows } = build();
    const v = await service.create(ask(), actor('wm-1'));
    expect(rows).toHaveLength(1);
    expect(v).toMatchObject({ requestNumber: 'SR-2026-000001', kind: 'WAREHOUSE', status: 'SUBMITTED', stage: 'WITH_REVIEWER', holder: 'Warehouse Supervisor', label: 'With the Warehouse Supervisor', totalBags: 20, requestedBy: 'Kofi Mensah' });
    expect(v.lines).toEqual([{ paddyGradeId: G4, gradeLabel: 'Size 4', bags: 17 }, { paddyGradeId: G5, gradeLabel: 'Size 5', bags: 3 }]);
    expect(v.warehouse).toEqual({ id: WH1, name: 'Tamale Warehouse', location: 'Tamale' });
  });

  it('gives the task and the notification ONLY to the supervisor of THAT warehouse, short, with the request number to link to', async () => {
    const { service, tasks, notifications } = build();
    await service.create(ask(), actor('wm-1'));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assignedToId: 'ws-1', title: 'Tamale Warehouse needs paddy', supplyRequestNumber: 'SR-2026-000001', warehouseId: WH1, status: 'TODO' });
    expect(tasks[0].description).toBeUndefined(); // short: the link takes them to the work
    expect(toldTo(notifications.notify)[0]).toMatchObject({ userIds: ['ws-1'], title: 'Tamale Warehouse needs paddy', body: NEEDS, entityType: 'SupplyRequest', entityId: 'SR-2026-000001' });
  });

  it('a Warehouse Supervisor asking for their own warehouse sends it straight on to the Farm Director', async () => {
    const { service, tasks, notifications } = build();
    const v = await service.create(ask(), actor('ws-1'));
    expect(v).toMatchObject({ status: 'FORWARDED', stage: 'WITH_SUPPLIER', holder: 'Farm Director' });
    expect(tasks.map((t) => t.assignedToId)).toEqual(['fd-1']);
    expect(toldTo(notifications.notify)[0].userIds.sort()).toEqual(['fd-1', 'md-1']);
  });

  it('forwarding: the supervisor\'s task is done, the Farm Director gets theirs, and the person who asked is told it moved', async () => {
    const { service, tasks, notifications } = build();
    await service.create(ask(), actor('wm-1')); notifications.notify.mockClear();
    const v = await service.forward('sr1', { note: 'Urgent' }, actor('ws-1'));
    expect(v).toMatchObject({ status: 'FORWARDED', forwardedBy: 'Abena Osei', forwardNote: 'Urgent', holder: 'Farm Director' });
    expect(tasks.find((t) => t.assignedToId === 'ws-1')!.status).toBe('COMPLETED');
    expect(tasks.find((t) => t.assignedToId === 'fd-1')).toMatchObject({ status: 'TODO', title: 'Tamale Warehouse needs paddy' });
    const sent = toldTo(notifications.notify);
    expect(sent.find((n) => n.userIds.includes('fd-1'))).toMatchObject({ body: NEEDS });
    expect(sent.find((n) => n.userIds.includes('wm-1'))).toMatchObject({ title: 'Your request was sent on' });
  });

  it('a supervisor of ANOTHER warehouse cannot send it on, and it cannot be sent on twice', async () => {
    const { service } = build();
    await service.create(ask(), actor('wm-1'));
    await expect(service.forward('sr1', {}, actor('ws-2'))).rejects.toThrow(ForbiddenException);
    await service.forward('sr1', {}, actor('ws-1'));
    await expect(service.forward('sr1', {}, actor('ws-1'))).rejects.toThrow(/already been sent on/);
  });

  it('either side can decline with a reason, which the person who asked is told', async () => {
    const a = build(); await a.service.create(ask(), actor('wm-1')); a.notifications.notify.mockClear();
    const v = await a.service.decline('sr1', { reason: 'We have stock here' } as any, actor('ws-1'));
    expect(v).toMatchObject({ status: 'DECLINED', stage: 'DECLINED', decisionNote: 'We have stock here', label: 'Not possible' });
    expect(toldTo(a.notifications.notify)[0]).toMatchObject({ userIds: ['wm-1'], title: 'Not possible: Tamale Warehouse', body: 'We have stock here' });
    expect(a.tasks.every((t) => t.status === 'COMPLETED')).toBe(true);
    const b = build(); await b.service.create(ask(), actor('wm-1')); await b.service.forward('sr1', {}, actor('ws-1')); b.notifications.notify.mockClear();
    await b.service.decline('sr1', { reason: 'No paddy anywhere' } as any, actor('fd-1'));
    expect(toldTo(b.notifications.notify)[0].userIds.sort()).toEqual(['wm-1', 'ws-1']);
  });

  it('the wrong person cannot decide at the wrong stage', async () => {
    const { service } = build();
    await service.create(ask(), actor('wm-1'));
    await expect(service.decline('sr1', { reason: 'x' } as any, actor('fd-1'))).rejects.toThrow(ForbiddenException); // still with the supervisor
    await service.forward('sr1', {}, actor('ws-1'));
    await expect(service.decline('sr1', { reason: 'x' } as any, actor('wm-1'))).rejects.toThrow(ForbiddenException);
  });

  it('validates the request: a size twice, an unknown size, an unknown warehouse, a warehouse outside your own', async () => {
    const { service } = build();
    await expect(service.create(ask({ lines: [{ paddyGradeId: G4, bagCount: 5 }, { paddyGradeId: G4, bagCount: 2 }] }), actor('wm-1'))).rejects.toThrow(/on the list twice/);
    await expect(service.create(ask({ lines: [{ paddyGradeId: 'nope', bagCount: 5 }] }), actor('wm-1'))).rejects.toThrow(BadRequestException);
    await expect(service.create(ask({ warehouseId: 'ghost' }), actor('wm-1'))).rejects.toThrow(/Warehouse not found/);
    await expect(service.create(ask({ warehouseId: WH2 }), actor('wm-1'))).rejects.toThrow(ForbiddenException);
    await expect(service.create({ lines: ask().lines } as any, actor('wm-1'))).rejects.toThrow(/Choose the warehouse or the mill/);
  });
});

describe('the Farm Director decides on the farms\' stock', () => {
  async function forwarded() { const h = build(); await h.service.create(ask(), actor('wm-1')); await h.service.forward('sr1', {}, actor('ws-1')); h.notifications.notify.mockClear(); return h; }

  it('shows what each farm holds of EACH size asked for, the farms that can cover it first', async () => {
    const { service } = await forwarded();
    const s: any = await service.sources('sr1', actor('fd-1'));
    expect(s.farms.map((f: any) => [f.farmName, f.canCover])).toEqual([['Nkawkaw Farm', true], ['Techiman Farm', false]]);
    expect(s.farms[0].bySize).toEqual([{ paddyGradeId: G4, label: 'Size 4', needed: 17, has: 50, enough: true }, { paddyGradeId: G5, label: 'Size 5', needed: 3, has: 10, enough: true }]);
    expect(s.farms[0].managers).toEqual(['Yaa Owusu']);
    expect(s.farms[1].bySize.map((x: any) => x.enough)).toEqual([false, false]);
  });

  it('choosing a farm asks its manager to dispatch (on the Dispatch desk) with the same sizes, to the same warehouse, by the needed date', async () => {
    const { service, deliveryOrders, rows } = await forwarded();
    const v = await service.assign('sr1', { sourceFarmId: FARM_A, note: 'Use the new truck' }, actor('fd-1'));
    const call = (deliveryOrders.createRequest.mock.calls[0] as any[])[0];
    expect(call).toMatchObject({ farmId: FARM_A, destinationWarehouseId: WH1, requestedDate: '2026-10-09' });
    expect(call.lines).toEqual([{ paddyGradeId: G4, bagCount: 17 }, { paddyGradeId: G5, bagCount: 3 }]);
    expect(call.notes).toBe('Use the new truck'); // only a note the Farm Director wrote goes to the farm manager
    expect(rows[0]).toMatchObject({ status: 'ASSIGNED', sourceFarmId: FARM_A, dispatchRequestRef: 'RQ-2026-000001', decidedById: 'fd-1' });
    expect(v).toMatchObject({ status: 'ASSIGNED', sourceFarm: { id: FARM_A, name: 'Nkawkaw Farm' } });
  });

  it('tells the person who asked and the supervisor which farm will send it, and completes the Farm Director\'s task', async () => {
    const { service, notifications, tasks } = await forwarded();
    const { deliveryOrders } = await Promise.resolve({ deliveryOrders: (service as any).deliveryOrders });
    await service.assign('sr1', { sourceFarmId: FARM_A }, actor('fd-1'));
    expect(((deliveryOrders.createRequest as jest.Mock).mock.calls[0] as any[])[0].notes).toBeUndefined(); // no note typed: none invented
    expect(toldTo(notifications.notify)[0]).toMatchObject({ title: 'Nkawkaw Farm will send your paddy', body: NEEDS });
    expect(toldTo(notifications.notify)[0].userIds.sort()).toEqual(['wm-1', 'ws-1']);
    expect(tasks.filter((t) => t.assignedToId === 'fd-1').every((t) => t.status === 'COMPLETED')).toBe(true);
  });

  it('a farm without the stock is refused by the dispatch itself, and the request stays with the Farm Director', async () => {
    const { service, deliveryOrders, rows } = await forwarded();
    deliveryOrders.createRequest.mockRejectedValueOnce(new BadRequestException('The farm does not have enough bags: Size 4: wanted 17, has 5.'));
    await expect(service.assign('sr1', { sourceFarmId: FARM_B }, actor('fd-1'))).rejects.toThrow(/does not have enough bags/);
    expect(rows[0].status).toBe('FORWARDED');
  });

  it('only a request that is waiting for a farm can be assigned', async () => {
    const h = build(); await h.service.create(ask(), actor('wm-1'));
    await expect(h.service.assign('sr1', { sourceFarmId: FARM_A }, actor('fd-1'))).rejects.toThrow(/not waiting for a farm/);
  });

  it('follows the dispatch: with the farm manager, then waiting for approval, on the road, arrived', async () => {
    const h = await forwarded(); await h.service.assign('sr1', { sourceFarmId: FARM_A }, actor('fd-1'));
    const stage = async (s: string, extra: any = {}) => { h.cards.set('RQ-2026-000001', { stage: s, label: 'x', dispatches: [{ driverName: 'Kofi', vehiclePlate: 'GT-1' }], ...extra }); return (await h.service.board(actor('md-1')))[0]; };
    expect(await stage('REQUESTED')).toMatchObject({ stage: 'DISPATCHING', holder: 'Farm manager', label: 'Nkawkaw Farm is getting it ready' });
    expect(await stage('IN_REVIEW')).toMatchObject({ stage: 'DISPATCHING', holder: 'Farm Director', label: 'Waiting for the Farm Director to approve the dispatch' });
    expect(await stage('ON_THE_WAY')).toMatchObject({ stage: 'ON_THE_WAY', holder: 'On the road', label: 'On the road to Tamale Warehouse' });
    const arrived = await stage('ARRIVED', { arrivedAt: '2026-10-06T09:00:00Z', bagVariance: -2 });
    expect(arrived).toMatchObject({ stage: 'RECEIVED', holder: null, label: 'Arrived at Tamale Warehouse' });
    expect(arrived.dispatch).toMatchObject({ driverName: 'Kofi', vehiclePlate: 'GT-1', bagVariance: -2 });
    expect(arrived.steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
  });
});

describe('a milling center asks: Operations Manager, then the Warehouse Supervisor of its warehouse', () => {
  const askMill = (over: Record<string, unknown> = {}) => ({ millingCenterId: MC1, lines: [{ paddyGradeId: G4, bagCount: 10 }, { paddyGradeId: G5, bagCount: 2 }], neededBy: '2026-10-09', ...over }) as any;
  async function forwardedMill() { const h = build(); await h.service.create(askMill(), actor('oo-1')); await h.service.forward('sr1', {}, actor('om-1')); h.notifications.notify.mockClear(); return h; }

  it('goes to the Operations Manager first, for the mill\'s own warehouse', async () => {
    const { service, rows, tasks } = build();
    const v = await service.create(askMill(), actor('oo-1'));
    expect(rows[0]).toMatchObject({ kind: 'MILL', warehouseId: WH1, millingCenterId: MC1, status: 'SUBMITTED' });
    expect(v).toMatchObject({ holder: 'Operations Manager', label: 'With the Operations Manager', millingCenter: { id: MC1, name: 'Tamale Mill' } });
    expect(tasks.map((t) => [t.assignedToId, t.title])).toEqual([['om-1', 'Tamale Mill needs paddy']]);
  });

  it('the Operations Manager sends it to the supervisor of THAT warehouse only', async () => {
    const { tasks, rows } = await forwardedMill();
    expect(rows[0].status).toBe('FORWARDED');
    expect(tasks.filter((t) => t.status === 'TODO').map((t) => t.assignedToId)).toEqual(['ws-1']);
  });

  it('"Paddy is ready" is only possible when the warehouse really holds it', async () => {
    const { service } = await forwardedMill(); // the warehouse holds 12 of Size 4 and 3 of Size 5: enough for 10 + 2
    const v = await service.ready('sr1', { note: 'On the floor' }, actor('ws-1'));
    expect(v).toMatchObject({ status: 'READY', stage: 'READY', label: 'Paddy is ready at Tamale Warehouse' });
  });

  it('when it is short, "ready" is refused and names every size that is short', async () => {
    const h = build({ stock: { WAREHOUSE: { [WH1]: { [G4]: 4, [G5]: 1 } }, FARM: {} } }); await h.service.create(askMill(), actor('oo-1')); await h.service.forward('sr1', {}, actor('om-1'));
    await expect(h.service.ready('sr1', {}, actor('ws-1'))).rejects.toThrow(/Size 4 needs 10, has 4; Size 5 needs 2, has 1/);
    await expect(h.service.ready('sr1', {}, actor('ws-2'))).rejects.toThrow(ForbiddenException);
  });

  it('asking the Farm Director raises a warehouse request for EXACTLY the shortfall, and links it to the mill request', async () => {
    const h = build({ stock: { WAREHOUSE: { [WH1]: { [G4]: 4, [G5]: 2 } }, FARM: {} } }); await h.service.create(askMill(), actor('oo-1')); await h.service.forward('sr1', {}, actor('om-1')); h.notifications.notify.mockClear();
    const parent = await h.service.askFarmDirector('sr1', {}, actor('ws-1'));
    const child = h.rows[1];
    expect(child).toMatchObject({ kind: 'WAREHOUSE', warehouseId: WH1, status: 'FORWARDED', parentRequestId: 'sr1', totalBags: 6 });
    expect(child.lines).toEqual([{ paddyGradeId: G4, gradeLabel: 'Size 4', bags: 6 }]); // 10 asked, 4 held: only the 6 that is missing, and Size 5 is covered
    expect(h.tasks.filter((t) => t.status === 'TODO').map((t) => t.assignedToId)).toContain('fd-1');
    expect(parent).toMatchObject({ childNumber: 'SR-2026-000002', holder: 'Farm Director', label: 'Asked the Farm Director for more (SR-2026-000002)' });
    expect(toldTo(h.notifications.notify).some((n) => n.title === 'Asked the Farm Director for more' && n.body === 'Size 4: 6 (SR-2026-000002)')).toBe(true);
  });

  it('once the Farm Director has been asked it waits for them; when that paddy ARRIVES it comes back to the Warehouse Supervisor', async () => {
    const h = build({ stock: { WAREHOUSE: { [WH1]: { [G4]: 4, [G5]: 2 } }, FARM: {} } }); await h.service.create(askMill(), actor('oo-1')); await h.service.forward('sr1', {}, actor('om-1'));
    await h.service.askFarmDirector('sr1', {}, actor('ws-1'));
    let parent = (await h.service.board(actor('md-1'))).find((v) => v.requestNumber === 'SR-2026-000001')!;
    expect(parent).toMatchObject({ childStage: 'WITH_SUPPLIER', holder: 'Farm Director' });
    h.rows[1].status = 'ASSIGNED'; h.rows[1].dispatchRequestRef = 'RQ-9'; h.cards.set('RQ-9', { stage: 'ARRIVED', label: 'x', dispatches: [], arrivedAt: '2026-10-06T09:00:00Z' });
    parent = (await h.service.board(actor('md-1'))).find((v) => v.requestNumber === 'SR-2026-000001')!;
    expect(parent).toMatchObject({ childStage: 'RECEIVED', holder: 'Warehouse Supervisor', label: 'The paddy has arrived: check it and press "Paddy is ready"' });
  });

  it('cannot ask twice, and cannot ask when there is already enough', async () => {
    const h = build({ stock: { WAREHOUSE: { [WH1]: { [G4]: 4, [G5]: 2 } }, FARM: {} } }); await h.service.create(askMill(), actor('oo-1')); await h.service.forward('sr1', {}, actor('om-1'));
    await h.service.askFarmDirector('sr1', {}, actor('ws-1'));
    await expect(h.service.askFarmDirector('sr1', {}, actor('ws-1'))).rejects.toThrow(/already asked the Farm Director \(SR-2026-000002\)/);
    const enough = await forwardedMill();
    await expect(enough.service.askFarmDirector('sr1', {}, actor('ws-1'))).rejects.toThrow(/enough paddy in the warehouse already/);
  });

  it('shows the supervisor the warehouse\'s own stock against what the mill needs', async () => {
    const { service } = await forwardedMill();
    const s: any = await service.sources('sr1', actor('ws-1'));
    expect(s).toMatchObject({ kind: 'MILL', warehouse: { name: 'Tamale Warehouse' }, canCover: true });
    expect(s.bySize.map((x: any) => [x.label, x.needed, x.has])).toEqual([['Size 4', 10, 12], ['Size 5', 2, 3]]);
  });
});

describe('cancelling, and who sees which request', () => {
  it('only the person who asked can cancel, and only before it is filled', async () => {
    const { service, tasks } = build();
    await service.create(ask(), actor('wm-1'));
    await expect(service.cancel('sr1', actor('ws-1'))).rejects.toThrow(ForbiddenException);
    const v = await service.cancel('sr1', actor('wm-1'));
    expect(v.status).toBe('CANCELLED');
    expect(tasks.every((t) => t.status === 'COMPLETED')).toBe(true);
    await expect(service.cancel('sr1', actor('wm-1'))).rejects.toThrow(/can no longer be cancelled/);
  });

  it('each role sees only its own part of the chain', async () => {
    const h = build();
    await h.service.create(ask(), actor('wm-1'));                                                    // SR-1: Tamale warehouse request
    await h.service.create(ask({ warehouseId: WH2 }), actor('ws-2'));                                // SR-2: Kumasi warehouse request (forwarded)
    await h.service.create({ millingCenterId: MC1, lines: [{ paddyGradeId: G4, bagCount: 4 }] } as any, actor('oo-1')); // SR-3: the mill
    const seen = async (id: string) => (await h.service.board(actor(id))).map((v) => v.requestNumber).sort();
    expect(await seen('wm-1')).toEqual(['SR-2026-000001']);                        // own warehouse only
    expect(await seen('ws-1')).toEqual(['SR-2026-000001', 'SR-2026-000003']);      // Tamale: its warehouse request and the mill that draws from it
    expect(await seen('ws-2')).toEqual(['SR-2026-000002']);                        // Kumasi only
    expect(await seen('fd-1')).toEqual(['SR-2026-000001', 'SR-2026-000002']);      // warehouse requests, not mill ones
    expect(await seen('om-1')).toEqual(['SR-2026-000003']);                        // mill requests
    expect(await seen('oo-1')).toEqual(['SR-2026-000003']);                        // their own mill
    expect(await seen('md-1')).toEqual(['SR-2026-000001', 'SR-2026-000002', 'SR-2026-000003']); // everything
  });
});

describe('buildSupplyView: the timeline', () => {
  const ctx: any = { users: new Map([['u1', 'Kofi Mensah'], ['u2', 'Abena Osei']]), warehouses: new Map([[WH1, { name: 'Tamale Warehouse', location: null }]]), centers: new Map(), farms: new Map(), cards: new Map(), parents: new Map(), children: new Map() };
  const row = (over: any) => ({ id: 'x', requestNumber: 'SR-1', kind: 'WAREHOUSE', status: 'SUBMITTED', warehouseId: WH1, lines: [], totalBags: 0, requestedById: 'u1', createdAt: '2026-10-05T08:00:00Z', ...over });
  it('marks the step that stopped it when it was declined, and what the reason was', () => {
    const v = buildSupplyView(row({ status: 'DECLINED', decidedById: 'u2', decidedAt: '2026-10-05T10:00:00Z', decisionNote: 'We have stock' }), ctx);
    expect(v.steps.map((s) => s.state)).toEqual(['done', 'stopped', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(v.steps[1].detail).toBe('We have stock');
  });
  it('does not throw on a bare row', () => {
    expect(() => buildSupplyView({ id: 'x', requestNumber: 'S', kind: 'MILL', status: 'FORWARDED', warehouseId: 'z', requestedById: 'q', lines: null } as any, ctx)).not.toThrow();
  });
});

describe('the right ROLE does each step, not just anyone holding the permission', () => {
  it('a Warehouse Supervisor cannot send a MILL request on, and the Farm Director cannot answer one', async () => {
    const h = build(); await h.service.create({ millingCenterId: MC1, lines: [{ paddyGradeId: G4, bagCount: 4 }] } as any, actor('oo-1'));
    await expect(h.service.forward('sr1', {}, actor('ws-1'))).rejects.toThrow(/waiting for someone else/);
    await h.service.forward('sr1', {}, actor('om-1'));
    await expect(h.service.ready('sr1', {}, actor('fd-1'))).rejects.toThrow(/Only the Warehouse Supervisor answers a mill request/);
    await expect(h.service.askFarmDirector('sr1', {}, actor('fd-1'))).rejects.toThrow(ForbiddenException);
    await expect(h.service.sources('sr1', actor('wm-1'))).rejects.toThrow(ForbiddenException);
  });
  it('a Warehouse Supervisor cannot choose the farm for a warehouse request: only the Farm Director', async () => {
    const h = build(); await h.service.create(ask(), actor('ws-1'));
    await expect(h.service.assign('sr1', { sourceFarmId: FARM_A }, actor('ws-1'))).rejects.toThrow(/Only the Farm Director chooses the farm/);
    await expect(h.service.assign('sr1', { sourceFarmId: FARM_A }, actor('fd-1'))).resolves.toMatchObject({ status: 'ASSIGNED' });
  });
  it('the Administrator can do any step', async () => {
    const h = build(); await h.service.create(ask(), actor('wm-1'));
    await expect(h.service.forward('sr1', {}, actor('ad-1'))).resolves.toMatchObject({ status: 'FORWARDED' });
    await expect(h.service.assign('sr1', { sourceFarmId: FARM_A }, actor('ad-1'))).resolves.toMatchObject({ status: 'ASSIGNED' });
  });
});
