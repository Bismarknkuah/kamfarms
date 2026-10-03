// The real NotificationsService imports a Prisma-generated enum, which cannot
// be generated in every environment these tests run in. This suite only ever
// uses a hand-built stand-in for it, so the module is replaced outright.
jest.mock('../../notifications/notifications.service', () => ({ NotificationsService: class NotificationsService {} }));

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { SalesOrdersService } from '../sales-orders.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

// The chain under test:
//   Sales Officer submits -> Finance Director approves -> MD/CEO releases to
//   the Warehouse Supervisor -> Warehouse Supervisor delivers.
describe('SalesOrdersService: the sale, from request to delivery', () => {
  const salesOfficer = { id: 'sales-1' } as AuthenticatedUser;
  const financeDirector = { id: 'fd-1' } as AuthenticatedUser;
  const md = { id: 'md-1' } as AuthenticatedUser;
  const supervisor = { id: 'ws-1' } as AuthenticatedUser;

  const baseOrder = {
    id: 'so-1',
    orderNumber: 'SO-2026-000001',
    customerId: 'cust-1',
    customer: { name: 'Koforidua Wholesale' },
    salesOfficer: { firstName: 'Nana', lastName: 'Yeboah' },
    preferredWarehouseId: null as string | null,
    allocatedWarehouseId: null as string | null,
    status: 'SUBMITTED',
    submittedById: 'sales-1',
    totalKg: 1250,
    totalAmount: 10500,
    deliveryLocation: 'UG Legon',
    requestedDeliveryDate: null,
    items: [
      { id: 'item-1', productId: 'prod-1', packagingSizeId: 'size-25', bagCount: 50, totalKg: 1250, product: { name: 'Pectra Rice' }, packagingSize: { label: '25KG' } },
    ],
    reservations: [] as unknown[],
  };

  const DEFAULT_ROLE_USERS: Record<string, string[]> = {
    FINANCE_DIRECTOR: ['fd-1'],
    MD: ['md-1'],
    CEO: ['ceo-1'],
    WAREHOUSE_SUPERVISOR: ['ws-1'],
  };

  function build(opts: {
    order?: Partial<typeof baseOrder>;
    balances?: Record<string, number>;
    reservedBags?: number;
    roleUsers?: Record<string, string[]>;
    warehouse?: { id: string; name: string; isActive: boolean } | null;
    notifyRejects?: boolean;
    lostRace?: boolean;
  } = {}) {
    let current: Record<string, unknown> = { ...baseOrder, ...opts.order };
    const roleUsers = opts.roleUsers ?? DEFAULT_ROLE_USERS;
    const balances = opts.balances ?? {};

    const tx = {
      salesOrder: {
        // The guarded stage change: only writes if the order is still in the
        // stage the caller read, exactly as the database would.
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (opts.lostRace || current.status !== where.status) return { count: 0 };
          current = { ...current, ...data };
          return { count: 1 };
        }),
        update: jest.fn(async ({ data }: any) => {
          current = { ...current, ...data };
          return current;
        }),
      },
      stockReservation: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      task: { count: jest.fn().mockResolvedValue(0), create: jest.fn(), updateMany: jest.fn() },
    };
    const prisma = {
      salesOrder: {
        findUnique: jest.fn(async () => current),
        update: jest.fn(async ({ data }: any) => {
          current = { ...current, ...data };
          return current;
        }),
      },
      user: {
        findMany: jest.fn(async ({ where }: any) => {
          const codes: string[] = where.roles.some.role.code.in;
          return Array.from(new Set(codes.flatMap((c) => roleUsers[c] ?? []))).map((id) => ({ id }));
        }),
      },
      warehouse: {
        findUnique: jest.fn(async () => (opts.warehouse === undefined ? { id: 'wh-1', name: 'Warehouse 1', isActive: true } : opts.warehouse)),
        findMany: jest.fn(async () => [
          { id: 'wh-1', name: 'Warehouse 1', code: 'WH1' },
          { id: 'wh-2', name: 'Warehouse 2', code: 'WH2' },
        ]),
      },
      warehouseManager: { findMany: jest.fn().mockResolvedValue([{ userId: 'wm-1' }]) },
      stockReservation: { aggregate: jest.fn().mockResolvedValue({ _sum: { bagCount: opts.reservedBags ?? 0 } }) },
      $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const ledger = {
      recordTransaction: jest.fn(),
      adjustBalance: jest.fn(),
      getBalance: jest.fn(async (_client: unknown, key: { locationId: string }) => ({ bagCount: balances[key.locationId] ?? 100 })),
    } as unknown as InventoryLedgerService;
    const notifications = {
      notify: opts.notifyRejects ? jest.fn().mockRejectedValue(new Error('provider down')) : jest.fn().mockResolvedValue({ count: 1 }),
    };
    const service = new SalesOrdersService(prisma as any, audit, ledger, notifications as unknown as NotificationsService);
    const sent = () => notifications.notify.mock.calls.map(([arg]: any[]) => arg);
    return { service, prisma, tx, ledger, audit, notifications, sent, state: () => current };
  }

  // ───────────────────────── 1. Sales Officer submits ─────────────────────────
  describe('submitting (Sales Officer -> Finance Director)', () => {
    it('sends a review request to every Finance Director, with enough detail to act on', async () => {
      const { service, sent } = build({ order: { status: 'DRAFT' } });
      await service.submit('so-1', salesOfficer);

      expect(sent()).toHaveLength(1);
      expect(sent()[0]).toMatchObject({ userIds: ['fd-1'], type: 'sales_order.awaiting_finance', entityType: 'SalesOrder', entityId: 'so-1' });
      expect(sent()[0].body).toContain('Koforidua Wholesale');
      expect(sent()[0].body).toContain('GHS 10,500');
      expect(sent()[0].body).toContain('Nana Yeboah');
    });

    it('moves the order to SUBMITTED', async () => {
      const { service, state } = build({ order: { status: 'DRAFT' } });
      await service.submit('so-1', salesOfficer);
      expect(state().status).toBe('SUBMITTED');
    });

    it('only the original submitter can submit it', async () => {
      const { service } = build({ order: { status: 'DRAFT' } });
      await expect(service.submit('so-1', { id: 'someone-else' } as AuthenticatedUser)).rejects.toThrow(ForbiddenException);
    });

    it('a failed notification never fails or undoes the submission', async () => {
      const { service, state } = build({ order: { status: 'DRAFT' }, notifyRejects: true });
      await expect(service.submit('so-1', salesOfficer)).resolves.toBeDefined();
      expect(state().status).toBe('SUBMITTED');
    });
  });

  // ───────────────────────── 2. Finance Director decides ─────────────────────────
  describe('approving (Finance Director)', () => {
    it('the officer who submitted the order cannot approve it', async () => {
      const { service } = build();
      await expect(service.approve('so-1', {}, salesOfficer)).rejects.toThrow(ForbiddenException);
    });

    it.each(['DRAFT', 'APPROVED', 'RESERVED', 'FULFILLED', 'REJECTED', 'CANCELLED'])('cannot approve an order that is %s, only one waiting for Finance', async (status) => {
      const { service } = build({ order: { status } });
      await expect(service.approve('so-1', {}, financeDirector)).rejects.toThrow(BadRequestException);
    });

    it('is a purely financial decision: needs no warehouse, reserves no stock, creates no task', async () => {
      const { service, state, tx } = build();
      await service.approve('so-1', {}, financeDirector);

      expect(state().status).toBe('APPROVED');
      expect(state().approvedById).toBe('fd-1');
      expect(tx.stockReservation.create).not.toHaveBeenCalled();
      expect(tx.task.create).not.toHaveBeenCalled();
    });

    it('hands the order on to the Managing Director and CEO, passing along the Finance Director\'s remark', async () => {
      const { service, sent } = build();
      await service.approve('so-1', { note: '50% deposit received' }, financeDirector);

      const toExecutives = sent().find((n) => n.type === 'sales_order.awaiting_release');
      expect(toExecutives.userIds.sort()).toEqual(['ceo-1', 'md-1']);
      expect(toExecutives.body).toContain('50% deposit received');
      expect(toExecutives.body).toContain('release');
    });

    it('tells the Sales Officer it has been approved and where it is now', async () => {
      const { service, sent } = build();
      await service.approve('so-1', {}, financeDirector);
      expect(sent().find((n) => n.type === 'sales_order.approved')).toMatchObject({ userIds: ['sales-1'] });
    });

    it('never notifies the person who just acted', async () => {
      const { service, sent } = build({ roleUsers: { ...DEFAULT_ROLE_USERS, MD: ['md-1', 'fd-1'] } });
      await service.approve('so-1', {}, financeDirector);
      expect(sent().flatMap((n) => n.userIds)).not.toContain('fd-1');
    });

    it('if two people approve at the same moment, the second is told someone else got there first', async () => {
      const { service } = build({ lostRace: true });
      await expect(service.approve('so-1', {}, financeDirector)).rejects.toThrow(ConflictException);
    });

    it('records the decision in the audit trail', async () => {
      const { service, audit } = build();
      await service.approve('so-1', { note: 'ok' }, financeDirector);
      expect((audit.record as jest.Mock).mock.calls[0][0]).toMatchObject({ userId: 'fd-1', action: 'sales_order.approve', entityId: 'so-1' });
    });
  });

  describe('rejecting (Finance Director)', () => {
    it('sends the order back with the reason, and tells the Sales Officer exactly why', async () => {
      const { service, state, sent } = build();
      await service.reject('so-1', { reason: 'Customer is over their credit limit' }, financeDirector);

      expect(state().status).toBe('REJECTED');
      expect(sent()[0]).toMatchObject({ userIds: ['sales-1'], type: 'sales_order.rejected' });
      expect(sent()[0].body).toContain('over their credit limit');
    });

    it('can only reject an order that is actually waiting for Finance', async () => {
      const { service } = build({ order: { status: 'APPROVED' } });
      await expect(service.reject('so-1', { reason: 'too late' }, financeDirector)).rejects.toThrow(BadRequestException);
    });
  });

  // ───────────────────────── 3. MD / CEO release ─────────────────────────
  describe('releasing for delivery (Managing Director / CEO)', () => {
    const approved = { status: 'APPROVED', approvedById: 'fd-1' };

    it('an order still with Finance cannot be released, and says why', async () => {
      const { service } = build({ order: { status: 'SUBMITTED' } });
      await expect(service.release('so-1', { allocatedWarehouseId: 'wh-1' }, md)).rejects.toThrow(/waiting for the Finance Director/);
    });

    it.each(['DRAFT', 'RESERVED', 'FULFILLED', 'REJECTED', 'CANCELLED'])('cannot release an order that is %s', async (status) => {
      const { service } = build({ order: { status } });
      await expect(service.release('so-1', { allocatedWarehouseId: 'wh-1' }, md)).rejects.toThrow(BadRequestException);
    });

    it('a warehouse must be chosen when the order has no preferred one', async () => {
      const { service } = build({ order: approved });
      await expect(service.release('so-1', {}, md)).rejects.toThrow(/Choose the warehouse/);
    });

    it('falls back to the order\'s preferred warehouse when none is chosen', async () => {
      const { service, state } = build({ order: { ...approved, preferredWarehouseId: 'wh-1' } });
      await service.release('so-1', {}, md);
      expect(state().allocatedWarehouseId).toBe('wh-1');
    });

    it.each([['does not exist', null], ['is inactive', { id: 'wh-1', name: 'Old', isActive: false }]])('rejects a warehouse that %s', async (_l, warehouse) => {
      const { service } = build({ order: approved, warehouse: warehouse as any });
      await expect(service.release('so-1', { allocatedWarehouseId: 'wh-1' }, md)).rejects.toThrow(/not found or is not active/);
    });

    it('rejects release when the warehouse cannot cover the order (stock minus what other orders already hold)', async () => {
      // 100 in the warehouse, 60 already reserved elsewhere -> 40 available; the order wants 50.
      const { service } = build({ order: approved, balances: { 'wh-1': 100 }, reservedBags: 60 });
      await expect(service.release('so-1', { allocatedWarehouseId: 'wh-1' }, md)).rejects.toMatchObject({
        response: { errorCode: 'INSUFFICIENT_STOCK', message: expect.stringContaining('only 40 available') },
      });
    });

    it('never lets two orders reserve the same stock: a second order sees the first one\'s reservation', async () => {
      const { service } = build({ order: approved, balances: { 'wh-1': 100 }, reservedBags: 80 });
      await expect(service.release('so-1', { allocatedWarehouseId: 'wh-1' }, md)).rejects.toThrow(BadRequestException);
    });

    it('reserves the stock, tasks the Warehouse Supervisor, and moves the order to RESERVED', async () => {
      const { service, state, tx } = build({ order: approved });
      const result = await service.release('so-1', { allocatedWarehouseId: 'wh-1', note: 'Deliver before noon' }, md);

      expect(result.status).toBe('RESERVED');
      expect(state().allocatedWarehouseId).toBe('wh-1');
      expect(tx.stockReservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ salesOrderId: 'so-1', warehouseId: 'wh-1', productId: 'prod-1', packagingSizeId: 'size-25', bagCount: 50, status: 'ACTIVE' }),
      });
      const task = tx.task.create.mock.calls[0][0].data;
      expect(task).toMatchObject({ assignedRoleCode: 'WAREHOUSE_SUPERVISOR', salesOrderId: 'so-1', warehouseId: 'wh-1', createdById: 'md-1' });
      expect(task.title).toBe('Deliver order SO-2026-000001');
      expect(task.description).toContain('Instruction: Deliver before noon');
      expect(task.description).toContain('UG Legon');
    });

    it('tells the Warehouse Supervisor, that warehouse\'s own managers, and the Sales Officer', async () => {
      const { service, sent } = build({ order: approved });
      await service.release('so-1', { allocatedWarehouseId: 'wh-1' }, md);

      expect(sent().find((n) => n.type === 'sales_order.delivery_assigned')).toMatchObject({ userIds: ['ws-1'] });
      expect(sent().find((n) => n.type === 'sales_order.delivery_from_your_warehouse')).toMatchObject({ userIds: ['wm-1'] });
      expect(sent().find((n) => n.type === 'sales_order.released')).toMatchObject({ userIds: ['sales-1'] });
    });

    it('if two people release at the same moment, nothing is reserved twice', async () => {
      const { service, tx } = build({ order: approved, lostRace: true });
      await expect(service.release('so-1', { allocatedWarehouseId: 'wh-1' }, md)).rejects.toThrow(ConflictException);
      expect(tx.stockReservation.create).not.toHaveBeenCalled();
      expect(tx.task.create).not.toHaveBeenCalled();
    });

    it('records who released it, and where from, in the audit trail', async () => {
      const { service, audit } = build({ order: approved });
      await service.release('so-1', { allocatedWarehouseId: 'wh-1' }, md);
      expect((audit.record as jest.Mock).mock.calls[0][0]).toMatchObject({ userId: 'md-1', action: 'sales_order.release', afterValue: expect.objectContaining({ warehouseId: 'wh-1' }) });
    });
  });

  describe('which warehouse can deliver it (availability)', () => {
    it('shows, per warehouse, whether the whole order can be covered, with the ones that can first', async () => {
      const { service } = build({ order: { status: 'APPROVED' }, balances: { 'wh-1': 10, 'wh-2': 100 } });
      const result = await service.availability('so-1');

      expect(result.warehouses.map((w) => w.warehouseId)).toEqual(['wh-2', 'wh-1']);
      expect(result.warehouses[0]).toMatchObject({ canFulfillAll: true });
      expect(result.warehouses[1]).toMatchObject({ canFulfillAll: false, lines: [expect.objectContaining({ availableBags: 10, requestedBags: 50, enough: false })] });
    });

    it('counts stock already reserved by other orders as unavailable, and never reports a negative figure', async () => {
      const { service } = build({ order: { status: 'APPROVED' }, balances: { 'wh-1': 30, 'wh-2': 30 }, reservedBags: 45 });
      const result = await service.availability('so-1');
      expect(result.warehouses.every((w) => w.lines[0].availableBags === 0)).toBe(true);
    });
  });

  // ───────────────────────── 4. Warehouse Supervisor delivers ─────────────────────────
  describe('delivering (Warehouse Supervisor)', () => {
    const released = {
      status: 'RESERVED',
      allocatedWarehouseId: 'wh-1',
      reservations: [{ id: 'res-1', status: 'ACTIVE', productId: 'prod-1', packagingSizeId: 'size-25', bagCount: 50, totalKg: 1250 }],
    };

    it('an approved order cannot be delivered until the MD has released it', async () => {
      const { service } = build({ order: { status: 'APPROVED' } });
      await expect(service.fulfill('so-1', supervisor)).rejects.toThrow(/not been released for delivery/);
    });

    it('an order still with Finance cannot be delivered either', async () => {
      const { service } = build({ order: { status: 'SUBMITTED' } });
      await expect(service.fulfill('so-1', supervisor)).rejects.toThrow(BadRequestException);
    });

    it('moves stock from the warehouse to a CUSTOMER-location balance and consumes the reservation', async () => {
      const { service, ledger, tx } = build({ order: released });
      const result = await service.fulfill('so-1', supervisor);

      expect(result.status).toBe('FULFILLED');
      expect(ledger.recordTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'PACKAGED_RICE_SOLD', sourceLocationId: 'wh-1', destLocationType: 'CUSTOMER', destLocationId: 'cust-1' }),
      );
      expect(ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ locationType: 'WAREHOUSE', locationId: 'wh-1' }), -1250, -50);
      expect(ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ locationType: 'CUSTOMER', locationId: 'cust-1' }), 1250, 50);
      expect(tx.stockReservation.update).toHaveBeenCalledWith({ where: { id: 'res-1' }, data: { status: 'CONSUMED' } });
    });

    it('closes the delivery task, so it leaves the Warehouse Supervisor\'s list', async () => {
      const { service, tx } = build({ order: released });
      await service.fulfill('so-1', supervisor);
      expect(tx.task.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ salesOrderId: 'so-1' }),
        data: expect.objectContaining({ status: 'COMPLETED', completedById: 'ws-1' }),
      });
    });

    it('tells the Sales Officer, the Finance Director (to invoice it) and the MD and CEO that it is done', async () => {
      const { service, sent } = build({ order: released });
      await service.fulfill('so-1', supervisor);
      const delivered = sent().find((n) => n.type === 'sales_order.delivered');
      expect(delivered.userIds.sort()).toEqual(['ceo-1', 'fd-1', 'md-1', 'sales-1']);
    });
  });

  // ───────────────────────── cancelling mid-chain ─────────────────────────
  describe('cancelling (Sales Officer)', () => {
    it('an order waiting for the MD can be cancelled; its task is closed and the MD is told', async () => {
      const { service, state, tx, sent } = build({ order: { status: 'APPROVED' } });
      await service.cancel('so-1', salesOfficer);

      expect(state().status).toBe('CANCELLED');
      expect(tx.task.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ salesOrderId: 'so-1' }), data: { status: 'CANCELLED' } });
      expect(sent().find((n) => n.type === 'sales_order.cancelled').userIds.sort()).toEqual(['ceo-1', 'md-1']);
    });

    it('cancelling an order already released for delivery frees the reserved stock and tells the Warehouse Supervisor', async () => {
      const { service, tx, sent } = build({ order: { status: 'RESERVED', allocatedWarehouseId: 'wh-1' } });
      await service.cancel('so-1', salesOfficer);
      expect(tx.stockReservation.updateMany).toHaveBeenCalledWith({
        where: { salesOrderId: 'so-1', status: 'ACTIVE' },
        data: expect.objectContaining({ status: 'RELEASED' }),
      });
      expect(sent().find((n) => n.type === 'sales_order.cancelled').userIds).toEqual(['ws-1']);
    });

    it('a submitted order, when cancelled, tells the Finance Director to stop reviewing it', async () => {
      const { service, sent } = build({ order: { status: 'SUBMITTED' } });
      await service.cancel('so-1', salesOfficer);
      expect(sent().find((n) => n.type === 'sales_order.cancelled').userIds).toEqual(['fd-1']);
    });

    it.each(['FULFILLED', 'REJECTED', 'CANCELLED'])('a %s order cannot be cancelled', async (status) => {
      const { service } = build({ order: { status } });
      await expect(service.cancel('so-1', salesOfficer)).rejects.toThrow(BadRequestException);
    });
  });

  // ───────────────────────── the whole journey ─────────────────────────
  it('runs the complete chain in order, each person acting on what the previous one handed over', async () => {
    const { service, state, sent } = build({ order: { status: 'DRAFT' } });

    await service.submit('so-1', salesOfficer);
    expect(state().status).toBe('SUBMITTED');

    await service.approve('so-1', {}, financeDirector);
    expect(state().status).toBe('APPROVED');

    await service.release('so-1', { allocatedWarehouseId: 'wh-1' }, md);
    expect(state().status).toBe('RESERVED');

    // The delivery is only possible now that the whole chain has been walked.
    (state() as any).reservations = [{ id: 'res-1', status: 'ACTIVE', productId: 'prod-1', packagingSizeId: 'size-25', bagCount: 50, totalKg: 1250 }];
    await service.fulfill('so-1', supervisor);
    expect(state().status).toBe('FULFILLED');

    // The hand-offs happened in the right order, to the right people.
    expect(sent().map((n) => n.type)).toEqual([
      'sales_order.awaiting_finance',
      'sales_order.awaiting_release',
      'sales_order.approved',
      'sales_order.delivery_assigned',
      'sales_order.delivery_from_your_warehouse',
      'sales_order.released',
      'sales_order.delivered',
    ]);
  });

  it('no one can skip a stage: delivering straight after approval, or approving straight from draft, both fail', async () => {
    const a = build({ order: { status: 'APPROVED' } });
    await expect(a.service.fulfill('so-1', supervisor)).rejects.toThrow(BadRequestException);
    const b = build({ order: { status: 'DRAFT' } });
    await expect(b.service.approve('so-1', {}, financeDirector)).rejects.toThrow(BadRequestException);
  });
});
