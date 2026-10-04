import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeliveryReportsService } from '../delivery-reports.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const GLOBAL = [{ scopeType: 'GLOBAL', scopeId: null }];
const person = (id: string, scopes: { scopeType: string; scopeId: string | null }[] = GLOBAL) => ({ id, firstName: id, lastName: 'X', permissionCodes: new Set<string>(), roles: [{ scopes }] }) as unknown as AuthenticatedUser;
const manager = person('fm-1'), supervisor = person('fs-1'), otherSupervisor = person('fs-2');

const order = (id: string, over: Record<string, unknown> = {}) => ({
  id, orderNumber: `DO-${id}`, requestRef: 'RQ-1', farmId: 'farm-a', destinationWarehouseId: 'wh-1', paddyGradeId: id === 'o4' ? 'g4' : 'g5', status: 'PENDING', createdById: 'fs-1',
  bagCount: 100, totalKg: 5200, paddyGrade: { label: id === 'o4' ? 'Size 4' : 'Size 5' }, ...over,
});

function build(opts: { orders?: Record<string, unknown>[]; preload?: Record<string, unknown>[]; failOnReport?: number; failOnShipment?: number; scopes?: { scopeType: string; scopeId: string | null }[] } = {}) {
  let seq = 0, vehicleCalls = 0, driverCalls = 0;
  const orders = opts.orders ?? [order('o4'), order('o5')];
  const reports: Record<string, any>[] = [...(opts.preload ?? [])];
  const shipments: Record<string, any>[] = [];
  const matches = (r: any, w: any = {}) => Object.entries(w).every(([k, v]) => (v && typeof v === 'object' && 'in' in (v as any) ? (v as any).in.includes(r[k]) : r[k] === v));
  const tx = {
    deliveryReport: {
      updateMany: jest.fn(async ({ where, data }: any) => { reports.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, data)); }),
      create: jest.fn(async ({ data }: any) => { if (opts.failOnReport === reports.length + 1) throw new Error('the database dropped the connection'); const row = { id: `r${reports.length + 1}`, createdAt: new Date(), ...data }; reports.push(row); return row; }),
      update: jest.fn(async ({ where, data }: any) => { const r = reports.find((x) => x.id === where.id)!; Object.assign(r, data); return r; }),
    },
    shipment: { create: jest.fn(async ({ data }: any) => { if (opts.failOnShipment === shipments.length + 1) throw new Error('shipment table unavailable'); const row = { id: `sh${shipments.length + 1}`, ...data }; shipments.push(row); return row; }) },
    shipmentEvent: { create: jest.fn() },
    vehicle: { upsert: jest.fn(async () => { vehicleCalls++; return { id: 'veh-1' }; }), create: jest.fn(async () => { vehicleCalls++; return { id: 'veh-1' }; }), findFirst: jest.fn(async () => null) },
    driver: { upsert: jest.fn(async () => { driverCalls++; return { id: 'drv-1' }; }), create: jest.fn(async () => { driverCalls++; return { id: 'drv-1' }; }) },
  };
  const withRel = (r: any) => ({ ...r, deliveryOrder: orders.find((o: any) => o.id === r.deliveryOrderId), farm: { name: 'Nkawkaw Farm' }, destinationWarehouse: { name: 'Tamale Warehouse', location: 'Tamale' }, paddyGrade: { label: r.paddyGradeId === 'g4' ? 'Size 4' : 'Size 5' }, driver: r.driverId ? { name: 'Yaw Boateng' } : null, vehicle: r.vehicleId ? { plateNumber: 'GT-5521-21' } : null, submittedBy: { firstName: 'Yaa', lastName: 'Owusu' }, shipment: null });
  const prisma = {
    deliveryOrder: { findMany: jest.fn(async ({ where }: any) => orders.filter((o: any) => (where.id ? where.id.in.includes(o.id) : where.requestRef ? o.requestRef === where.requestRef : true)).map((o: any) => ({ ...o, reports: reports.filter((r) => r.deliveryOrderId === o.id).map((r) => ({ id: r.id, status: r.status })) }))) },
    deliveryReport: { findMany: jest.fn(async ({ where }: any) => reports.filter((r) => r.dispatchRef === where.dispatchRef).map(withRel)) },
    task: { updateMany: jest.fn() },
    warehouseManager: { findMany: jest.fn(async () => [{ userId: 'wm-1' }]) },
    $transaction: jest.fn(async (cb: any) => { const snap = [reports.map((r) => ({ ...r })), shipments.length]; try { return await cb(tx); } catch (err) { reports.splice(0, reports.length, ...(snap[0] as any[])); shipments.length = snap[1] as number; throw err; } }),
  };
  const ledger = { generateNumber: jest.fn(async (_t: unknown, prefix: string) => `${prefix}-2026-${String(++seq).padStart(6, '0')}`), recordTransaction: jest.fn(), adjustBalance: jest.fn() };
  const notifications = { notify: jest.fn() };
  const service = new DeliveryReportsService(prisma as any, { record: jest.fn() } as any, ledger as any, notifications as any);
  return { service, prisma, tx, reports, shipments, ledger, notifications, calls: () => ({ vehicleCalls, driverCalls }) };
}
const dispatch = (over: Record<string, unknown> = {}) => ({
  lines: [{ deliveryOrderId: 'o4', actualBagCount: 17 }, { deliveryOrderId: 'o5', actualBagCount: 3 }],
  vehiclePlateNumber: 'GT-5521-21', driverName: 'Yaw Boateng', labourCost: 120, transportationFee: 300, otherCosts: 30, ...over,
}) as any;
const sent = (n: { notify: jest.Mock }) => n.notify.mock.calls.map(([a]: any[]) => a);

describe('createDispatch: ONE truck with every size, prepared in one go', () => {
  it('saves both sizes as one dispatch under one reference, and sends it to the supervisor in the same step', async () => {
    const { service, reports } = build();
    const r = await service.createDispatch(dispatch(), manager);
    expect(reports).toHaveLength(2);
    expect(new Set(reports.map((x) => x.dispatchRef)).size).toBe(1);
    expect(r.dispatchRef).toMatch(/^DS-2026-/);
    expect(reports.every((x) => x.status === 'SUPERVISOR_REVIEW' && x.submittedById === 'fm-1' && x.submittedAt instanceof Date)).toBe(true);
    expect(r).toMatchObject({ status: 'SUPERVISOR_REVIEW', submitted: true, totalBags: 20, farmName: 'Nkawkaw Farm' });
    expect(r.lines.map((l) => [l.gradeLabel, l.bags])).toEqual([['Size 4', 17], ['Size 5', 3]]);
  });

  it('works out each size\'s kilograms from its own order (52 kg a bag), marked as an estimate when nothing was weighed', async () => {
    const { service } = build();
    const r = await service.createDispatch(dispatch({ lines: [{ deliveryOrderId: 'o4', actualBagCount: 17 }, { deliveryOrderId: 'o5', actualBagCount: 3, actualKg: 151 }] }), manager);
    expect(r.lines[0]).toMatchObject({ kg: 884, kgEstimated: true });
    expect(r.lines[1]).toMatchObject({ kg: 151, kgEstimated: false });
    expect(r.anyKgEstimated).toBe(true);
  });

  it('records the trip\'s costs ONCE (on the first report), never counted twice, and the driver and vehicle once', async () => {
    const { service, reports, calls } = build();
    const r = await service.createDispatch(dispatch(), manager);
    expect(reports[0]).toMatchObject({ labourCost: 120, transportationFee: 300, otherCosts: 30, totalDeliveryCost: 450 });
    expect(reports[1]).toMatchObject({ labourCost: 0, transportationFee: 0, otherCosts: 0, totalDeliveryCost: 0 });
    expect(r.totalCost).toBe(450);
    expect(calls()).toEqual({ vehicleCalls: 1, driverCalls: 1 });
    expect(reports[0].vehicleId).toBe('veh-1'); expect(reports[1].vehicleId).toBe('veh-1');
  });

  it('is ALL OR NOTHING: if the second size cannot be saved, the first is not left behind', async () => {
    const { service, reports, notifications } = build({ failOnReport: 2 });
    await expect(service.createDispatch(dispatch(), manager)).rejects.toThrow(/dropped the connection/);
    expect(reports).toHaveLength(0);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('can be saved as a draft, and then nobody is told', async () => {
    const { service, reports, notifications } = build();
    const r = await service.createDispatch(dispatch({ submit: false }), manager);
    expect(r).toMatchObject({ status: 'DRAFT', submitted: false });
    expect(reports.every((x) => x.status === 'DRAFT' && x.submittedAt === null)).toBe(true);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('replaces a draft the same person left on these orders the old one-size-at-a-time way', async () => {
    const { service, reports } = build({ preload: [{ id: 'old1', deliveryOrderId: 'o4', status: 'DRAFT', submittedById: 'fm-1' }, { id: 'old2', deliveryOrderId: 'o5', status: 'DRAFT', submittedById: 'someone-else' }] });
    await service.createDispatch(dispatch(), manager);
    expect(reports.find((r) => r.id === 'old1')!.status).toBe('CANCELLED');
    expect(reports.find((r) => r.id === 'old2')!.status).toBe('DRAFT'); // somebody else's draft is never touched
  });

  it('tells the supervisor who asked ONCE for the whole dispatch, and moves the farm manager\'s task to in progress', async () => {
    const { service, notifications, prisma } = build();
    await service.createDispatch(dispatch(), manager);
    expect(sent(notifications)).toHaveLength(1);
    expect(sent(notifications)[0]).toMatchObject({ userIds: ['fs-1'] });
    expect(sent(notifications)[0].title).toMatch(/^Dispatch ready for approval: DS-2026-/);
    expect(sent(notifications)[0].body).toBe("Nkawkaw Farm's manager has loaded 20 bags (Size 4 17, Size 5 3) for Tamale Warehouse. Open the Dispatch desk to approve it.");
    expect(prisma.task.updateMany).toHaveBeenCalledWith({ where: { deliveryRequestRef: 'RQ-1', status: 'TODO' }, data: { status: 'IN_PROGRESS' } });
  });

  it('refuses the same order twice, orders for different warehouses or farms, cancelled orders, and one already under way', async () => {
    await expect(build().service.createDispatch(dispatch({ lines: [{ deliveryOrderId: 'o4', actualBagCount: 5 }, { deliveryOrderId: 'o4', actualBagCount: 5 }] }), manager)).rejects.toThrow(/on the list twice/);
    await expect(build({ orders: [order('o4'), order('o5', { destinationWarehouseId: 'wh-2' })] }).service.createDispatch(dispatch(), manager)).rejects.toThrow(/different warehouses: one truck goes to one warehouse/);
    await expect(build({ orders: [order('o4'), order('o5', { farmId: 'farm-b' })] }).service.createDispatch(dispatch(), manager)).rejects.toThrow(/different farms/);
    await expect(build({ orders: [order('o4'), order('o5', { status: 'CANCELLED' })] }).service.createDispatch(dispatch(), manager)).rejects.toThrow(/was cancelled/);
    await expect(build({ preload: [{ id: 'x', deliveryOrderId: 'o5', status: 'IN_TRANSIT' }] }).service.createDispatch(dispatch(), manager)).rejects.toThrow(/already has a dispatch under way/);
    await expect(build({ orders: [order('o4')] }).service.createDispatch(dispatch(), manager)).rejects.toThrow(NotFoundException);
  });

  it('refuses a farm outside the person\'s own', async () => {
    await expect(build().service.createDispatch(dispatch(), person('fm-9', [{ scopeType: 'FARM', scopeId: 'farm-z' }]))).rejects.toThrow(ForbiddenException);
  });
});

describe('submitDispatch / approveDispatch / rejectDispatch: every size together', () => {
  async function inReview() { const h = build(); const r = await h.service.createDispatch(dispatch(), manager); h.notifications.notify.mockClear(); h.prisma.task.updateMany.mockClear(); return { ...h, ref: r.dispatchRef }; }

  it('approving moves EVERY size out of the farm together: one shipment and one stock movement per size, in one transaction', async () => {
    const { service, ref, shipments, ledger, prisma } = await inReview();
    prisma.$transaction.mockClear();
    const r = await service.approveDispatch(ref, supervisor);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(shipments.map((s) => [s.paddyGradeId, s.expectedBags])).toEqual([['g4', 17], ['g5', 3]]);
    expect(ledger.recordTransaction).toHaveBeenCalledTimes(2);
    expect(ledger.adjustBalance).toHaveBeenCalledTimes(4); // farm down and in-transit up, for each size
    expect(r.status).toBe('IN_TRANSIT');
  });

  it('is ALL OR NOTHING: if the second size cannot be approved, the first leaves nothing behind', async () => {
    const h = build({ failOnShipment: 2 }); const made = await h.service.createDispatch(dispatch(), manager); h.notifications.notify.mockClear();
    await expect(h.service.approveDispatch(made.dispatchRef, supervisor)).rejects.toThrow(/shipment table unavailable/);
    expect(h.shipments).toHaveLength(0);
    expect(h.reports.every((r) => r.status === 'SUPERVISOR_REVIEW')).toBe(true);
    expect(h.notifications.notify).not.toHaveBeenCalled();
  });

  it('tells the supervisor who asked, and the receiving warehouse, ONCE each, about the whole trip', async () => {
    const h = await inReview();
    await h.service.approveDispatch(h.ref, otherSupervisor);
    const [toAsker, toWarehouse] = sent(h.notifications);
    expect(toAsker).toMatchObject({ userIds: ['fs-1'], title: `Dispatched: ${h.ref}` });
    expect(toAsker.body).toBe('20 bags (Size 4 17, Size 5 3) left Nkawkaw Farm for Tamale Warehouse (driver Yaw Boateng, vehicle GT-5521-21). Track it under Dispatch.');
    expect(toWarehouse).toMatchObject({ userIds: ['wm-1'], title: 'Incoming: 20 bags (Size 4 17, Size 5 3)' });
    expect(h.notifications.notify).toHaveBeenCalledTimes(2);
  });

  it('completes the farm manager\'s task once every order of the request is on its way', async () => {
    const h = await inReview();
    await h.service.approveDispatch(h.ref, supervisor);
    const call = h.prisma.task.updateMany.mock.calls.find(([a]: any[]) => a.data.status === 'COMPLETED')![0];
    expect(call.where.deliveryRequestRef).toBe('RQ-1');
    expect(call.data).toMatchObject({ status: 'COMPLETED', completedById: 'fm-1' });
    expect(call.data.completionEvidence).toContain(h.ref);
  });

  it('nobody can approve or send back their own dispatch, and only a dispatch waiting for approval can be decided', async () => {
    const h = await inReview();
    await expect(h.service.approveDispatch(h.ref, manager)).rejects.toThrow(/cannot approve a dispatch you prepared/);
    await expect(h.service.rejectDispatch(h.ref, { reason: 'x' } as any, manager)).rejects.toThrow(ForbiddenException);
    await h.service.approveDispatch(h.ref, supervisor);
    await expect(h.service.approveDispatch(h.ref, otherSupervisor)).rejects.toThrow(/Only a dispatch waiting for approval/);
    await expect(h.service.rejectDispatch(h.ref, { reason: 'late' } as any, otherSupervisor)).rejects.toThrow(BadRequestException);
  });

  it('sending it back returns the WHOLE dispatch to the farm manager, with the reason, and tells them', async () => {
    const h = await inReview();
    const r = await h.service.rejectDispatch(h.ref, { reason: 'The weights do not match the bags' } as any, supervisor);
    expect(r.status).toBe('REJECTED');
    expect(h.reports.every((x) => x.status === 'REJECTED' && x.rejectionReason === 'The weights do not match the bags')).toBe(true);
    expect(sent(h.notifications)[0]).toMatchObject({ userIds: ['fm-1'], title: `Dispatch sent back: ${h.ref}` });
    expect(sent(h.notifications)[0].body).toBe('Reason: The weights do not match the bags. Prepare it again from the Dispatch desk.');
  });

  it('a saved draft is sent by the person who prepared it, and only by them (the mistake in the screenshot can no longer happen)', async () => {
    const h = build(); const made = await h.service.createDispatch(dispatch({ submit: false }), manager); h.notifications.notify.mockClear();
    await expect(h.service.submitDispatch(made.dispatchRef, supervisor)).rejects.toThrow(/Only the person who prepared this dispatch can send it/);
    const r = await h.service.submitDispatch(made.dispatchRef, manager);
    expect(r).toMatchObject({ status: 'SUPERVISOR_REVIEW', submitted: true });
    expect(sent(h.notifications)[0]).toMatchObject({ userIds: ['fs-1'] });
    await expect(h.service.submitDispatch(made.dispatchRef, manager)).rejects.toThrow(/cannot be sent for approval while it is supervisor review/);
  });

  it('an unknown dispatch is not found', async () => {
    await expect(build().service.approveDispatch('DS-nope', supervisor)).rejects.toThrow(NotFoundException);
  });
});
