import { buildRequestCards } from '../dispatch-board.util';
import { DeliveryOrdersService } from '../delivery-orders.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const T = { t0: '2026-10-05T08:00:00.000Z', t1: '2026-10-05T10:00:00.000Z', t2: '2026-10-05T12:00:00.000Z', t3: '2026-10-05T14:00:00.000Z', t4: '2026-10-06T09:00:00.000Z' };
const ord = (id: string, grade: string, over: Record<string, unknown> = {}) => ({
  id, orderNumber: `DO-${id}`, requestRef: 'RQ-1', farmId: 'farm-a', farm: { name: 'Nkawkaw Farm' }, destinationWarehouseId: 'wh-1', destinationWarehouse: { name: 'Tamale Warehouse', location: 'Tamale' },
  paddyGrade: { label: grade }, bagCount: 17, totalKg: 850, totalKgEstimated: true, status: 'PENDING', priority: 'HIGH', notes: 'Load Size 4 first', requestedDate: '2026-10-09T00:00:00.000Z',
  createdAt: T.t0, createdById: 'fs-1', createdBy: { firstName: 'Efua', lastName: 'Mensah' }, reports: [] as any[], ...over,
});
const rep = (id: string, orderId: string, grade: string, status: string, over: Record<string, unknown> = {}) => ({
  id, reportNumber: `DR-${id}`, dispatchRef: 'DS-1', deliveryOrderId: orderId, status, createdAt: T.t1, submittedAt: T.t2, submittedById: 'fm-1', submittedBy: { firstName: 'Yaa', lastName: 'Owusu' },
  paddyGrade: { label: grade }, actualBagCount: grade === 'Size 4' ? 17 : 3, actualKg: 850, actualKgEstimated: true, labourCost: 0, transportationFee: 0, otherCosts: 0, totalDeliveryCost: 0,
  driver: { name: 'Yaw Boateng', phone: '0244' }, vehicle: { plateNumber: 'GT-5521-21' }, ...over,
});
const NOW = new Date('2026-10-07T10:00:00.000Z');
const two = (status: string, extra5: Record<string, unknown> = {}, extra4: Record<string, unknown> = {}) => [
  ord('a4', 'Size 4', { reports: [rep('r1', 'a4', 'Size 4', status, { labourCost: 120, transportationFee: 300, otherCosts: 30, totalDeliveryCost: 450, ...extra4 })] }),
  ord('a5', 'Size 5', { bagCount: 3, reports: [rep('r2', 'a5', 'Size 5', status, extra5)] }),
];

describe('buildRequestCards: one card per request, shared by the supervisor and the farm manager', () => {
  it('groups the orders made together into ONE request with every size', () => {
    const [c] = buildRequestCards([ord('a4', 'Size 4'), ord('a5', 'Size 5', { bagCount: 3 })], NOW);
    expect(c).toMatchObject({ requestRef: 'RQ-1', totalBags: 20, priority: 'HIGH', notes: 'Load Size 4 first', requestedBy: 'Efua Mensah', farm: { name: 'Nkawkaw Farm' }, warehouse: { name: 'Tamale Warehouse', location: 'Tamale' } });
    expect(c.lines.map((l) => [l.gradeLabel, l.bagCount])).toEqual([['Size 4', 17], ['Size 5', 3]]);
  });

  it('REQUESTED: with the farm manager, nothing prepared yet', () => {
    const [c] = buildRequestCards([ord('a4', 'Size 4'), ord('a5', 'Size 5')], NOW);
    expect(c).toMatchObject({ stage: 'REQUESTED', holder: 'Farm manager', awaitingApproval: false, dispatches: [] });
  });

  it('IN REVIEW: ONE dispatch with both sizes, waiting for the supervisor, with the trip\'s details and costs added up once', () => {
    const [c] = buildRequestCards(two('SUPERVISOR_REVIEW'), NOW);
    expect(c).toMatchObject({ stage: 'IN_REVIEW', holder: 'Farm supervisor', awaitingApproval: true });
    expect(c.dispatches).toHaveLength(1);
    expect(c.dispatches[0]).toMatchObject({ ref: 'DS-1', dispatchRef: 'DS-1', status: 'SUPERVISOR_REVIEW', totalBags: 20, preparedBy: 'Yaa Owusu', preparedById: 'fm-1', driverName: 'Yaw Boateng', vehiclePlate: 'GT-5521-21', totalCost: 450, labourCost: 120, transportationFee: 300, otherCosts: 30 });
    expect(c.dispatches[0].lines.map((l) => [l.gradeLabel, l.bags])).toEqual([['Size 4', 17], ['Size 5', 3]]);
  });

  it('is only as far along as its SLOWEST size', () => {
    const orders = [
      ord('a4', 'Size 4', { reports: [rep('r1', 'a4', 'Size 4', 'IN_TRANSIT', { approvedAt: T.t3, shipment: { departedAt: T.t3, expectedBags: 17 } })] }),
      ord('a5', 'Size 5', { bagCount: 3 }),
    ];
    const [c] = buildRequestCards(orders, NOW);
    expect(c.stage).toBe('REQUESTED');
    expect(c.lines.map((l) => l.stage)).toEqual(['ON_THE_WAY', 'REQUESTED']);
  });

  it('ON THE WAY, then ARRIVED with the bags short across the sizes added up', () => {
    const road = buildRequestCards(two('IN_TRANSIT', { shipment: { departedAt: T.t3, expectedBags: 3 } }, { shipment: { departedAt: T.t3, expectedBags: 17 } }), NOW)[0];
    expect(road).toMatchObject({ stage: 'ON_THE_WAY', holder: 'On the road', awaitingApproval: false });
    const arrived = buildRequestCards(two('RECONCILED', { shipment: { departedAt: T.t3, receivedAt: T.t4, expectedBags: 3, receivedBags: 3 } }, { shipment: { departedAt: T.t3, receivedAt: T.t4, expectedBags: 17, receivedBags: 16, varianceRequiresApproval: true } }), NOW)[0];
    expect(arrived).toMatchObject({ stage: 'ARRIVED', holder: null, arrivedAt: T.t4, bagVariance: -1, varianceRequiresApproval: true });
  });

  it('SENT BACK: the farm manager has it again, with the reason', () => {
    const [c] = buildRequestCards(two('REJECTED', { rejectionReason: 'x' }, { rejectionReason: 'The weights do not match' }), NOW);
    expect(c).toMatchObject({ stage: 'PREPARING', holder: 'Farm manager', sentBack: 'The weights do not match' });
  });

  it('flags a request as OVERDUE when it was needed by a date that has passed and has not left yet', () => {
    const [late] = buildRequestCards([ord('a4', 'Size 4', { requestedDate: '2026-10-04T00:00:00.000Z' })], NOW);
    expect(late).toMatchObject({ overdue: true, daysOverdue: 3 });
    const [fine] = buildRequestCards([ord('a4', 'Size 4')], NOW);
    expect(fine.overdue).toBe(false);
    const [sent] = buildRequestCards([ord('a4', 'Size 4', { requestedDate: '2026-10-04T00:00:00.000Z', reports: [rep('r1', 'a4', 'Size 4', 'IN_TRANSIT', { shipment: { departedAt: T.t3 } })] })], NOW);
    expect(sent.overdue).toBe(false); // it has left: no longer late
  });

  it('uses the CURRENT report of each order: a cancelled draft and an older sent-back one do not count', () => {
    const o = ord('a4', 'Size 4', { reports: [rep('new', 'a4', 'Size 4', 'SUPERVISOR_REVIEW', { createdAt: T.t3, dispatchRef: 'DS-2' }), rep('old', 'a4', 'Size 4', 'REJECTED', { createdAt: T.t1 }), rep('gone', 'a4', 'Size 4', 'CANCELLED', { createdAt: T.t4 })] });
    const [c] = buildRequestCards([o], NOW);
    expect(c.dispatches.map((d) => d.ref)).toEqual(['DS-2']);
    expect(c.stage).toBe('IN_REVIEW');
  });

  it('shows a report made the old one-size-at-a-time way as its own dispatch, and an order with no request reference as its own request', () => {
    const [c] = buildRequestCards([ord('z1', 'Size 4', { requestRef: null, reports: [rep('r1', 'z1', 'Size 4', 'SUPERVISOR_REVIEW', { dispatchRef: null })] })], NOW);
    expect(c.requestRef).toBeNull();
    expect(c.key).toBe('DO-z1');
    expect(c.dispatches[0]).toMatchObject({ ref: 'DR-r1', dispatchRef: null });
  });

  it('puts the newest request first, shows cancelled requests as cancelled, and never throws on bare data', () => {
    const cards = buildRequestCards([ord('a1', 'Size 4', { requestRef: 'RQ-old', createdAt: T.t0 }), ord('b1', 'Size 4', { requestRef: 'RQ-new', createdAt: T.t4 }), ord('c1', 'Size 4', { requestRef: 'RQ-x', status: 'CANCELLED' })], NOW);
    expect(cards.map((c) => c.requestRef)[0]).toBe('RQ-new');
    expect(cards.find((c) => c.requestRef === 'RQ-x')!.stage).toBe('CANCELLED');
    expect(() => buildRequestCards([{ id: 'x' } as any], NOW)).not.toThrow();
  });
});

describe('DeliveryOrdersService.board: who sees which requests', () => {
  const asPerson = (scopes: { scopeType: string; scopeId: string | null }[]) => ({ id: 'u', permissionCodes: new Set<string>(), roles: [{ scopes }] }) as unknown as AuthenticatedUser;
  const make = () => {
    const prisma = { deliveryOrder: { findMany: jest.fn(async () => [ord('a4', 'Size 4'), ord('a5', 'Size 5')]) } };
    return { service: new DeliveryOrdersService(prisma as any, {} as any, {} as any, {} as any), prisma };
  };
  it('a supervisor with company-wide scope sees every farm', async () => {
    const { service, prisma } = make();
    const cards = await service.board(asPerson([{ scopeType: 'GLOBAL', scopeId: null }]));
    expect(cards).toHaveLength(1);
    expect((prisma.deliveryOrder.findMany.mock.calls[0] as any[])[0].where).toEqual({});
  });
  it('a farm manager sees only their own farm\'s requests', async () => {
    const { service, prisma } = make();
    await service.board(asPerson([{ scopeType: 'FARM', scopeId: 'farm-a' }]));
    expect((prisma.deliveryOrder.findMany.mock.calls[0] as any[])[0].where).toEqual({ farmId: { in: ['farm-a'] } });
  });
  it('someone with no farm scope sees nothing, and the database is not even asked', async () => {
    const { service, prisma } = make();
    await expect(service.board(asPerson([]))).resolves.toEqual([]);
    expect(prisma.deliveryOrder.findMany).not.toHaveBeenCalled();
  });
});
