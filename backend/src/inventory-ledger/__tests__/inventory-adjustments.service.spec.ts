import { BadRequestException } from '@nestjs/common';
import { InventoryAdjustmentsService } from '../inventory-adjustments.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryLedgerService } from '../inventory-ledger.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('InventoryAdjustmentsService - milling-center scope resolution', () => {
  const warehouseAScopedManager = {
    id: 'wm-a',
    roles: [{ scopes: [{ scopeType: 'WAREHOUSE', scopeId: 'wh-a' }] }],
  } as unknown as AuthenticatedUser;

  function buildService() {
    const prisma = {
      inventoryAdjustment: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'adj-1', ...data })),
        findUnique: jest.fn(),
      },
      millingCenter: { findUnique: jest.fn() },
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const ledger = { getBalance: jest.fn().mockResolvedValue({ quantityKg: 1000, bagCount: 20 }) } as unknown as InventoryLedgerService;
    const service = new InventoryAdjustmentsService(prisma as any, audit, ledger);
    return { service, prisma };
  }

  it('allows a warehouse-scoped caller to request an adjustment for a milling center that belongs to their own warehouse', async () => {
    const { service, prisma } = buildService();
    prisma.millingCenter.findUnique.mockResolvedValue({ id: 'mc-1', warehouseId: 'wh-a' });
    prisma.inventoryAdjustment.findUnique.mockResolvedValue({
      id: 'adj-1', paddyGrade: null, product: { name: 'Rice' }, packagingSize: { label: '25KG' },
    });

    await expect(
      service.create(
        { locationType: 'MILLING_CENTER', locationId: 'mc-1', productId: 'p-1', packagingSizeId: 'ps-1', adjustmentKg: -10, adjustmentBags: -1, reason: 'test' },
        warehouseAScopedManager,
      ),
    ).resolves.toBeDefined();
  });

  it('blocks a warehouse-scoped caller from requesting an adjustment for a milling center belonging to a DIFFERENT warehouse - the bug this fixes', async () => {
    const { service, prisma } = buildService();
    prisma.millingCenter.findUnique.mockResolvedValue({ id: 'mc-2', warehouseId: 'wh-b' });

    await expect(
      service.create(
        { locationType: 'MILLING_CENTER', locationId: 'mc-2', productId: 'p-1', packagingSizeId: 'ps-1', adjustmentKg: -10, adjustmentBags: -1, reason: 'test' },
        warehouseAScopedManager,
      ),
    ).rejects.toThrow();
  });

  it('rejects a request naming a milling center that does not exist, before touching the balance at all', async () => {
    const { service, prisma } = buildService();
    prisma.millingCenter.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        { locationType: 'MILLING_CENTER', locationId: 'ghost', productId: 'p-1', packagingSizeId: 'ps-1', adjustmentKg: -10, adjustmentBags: -1, reason: 'test' },
        warehouseAScopedManager,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('still correctly scopes a plain warehouse location - never regresses the already-working FARM/WAREHOUSE cases', async () => {
    const { service, prisma } = buildService();
    prisma.inventoryAdjustment.findUnique.mockResolvedValue({
      id: 'adj-1', paddyGrade: null, product: { name: 'Rice' }, packagingSize: { label: '25KG' },
    });

    await expect(
      service.create(
        { locationType: 'WAREHOUSE', locationId: 'wh-a', productId: 'p-1', packagingSizeId: 'ps-1', adjustmentKg: -10, adjustmentBags: -1, reason: 'test' },
        warehouseAScopedManager,
      ),
    ).resolves.toBeDefined();

    await expect(
      service.create(
        { locationType: 'WAREHOUSE', locationId: 'wh-b', productId: 'p-1', packagingSizeId: 'ps-1', adjustmentKg: -10, adjustmentBags: -1, reason: 'test' },
        warehouseAScopedManager,
      ),
    ).rejects.toThrow();
  });
});

describe('InventoryAdjustmentsService.approve - editing the submitted figures before approval', () => {
  const supervisor = { id: 'supervisor-1', roles: [{ scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }] } as unknown as AuthenticatedUser;

  const pendingAdjustment = {
    id: 'adj-1',
    adjustmentNumber: 'ADJ-2026-000001',
    locationType: 'FARM',
    locationId: 'farm-a',
    paddyGradeId: 'grade-4',
    productId: null,
    packagingSizeId: null,
    adjustmentKg: -100,
    adjustmentBags: -2,
    reason: 'Original reason from the Farm Manager',
    status: 'PENDING',
    requestedById: 'manager-1',
  };

  function buildApproveService(adjustment = pendingAdjustment) {
    const balanceUpdate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...adjustment, ...data }));
    const prisma = {
      inventoryAdjustment: {
        findUnique: jest.fn().mockResolvedValue(adjustment),
        update: jest.fn().mockResolvedValue({ ...adjustment, status: 'APPROVED' }),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          inventoryAdjustment: { update: balanceUpdate },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const recordTransaction = jest.fn();
    const adjustBalance = jest.fn();
    const ledger = { recordTransaction, adjustBalance } as unknown as InventoryLedgerService;
    const service = new InventoryAdjustmentsService(prisma as any, audit, ledger);
    return { service, prisma, recordTransaction, adjustBalance, balanceUpdate, audit };
  }

  it('applies the Farm Supervisor’s corrected figures, not the Farm Manager’s original ones, when overrides are given', async () => {
    const { service, adjustBalance, balanceUpdate } = buildApproveService();
    await service.approve('adj-1', { adjustmentKg: -120, adjustmentBags: -3, reason: 'Corrected count after recheck' }, supervisor);

    expect(adjustBalance).toHaveBeenCalledWith(expect.anything(), expect.anything(), -120, -3);
    const updateArgs = balanceUpdate.mock.calls[0][0].data;
    expect(updateArgs.adjustmentKg).toBe(-120);
    expect(updateArgs.adjustmentBags).toBe(-3);
    expect(updateArgs.reason).toBe('Corrected count after recheck');
  });

  it('falls back to the originally submitted figures when no override is given', async () => {
    const { service, adjustBalance } = buildApproveService();
    await service.approve('adj-1', {}, supervisor);
    expect(adjustBalance).toHaveBeenCalledWith(expect.anything(), expect.anything(), -100, -2);
  });

  it('records both the original and corrected values in the audit trail', async () => {
    const { service, audit } = buildApproveService();
    await service.approve('adj-1', { adjustmentKg: -120, adjustmentBags: -3 }, supervisor);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeValue: expect.objectContaining({ adjustmentKg: -100, adjustmentBags: -2 }),
        afterValue: expect.objectContaining({ adjustmentKg: -120, adjustmentBags: -3 }),
      }),
      expect.anything(),
    );
  });

  it('refuses to approve an adjustment that is not PENDING, even with corrected figures supplied', async () => {
    const approvedAlready = { ...pendingAdjustment, status: 'APPROVED' };
    const { service } = buildApproveService(approvedAlready);
    await expect(service.approve('adj-1', { adjustmentKg: -120 }, supervisor)).rejects.toThrow(BadRequestException);
  });
});
