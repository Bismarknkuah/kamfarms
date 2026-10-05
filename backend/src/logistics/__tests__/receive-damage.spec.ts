import { BadRequestException } from '@nestjs/common';
import { ShipmentsService } from '../shipments.service';
import { ReceiptReviewsService } from '../receipt-reviews.service';

const wm = { id: 'wm-1', roles: [{ roleCode: 'WAREHOUSE_MANAGER', scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }] } as any;
const shipment = { id: 'sh-1', shipmentNumber: 'SH-2026-000001', deliveryReportId: 'dr-1', farmId: 'farm-a', warehouseId: 'wh-1', paddyGradeId: 'g4', expectedKg: 20000, expectedBags: 400, receivedAt: null, farm: {}, warehouse: {}, paddyGrade: {}, deliveryReport: { vehicle: null, driver: null }, events: [] };

function build() {
  const reviews: any[] = [];
  const rr = {
    findFirst: jest.fn(async ({ where }: any) => reviews.find((r) => r.truckRef === where.truckRef && r.status === 'PENDING') ?? null), count: jest.fn(async () => reviews.length),
    create: jest.fn(async ({ data }: any) => { const r = { id: `rv-${reviews.length + 1}`, status: 'PENDING', ...data }; reviews.push(r); return r; }),
    update: jest.fn(async ({ where, data }: any) => Object.assign(reviews.find((x) => x.id === where.id), data)),
  };
  const prisma: any = {
    shipment: { findUnique: jest.fn().mockResolvedValue(shipment) },
    deliveryReport: { findUnique: jest.fn().mockResolvedValue({ dispatchRef: 'DS-1', reportNumber: 'DR-1', farmId: 'farm-a' }) },
    $transaction: jest.fn((cb: any) => cb({ shipment: { update: jest.fn().mockResolvedValue({ ...shipment, receivedAt: new Date() }) }, deliveryReport: { update: jest.fn() }, shipmentEvent: { create: jest.fn() }, paddyGrade: { findUnique: jest.fn().mockResolvedValue({ label: 'Size 4' }) }, receiptReview: rr })),
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'ws-1' }]) },
  };
  const ledger = { recordTransaction: jest.fn(), adjustBalance: jest.fn() }; const audit = { record: jest.fn() }; const notifications = { notify: jest.fn() };
  const rv = new ReceiptReviewsService(prisma, audit as any, ledger as any, notifications as any);
  return { service: new ShipmentsService(prisma, audit as any, ledger as any, undefined, notifications as any, rv), ledger, notifications, reviews, prisma };
}
const types = (l: any) => l.recordTransaction.mock.calls.map((c: any[]) => c[1].type);

describe('counting a truck in with spoiled or broken bags', () => {
  it('only the good bags go into the warehouse stock; the damaged ones are held out of it', async () => {
    const h = build(); await h.service.receive('sh-1', { receivedBags: 390, damagedBags: 15, damageNote: 'Wet and torn' }, wm);   // 390 bags at 50 kg
    expect(h.ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), { locationType: 'WAREHOUSE', locationId: 'wh-1', paddyGradeId: 'g4' }, 18750, 375);
    expect(h.ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), { locationType: 'EXTERNAL', locationId: 'hold:sh-1', paddyGradeId: 'g4' }, 750, 15);
    expect(h.ledger.recordTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'PADDY_RECEIVED_AT_WAREHOUSE', quantityKg: 18750, bagCount: 375 }));
    expect(h.ledger.recordTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'STOCK_ADJUSTMENT', destLocationId: 'hold:sh-1', bagCount: 15, approvalStatus: 'PENDING' }));
  });
  it('a review is opened for the Warehouse Supervisor, who is told, and the truck is still counted in', async () => {
    const h = build(); const fresh = await h.service.receive('sh-1', { receivedBags: 390, damagedBags: 15, damageNote: 'Wet and torn' }, wm);
    expect(fresh).toBeTruthy(); expect(h.reviews).toHaveLength(1);
    expect(h.reviews[0]).toMatchObject({ truckRef: 'DS-1', warehouseId: 'wh-1', farmId: 'farm-a', damagedBags: 15, note: 'Wet and torn', submittedById: 'wm-1' });
    expect(h.reviews[0].lines[0]).toMatchObject({ gradeLabel: 'Size 4', sentBags: 400, receivedBags: 390, damagedBags: 15, damagedKg: 750 });
    expect(h.notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['ws-1'], entityType: 'DispatchReceipt', entityId: 'DS-1' }));
  });
  it('with no damage nothing changes: every counted bag is credited, no hold, no review', async () => {
    const h = build(); await h.service.receive('sh-1', { receivedBags: 390 }, wm);
    expect(h.ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), { locationType: 'WAREHOUSE', locationId: 'wh-1', paddyGradeId: 'g4' }, 19500, 390);
    expect(h.ledger.adjustBalance.mock.calls.some((c: any[]) => String(c[1].locationId).startsWith('hold:'))).toBe(false); expect(h.reviews).toHaveLength(0);
  });
  it('when every bag that arrived is damaged, nothing is credited to the warehouse at all', async () => {
    const h = build(); await h.service.receive('sh-1', { receivedBags: 10, damagedBags: 10, damageNote: 'All soaked' }, wm);
    expect(types(h.ledger)).not.toContain('PADDY_RECEIVED_AT_WAREHOUSE'); expect(h.ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ locationId: 'hold:sh-1' }), 500, 10);
  });
  it('refuses more damaged than arrived, a missing comment, or a fraction, before any stock moves', async () => {
    for (const dto of [{ receivedBags: 10, damagedBags: 11, damageNote: 'x wet' }, { receivedBags: 10, damagedBags: 2 }, { receivedBags: 10, damagedBags: 2, damageNote: ' ' }, { receivedBags: 10, damagedBags: 1.5, damageNote: 'torn bags' }]) {
      const h = build(); await expect(h.service.receive('sh-1', dto as any, wm)).rejects.toThrow(BadRequestException); expect(h.ledger.adjustBalance).not.toHaveBeenCalled(); expect(h.ledger.recordTransaction).not.toHaveBeenCalled();
    }
  });
  it('a whole truck counted in at once puts every damaged size into ONE review', async () => {
    const h = build(); h.prisma.shipment.findMany = jest.fn().mockResolvedValue([shipment]);
    await h.service.receiveDispatch('DS-1', { lines: [{ paddyGradeId: 'g4', receivedBags: 390, damagedBags: 15 }], damageNote: 'Wet and torn' } as any, wm);
    expect(h.reviews).toHaveLength(1); expect(h.reviews[0].damagedBags).toBe(15);
    await expect(build().service.receiveDispatch('DS-1', { lines: [{ paddyGradeId: 'g4', receivedBags: 390, damagedBags: 15 }] } as any, wm)).rejects.toThrow();
  });
});
