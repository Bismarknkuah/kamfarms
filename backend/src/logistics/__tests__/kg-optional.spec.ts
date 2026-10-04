import { DeliveryReportsService } from '../delivery-reports.service';
import { ShipmentsService } from '../shipments.service';
import { PaddyRequestsService } from '../paddy-requests.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

// Most farms and warehouses have no scale: they deal in BAGS. Kilograms are optional everywhere in the dispatch chain, worked out from the
// bags when nobody weighed anything, and marked as an estimate.
const GLOBAL = [{ scopeType: 'GLOBAL', scopeId: null }];
const manager = { id: 'fm-1', permissionCodes: new Set<string>(), roles: [{ scopes: GLOBAL }] } as unknown as AuthenticatedUser;

describe('delivery report: kilograms optional', () => {
  const order = { id: 'do-1', farmId: 'farm-a', destinationWarehouseId: 'wh-1', paddyGradeId: 'g4', bagCount: 100, totalKg: 5200 }; // 52 kg a bag

  function build(existing: Record<string, unknown> = {}) {
    const created: Record<string, any> = {};
    const updated: Record<string, any> = {};
    const tx = {
      deliveryReport: {
        create: jest.fn(async ({ data }: any) => { Object.assign(created, { id: 'dr-1', ...data }); return created; }),
        update: jest.fn(async ({ data }: any) => { Object.assign(updated, data); return { id: 'dr-1', ...data }; }),
      },
    };
    const stored = { id: 'dr-1', farmId: 'farm-a', status: 'DRAFT', submittedById: 'fm-1', actualBagCount: 100, actualKg: 5200, actualKgEstimated: true, labourCost: 0, transportationFee: 0, otherCosts: 0, ...existing };
    const prisma = { deliveryOrder: { findUnique: jest.fn(async () => order) }, deliveryReport: { findUnique: jest.fn(async () => stored) }, $transaction: jest.fn(async (cb: any) => cb(tx)) };
    const ledger = { generateNumber: jest.fn(async () => 'DR-2026-000001') };
    return { service: new DeliveryReportsService(prisma as any, { record: jest.fn() } as any, ledger as any), created, updated };
  }

  it('with only the bags counted, works the kilograms out at the order\'s own weight per bag and marks them as an estimate', async () => {
    const { service, created } = build();
    await service.create({ deliveryOrderId: 'do-1', actualBagCount: 80 } as any, manager);
    expect(created).toMatchObject({ actualBagCount: 80, actualKg: 4160, actualKgEstimated: true });
  });

  it('keeps a weighed figure as a measurement, not an estimate', async () => {
    const { service, created } = build();
    await service.create({ deliveryOrderId: 'do-1', actualBagCount: 80, actualKg: 4175.5 } as any, manager);
    expect(created).toMatchObject({ actualKg: 4175.5, actualKgEstimated: false });
  });

  it('falls back to the standard bag weight when the order itself carries no usable weight', async () => {
    const { service, created } = build();
    (service as any).prisma.deliveryOrder.findUnique.mockResolvedValue({ ...order, bagCount: 0, totalKg: 0 });
    await service.create({ deliveryOrderId: 'do-1', actualBagCount: 10 } as any, manager);
    expect(created).toMatchObject({ actualKg: 500, actualKgEstimated: true });
  });

  it('editing the bag count of an estimated report re-works the estimate, still marked as one', async () => {
    const { service, updated } = build();
    await service.update('dr-1', { actualBagCount: 90 } as any, manager);
    expect(updated).toMatchObject({ actualBagCount: 90, actualKg: 4680, actualKgEstimated: true });
  });

  it('typing kilograms on an edit turns the estimate into a measurement', async () => {
    const { service, updated } = build();
    await service.update('dr-1', { actualKg: 4700 } as any, manager);
    expect(updated).toMatchObject({ actualKg: 4700, actualKgEstimated: false });
  });

  it('editing the bag count of a WEIGHED report leaves its weighed kilograms alone', async () => {
    const { service, updated } = build({ actualKgEstimated: false, actualKg: 5230 });
    await service.update('dr-1', { actualBagCount: 99 } as any, manager);
    expect(updated.actualKg).toBeUndefined();
    expect(updated.actualKgEstimated).toBeUndefined();
  });
});

describe('shipment receive: kilograms optional', () => {
  const shipment = { id: 'sh-1', shipmentNumber: 'SH-1', deliveryReportId: 'dr-1', farmId: 'farm-a', warehouseId: 'wh-1', paddyGradeId: 'g4', expectedKg: 5200, expectedBags: 100, receivedAt: null, farm: {}, warehouse: {}, paddyGrade: {}, deliveryReport: { vehicle: null, driver: null }, events: [] };

  function build() {
    const shipmentUpdate = jest.fn(async ({ data }: any) => ({ ...shipment, ...data, receivedAt: new Date() }));
    const tx = { shipment: { update: shipmentUpdate }, deliveryReport: { update: jest.fn() }, shipmentEvent: { create: jest.fn() } };
    const prisma = { shipment: { findUnique: jest.fn(async () => shipment) }, $transaction: jest.fn(async (cb: any) => cb(tx)) };
    const ledger = { recordTransaction: jest.fn(), adjustBalance: jest.fn() };
    return { service: new ShipmentsService(prisma as any, { record: jest.fn() } as any, ledger as any), shipmentUpdate, ledger };
  }

  it('with only the bags counted, works the kilograms out at the weight per bag the shipment left with, so a full load shows no variance', async () => {
    const { service, shipmentUpdate, ledger } = build();
    await service.receive('sh-1', { receivedBags: 100 } as any, manager);
    expect(shipmentUpdate.mock.calls[0][0].data).toMatchObject({ receivedKg: 5200, receivedKgEstimated: true, receivedBags: 100, varianceKg: 0 });
    expect(ledger.recordTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ quantityKg: 5200, bagCount: 100 }));
  });

  it('a missing bag shows up as its share of the weight', async () => {
    const { service, shipmentUpdate } = build();
    await service.receive('sh-1', { receivedBags: 98 } as any, manager);
    expect(shipmentUpdate.mock.calls[0][0].data).toMatchObject({ receivedKg: 5096, receivedKgEstimated: true, varianceKg: -104 });
  });

  it('a weighed figure is used as given, and not marked as an estimate', async () => {
    const { service, shipmentUpdate } = build();
    await service.receive('sh-1', { receivedBags: 100, receivedKg: 5180 } as any, manager);
    expect(shipmentUpdate.mock.calls[0][0].data).toMatchObject({ receivedKg: 5180, receivedKgEstimated: false, varianceKg: -20 });
  });
});

describe('paddy request: kilograms optional', () => {
  function build() {
    const created: Record<string, any> = {};
    const tx = { paddyRequest: { count: jest.fn(async () => 0), create: jest.fn(async ({ data }: any) => { Object.assign(created, { id: 'req-1', requestNumber: 'PR-REQ-1', ...data }); return created; }) } };
    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      user: { findMany: jest.fn(async () => [{ id: 'sup-1' }]) },
      paddyRequest: { findUnique: jest.fn(async () => ({ id: 'req-1', warehouseId: 'wh-1', requestedBy: {}, respondedBy: {} })) },
    };
    const notifications = { notify: jest.fn() };
    return { service: new PaddyRequestsService(prisma as any, { record: jest.fn() } as any, notifications as any), created, notifications };
  }

  it('is counted in bags: with no kilograms given they are worked out from the bags', async () => {
    const { service, created } = build();
    await service.create({ warehouseId: 'wh-1', paddyGradeId: 'g4', requestedBagCount: 40 } as any, manager);
    expect(created).toMatchObject({ requestedBagCount: 40, requestedKg: 2000 });
  });

  it('tells the farm supervisors the bags, and the kilograms only if someone gave them', async () => {
    const a = build();
    await a.service.create({ warehouseId: 'wh-1', paddyGradeId: 'g4', requestedBagCount: 40 } as any, manager);
    expect(a.notifications.notify.mock.calls[0][0].body).toBe('A warehouse needs 40 bags - awaiting your response.');
    const b = build();
    await b.service.create({ warehouseId: 'wh-1', paddyGradeId: 'g4', requestedBagCount: 40, requestedKg: 2100 } as any, manager);
    expect(b.notifications.notify.mock.calls[0][0].body).toBe('A warehouse needs 40 bags (2100 KG) - awaiting your response.');
  });
});
