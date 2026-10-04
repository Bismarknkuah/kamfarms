import { DeliveryReportsService } from '../delivery-reports.service';
import { ShipmentsService } from '../shipments.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const GLOBAL = [{ scopeType: 'GLOBAL', scopeId: null }];
const person = (id: string) => ({ id, permissionCodes: new Set<string>(), roles: [{ scopes: GLOBAL }] }) as unknown as AuthenticatedUser;
const farmManager = person('fm-1'), supervisorB = person('fs-2'), warehouseManager = person('wm-1');

// The farm supervisor 'fs-1' made the request; the farm manager 'fm-1' does the dispatch; supervisor 'fs-2' approves; 'wm-1' receives.
const reportRow = (over: Record<string, unknown> = {}) => ({
  id: 'dr-1', reportNumber: 'DR-2026-000001', farmId: 'farm-a', destinationWarehouseId: 'wh-1', paddyGradeId: 'g4', actualKg: 5200, actualBagCount: 100, actualKgEstimated: true,
  status: 'DRAFT', submittedById: 'fm-1', labourCost: 0, transportationFee: 0, otherCosts: 0, rejectionReason: null,
  farm: { name: 'Nkawkaw Farm' }, destinationWarehouse: { name: 'Tamale Warehouse' }, paddyGrade: { label: 'Size 4' }, vehicle: { plateNumber: 'GT-5521-21' }, driver: { name: 'Yaw Boateng' },
  deliveryOrder: { id: 'do-1', requestRef: 'RQ-2026-000001', orderNumber: 'DO-2026-000001', createdById: 'fs-1', bagCount: 100, totalKg: 5200, farmId: 'farm-a', destinationWarehouseId: 'wh-1', paddyGradeId: 'g4' },
  ...over,
});

function buildReports(report: Record<string, unknown>, siblings: { reports: { status: string }[] }[] = [{ reports: [{ status: 'IN_TRANSIT' }] }]) {
  const tx = { deliveryReport: { update: jest.fn(async ({ data }: any) => ({ ...report, ...data })), create: jest.fn(async ({ data }: any) => ({ id: 'dr-1', ...data })) }, shipment: { create: jest.fn(async () => ({ id: 'sh-1' })) }, shipmentEvent: { create: jest.fn() } };
  const prisma = {
    deliveryOrder: { findUnique: jest.fn(async () => report.deliveryOrder), findMany: jest.fn(async () => siblings) },
    deliveryReport: { findUnique: jest.fn(async () => report) },
    task: { updateMany: jest.fn() },
    warehouseManager: { findMany: jest.fn(async () => [{ userId: 'wm-1' }]) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const ledger = { generateNumber: jest.fn(async () => 'SH-2026-000001'), recordTransaction: jest.fn(), adjustBalance: jest.fn() };
  const notifications = { notify: jest.fn() };
  return { service: new DeliveryReportsService(prisma as any, { record: jest.fn() } as any, ledger as any, notifications as any), prisma, notifications };
}
const sent = (n: { notify: jest.Mock }) => n.notify.mock.calls.map(([a]: any[]) => a);

describe('what follows each step of a dispatch', () => {
  it('starting a dispatch report moves the farm manager\'s task to "in progress"', async () => {
    const { service, prisma } = buildReports(reportRow());
    await service.create({ deliveryOrderId: 'do-1', actualBagCount: 100 } as any, farmManager);
    expect(prisma.task.updateMany).toHaveBeenCalledWith({ where: { deliveryRequestRef: 'RQ-2026-000001', status: 'TODO' }, data: { status: 'IN_PROGRESS' } });
  });

  it('submitting the report tells the Farm Supervisor who asked for it, to approve it', async () => {
    const { service, notifications } = buildReports(reportRow({ status: 'DRAFT' }));
    await service.submit('dr-1', farmManager);
    const [n] = sent(notifications);
    expect(n).toMatchObject({ userIds: ['fs-1'], title: 'Dispatch report ready: DR-2026-000001', entityType: 'DeliveryReport' });
    expect(n.body).toBe("Nkawkaw Farm's manager has loaded 100 bags of Size 4 for Tamale Warehouse (order DO-2026-000001). Open Dispatch to approve it.");
  });

  it('approving it completes the farm manager\'s task once EVERY size of the request is on its way', async () => {
    const { service, prisma } = buildReports(reportRow({ status: 'SUPERVISOR_REVIEW' }), [{ reports: [{ status: 'IN_TRANSIT' }] }, { reports: [{ status: 'APPROVED' }] }]);
    await service.approve('dr-1', supervisorB);
    const call = prisma.task.updateMany.mock.calls[0][0];
    expect(call.where.deliveryRequestRef).toBe('RQ-2026-000001');
    expect(call.data).toMatchObject({ status: 'COMPLETED', completedById: 'fm-1' });
    expect(call.data.completionEvidence).toContain('DR-2026-000001');
  });

  it('but not while another size of the same request has not left yet', async () => {
    const { service, prisma } = buildReports(reportRow({ status: 'SUPERVISOR_REVIEW' }), [{ reports: [{ status: 'IN_TRANSIT' }] }, { reports: [] }]);
    await service.approve('dr-1', supervisorB);
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('approving tells the supervisor who asked for it where it is, and the receiving warehouse that it is coming', async () => {
    const { service, notifications } = buildReports(reportRow({ status: 'SUPERVISOR_REVIEW' }));
    await service.approve('dr-1', supervisorB);
    const [toSupervisor, toWarehouse] = sent(notifications);
    expect(toSupervisor).toMatchObject({ userIds: ['fs-1'], title: 'Dispatched: order DO-2026-000001' });
    expect(toSupervisor.body).toBe('100 bags of Size 4 left Nkawkaw Farm for Tamale Warehouse (driver Yaw Boateng, vehicle GT-5521-21). Track it under Dispatch.');
    expect(toWarehouse).toMatchObject({ userIds: ['wm-1'], title: 'Incoming: 100 bags of Size 4' });
  });

  it('the person who approved is never notified of their own action (the supervisor who asked and approved hears nothing twice)', async () => {
    const { service, notifications } = buildReports(reportRow({ status: 'SUPERVISOR_REVIEW' }));
    await service.approve('dr-1', person('fs-1'));
    expect(sent(notifications).every((n: any) => !n.userIds.includes('fs-1'))).toBe(true);
  });

  it('sending a report back tells the farm manager why', async () => {
    const { service, notifications } = buildReports(reportRow({ status: 'SUPERVISOR_REVIEW', rejectionReason: 'The weight does not match the bags' }));
    await service.reject('dr-1', { reason: 'The weight does not match the bags' } as any, supervisorB);
    expect(sent(notifications)[0]).toMatchObject({ userIds: ['fm-1'], title: 'Dispatch report sent back: DR-2026-000001' });
    expect(sent(notifications)[0].body).toContain('The weight does not match the bags');
  });

  it('a problem in this follow-up never undoes or fails the report itself', async () => {
    const { service, prisma } = buildReports(reportRow({ status: 'SUPERVISOR_REVIEW' }));
    prisma.warehouseManager.findMany.mockRejectedValue(new Error('lookup failed'));
    await expect(service.approve('dr-1', supervisorB)).resolves.toBeDefined();
  });
});

describe('a shipment arriving', () => {
  const shipment = { id: 'sh-1', shipmentNumber: 'SH-2026-000001', deliveryReportId: 'dr-1', farmId: 'farm-a', warehouseId: 'wh-1', paddyGradeId: 'g4', expectedKg: 5200, expectedBags: 100, receivedAt: null, farm: { name: 'Nkawkaw Farm' }, warehouse: { name: 'Tamale Warehouse' }, paddyGrade: { label: 'Size 4' }, deliveryReport: { vehicle: null, driver: null, deliveryOrder: { orderNumber: 'DO-2026-000001', createdById: 'fs-1' } }, events: [] };
  function build() {
    const tx = { shipment: { update: jest.fn(async ({ data }: any) => ({ ...shipment, ...data, receivedAt: new Date() })) }, deliveryReport: { update: jest.fn() }, shipmentEvent: { create: jest.fn() } };
    const prisma = { shipment: { findUnique: jest.fn(async () => shipment) }, farmManager: { findMany: jest.fn(async () => [{ userId: 'fm-1' }]) }, $transaction: jest.fn(async (cb: any) => cb(tx)) };
    const notifications = { notify: jest.fn() };
    return { service: new ShipmentsService(prisma as any, { record: jest.fn() } as any, { recordTransaction: jest.fn(), adjustBalance: jest.fn() } as any, undefined, notifications as any), notifications };
  }

  it('tells the supervisor who asked and the farm manager that it arrived, and that a bag was missing', async () => {
    const { service, notifications } = build();
    await service.receive('sh-1', { receivedBags: 98 } as any, warehouseManager);
    const [n] = sent(notifications);
    expect(n.userIds.sort()).toEqual(['fm-1', 'fs-1']);
    expect(n.title).toBe('Arrived at Tamale Warehouse: DO-2026-000001');
    expect(n.body).toContain('98 bags of Size 4 from Nkawkaw Farm received, 2 bags fewer than the 100 bags that left.');
  });

  it('says "as sent" when every bag arrived', async () => {
    const { service, notifications } = build();
    await service.receive('sh-1', { receivedBags: 100 } as any, warehouseManager);
    expect(sent(notifications)[0].body).toContain('received, as sent.');
  });
});
