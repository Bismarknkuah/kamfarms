import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReceiptReviewsService } from '../receipt-reviews.service';

const at = (id: string): { scopeType: string; scopeId: string | null }[] => [{ scopeType: 'WAREHOUSE', scopeId: id }];
const actor = (id: string, role: string, scopes = at('wh-1')) => ({ id, roles: [{ roleId: 'r', roleCode: role, permissions: [], scopes }], permissionCodes: new Set(['receipt.review']) }) as any;
const line = (n: number, shipmentId = 'sh-1') => ({ shipmentId, paddyGradeId: 'g4', gradeLabel: 'Size 4', sentBags: 100, receivedBags: 98, damagedBags: n, damagedKg: n * 50 });
const wm = actor('wm-1', 'WAREHOUSE_MANAGER');

function build(rows: any[] = []) {
  const store = [...rows];
  const rr = {
    findFirst: jest.fn(async ({ where }: any) => store.find((r) => r.truckRef === where.truckRef && r.status === where.status) ?? null),
    count: jest.fn(async () => store.length),
    create: jest.fn(async ({ data }: any) => { const r = { id: `rv-${store.length + 1}`, status: 'PENDING', ...data }; store.push(r); return r; }),
    update: jest.fn(async ({ where, data }: any) => { const r = store.find((x) => x.id === where.id); Object.assign(r, data); return r; }),
  };
  const prisma: any = {
    receiptReview: { ...rr, findUnique: jest.fn(async ({ where }: any) => store.find((r) => r.id === where.id) ?? null) },
    $transaction: jest.fn(async (cb: any) => cb({ receiptReview: rr })),
    user: { findMany: jest.fn(async () => [{ id: 'farm-mgr' }]) },
  };
  const ledger = { adjustBalance: jest.fn(), recordTransaction: jest.fn() }; const audit = { record: jest.fn() }; const notifications = { notify: jest.fn() };
  return { service: new ReceiptReviewsService(prisma, audit as any, ledger as any, notifications as any), rr, prisma, ledger, audit, notifications, store };
}
const pending = (over: any = {}) => ({ id: 'rv-1', reviewNumber: 'RV-2026-000001', truckRef: 'DS-1', warehouseId: 'wh-1', farmId: 'farm-a', status: 'PENDING', damagedBags: 15, note: 'Wet and torn', lines: [line(15)], submittedById: 'wm-1', ...over });

describe('damaged bags: opening the review', () => {
  it('the first damaged size of a truck opens one numbered review, with the manager\'s comment', async () => {
    const h = build(); const { row, created } = await h.service.record(h.prisma.$transaction.mock ? { receiptReview: h.rr } : null, { truckRef: 'DS-1', warehouseId: 'wh-1', farmId: 'farm-a', line: line(15), note: 'Wet and torn', actor: wm });
    expect(created).toBe(true); expect(row).toMatchObject({ reviewNumber: expect.stringMatching(/^RV-\d{4}-000001$/), truckRef: 'DS-1', damagedBags: 15, note: 'Wet and torn', submittedById: 'wm-1', status: 'PENDING' });
  });
  it('the next size from the SAME truck joins that review instead of opening a second one', async () => {
    const h = build(); const tx = { receiptReview: h.rr };
    await h.service.record(tx, { truckRef: 'DS-1', warehouseId: 'wh-1', farmId: 'farm-a', line: line(15, 'sh-1'), note: 'Wet and torn', actor: wm });
    const again = await h.service.record(tx, { truckRef: 'DS-1', warehouseId: 'wh-1', farmId: 'farm-a', line: line(4, 'sh-2'), note: 'Wet and torn', actor: wm });
    expect(again.created).toBe(false); expect(h.store).toHaveLength(1); expect(h.store[0].damagedBags).toBe(19); expect(h.store[0].lines).toHaveLength(2); expect(h.store[0].note).toBe('Wet and torn');
  });
  it('a different truck gets its own review', async () => {
    const h = build(); const tx = { receiptReview: h.rr };
    await h.service.record(tx, { truckRef: 'DS-1', warehouseId: 'wh-1', farmId: null, line: line(1), note: 'torn', actor: wm });
    await h.service.record(tx, { truckRef: 'DS-2', warehouseId: 'wh-1', farmId: null, line: line(2), note: 'torn', actor: wm });
    expect(h.store).toHaveLength(2);
  });
  it('tells the Warehouse Supervisors of that warehouse, linking to the truck', async () => {
    const h = build(); h.prisma.user.findMany.mockResolvedValue([{ id: 'ws-1' }, { id: 'ws-2' }]);
    await h.service.announce(pending(), wm);
    expect(h.notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['ws-1', 'ws-2'], entityType: 'DispatchReceipt', entityId: 'DS-1', type: 'receipt.review' }));
  });
});

describe('damaged bags: the Warehouse Supervisor decides', () => {
  const ws = actor('ws-1', 'WAREHOUSE_SUPERVISOR');
  it('approving writes the held bags off as a loss, and says who decided and why', async () => {
    const h = build([pending()]); const r = await h.service.approve('rv-1', 'Confirmed on site', ws);
    expect(r).toEqual({ id: 'rv-1', status: 'APPROVED' });
    expect(h.ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), { locationType: 'EXTERNAL', locationId: 'hold:sh-1', paddyGradeId: 'g4' }, -750, -15);   // the hold is emptied
    expect(h.ledger.recordTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'STOCK_LOSS', quantityKg: 750, bagCount: 15, referenceDocument: 'RV-2026-000001', userId: 'ws-1', approvalStatus: 'APPROVED' }));
    expect(h.ledger.adjustBalance).toHaveBeenCalledTimes(1);                                                                                                               // nothing returned to the warehouse
    expect(h.store[0]).toMatchObject({ status: 'APPROVED', decidedById: 'ws-1', decisionNote: 'Confirmed on site' });
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'receipt.review.approve', entityId: 'rv-1' }), expect.anything());
  });
  it('refusing needs a reason, and puts the held bags back into the warehouse stock', async () => {
    const h = build([pending()]);
    await expect(h.service.reject('rv-1', '  ', ws)).rejects.toThrow(BadRequestException); expect(h.ledger.adjustBalance).not.toHaveBeenCalled();
    await h.service.reject('rv-1', 'They are fine, the bags are only dusty', ws);
    expect(h.ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), { locationType: 'EXTERNAL', locationId: 'hold:sh-1', paddyGradeId: 'g4' }, -750, -15);
    expect(h.ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), { locationType: 'WAREHOUSE', locationId: 'wh-1', paddyGradeId: 'g4' }, 750, 15);
    expect(h.ledger.recordTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'STOCK_ADJUSTMENT', destLocationType: 'WAREHOUSE', quantityKg: 750, bagCount: 15 }));
    expect(h.store[0]).toMatchObject({ status: 'REJECTED', decisionNote: 'They are fine, the bags are only dusty' });
  });
  it('every size of the truck is settled together', async () => {
    const h = build([pending({ damagedBags: 19, lines: [line(15, 'sh-1'), line(4, 'sh-2')] })]); await h.service.approve('rv-1', undefined, ws);
    expect(h.ledger.recordTransaction).toHaveBeenCalledTimes(2); expect(h.ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ locationId: 'hold:sh-2' }), -200, -4);
  });
  it('tells the manager who reported it, and the farm side, what was decided', async () => {
    const h = build([pending()]); await h.service.reject('rv-1', 'Looks fine to me', ws);
    expect(h.notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userIds: expect.arrayContaining(['wm-1', 'farm-mgr']), entityId: 'DS-1', title: expect.stringContaining('refused') }));
  });
  it('only the Warehouse Supervisor of THAT warehouse decides: not the manager, not another warehouse\'s supervisor', async () => {
    for (const who of [actor('wm-2', 'WAREHOUSE_MANAGER'), actor('ws-9', 'WAREHOUSE_SUPERVISOR', at('wh-2')), actor('md', 'MD')]) {
      const h = build([pending()]); await expect(h.service.approve('rv-1', 'ok', who)).rejects.toThrow(ForbiddenException);
      expect(h.ledger.adjustBalance).not.toHaveBeenCalled(); expect(h.store[0].status).toBe('PENDING');
    }
  });
  it('nobody decides on their own report, and a decision is made once', async () => {
    const h = build([pending({ submittedById: 'ws-1' })]); await expect(h.service.approve('rv-1', 'ok', ws)).rejects.toThrow(/yourself/);
    const done = build([pending({ status: 'APPROVED' })]); await expect(done.service.approve('rv-1', 'ok', ws)).rejects.toThrow(/already approved/);
    await expect(build().service.approve('missing', 'ok', ws)).rejects.toThrow(/not found/);
  });
});
