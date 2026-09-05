import { ConflictException } from '@nestjs/common';
import { WarehousesService } from '../warehouses.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';

describe('WarehousesService', () => {
  const basePrisma = () => ({
    warehouse: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    warehouseManager: { upsert: jest.fn(), deleteMany: jest.fn() },
    millingCenter: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findFirst: jest.fn() },
  });
  const audit = { record: jest.fn() } as unknown as AuditService;
  const ledger = { getBalancesForLocation: jest.fn() } as unknown as InventoryLedgerService;
  const actor = { id: 'admin-1' } as AuthenticatedUser;

  it('creates a 4th warehouse without any code change (never hard-coded to 3)', async () => {
    const prisma = basePrisma();
    prisma.warehouse.findUnique.mockResolvedValue(null);
    prisma.warehouse.create.mockResolvedValue({ id: 'w4', code: 'WAREHOUSE_4', name: 'Warehouse 4' });
    const service = new WarehousesService(prisma as any, audit, ledger);

    const result = await service.create({ code: 'WAREHOUSE_4', name: 'Warehouse 4' }, actor);

    expect(result.code).toBe('WAREHOUSE_4');
    expect(audit.record).toHaveBeenCalled();
  });

  it('rejects a duplicate warehouse code', async () => {
    const prisma = basePrisma();
    prisma.warehouse.findUnique.mockResolvedValue({ id: 'w1', code: 'WAREHOUSE_1' });
    const service = new WarehousesService(prisma as any, audit, ledger);

    await expect(service.create({ code: 'WAREHOUSE_1', name: 'dup' }, actor)).rejects.toThrow(ConflictException);
  });

  it('creates a milling center scoped to its warehouse and rejects duplicate codes', async () => {
    const prisma = basePrisma();
    prisma.warehouse.findUnique.mockResolvedValue({ id: 'w1', code: 'WAREHOUSE_1', managers: [], millingCenters: [] });
    prisma.millingCenter.findUnique.mockResolvedValueOnce(null);
    prisma.millingCenter.create.mockResolvedValue({ id: 'mc1', code: 'MILLING_WAREHOUSE_1', warehouseId: 'w1' });
    const service = new WarehousesService(prisma as any, audit, ledger);

    const result = await service.createMillingCenter('w1', { code: 'MILLING_WAREHOUSE_1', name: 'Milling Center 1' }, actor);

    expect(result.warehouseId).toBe('w1');
    expect(prisma.millingCenter.create).toHaveBeenCalledWith({
      data: { code: 'MILLING_WAREHOUSE_1', name: 'Milling Center 1', warehouseId: 'w1' },
    });
  });
});
