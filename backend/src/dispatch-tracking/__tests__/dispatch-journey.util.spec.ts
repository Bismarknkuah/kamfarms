import { analyse, buildFarmJourney, buildPaddyTransferJourney, buildRiceTransferJourney, deadlineOf, Names } from '../dispatch-journey.util';

const T = (s: string) => new Date(`2026-${s}Z`);
const names: Names & { products: Map<string, string> } = {
  users: new Map([['fd', 'Efua Mensah'], ['fm', 'Yaa Owusu'], ['wm', 'Kwabena Adjei'], ['ws', 'Abena Osei']]), farms: new Map([['f1', 'Nkawkaw Farm']]), warehouses: new Map([['w1', 'Tamale Warehouse'], ['w2', 'Kumasi Warehouse']]),
  grades: new Map([['g4', 'Size 4'], ['g5', 'Size 5']]), vehicles: new Map([['v1', 'GT-1234-21']]), drivers: new Map([['d1', 'Kofi Mensah']]), products: new Map([['p1', 'Premium Rice 25kg']]),
};
// Needed by 3 Oct, so the deadline is the end of that day: 4 Oct 00:00.
const order = { id: 'o1', orderNumber: 'DO-1', requestRef: 'RQ-1', farmId: 'f1', destinationWarehouseId: 'w1', createdById: 'fd', createdAt: T('10-01T08:00:00'), requestedDate: T('10-03T00:00:00'), paddyGradeId: 'g4', bagCount: 17 };
const report = { id: 'r1', reportNumber: 'DR-1', dispatchRef: 'DS-1', farmId: 'f1', destinationWarehouseId: 'w1', status: 'RECONCILED', deliveryOrderId: 'o1', paddyGradeId: 'g4', actualBagCount: 17, submittedById: 'fm', submittedAt: T('10-01T14:00:00'), approvedById: 'fd', approvedAt: T('10-02T10:00:00'), vehicleId: 'v1', driverId: 'd1', createdAt: T('10-01T13:00:00') };
const ship = (over: Record<string, unknown> = {}) => ({ id: 's1', deliveryReportId: 'r1', paddyGradeId: 'g4', expectedBags: 17, receivedBags: 16, departedAt: T('10-02T10:30:00'), receivedAt: T('10-04T09:00:00'), receivedById: 'wm', warehouseId: 'w1', ...over });
const NOW = T('10-06T00:00:00');
const farm = (o: Partial<Record<'orders' | 'reports' | 'shipments', any[]>> = {}) => buildFarmJourney({ key: 'farm:DS-1', orders: [order], reports: [report], shipments: [ship()], ...o }, names, NOW);

describe('the needed-by day', () => {
  it('is the last moment it may arrive: the end of that day', () => {
    expect(deadlineOf(T('10-03T00:00:00'))?.toISOString()).toBe('2026-10-04T00:00:00.000Z');
    expect(deadlineOf(T('10-03T17:45:00'))?.toISOString()).toBe('2026-10-04T00:00:00.000Z');
    expect(deadlineOf(null)).toBeNull();
  });
});

describe('a dispatch from a farm, start to finish', () => {
  it('lists every step with who did it and when, in order, and how long each step waited', () => {
    const j = farm();
    expect(j).toMatchObject({ kind: 'FARM_DISPATCH', ref: 'DS-1', requestRef: 'RQ-1', status: 'DELIVERED', label: 'Delivered', vehicle: 'GT-1234-21', driver: 'Kofi Mensah' });
    expect(j.from.name).toBe('Nkawkaw Farm'); expect(j.to).toEqual({ id: 'w1', name: 'Tamale Warehouse' });
    expect(j.steps.map((s) => [s.key, s.who, s.state, s.waitedHours])).toEqual([
      ['requested', 'Efua Mensah', 'done', null], ['loaded', 'Yaa Owusu', 'done', 6], ['approved', 'Efua Mensah', 'done', 20], ['departed', 'Kofi Mensah', 'done', 0.5], ['delivered', 'Kwabena Adjei', 'done', 46.5],
    ]);
    expect(j.steps.map((s) => s.at)).toEqual(['2026-10-01T08:00:00.000Z', '2026-10-01T14:00:00.000Z', '2026-10-02T10:00:00.000Z', '2026-10-02T10:30:00.000Z', '2026-10-04T09:00:00.000Z']);
  });
  it('says the day it was supposed to be delivered by, when it really was, and how late: delivered 9 hours after the end of the needed-by day', () => {
    const j = farm();
    expect(j.neededBy).toBe('2026-10-03T00:00:00.000Z'); expect(j.deliveredAt).toBe('2026-10-04T09:00:00.000Z');
    expect(j.late).toEqual({ hours: 9, delivered: true });
  });
  it('names who held it longest: here the last leg, the truck on the road until the warehouse counted it in', () => {
    expect(farm().slowest).toEqual({ label: 'Delivered and counted in', who: 'Kwabena Adjei', role: 'Warehouse Manager', hours: 46.5, running: false });
  });
  it('a shortfall is said on the delivery step, and the bags are shown sent and received', () => {
    const j = farm();
    expect(j.steps.find((s) => s.key === 'delivered')?.detail).toBe('1 bag short');
    expect(j.lines).toEqual([{ paddyGradeId: 'g4', label: 'Size 4', bags: 17, receivedBags: 16 }]); expect(j.totalBags).toBe(17);
  });
  it('delivered inside the needed-by day is on time: no lateness at all', () => {
    const j = farm({ shipments: [ship({ receivedAt: T('10-03T16:00:00') })] });
    expect(j.late).toBeNull();
  });
  it('without a request there is no "Requested" step, and the first step is the loading', () => {
    const j = farm({ orders: [{ ...order, requestRef: null }] });
    expect(j.steps.map((s) => s.key)).toEqual(['loaded', 'approved', 'departed', 'delivered']);
    expect(j.steps[0].waitedHours).toBeNull();
  });
});

describe('a dispatch that is not finished: who is holding it, and for how long', () => {
  it('in transit and past its day: overdue by the hours since the deadline, with the running wait on the warehouse', () => {
    const j = farm({ shipments: [ship({ receivedAt: null, receivedById: null, receivedBags: null })] });
    expect(j).toMatchObject({ status: 'IN_TRANSIT', label: 'In transit', deliveredAt: null });
    expect(j.late).toEqual({ hours: 48, delivered: false }); // now is 6 Oct 00:00, the deadline was 4 Oct 00:00
    expect(j.steps.find((s) => s.state === 'current')).toMatchObject({ key: 'delivered', waitedHours: 85.5, who: null, role: 'Warehouse Manager' });
    expect(j.slowest).toMatchObject({ label: 'Delivered and counted in', role: 'Warehouse Manager', hours: 85.5, running: true });
  });
  it('waiting for approval: the Farm Supervisor is holding it, since the loading', () => {
    const j = farm({ reports: [{ ...report, status: 'SUPERVISOR_REVIEW', approvedAt: null, approvedById: null }], shipments: [] });
    expect(j).toMatchObject({ status: 'IN_REVIEW', label: 'Waiting for approval' });
    expect(j.steps.find((s) => s.state === 'current')).toMatchObject({ key: 'approved', role: 'Farm Supervisor', waitedHours: 106 });
    expect(j.steps.filter((s) => s.state === 'upcoming').map((s) => s.key)).toEqual(['departed', 'delivered']);
  });
  it('a request nobody has loaded yet: the Farm Manager is holding it, since it was made', () => {
    const j = farm({ reports: [], shipments: [] });
    expect(j).toMatchObject({ status: 'REQUESTED', label: 'Requested: not loaded yet', ref: 'RQ-1' });
    expect(j.steps.find((s) => s.state === 'current')).toMatchObject({ key: 'loaded', role: 'Farm Manager', waitedHours: 112 });
    expect(j.lines).toEqual([{ paddyGradeId: 'g4', label: 'Size 4', bags: 17, receivedBags: null }]);
  });
  it('a truck with two sizes where only one is counted in yet says how far it has got, and is still in transit', () => {
    const j = farm({ shipments: [ship(), ship({ id: 's2', paddyGradeId: 'g5', receivedAt: null, receivedById: null, receivedBags: null, expectedBags: 3 })] });
    expect(j.status).toBe('IN_TRANSIT'); expect(j.deliveredAt).toBeNull();
    expect(j.steps.find((s) => s.key === 'delivered')).toMatchObject({ state: 'current', detail: '1 of 2 sizes counted in so far' });
  });
  it('not late before the needed-by day has ended', () => {
    const j = buildFarmJourney({ key: 'k', orders: [order], reports: [], shipments: [] }, names, T('10-03T12:00:00'));
    expect(j.late).toBeNull();
  });
});

describe('paddy and rice sent between warehouses', () => {
  const t = { id: 'pt1', transferNumber: 'PT-2026-000001', fromWarehouseId: 'w2', toWarehouseId: 'w1', status: 'RECEIVED', sentById: 'ws', sentAt: T('10-02T07:00:00'), receivedById: 'wm', receivedAt: T('10-02T15:00:00'), receivedLines: [{ gradeLabel: 'Size 4', bags: 19 }], varianceBags: -1, totalBags: 20, lines: [{ gradeLabel: 'Size 4', bags: 20 }], vehiclePlate: 'GT-9-21', driverName: 'Kojo', supplyRequestNumber: 'SR-2026-000001' };
  it('is two steps, sent and counted in, with the wait between them, and the supply request\'s needed-by day', () => {
    const j = buildPaddyTransferJourney(t, names, T('10-01T00:00:00'), NOW); // needed by 1 Oct, so due by the end of that day; counted in 2 Oct 15:00
    expect(j).toMatchObject({ kind: 'PADDY_TRANSFER', ref: 'PT-2026-000001', requestRef: 'SR-2026-000001', status: 'DELIVERED', late: { hours: 15, delivered: true } });
    expect(j.steps.map((s) => [s.key, s.who, s.waitedHours, s.detail])).toEqual([['sent', 'Abena Osei', null, 'Vehicle GT-9-21, driver Kojo'], ['delivered', 'Kwabena Adjei', 8, '1 bag short']]);
    expect(j.lines).toEqual([{ paddyGradeId: null, label: 'Size 4', bags: 20, receivedBags: 19 }]);
  });
  it('still on the road is in transit, and the warehouse that should count it in is the one holding it', () => {
    const j = buildPaddyTransferJourney({ ...t, status: 'IN_TRANSIT', receivedAt: null, receivedById: null }, names, null, NOW);
    expect(j).toMatchObject({ status: 'IN_TRANSIT', late: null }); expect(j.steps[1]).toMatchObject({ state: 'current', role: 'Warehouse Manager' });
  });
  it('rice between warehouses is the same two steps', () => {
    const j = buildRiceTransferJourney({ id: 'rt1', transferNumber: 'TRF-2026-000001', sourceWarehouseId: 'w1', destWarehouseId: 'w2', productId: 'p1', bagCount: 40, status: 'RECEIVED', requestedById: 'ws', dispatchedAt: T('10-02T07:00:00'), receivedById: 'wm', receivedAt: T('10-03T07:00:00'), receivedBagCount: 40 }, names, NOW);
    expect(j).toMatchObject({ kind: 'RICE_TRANSFER', status: 'DELIVERED', ref: 'TRF-2026-000001' }); expect(j.lines).toEqual([{ paddyGradeId: null, label: 'Premium Rice 25kg', bags: 40, receivedBags: 40 }]);
    expect(j.steps[1].waitedHours).toBe(24);
  });
});

describe('analyse never invents a time', () => {
  it('with nothing done the first step is the one waiting, and nothing has a wait', () => {
    const a = analyse([{ key: 'a', label: 'A', role: 'R', who: null, at: null }, { key: 'b', label: 'B', role: 'R', who: null, at: null }], null, null, NOW);
    expect(a.steps.map((s) => [s.state, s.waitedHours])).toEqual([['current', null], ['upcoming', null]]); expect(a.slowest).toBeNull(); expect(a.late).toBeNull(); expect(a.lastActivity).toBeNull();
  });
});
