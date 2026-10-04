// The real NotificationsService imports a Prisma-generated enum, which cannot be generated in every environment these tests run
// in. This suite only ever uses a hand-built stand-in for it, so the module is replaced outright.
jest.mock('../../notifications/notifications.service', () => ({ NotificationsService: class NotificationsService {} }));

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SalesOrdersService } from '../sales-orders.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const GLOBAL = [{ scopeType: 'GLOBAL', scopeId: null }];
const person = (id: string, first: string, role: string, perms: string[], scopes: unknown[] = GLOBAL) =>
  ({ id, email: `${id}@kam.local`, firstName: first, lastName: 'Test', status: 'ACTIVE', mustChangePassword: false, permissionCodes: new Set(perms), roles: [{ roleId: role, roleCode: role, permissions: perms, scopes }] }) as unknown as AuthenticatedUser;

// The chain under test, one accountable person per step:
//   Sales Officer -> Finance Director -> Managing Director -> Warehouse Supervisor assigns a warehouse ->
//   that warehouse processes it -> it is moved "on track" -> delivered.
describe('SalesOrdersService: the sale, from request to delivery', () => {
  const salesOfficer = person('sales-1', 'Nana', 'SALES_OFFICER', ['sales.create']);
  const otherOfficer = person('sales-2', 'Akosua', 'SALES_OFFICER', ['sales.create']);
  const financeDirector = person('fd-1', 'Kwesi', 'FINANCE_DIRECTOR', ['sales.approve', 'sales.view']);
  const md = person('md-1', 'Kwame', 'MD', ['sales.release', 'sales.view']);
  const supervisor = person('ws-1', 'Efua', 'WAREHOUSE_SUPERVISOR', ['sales.assign', 'sales.fulfill']);
  const manager1 = person('wm-1', 'Kwabena', 'WAREHOUSE_MANAGER', ['sales.fulfill'], [{ scopeType: 'WAREHOUSE', scopeId: 'wh-1' }]);
  const manager2 = person('wm-2', 'Abena', 'WAREHOUSE_MANAGER', ['sales.fulfill'], [{ scopeType: 'WAREHOUSE', scopeId: 'wh-2' }]);

  const baseOrder = {
    id: 'so-1', orderNumber: 'SO-2026-000001', customerId: 'cust-1', customer: { name: 'Koforidua Wholesale' },
    salesOfficerId: 'sales-1', salesOfficer: { firstName: 'Nana', lastName: 'Yeboah' }, submittedById: 'sales-1',
    preferredWarehouseId: null as string | null, allocatedWarehouseId: null as string | null, allocatedWarehouse: null as { name: string } | null,
    status: 'SUBMITTED', totalKg: 1250, totalAmount: 10500, deliveryLocation: 'UG Legon', requestedDeliveryDate: null,
    items: [{ id: 'item-1', productId: 'prod-1', packagingSizeId: 'size-25', bagCount: 50, totalKg: 1250, product: { name: 'Pectra Rice' }, packagingSize: { label: '25KG' } }],
    reservations: [] as unknown[],
  };
  const approved = { status: 'APPROVED' };
  const released = { status: 'RELEASED' };
  const reservation = { id: 'res-1', status: 'ACTIVE', productId: 'prod-1', packagingSizeId: 'size-25', bagCount: 50, totalKg: 1250 };
  const assigned = { status: 'RESERVED', allocatedWarehouseId: 'wh-1', allocatedWarehouse: { name: 'Warehouse wh-1' }, reservations: [reservation] };
  const processing = { ...assigned, status: 'PROCESSING' };
  const onTrack = { ...assigned, status: 'ON_TRACK' };

  const ROLE_USERS: Record<string, string[]> = { FINANCE_DIRECTOR: ['fd-1'], MD: ['md-1'], CEO: ['ceo-1'], WAREHOUSE_SUPERVISOR: ['ws-1'], WAREHOUSE_MANAGER: ['wm-1', 'wm-2'] };

  function build(opts: { order?: Record<string, unknown>; balances?: Record<string, number>; reservedBags?: number; warehouse?: { id: string; name: string; isActive: boolean } | null; notifyRejects?: boolean; lostRace?: boolean; receiptCount?: number } = {}) {
    let current: Record<string, unknown> = { ...baseOrder, ...opts.order };
    const balances = opts.balances ?? {};
    const tx = {
      salesOrder: {
        // The guarded stage change: only writes if the order is still in the stage the caller read, as the database would.
        updateMany: jest.fn(async ({ where, data }: any) => { if (opts.lostRace || current.status !== where.status) return { count: 0 }; current = { ...current, ...data }; return { count: 1 }; }),
        update: jest.fn(async ({ data }: any) => { current = { ...current, ...data }; return current; }),
      },
      stockReservation: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      task: { count: jest.fn().mockResolvedValue(0), create: jest.fn(), updateMany: jest.fn() },
      salesOrderEvent: { create: jest.fn() },
    };
    const prisma = {
      salesOrder: { findUnique: jest.fn(async () => current), findMany: jest.fn(async (_args?: any) => [] as unknown[]), update: jest.fn(async ({ data }: any) => { current = { ...current, ...data }; return current; }) },
      user: { findMany: jest.fn(async ({ where }: any) => Array.from(new Set((where.roles.some.role.code.in as string[]).flatMap((c) => ROLE_USERS[c] ?? []))).map((id) => ({ id }))) },
      warehouse: { findUnique: jest.fn(async ({ where }: any) => (opts.warehouse === undefined ? { id: where.id, name: `Warehouse ${where.id}`, isActive: true } : opts.warehouse)) },
      warehouseManager: { findMany: jest.fn(async ({ where }: any) => (where.warehouseId === 'wh-2' ? [{ userId: 'wm-2' }] : [{ userId: 'wm-1' }])) },
      stockReservation: { aggregate: jest.fn().mockResolvedValue({ _sum: { bagCount: opts.reservedBags ?? 0 } }) },
      salesReceipt: { count: jest.fn().mockResolvedValue(opts.receiptCount ?? 0), create: jest.fn().mockResolvedValue({ id: 'rc-1' }), findFirst: jest.fn(), delete: jest.fn() },
      salesOrderEvent: { create: jest.fn() },
      $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const ledger = { recordTransaction: jest.fn(), adjustBalance: jest.fn(), getBalance: jest.fn(async (_c: unknown, key: { locationId: string }) => ({ bagCount: balances[key.locationId] ?? 100 })) } as unknown as InventoryLedgerService;
    const notifications = { notify: opts.notifyRejects ? jest.fn().mockRejectedValue(new Error('provider down')) : jest.fn().mockResolvedValue({ count: 1 }) };
    const service = new SalesOrdersService(prisma as any, audit, ledger, notifications as unknown as NotificationsService);
    const sent = () => notifications.notify.mock.calls.map(([arg]: any[]) => arg);
    const toWhom = (type: string) => (sent().find((n: any) => n.type === type)?.userIds ?? []) as string[];
    const trail = () => [...tx.salesOrderEvent.create.mock.calls, ...prisma.salesOrderEvent.create.mock.calls].map(([a]: any[]) => a.data);
    return { service, prisma, tx, ledger, audit, notifications, sent, toWhom, trail, state: () => current };
  }

  // ───────────────────────── 1. Sales Officer submits ─────────────────────────
  describe('submitting (Sales Officer -> Finance Director)', () => {
    it('moves the order to SUBMITTED, writes it to the trail, and asks every Finance Director to review it with enough detail to act on', async () => {
      const { service, state, sent, trail } = build({ order: { status: 'DRAFT' } });
      await service.submit('so-1', salesOfficer);
      expect(state().status).toBe('SUBMITTED');
      expect(trail()).toEqual([expect.objectContaining({ type: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED', actorId: 'sales-1', actorName: 'Nana Test', actorRole: 'Sales Officer' })]);
      expect(sent()[0]).toMatchObject({ userIds: ['fd-1'], type: 'sales_order.awaiting_finance', entityId: 'so-1' });
      expect(sent()[0].body).toContain('Koforidua Wholesale');
      expect(sent()[0].body).toContain('GHS 10,500');
    });
    it('only the original submitter can submit it', async () => {
      await expect(build({ order: { status: 'DRAFT', submittedById: 'someone-else', salesOfficerId: 'sales-1' } }).service.submit('so-1', salesOfficer)).rejects.toThrow(ForbiddenException);
    });
    it('only a draft can be submitted', async () => {
      await expect(build({ order: { status: 'APPROVED' } }).service.submit('so-1', salesOfficer)).rejects.toThrow(BadRequestException);
    });
    it('a failed notification never fails or undoes the submission', async () => {
      const { service, state } = build({ order: { status: 'DRAFT' }, notifyRejects: true });
      await expect(service.submit('so-1', salesOfficer)).resolves.toBeDefined();
      expect(state().status).toBe('SUBMITTED');
    });
  });

  // ───────────────────────── 2. Finance Director ─────────────────────────
  describe('approving (Finance Director)', () => {
    it('the officer who submitted the order cannot approve it', async () => {
      await expect(build().service.approve('so-1', {}, person('sales-1', 'Nana', 'SALES_OFFICER', ['sales.create', 'sales.approve']))).rejects.toThrow(ForbiddenException);
    });
    it('is a purely financial decision: reserves no stock and creates no task', async () => {
      const { service, tx, ledger } = build();
      const r = await service.approve('so-1', {}, financeDirector);
      expect(r.status).toBe('APPROVED');
      expect(tx.stockReservation.create).not.toHaveBeenCalled();
      expect(tx.task.create).not.toHaveBeenCalled();
      expect(ledger.getBalance).not.toHaveBeenCalled();
    });
    it('hands the order on to the Managing Director and CEO with Finance\'s remark, and tells the Sales Officer where it is', async () => {
      const { service, sent, toWhom } = build();
      await service.approve('so-1', { note: '50% deposit received' }, financeDirector);
      expect(toWhom('sales_order.awaiting_release').sort()).toEqual(['ceo-1', 'md-1']);
      expect(sent().find((n: any) => n.type === 'sales_order.awaiting_release').body).toContain('50% deposit received');
      expect(toWhom('sales_order.approved')).toEqual(['sales-1']);
    });
    it('records who approved it, with their comment, in the trail and the audit log, and never notifies the person who just acted', async () => {
      const { service, trail, audit, sent } = build();
      await service.approve('so-1', { note: 'Deposit confirmed' }, financeDirector);
      expect(trail()[0]).toMatchObject({ type: 'APPROVED', actorName: 'Kwesi Test', actorRole: 'Finance Director', comment: 'Deposit confirmed' });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'sales_order.approve', userId: 'fd-1' }), expect.anything());
      expect(sent().every((n: any) => !n.userIds.includes('fd-1'))).toBe(true);
    });
    it('if two people approve at the same moment, the second is told someone else got there first', async () => {
      await expect(build({ lostRace: true }).service.approve('so-1', {}, financeDirector)).rejects.toThrow(ConflictException);
    });
  });

  // ───────────────────────── 3. Rejecting: always with a comment ─────────────────────────
  describe('rejecting (Finance Director or Managing Director): a comment is always required', () => {
    it('Finance rejects an order waiting for Finance: the Sales Officer is told exactly why, and the trail says who', async () => {
      const { service, state, trail, toWhom, sent } = build();
      const r = await service.reject('so-1', { reason: 'Receipt shows GHS 2,000, not the GHS 5,000 deposit' }, financeDirector);
      expect(r.status).toBe('REJECTED');
      expect(state().rejectionReason).toBe('Receipt shows GHS 2,000, not the GHS 5,000 deposit');
      expect(trail()[0]).toMatchObject({ type: 'REJECTED', actorRole: 'Finance Director', comment: 'Receipt shows GHS 2,000, not the GHS 5,000 deposit', meta: { stage: 'FINANCE' } });
      expect(toWhom('sales_order.rejected')).toEqual(['sales-1']);
      expect(sent().find((n: any) => n.type === 'sales_order.rejected').body).toContain('Receipt shows GHS 2,000');
    });
    it('the Managing Director can reject an order Finance approved: the Sales Officer AND Finance are told why', async () => {
      const { service, trail, toWhom } = build({ order: approved });
      const r = await service.reject('so-1', { reason: 'Customer is over the credit limit' }, md);
      expect(r.status).toBe('REJECTED');
      expect(trail()[0]).toMatchObject({ type: 'REJECTED', actorRole: 'Managing Director', meta: { stage: 'MD' } });
      expect(toWhom('sales_order.rejected')).toEqual(['sales-1']);
      expect(toWhom('sales_order.rejected_after_approval')).toEqual(['fd-1']);
    });
    it.each([[''], ['   '], ['ab'], [undefined as unknown as string]])('refuses a rejection with no real comment (%j), and changes nothing', async (reason) => {
      const { service, state, notifications } = build();
      await expect(service.reject('so-1', { reason }, financeDirector)).rejects.toThrow(BadRequestException);
      expect(state().status).toBe('SUBMITTED');
      expect(notifications.notify).not.toHaveBeenCalled();
    });
    it('each person rejects only at their own step: Finance cannot reject what is with the MD, nor the MD what is with Finance', async () => {
      await expect(build({ order: approved }).service.reject('so-1', { reason: 'Changed my mind' }, financeDirector)).rejects.toThrow(ForbiddenException);
      await expect(build().service.reject('so-1', { reason: 'Changed my mind' }, md)).rejects.toThrow(ForbiddenException);
    });
    it('only orders waiting for a decision can be rejected, and nobody rejects their own order', async () => {
      await expect(build({ order: released }).service.reject('so-1', { reason: 'Too late now' }, md)).rejects.toThrow(BadRequestException);
      await expect(build().service.reject('so-1', { reason: 'My own order' }, person('sales-1', 'Nana', 'FINANCE_DIRECTOR', ['sales.approve']))).rejects.toThrow(ForbiddenException);
    });
    it('puts the reason in the audit trail too', async () => {
      const { service, audit } = build();
      await service.reject('so-1', { reason: 'Price is below the list price' }, financeDirector);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'sales_order.reject', reason: 'Price is below the list price' }), expect.anything());
    });
  });

  // ───────────────────────── 4. Managing Director releases ─────────────────────────
  describe('releasing (Managing Director / CEO)', () => {
    it('an order still with Finance cannot be released, and says why', async () => {
      await expect(build().service.release('so-1', {}, md)).rejects.toThrow(/waiting for the Finance Director/);
    });
    it('moves it to RELEASED without choosing a warehouse, reserving stock or creating a task: that is the Warehouse Supervisor\'s decision', async () => {
      const { service, tx, ledger, state, trail } = build({ order: approved });
      const r = await service.release('so-1', { note: 'Priority customer' }, md);
      expect(r.status).toBe('RELEASED');
      expect(state().allocatedWarehouseId).toBeNull();
      expect(tx.stockReservation.create).not.toHaveBeenCalled();
      expect(tx.task.create).not.toHaveBeenCalled();
      expect(ledger.getBalance).not.toHaveBeenCalled();
      expect(trail()[0]).toMatchObject({ type: 'RELEASED', actorRole: 'Managing Director', comment: 'Priority customer', fromStatus: 'APPROVED', toStatus: 'RELEASED' });
    });
    it('asks the Warehouse Supervisor to assign a warehouse, passing on the MD\'s instruction, and tells the Sales Officer', async () => {
      const { service, sent, toWhom } = build({ order: approved });
      await service.release('so-1', { note: 'Deliver before noon' }, md);
      expect(toWhom('sales_order.awaiting_assignment')).toEqual(['ws-1']);
      expect(sent().find((n: any) => n.type === 'sales_order.awaiting_assignment').body).toContain('Deliver before noon');
      expect(toWhom('sales_order.released')).toEqual(['sales-1']);
    });
    it('a browser still sending the old warehouse choice is not an error: it is ignored', async () => {
      const { service, state } = build({ order: approved });
      await service.release('so-1', { allocatedWarehouseId: 'wh-9' }, md);
      expect(state().allocatedWarehouseId).toBeNull();
    });
    it('if two people release at the same moment, only one succeeds', async () => {
      await expect(build({ order: approved, lostRace: true }).service.release('so-1', {}, md)).rejects.toThrow(ConflictException);
    });
  });

  // ───────────────────────── 5. Warehouse Supervisor assigns a warehouse ─────────────────────────
  describe('assigning a warehouse (Warehouse Supervisor)', () => {
    it('cannot assign an order the MD has not released, and says where it is', async () => {
      await expect(build().service.assignWarehouse('so-1', { warehouseId: 'wh-1' }, supervisor)).rejects.toThrow(/waiting for the Finance Director/);
      await expect(build({ order: approved }).service.assignWarehouse('so-1', { warehouseId: 'wh-1' }, supervisor)).rejects.toThrow(/not been released by the Managing Director/);
    });
    it('reserves the stock at that warehouse, tasks that warehouse\'s managers, and moves the order to RESERVED', async () => {
      const { service, state, tx } = build({ order: released });
      const r = await service.assignWarehouse('so-1', { warehouseId: 'wh-1', note: 'Load the 25KG bags first' }, supervisor);
      expect(r.status).toBe('RESERVED');
      expect(state().allocatedWarehouseId).toBe('wh-1');
      expect(tx.stockReservation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ salesOrderId: 'so-1', warehouseId: 'wh-1', productId: 'prod-1', packagingSizeId: 'size-25', bagCount: 50, status: 'ACTIVE' }) });
      const task = tx.task.create.mock.calls[0][0].data;
      expect(task).toMatchObject({ assignedRoleCode: 'WAREHOUSE_MANAGER', salesOrderId: 'so-1', warehouseId: 'wh-1', createdById: 'ws-1' });
      expect(task.title).toBe('Process order SO-2026-000001');
      expect(task.description).toContain('Instruction: Load the 25KG bags first');
    });
    it('refuses a warehouse that cannot cover the order (stock minus what other orders already hold)', async () => {
      await expect(build({ order: released, balances: { 'wh-1': 40 } }).service.assignWarehouse('so-1', { warehouseId: 'wh-1' }, supervisor)).rejects.toThrow(/only 40 available/);
      await expect(build({ order: released, balances: { 'wh-1': 100 }, reservedBags: 80 }).service.assignWarehouse('so-1', { warehouseId: 'wh-1' }, supervisor)).rejects.toThrow(/only 20 available/);
    });
    it('refuses an unknown or inactive warehouse', async () => {
      await expect(build({ order: released, warehouse: null }).service.assignWarehouse('so-1', { warehouseId: 'wh-x' }, supervisor)).rejects.toThrow(/not found or is not active/);
      await expect(build({ order: released, warehouse: { id: 'wh-1', name: 'Old', isActive: false } }).service.assignWarehouse('so-1', { warehouseId: 'wh-1' }, supervisor)).rejects.toThrow(/not active/);
    });
    it('tells that warehouse\'s own managers, the Sales Officer and the MD and CEO, and writes the warehouse into the trail', async () => {
      const { service, toWhom, trail } = build({ order: released });
      await service.assignWarehouse('so-1', { warehouseId: 'wh-2' }, supervisor);
      expect(toWhom('sales_order.assigned_to_your_warehouse')).toEqual(['wm-2']);
      expect(toWhom('sales_order.assigned').sort()).toEqual(['ceo-1', 'md-1', 'sales-1']);
      expect(trail()[0]).toMatchObject({ type: 'ASSIGNED', actorRole: 'Warehouse Supervisor', meta: { warehouseId: 'wh-2', warehouseName: 'Warehouse wh-2' } });
    });
    it('can move it to another warehouse before the first one starts: the old hold and task end, a new one begins, and the trail says REASSIGNED', async () => {
      const { service, state, tx, trail } = build({ order: assigned });
      await service.assignWarehouse('so-1', { warehouseId: 'wh-2' }, supervisor);
      expect(state().allocatedWarehouseId).toBe('wh-2');
      expect(tx.stockReservation.updateMany).toHaveBeenCalledWith({ where: { salesOrderId: 'so-1', status: 'ACTIVE' }, data: expect.objectContaining({ status: 'RELEASED' }) });
      expect(tx.task.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'CANCELLED' } }));
      expect(tx.stockReservation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ warehouseId: 'wh-2' }) });
      expect(trail()[0]).toMatchObject({ type: 'REASSIGNED', fromStatus: 'RESERVED', toStatus: 'RESERVED' });
      await expect(build({ order: assigned }).service.assignWarehouse('so-1', { warehouseId: 'wh-1' }, supervisor)).rejects.toThrow(/already assigned to that warehouse/);
    });
    it('once the warehouse has started processing, it can no longer be moved', async () => {
      await expect(build({ order: processing }).service.assignWarehouse('so-1', { warehouseId: 'wh-2' }, supervisor)).rejects.toThrow(BadRequestException);
    });
    it('two supervisors assigning at the same moment cannot reserve the stock twice', async () => {
      const { service, tx } = build({ order: released, lostRace: true });
      await expect(service.assignWarehouse('so-1', { warehouseId: 'wh-1' }, supervisor)).rejects.toThrow(ConflictException);
      expect(tx.stockReservation.create).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────── 6. The warehouse processes it, then moves it on track ─────────────────────────
  describe('processing and dispatching (the assigned warehouse)', () => {
    it('cannot start before a warehouse is assigned', async () => {
      await expect(build({ order: released }).service.startProcessing('so-1', {}, supervisor)).rejects.toThrow(/has not assigned/);
    });
    it('that warehouse\'s manager starts processing: PROCESSING, its task goes in progress, and the trail records who', async () => {
      const { service, tx, trail } = build({ order: assigned });
      const r = await service.startProcessing('so-1', { note: 'Picking now' }, manager1);
      expect(r.status).toBe('PROCESSING');
      expect(tx.task.updateMany).toHaveBeenCalledWith({ where: { salesOrderId: 'so-1', status: 'TODO' }, data: { status: 'IN_PROGRESS' } });
      expect(trail()[0]).toMatchObject({ type: 'PROCESSING', actorRole: 'Warehouse Manager', comment: 'Picking now' });
    });
    it('another warehouse\'s manager cannot even see it, so cannot touch it; the Supervisor, who works across warehouses, can', async () => {
      await expect(build({ order: assigned }).service.startProcessing('so-1', {}, manager2)).rejects.toThrow(NotFoundException);
      await expect(build({ order: assigned }).service.startProcessing('so-1', {}, supervisor)).resolves.toBeDefined();
    });
    it('tells the Sales Officer, the Supervisor and the MD when it starts', async () => {
      const { service, toWhom } = build({ order: assigned });
      await service.startProcessing('so-1', {}, manager1);
      expect(toWhom('sales_order.processing').sort()).toEqual(['ceo-1', 'md-1', 'sales-1', 'ws-1']);
    });
    it('moves it ON TRACK only after processing, recording the driver, vehicle and expected arrival for the Sales Officer to pass on', async () => {
      await expect(build({ order: assigned }).service.dispatch('so-1', {}, manager1)).rejects.toThrow(/Start processing the order first/);
      const { service, trail, sent } = build({ order: processing });
      const r = await service.dispatch('so-1', { driverName: 'Yaw Boateng', vehicleNumber: 'GT-1234-22', expectedDeliveryAt: '2026-10-08T14:00:00.000Z', note: 'Left at 9am' }, manager1);
      expect(r.status).toBe('ON_TRACK');
      expect(trail()[0]).toMatchObject({ type: 'ON_TRACK', comment: 'Left at 9am', meta: { driverName: 'Yaw Boateng', vehicleNumber: 'GT-1234-22', expectedDeliveryAt: '2026-10-08T14:00:00.000Z' } });
      const note = sent().find((n: any) => n.type === 'sales_order.on_track');
      expect(note.userIds).toContain('sales-1');
      expect(note.body).toContain('Yaw Boateng');
      expect(note.body).toContain('GT-1234-22');
    });
    it('another warehouse\'s manager cannot dispatch it', async () => {
      await expect(build({ order: processing }).service.dispatch('so-1', {}, manager2)).rejects.toThrow(NotFoundException);
    });
    it('someone who can see every order but works at another warehouse is told it is not theirs to work on', async () => {
      const viewerAtWh2 = person('wm-3', 'Kofi', 'WAREHOUSE_MANAGER', ['sales.fulfill', 'sales.view'], [{ scopeType: 'WAREHOUSE', scopeId: 'wh-2' }]);
      await expect(build({ order: assigned }).service.startProcessing('so-1', {}, viewerAtWh2)).rejects.toThrow(/different warehouse/);
      await expect(build({ order: processing }).service.dispatch('so-1', {}, viewerAtWh2)).rejects.toThrow(/different warehouse/);
      await expect(build({ order: onTrack }).service.fulfill('so-1', {}, viewerAtWh2)).rejects.toThrow(/different warehouse/);
    });
  });

  // ───────────────────────── 7. Delivery ─────────────────────────
  describe('confirming delivery (the assigned warehouse)', () => {
    it.each([
      [released, /not assigned this order to a warehouse|has not assigned/],
      [assigned, /has not been sent yet/],
      [processing, /has not been sent yet/],
    ])('cannot deliver an order that has not been sent (%#)', async (order, message) => {
      await expect(build({ order }).service.fulfill('so-1', {}, supervisor)).rejects.toThrow(message as RegExp);
    });
    it('an order still with Finance or the MD cannot be delivered either', async () => {
      await expect(build().service.fulfill('so-1', {}, supervisor)).rejects.toThrow(BadRequestException);
      await expect(build({ order: approved }).service.fulfill('so-1', {}, supervisor)).rejects.toThrow(/not been released/);
    });
    it('moves stock from the warehouse to a CUSTOMER-location balance and consumes the reservation', async () => {
      const { service, ledger, tx } = build({ order: onTrack });
      const r = await service.fulfill('so-1', { note: 'Received by Mr Mensah' }, manager1);
      expect(r.status).toBe('FULFILLED');
      expect(ledger.recordTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'PACKAGED_RICE_SOLD', sourceLocationId: 'wh-1', destLocationType: 'CUSTOMER', destLocationId: 'cust-1' }));
      expect(ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ locationType: 'WAREHOUSE', locationId: 'wh-1' }), -1250, -50);
      expect(ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ locationType: 'CUSTOMER', locationId: 'cust-1' }), 1250, 50);
      expect(tx.stockReservation.update).toHaveBeenCalledWith({ where: { id: 'res-1' }, data: { status: 'CONSUMED' } });
    });
    it('closes the task, writes DELIVERED with the note, and tells the Sales Officer, Finance (to invoice), the MD and CEO and the Supervisor', async () => {
      const { service, tx, trail, toWhom } = build({ order: onTrack });
      await service.fulfill('so-1', { note: 'Received by Mr Mensah' }, manager1);
      expect(tx.task.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED', completedById: 'wm-1' }) }));
      expect(trail()[0]).toMatchObject({ type: 'DELIVERED', comment: 'Received by Mr Mensah' });
      expect(toWhom('sales_order.delivered').sort()).toEqual(['ceo-1', 'fd-1', 'md-1', 'sales-1', 'ws-1']);
    });
    it('another warehouse\'s manager cannot confirm it', async () => {
      await expect(build({ order: onTrack }).service.fulfill('so-1', {}, manager2)).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── 8. Cancelling ─────────────────────────
  describe('cancelling', () => {
    it('the Sales Officer who made the order can cancel it; the person holding it is told, with the reason', async () => {
      const { service, toWhom, sent, trail } = build();
      await service.cancel('so-1', { reason: 'Customer withdrew' }, salesOfficer);
      expect(toWhom('sales_order.cancelled')).toEqual(['fd-1']);
      expect(sent()[0].body).toContain('Customer withdrew');
      expect(trail()[0]).toMatchObject({ type: 'CANCELLED', comment: 'Customer withdrew' });
    });
    it('cancelling an order already assigned frees the reserved stock and tells the Supervisor and that warehouse\'s managers', async () => {
      const { service, tx, toWhom } = build({ order: assigned });
      await service.cancel('so-1', undefined, salesOfficer);
      expect(tx.stockReservation.updateMany).toHaveBeenCalledWith({ where: { salesOrderId: 'so-1', status: 'ACTIVE' }, data: expect.objectContaining({ status: 'RELEASED' }) });
      expect(toWhom('sales_order.cancelled').sort()).toEqual(['wm-1', 'ws-1']);
    });
    it('another officer cannot cancel it (they cannot even see it); the MD can', async () => {
      await expect(build().service.cancel('so-1', {}, otherOfficer)).rejects.toThrow(NotFoundException);
      await expect(build().service.cancel('so-1', {}, md)).resolves.toBeDefined();
    });
    it('once the warehouse is processing it, it can no longer be cancelled', async () => {
      await expect(build({ order: processing }).service.cancel('so-1', {}, salesOfficer)).rejects.toThrow(BadRequestException);
    });
  });

  // ───────────────────────── 9. Each Sales Officer's work is their own ─────────────────────────
  describe('who can see which orders', () => {
    const whereOf = async (actor: AuthenticatedUser) => { const b = build(); await b.service.list({ status: 'SUBMITTED' }, actor); return b.prisma.salesOrder.findMany.mock.calls[0][0].where; };

    it('a Sales Officer\'s list is limited to the orders they made', async () => {
      expect(await whereOf(salesOfficer)).toEqual({ AND: [{ OR: [{ salesOfficerId: 'sales-1' }, { submittedById: 'sales-1' }] }, { status: 'SUBMITTED', customerId: undefined }] });
    });
    it('another Sales Officer gets a list limited to theirs, never the first officer\'s', async () => {
      expect(JSON.stringify(await whereOf(otherOfficer))).toContain('sales-2');
      expect(JSON.stringify(await whereOf(otherOfficer))).not.toContain('sales-1');
    });
    it('Finance, the MD and the Supervisor see the whole pipeline', async () => {
      for (const actor of [financeDirector, md, supervisor]) expect((await whereOf(actor)).AND[0]).toEqual({});
    });
    it('a warehouse manager sees only orders assigned to their own warehouse', async () => {
      expect((await whereOf(manager1)).AND[0]).toEqual({ allocatedWarehouseId: { in: ['wh-1'] } });
    });
    it('someone who takes no part in sales sees nothing', async () => {
      expect(JSON.stringify((await whereOf(person('x-1', 'Xavier', 'FARM_MANAGER', ['dashboard.view']))).AND[0])).toContain('00000000-0000');
    });
    it('opening another officer\'s order is reported as not found, so even its existence is not revealed', async () => {
      await expect(build().service.findById('so-1', otherOfficer)).rejects.toThrow(NotFoundException);
      await expect(build().service.findById('so-1', salesOfficer)).resolves.toBeDefined();
      await expect(build().service.findById('so-1', md)).resolves.toBeDefined();
    });
    it('a warehouse manager cannot open an order that is assigned elsewhere or not yet assigned', async () => {
      await expect(build({ order: assigned }).service.findById('so-1', manager2)).rejects.toThrow(NotFoundException);
      await expect(build({ order: released }).service.findById('so-1', manager1)).rejects.toThrow(NotFoundException);
      await expect(build({ order: assigned }).service.findById('so-1', manager1)).resolves.toBeDefined();
    });
    it('every action on another officer\'s order is refused the same way', async () => {
      const { service } = build({ order: { status: 'DRAFT' } });
      await expect(service.submit('so-1', otherOfficer)).rejects.toThrow(NotFoundException);
      await expect(service.addReceipt('so-1', undefined, {}, otherOfficer)).rejects.toThrow(NotFoundException);
      await expect(service.getReceiptFile('so-1', 'rc-1', otherOfficer)).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── 10. Receipts are uploaded as files ─────────────────────────
  describe('payment receipts uploaded from a phone or computer', () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 2)]);
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100, 3)]);
    const heic = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(50)]);

    it('stores a photo against the order, as what it really is, and writes it to the trail with the officer\'s note', async () => {
      const { service, prisma, trail } = build({ order: { status: 'DRAFT' } });
      await service.addReceipt('so-1', { buffer: jpeg, originalname: 'IMG_2041 deposit.JPG' }, { note: '50% deposit, mobile money' }, salesOrder_());
      expect(prisma.salesReceipt.create).toHaveBeenCalledWith({ data: expect.objectContaining({ salesOrderId: 'so-1', mimeType: 'image/jpeg', fileName: 'IMG_2041 deposit.jpg', sizeBytes: jpeg.length, note: '50% deposit, mobile money', uploadedById: 'sales-1', uploadedByName: 'Nana Test', data: jpeg }), select: { id: true } });
      expect(trail()[0]).toMatchObject({ type: 'RECEIPT_ADDED', comment: '50% deposit, mobile money', meta: { receiptId: 'rc-1', fileName: 'IMG_2041 deposit.jpg' } });
    });
    it('accepts PNG and PDF too, judging by content rather than the name', async () => {
      for (const [file, mime] of [[png, 'image/png'], [pdf, 'application/pdf']] as const) {
        const { service, prisma } = build({ order: { status: 'SUBMITTED' } });
        await service.addReceipt('so-1', { buffer: file, originalname: 'whatever.bin' }, {}, salesOfficer);
        expect(prisma.salesReceipt.create.mock.calls[0][0].data.mimeType).toBe(mime);
      }
    });
    it.each([
      ['nothing chosen', undefined, /Choose a photo/],
      ['an empty file', { buffer: Buffer.alloc(0) }, /Choose a photo/],
      ['a text file renamed to .jpg', { buffer: Buffer.from('this is not an image at all, just text'), originalname: 'a.jpg' }, /Only photos/],
      ['an iPhone HEIC photo', { buffer: heic, originalname: 'a.heic' }, /HEIC/],
      ['a file over the size limit', { buffer: Buffer.concat([jpeg, Buffer.alloc(10 * 1024 * 1024)]), originalname: 'big.jpg' }, /too large/],
    ])('refuses %s, with a message that says what to do', async (_n, file, message) => {
      const { service, prisma } = build({ order: { status: 'DRAFT' } });
      await expect(service.addReceipt('so-1', file as any, {}, salesOfficer)).rejects.toThrow(message as RegExp);
      expect(prisma.salesReceipt.create).not.toHaveBeenCalled();
    });
    it('only the officer who made the order adds receipts, and an order holds a limited number', async () => {
      await expect(build().service.addReceipt('so-1', { buffer: jpeg }, {}, md)).rejects.toThrow(ForbiddenException);
      await expect(build({ receiptCount: 10 }).service.addReceipt('so-1', { buffer: jpeg }, {}, salesOfficer)).rejects.toThrow(/up to 10/);
    });
    it('a closed order takes no more receipts', async () => {
      await expect(build({ order: { status: 'CANCELLED' } }).service.addReceipt('so-1', { buffer: jpeg }, {}, salesOfficer)).rejects.toThrow(/closed/);
    });
    it('the file is available to the approvers while they decide, and to nobody who cannot see the order', async () => {
      const mk = () => { const b = build(); b.prisma.salesReceipt.findFirst.mockResolvedValue({ id: 'rc-1', fileName: 'r.jpg', mimeType: 'image/jpeg', data: jpeg }); return b; };
      for (const actor of [financeDirector, md, salesOfficer]) await expect(mk().service.getReceiptFile('so-1', 'rc-1', actor)).resolves.toMatchObject({ mimeType: 'image/jpeg' });
      await expect(mk().service.getReceiptFile('so-1', 'rc-1', otherOfficer)).rejects.toThrow(NotFoundException);
      const none = build(); none.prisma.salesReceipt.findFirst.mockResolvedValue(null);
      await expect(none.service.getReceiptFile('so-1', 'nope', md)).rejects.toThrow(NotFoundException);
    });
    it('a receipt can be removed only while the order is a draft: after submitting it is part of the record', async () => {
      const draft = build({ order: { status: 'DRAFT' } }); draft.prisma.salesReceipt.findFirst.mockResolvedValue({ id: 'rc-1', fileName: 'r.jpg' });
      await draft.service.removeReceipt('so-1', 'rc-1', salesOfficer);
      expect(draft.prisma.salesReceipt.delete).toHaveBeenCalledWith({ where: { id: 'rc-1' } });
      expect(draft.trail()[0]).toMatchObject({ type: 'RECEIPT_REMOVED' });
      await expect(build({ order: { status: 'SUBMITTED' } }).service.removeReceipt('so-1', 'rc-1', salesOfficer)).rejects.toThrow(/part of the record/);
    });
    function salesOrder_() { return salesOfficer; }
  });

  // ───────────────────────── 11. The whole journey ─────────────────────────
  describe('the whole journey', () => {
    it('runs the complete chain in order, each person acting on what the previous one handed over, and leaves a complete trail', async () => {
      const { service, state, trail } = build({ order: { status: 'DRAFT' } });
      await service.submit('so-1', salesOfficer);
      await service.approve('so-1', { note: 'Deposit seen' }, financeDirector);
      await service.release('so-1', { note: 'Go ahead' }, md);
      expect(state().status).toBe('RELEASED');
      await service.assignWarehouse('so-1', { warehouseId: 'wh-1' }, supervisor);
      expect(state().status).toBe('RESERVED');
      // the order is re-read each time, so give the in-memory order what the database would now hold
      (state() as any).allocatedWarehouse = { name: 'Warehouse wh-1' };
      (state() as any).reservations = [reservation];
      await service.startProcessing('so-1', {}, manager1);
      await service.dispatch('so-1', { driverName: 'Yaw' }, manager1);
      expect(state().status).toBe('ON_TRACK');
      await service.fulfill('so-1', {}, manager1);
      expect(state().status).toBe('FULFILLED');
      expect(trail().map((e: any) => [e.type, e.actorRole])).toEqual([
        ['SUBMITTED', 'Sales Officer'], ['APPROVED', 'Finance Director'], ['RELEASED', 'Managing Director'], ['ASSIGNED', 'Warehouse Supervisor'],
        ['PROCESSING', 'Warehouse Manager'], ['ON_TRACK', 'Warehouse Manager'], ['DELIVERED', 'Warehouse Manager'],
      ]);
    });
    it('no one can skip a stage: delivering straight after approval, assigning before release, or approving a draft, all fail', async () => {
      await expect(build({ order: { status: 'DRAFT' } }).service.approve('so-1', {}, financeDirector)).rejects.toThrow(BadRequestException);
      await expect(build({ order: approved }).service.assignWarehouse('so-1', { warehouseId: 'wh-1' }, supervisor)).rejects.toThrow(BadRequestException);
      await expect(build({ order: approved }).service.fulfill('so-1', {}, supervisor)).rejects.toThrow(BadRequestException);
      await expect(build({ order: assigned }).service.dispatch('so-1', {}, manager1)).rejects.toThrow(BadRequestException);
    });
  });
});
