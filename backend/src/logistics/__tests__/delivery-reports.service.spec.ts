import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DeliveryReportsService } from '../delivery-reports.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('DeliveryReportsService.approve', () => {
  const supervisor = { id: 'supervisor-1', roles: [{ scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }] } as unknown as AuthenticatedUser;

  const reviewReport = {
    id: 'dr-1',
    reportNumber: 'DR-2026-000001',
    farmId: 'farm-a',
    destinationWarehouseId: 'wh-1',
    paddyGradeId: 'grade-4',
    actualKg: 20000,
    actualBagCount: 400,
    status: 'SUPERVISOR_REVIEW',
    submittedById: 'manager-1',
    farm: {},
    destinationWarehouse: {},
    paddyGrade: {},
    vehicle: null,
    driver: null,
    submittedBy: {},
    approvedBy: null,
    shipment: null,
    deliveryOrder: {},
  };

  function buildService() {
    const shipmentCreate = jest.fn().mockResolvedValue({ id: 'sh-1' });
    const prisma = {
      deliveryReport: { findUnique: jest.fn().mockResolvedValue(reviewReport), update: jest.fn().mockResolvedValue({ ...reviewReport, status: 'IN_TRANSIT' }) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          deliveryReport: { update: jest.fn().mockResolvedValue({ ...reviewReport, status: 'IN_TRANSIT' }) },
          shipment: { create: shipmentCreate },
          shipmentEvent: { create: jest.fn() },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const ledger = {
      generateNumber: jest.fn().mockResolvedValue('SH-2026-000001'),
      recordTransaction: jest.fn(),
      adjustBalance: jest.fn(),
    } as unknown as InventoryLedgerService;

    const service = new DeliveryReportsService(prisma as any, audit, ledger);
    return { service, prisma, audit, ledger, shipmentCreate };
  }

  it('rejects the original submitter approving their own delivery report', async () => {
    const { service } = buildService();
    const submitter = { id: 'manager-1', roles: [{ scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }] } as unknown as AuthenticatedUser;

    await expect(service.approve('dr-1', submitter)).rejects.toThrow(ForbiddenException);
  });

  it('refuses to approve a report that is not awaiting supervisor review', async () => {
    const { service, prisma } = buildService();
    prisma.deliveryReport.findUnique.mockResolvedValue({ ...reviewReport, status: 'DRAFT' });

    await expect(service.approve('dr-1', supervisor)).rejects.toThrow(BadRequestException);
  });

  it('on approval, decreases farm balance and increases the in-transit (EXTERNAL) balance by the same amount', async () => {
    const { service, ledger } = buildService();

    await service.approve('dr-1', supervisor);

    expect(ledger.adjustBalance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationType: 'FARM', locationId: 'farm-a' }),
      -20000,
      -400,
    );
    expect(ledger.adjustBalance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationType: 'EXTERNAL', locationId: 'sh-1' }),
      20000,
      400,
    );
    expect(ledger.recordTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'PADDY_DISPATCHED', sourceLocationId: 'farm-a', destLocationId: 'sh-1' }),
    );
  });
});

describe('DeliveryReportsService.list', () => {
  function buildService() {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { deliveryReport: { findMany } };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const ledger = {} as unknown as InventoryLedgerService;
    const service = new DeliveryReportsService(prisma as any, audit, ledger);
    return { service, prisma, findMany };
  }

  it('did not exist before this fix — the Farm Director had no way to discover reports awaiting approval. Confirms it now does, scoped correctly for a globally-scoped approver', async () => {
    const { service, findMany } = buildService();
    const farmDirector = {
      id: 'fd-1',
      roles: [{ scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }],
    } as unknown as AuthenticatedUser;

    await service.list(farmDirector, {});

    // GLOBAL scope -> no farmId filter injected, sees every farm's reports.
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.not.objectContaining({ farmId: expect.anything() }) }));
  });

  it('auto-restricts a Farm-Manager-scoped caller to only their own farm, without them having to pass a filter', async () => {
    const { service, findMany } = buildService();
    const farmManagerA = {
      id: 'manager-a',
      roles: [{ scopes: [{ scopeType: 'FARM', scopeId: 'farm-a' }] }],
    } as unknown as AuthenticatedUser;

    await service.list(farmManagerA, {});

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ farmId: { in: ['farm-a'] } }) }));
  });

  it('returns an empty list rather than throwing for a caller with no farm scope at all', async () => {
    const { service, findMany } = buildService();
    const noScope = { id: 'x', roles: [{ scopes: [] }] } as unknown as AuthenticatedUser;

    const result = await service.list(noScope, {});

    expect(result).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
