import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SalesOrdersService } from '../sales-orders.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('SalesOrdersService', () => {
  const salesOfficer = { id: 'sales-1' } as AuthenticatedUser;
  const warehouseSupervisor = { id: 'supervisor-1' } as AuthenticatedUser;

  const submittedOrder = {
    id: 'so-1',
    orderNumber: 'SO-2026-000001',
    customerId: 'cust-1',
    preferredWarehouseId: 'wh-1',
    allocatedWarehouseId: null,
    status: 'SUBMITTED',
    submittedById: 'sales-1',
    items: [
      { id: 'item-1', productId: 'prod-1', packagingSizeId: 'size-25', bagCount: 50, totalKg: 1250, product: { name: 'Pectra Rice' }, packagingSize: { label: '25KG' } },
    ],
    reservations: [],
  };

  function buildService(overrides: Partial<{ balanceBagCount: number; activeReservedBags: number }> = {}) {
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', isActive: true }) },
      salesOrder: {
        findUnique: jest.fn().mockResolvedValue(submittedOrder),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...submittedOrder, ...data })),
      },
      productPrice: { findFirst: jest.fn() },
      packagingSize: { findUnique: jest.fn().mockResolvedValue({ id: 'size-25', isActive: true, sizeKg: 25 }) },
      stockReservation: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { bagCount: overrides.activeReservedBags ?? 0 } }),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          salesOrder: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'so-1' }), update: jest.fn().mockResolvedValue({ ...submittedOrder, status: 'RESERVED' }) },
          stockReservation: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
          productPrice: { updateMany: jest.fn() },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const ledger = {
      recordTransaction: jest.fn(),
      adjustBalance: jest.fn(),
      getBalance: jest.fn().mockResolvedValue({ bagCount: overrides.balanceBagCount ?? 100 }),
    } as unknown as InventoryLedgerService;
    const service = new SalesOrdersService(prisma as any, audit, ledger);
    return { service, prisma, ledger, audit };
  }

  it('rejects the original sales officer approving their own order', async () => {
    const { service } = buildService();
    const selfSubmitter = { id: 'sales-1' } as AuthenticatedUser;

    await expect(service.approve('so-1', {}, selfSubmitter)).rejects.toThrow(ForbiddenException);
  });

  it('rejects approval when requested quantity exceeds available-to-sell stock (balance minus active reservations)', async () => {
    // 100 in the warehouse, but 60 already reserved by other orders -> only 40 available, order wants 50.
    const { service } = buildService({ balanceBagCount: 100, activeReservedBags: 60 });

    await expect(service.approve('so-1', {}, warehouseSupervisor)).rejects.toThrow(BadRequestException);
  });

  it('approves and creates a reservation when stock genuinely covers the order', async () => {
    const { service, prisma } = buildService({ balanceBagCount: 100, activeReservedBags: 0 });

    const result = await service.approve('so-1', {}, warehouseSupervisor);

    expect(result.status).toBe('RESERVED');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('never allows two orders to reserve the same stock — the second approval sees the first reservation as unavailable', async () => {
    // Simulates: warehouse has 100 bags, another order already holds an ACTIVE reservation for 80.
    const { service } = buildService({ balanceBagCount: 100, activeReservedBags: 80 });

    // This order wants 50 more, but only 20 remain available (100 - 80).
    await expect(service.approve('so-1', {}, warehouseSupervisor)).rejects.toThrow(BadRequestException);
  });

  it('on fulfillment, moves stock from warehouse to a CUSTOMER-location balance and consumes the reservation', async () => {
    const { service, prisma, ledger } = buildService();
    const reservedOrder = {
      ...submittedOrder,
      status: 'RESERVED',
      allocatedWarehouseId: 'wh-1',
      reservations: [{ id: 'res-1', status: 'ACTIVE', productId: 'prod-1', packagingSizeId: 'size-25', bagCount: 50, totalKg: 1250 }],
    };
    prisma.salesOrder.findUnique.mockResolvedValue(reservedOrder);

    await service.fulfill('so-1', warehouseSupervisor);

    expect(ledger.recordTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'PACKAGED_RICE_SOLD', sourceLocationId: 'wh-1', destLocationType: 'CUSTOMER', destLocationId: 'cust-1' }),
    );
    expect(ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ locationType: 'WAREHOUSE', locationId: 'wh-1' }), -1250, -50);
    expect(ledger.adjustBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ locationType: 'CUSTOMER', locationId: 'cust-1' }), 1250, 50);
  });
});
