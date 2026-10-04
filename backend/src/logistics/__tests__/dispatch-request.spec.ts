import { BadRequestException } from '@nestjs/common';
import { DeliveryOrdersService } from '../delivery-orders.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const GRADES: Record<string, string> = { g4: 'Size 4', g5: 'Size 5' };
const supervisor = { id: 'fs-1', firstName: 'Efua', lastName: 'Mensah', permissionCodes: new Set(['delivery.create']), roles: [{ roleId: 'r', roleCode: 'FARM_DIRECTOR', permissions: [], scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }] } as unknown as AuthenticatedUser;
const MANAGER = { userId: 'fm-1', user: { firstName: 'Yaa', lastName: 'Owusu' } };

function build(opts: { managers?: unknown[]; warehouse?: unknown; stock?: Record<string, number>; failOnOrder?: number; grades?: unknown[] } = {}) {
  let seq = 0;
  const orders: Record<string, any>[] = [];
  const tasks: Record<string, any>[] = [];
  const tx = {
    deliveryOrder: {
      create: jest.fn(async ({ data }: any) => {
        if (opts.failOnOrder === orders.length + 1) throw new Error('the database dropped the connection');
        const row = { id: `o${orders.length + 1}`, ...data, paddyGrade: { label: GRADES[data.paddyGradeId] } };
        orders.push(row);
        return row;
      }),
    },
    task: { count: jest.fn(async () => 0), create: jest.fn(async ({ data }: any) => { const row = { id: `t${tasks.length + 1}`, ...data }; tasks.push(row); return row; }) },
  };
  const prisma = {
    farm: { findUnique: jest.fn(async () => ({ id: 'farm-1', name: 'Nkawkaw Farm', isActive: true })) },
    warehouse: { findUnique: jest.fn(async () => opts.warehouse === undefined ? { id: 'wh-1', name: 'Tamale Warehouse', location: 'Tamale, Northern Region', isActive: true, managers: [{ user: { firstName: 'Kwabena', lastName: 'Adjei', phone: '0244111222' } }] } : opts.warehouse) },
    paddyGrade: { findMany: jest.fn(async () => opts.grades ?? [{ id: 'g4', label: 'Size 4', isActive: true }, { id: 'g5', label: 'Size 5', isActive: true }]) },
    farmManager: { findMany: jest.fn(async () => opts.managers ?? [MANAGER]) },
    deliveryOrder: { findUnique: jest.fn(async ({ where }: any) => { const o = orders.find((x) => x.id === where.id); return o ? { ...o, farmId: 'farm-1', reports: [] } : null; }) },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => {
      const [o, t] = [orders.length, tasks.length];
      try { return await cb(tx); } catch (err) { orders.length = o; tasks.length = t; throw err; }
    }),
  };
  const ledger = {
    generateNumber: jest.fn(async (_t: unknown, prefix: string) => `${prefix}-2026-${String(++seq).padStart(6, '0')}`),
    getBalancesForLocation: jest.fn(async () => Object.entries(opts.stock ?? { g4: 100, g5: 100 }).map(([paddyGradeId, bagCount]) => ({ paddyGradeId, bagCount }))),
  };
  const notifications = { notify: jest.fn() };
  return { service: new DeliveryOrdersService(prisma as any, { record: jest.fn() } as any, ledger as any, notifications as any), orders, tasks, notifications, prisma };
}
const request = (over: Record<string, unknown> = {}) => ({
  farmId: 'farm-1', destinationWarehouseId: 'wh-1', requestedDate: '2026-10-09', priority: 'HIGH', notes: 'Load the Size 4 first. The truck leaves at 6am.',
  lines: [{ paddyGradeId: 'g4', bagCount: 17 }, { paddyGradeId: 'g5', bagCount: 3 }], ...over,
}) as any;

describe('a Farm Supervisor\'s dispatch request to a farm manager', () => {
  it('saves every size as ONE request: one order per size, tied together by one request reference', async () => {
    const { service, orders } = build();
    const r = await service.createRequest(request(), supervisor);
    expect(orders).toHaveLength(2);
    expect(new Set(orders.map((o) => o.requestRef)).size).toBe(1);
    expect(orders[0].requestRef).toBe(r.requestRef);
    expect(r.requestRef).toMatch(/^RQ-2026-/);
    expect(r.orders.map((o) => [o.gradeLabel, o.bagCount])).toEqual([['Size 4', 17], ['Size 5', 3]]);
    expect(r.totalBags).toBe(20);
    expect(orders.every((o) => o.farmId === 'farm-1' && o.destinationWarehouseId === 'wh-1' && o.createdById === 'fs-1' && o.priority === 'HIGH')).toBe(true);
  });

  it('automatically becomes a TASK for the farm manager, due on the date it is needed, tied to the request', async () => {
    const { service, tasks } = build();
    const r = await service.createRequest(request(), supervisor);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assignedToId: 'fm-1', farmId: 'farm-1', warehouseId: 'wh-1', status: 'TODO', createdById: 'fs-1', deliveryRequestRef: r.requestRef });
    expect(tasks[0].dueDate.toISOString().slice(0, 10)).toBe('2026-10-09');
    expect(tasks[0].taskNumber).toMatch(/^TASK-2026-000001$/);
    expect(r.tasks).toEqual([{ id: 't1', taskNumber: 'TASK-2026-000001', assignedTo: 'Yaa Owusu' }]);
  });

  it('the task says exactly WHERE it goes, WHAT to send, WHEN, who to ask, and any instruction, so nobody has to ask which warehouse', async () => {
    const { service, tasks } = build();
    const r = await service.createRequest(request(), supervisor);
    const t = tasks[0];
    expect(t.title).toBe('Dispatch 20 bags to Tamale Warehouse');
    for (const line of [
      'Dispatch from Nkawkaw Farm to Tamale Warehouse (Tamale, Northern Region).',
      'Needed there by: Fri 9 Oct 2026.',
      'Priority: HIGH.',
      '- Size 4: 17 bags',
      '- Size 5: 3 bags',
      'Total: 20 bags.',
      'Who to ask at the warehouse: Kwabena Adjei (0244111222).',
      'Instructions from Efua Mensah: Load the Size 4 first. The truck leaves at 6am.',
      'open the Dispatch desk and submit one dispatch with every size on the truck',
      `Request ${r.requestRef}`,
    ]) expect(t.description).toContain(line);
  });

  it('a single size reads naturally too: no total line, one report', async () => {
    const { service, tasks } = build();
    await service.createRequest(request({ lines: [{ paddyGradeId: 'g4', bagCount: 1 }], priority: undefined, notes: undefined }), supervisor);
    expect(tasks[0].title).toBe('Dispatch 1 bag to Tamale Warehouse');
    expect(tasks[0].description).toContain('- Size 4: 1 bag');
    expect(tasks[0].description).not.toContain('Total:');
    expect(tasks[0].description).not.toContain('Priority:');
    expect(tasks[0].description).not.toContain('Instructions from');
    expect(tasks[0].description).toContain('open the Dispatch desk and submit one dispatch. Request');
  });

  it('tells the farm manager, with the same detail, and points the notification at their task', async () => {
    const { service, notifications } = build();
    await service.createRequest(request(), supervisor);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    const n = notifications.notify.mock.calls[0][0];
    expect(n).toMatchObject({ userIds: ['fm-1'], type: 'task.assigned', entityType: 'Task', entityId: 't1' });
    expect(n.title).toBe('New dispatch task - TASK-2026-000001');
    expect(n.body).toContain('Efua Mensah asks you to dispatch 20 bags');
    expect(n.body).toContain('Tamale Warehouse (Tamale, Northern Region)');
    expect(n.body).toContain('Size 4 17, Size 5 3');
    expect(n.body).toContain('Fri 9 Oct 2026');
  });

  it('gives each of the farm\'s managers their own task', async () => {
    const { service, tasks, notifications } = build({ managers: [MANAGER, { userId: 'fm-2', user: { firstName: 'Kofi', lastName: 'Asare' } }] });
    const r = await service.createRequest(request(), supervisor);
    expect(tasks.map((t) => [t.assignedToId, t.taskNumber])).toEqual([['fm-1', 'TASK-2026-000001'], ['fm-2', 'TASK-2026-000002']]);
    expect(r.tasks.map((t) => t.assignedTo)).toEqual(['Yaa Owusu', 'Kofi Asare']);
    expect(notifications.notify).toHaveBeenCalledTimes(2);
  });

  it('is ALL OR NOTHING: if the second size cannot be saved, no order, no task and no notification is left behind', async () => {
    const { service, orders, tasks, notifications } = build({ failOnOrder: 2 });
    await expect(service.createRequest(request(), supervisor)).rejects.toThrow(/dropped the connection/);
    expect([orders.length, tasks.length]).toEqual([0, 0]);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('says so when nobody was given a task: a farm with no manager is never a silent miss', async () => {
    const { service, orders, tasks, notifications } = build({ managers: [] });
    const r = await service.createRequest(request(), supervisor);
    expect(orders).toHaveLength(2);
    expect(tasks).toHaveLength(0);
    expect(r).toMatchObject({ noTaskCreated: true, noManagerOnFarm: true, tasks: [] });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('does not make a task for the farm manager who asked for the dispatch themselves', async () => {
    const { service, tasks } = build();
    const selfAsking = { ...supervisor, id: 'fm-1' } as unknown as AuthenticatedUser;
    const r = await service.createRequest(request(), selfAsking);
    expect(tasks).toHaveLength(0);
    expect(r).toMatchObject({ noTaskCreated: true, noManagerOnFarm: false });
  });

  it('reports EVERY size the farm cannot cover, in bags, and saves nothing', async () => {
    const { service, orders } = build({ stock: { g4: 10, g5: 1 } });
    await expect(service.createRequest(request(), supervisor)).rejects.toThrow(/Size 4: wanted 17, has 10; Size 5: wanted 3, has 1/);
    expect(orders).toHaveLength(0);
  });

  it('refuses the same size twice, by name, and a warehouse that is not active', async () => {
    await expect(build().service.createRequest(request({ lines: [{ paddyGradeId: 'g4', bagCount: 5 }, { paddyGradeId: 'g4', bagCount: 2 }] }), supervisor)).rejects.toThrow(/Size 4 is on the list twice/);
    await expect(build({ warehouse: { id: 'wh-1', name: 'Old', isActive: false } }).service.createRequest(request(), supervisor)).rejects.toThrow(/Destination warehouse not found or inactive/);
    await expect(build({ grades: [{ id: 'g4', label: 'Size 4', isActive: true }] }).service.createRequest(request(), supervisor)).rejects.toThrow(BadRequestException);
  });

  it('the old one-size order now goes the same way: it also becomes a task and carries tracking', async () => {
    const { service, tasks } = build();
    const order = await service.create({ farmId: 'farm-1', destinationWarehouseId: 'wh-1', requestedDate: '2026-10-09', paddyGradeId: 'g4', bagCount: 17 } as any, supervisor);
    expect(tasks).toHaveLength(1);
    expect(order.tracking.stage).toBe('REQUESTED');
  });
});
