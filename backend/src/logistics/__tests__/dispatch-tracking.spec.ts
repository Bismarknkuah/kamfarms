import { trackingOf } from '../dispatch-tracking.util';

const T0 = '2026-10-05T08:00:00.000Z', T1 = '2026-10-05T10:00:00.000Z', T2 = '2026-10-05T12:00:00.000Z', T3 = '2026-10-05T14:00:00.000Z', T4 = '2026-10-06T09:00:00.000Z';
const order = (over: Record<string, unknown> = {}) => ({ status: 'PENDING', createdAt: T0, createdBy: { firstName: 'Efua', lastName: 'Mensah' }, bagCount: 100, destinationWarehouse: { name: 'Tamale Warehouse' }, reports: [] as unknown[], ...over }) as any;
const report = (over: Record<string, unknown> = {}) => ({ reportNumber: 'DR-1', status: 'DRAFT', createdAt: T1, actualBagCount: 98, submittedBy: { firstName: 'Yaa', lastName: 'Owusu' }, ...over });
const states = (t: ReturnType<typeof trackingOf>) => t.steps.map((s) => s.state);

describe('trackingOf: where a dispatch order is, for the Farm Supervisor who asked for it', () => {
  it('REQUESTED: nobody has started; the farm manager has it', () => {
    const t = trackingOf(order());
    expect(t).toMatchObject({ stage: 'REQUESTED', holder: 'Farm manager', since: T0, sentBack: null });
    expect(t.label).toBe('Waiting for the farm manager to start loading');
    expect(states(t)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(t.steps[0]).toMatchObject({ label: 'Requested', by: 'Efua Mensah', at: T0 });
  });

  it('PREPARING: the farm manager has started a dispatch report', () => {
    const t = trackingOf(order({ reports: [report()] }));
    expect(t).toMatchObject({ stage: 'PREPARING', holder: 'Farm manager', since: T1, bagsLoaded: 98 });
    expect(states(t)).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(t.steps[1].detail).toBe('98 bags loaded');
  });

  it('IN_REVIEW: the report is with the supervisor to approve', () => {
    const t = trackingOf(order({ reports: [report({ status: 'SUPERVISOR_REVIEW', submittedAt: T2 })] }));
    expect(t).toMatchObject({ stage: 'IN_REVIEW', holder: 'Farm supervisor', since: T2 });
    expect(states(t)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
  });

  it('SENT BACK: a rejected report is back with the farm manager, with the reason', () => {
    const t = trackingOf(order({ reports: [report({ status: 'REJECTED', rejectionReason: 'The weight does not match the bags' })] }));
    expect(t).toMatchObject({ stage: 'PREPARING', holder: 'Farm manager', sentBack: 'The weight does not match the bags' });
    expect(t.label).toBe('Sent back to the farm manager');
  });

  it('ON_THE_WAY: approved, with the driver and vehicle', () => {
    const t = trackingOf(order({ reports: [report({ status: 'IN_TRANSIT', submittedAt: T2, approvedAt: T3, approvedBy: { firstName: 'Efua', lastName: 'Mensah' }, driver: { name: 'Yaw Boateng' }, vehicle: { plateNumber: 'GT-5521-21' }, shipment: { departedAt: T3, expectedBags: 98 } })] }));
    expect(t).toMatchObject({ stage: 'ON_THE_WAY', holder: 'On the road', since: T3, driverName: 'Yaw Boateng', vehiclePlate: 'GT-5521-21' });
    expect(t.label).toBe('On the way to Tamale Warehouse');
    expect(states(t)).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
    expect(t.steps[2]).toMatchObject({ by: 'Efua Mensah', at: T3 });
    expect(t.steps[3].detail).toBe('Driver Yaw Boateng, vehicle GT-5521-21');
  });

  it('ARRIVED: received, with how many bags and any difference against what left', () => {
    const t = trackingOf(order({ reports: [report({ status: 'RECONCILED', approvedAt: T3, shipment: { departedAt: T3, receivedAt: T4, expectedBags: 98, receivedBags: 96, varianceRequiresApproval: true } })] }));
    expect(t).toMatchObject({ stage: 'ARRIVED', holder: null, since: T4, bagsReceived: 96, bagVariance: -2, varianceRequiresApproval: true });
    expect(t.label).toBe('Received at Tamale Warehouse');
    expect(states(t)).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(t.steps[4].detail).toBe('96 bags received (-2 bags against what left)');
  });

  it('a full load shows no difference', () => {
    const t = trackingOf(order({ reports: [report({ status: 'RECONCILED', shipment: { departedAt: T3, receivedAt: T4, expectedBags: 98, receivedBags: 98 } })] }));
    expect(t.bagVariance).toBe(0);
    expect(t.steps[4].detail).toBe('98 bags received');
  });

  it('CANCELLED', () => {
    const t = trackingOf(order({ status: 'CANCELLED', reports: [report()] }));
    expect(t).toMatchObject({ stage: 'CANCELLED', holder: null, label: 'Cancelled' });
    expect(states(t)).toEqual(['done', 'done', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('follows the LATEST report when a rejected one was redone', () => {
    const t = trackingOf(order({ reports: [report({ status: 'REJECTED', createdAt: T1, rejectionReason: 'x' }), report({ reportNumber: 'DR-2', status: 'SUPERVISOR_REVIEW', createdAt: T2, submittedAt: T3 })] }));
    expect(t.stage).toBe('IN_REVIEW');
    expect(t.sentBack).toBeNull();
  });

  it('ignores a cancelled report: an order whose stale draft was replaced is not shown as preparing', () => {
    const t = trackingOf(order({ reports: [report({ status: 'CANCELLED', createdAt: T3 })] }));
    expect(t.stage).toBe('REQUESTED');
  });

  it('copes with an order that carries no details at all (never throws)', () => {
    expect(() => trackingOf({} as any)).not.toThrow();
    expect(trackingOf({} as any).stage).toBe('REQUESTED');
  });
});
