import { BadRequestException } from '@nestjs/common';
import { ShipmentsService } from '../shipments.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('ShipmentsService.receive', () => {
  const warehouseManager = { id: 'wm-1', roles: [{ scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }] } as unknown as AuthenticatedUser;

  const inTransitShipment = {
    id: 'sh-1',
    shipmentNumber: 'SH-2026-000001',
    deliveryReportId: 'dr-1',
    farmId: 'farm-a',
    warehouseId: 'wh-1',
    paddyGradeId: 'grade-4',
    expectedKg: 20000,
    expectedBags: 400,
    receivedAt: null,
    farm: {},
    warehouse: {},
    paddyGrade: {},
    deliveryReport: { vehicle: null, driver: null },
    events: [],
  };

  function buildService() {
    const prisma = {
      shipment: { findUnique: jest.fn().mockResolvedValue(inTransitShipment), update: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          shipment: { update: jest.fn().mockResolvedValue({ ...inTransitShipment, receivedAt: new Date() }) },
          deliveryReport: { update: jest.fn() },
          shipmentEvent: { create: jest.fn() },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const ledger = { recordTransaction: jest.fn(), adjustBalance: jest.fn() } as unknown as InventoryLedgerService;
    const service = new ShipmentsService(prisma as any, audit, ledger);
    return { service, prisma, ledger, audit };
  }

  it('refuses to receive a shipment twice', async () => {
    const { service, prisma } = buildService();
    prisma.shipment.findUnique.mockResolvedValue({ ...inTransitShipment, receivedAt: new Date() });

    await expect(service.receive('sh-1', { receivedKg: 20000, receivedBags: 400 }, warehouseManager)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('when received quantity matches expected exactly, records no variance and no STOCK_ADJUSTMENT', async () => {
    const { service, ledger } = buildService();

    await service.receive('sh-1', { receivedKg: 20000, receivedBags: 400 }, warehouseManager);

    const stockAdjustmentCalls = (ledger.recordTransaction as jest.Mock).mock.calls.filter(
      ([, input]) => input.type === 'STOCK_ADJUSTMENT',
    );
    expect(stockAdjustmentCalls).toHaveLength(0);
  });

  it('when received quantity differs, creates a variance record and closes the in-transit balance by the FULL expected amount (never leaves a dangling in-transit remainder)', async () => {
    const { service, ledger } = buildService();

    // Truck arrived short: 19,500 KG instead of the expected 20,000 KG.
    await service.receive('sh-1', { receivedKg: 19500, receivedBags: 390 }, warehouseManager);

    expect(ledger.adjustBalance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationType: 'EXTERNAL', locationId: 'sh-1' }),
      -20000, // full expected amount leaves the in-transit bucket, closing it out
      -400,
    );
    expect(ledger.adjustBalance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationType: 'WAREHOUSE', locationId: 'wh-1' }),
      19500, // only what actually arrived is credited to the warehouse
      390,
    );

    const stockAdjustmentCalls = (ledger.recordTransaction as jest.Mock).mock.calls.filter(
      ([, input]) => input.type === 'STOCK_ADJUSTMENT',
    );
    expect(stockAdjustmentCalls).toHaveLength(1);
    expect(stockAdjustmentCalls[0][1].quantityKg).toBe(500); // |19500 - 20000|
  });

  it('flags large variances (beyond tolerance) as PENDING approval rather than silently auto-approving', async () => {
    const { service, ledger } = buildService();

    // 500 KG short is well beyond the 5 KG tolerance.
    await service.receive('sh-1', { receivedKg: 19500, receivedBags: 390 }, warehouseManager);

    const [, adjustmentInput] = (ledger.recordTransaction as jest.Mock).mock.calls.find(
      ([, input]) => input.type === 'STOCK_ADJUSTMENT',
    );
    expect(adjustmentInput.approvalStatus).toBe('PENDING');
  });
});
