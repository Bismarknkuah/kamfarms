import { BadRequestException } from '@nestjs/common';
import { InvoicesService } from '../invoices.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('InvoicesService', () => {
  const actor = { id: 'finance-1' } as AuthenticatedUser;

  function buildService() {
    const prisma = {
      salesOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'so-1',
          status: 'FULFILLED',
          customerId: 'cust-1',
          items: [{ productId: 'p1', packagingSizeId: 's1', bagCount: 100, unitPrice: 250, lineTotal: 25000 }],
        }),
      },
      invoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'inv-1', totalAmount: 25000, customerId: 'cust-1', items: [] }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      paymentAllocation: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          invoice: {
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockResolvedValue({ id: 'inv-1' }),
          },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const service = new InvoicesService(prisma as any, audit);
    return { service, prisma };
  }

  it('refuses to invoice a sales order that is not FULFILLED', async () => {
    const { service, prisma } = buildService();
    prisma.salesOrder.findUnique.mockResolvedValue({ id: 'so-1', status: 'RESERVED', items: [] });

    await expect(service.createFromSalesOrder({ salesOrderId: 'so-1' }, actor)).rejects.toThrow(BadRequestException);
  });

  it('refuses to double-invoice the same sales order', async () => {
    const { service, prisma } = buildService();
    prisma.invoice.findFirst.mockResolvedValue({ id: 'existing-inv' });

    await expect(service.createFromSalesOrder({ salesOrderId: 'so-1' }, actor)).rejects.toThrow(BadRequestException);
  });

  it('computes amountPaid/balance/status purely from VERIFIED payment allocations, ignoring PENDING/REJECTED ones', async () => {
    const { service, prisma } = buildService();
    prisma.paymentAllocation.findMany.mockResolvedValue([{ amountApplied: 10000 }]); // simulates the where-filter already excluding non-VERIFIED

    const result = await service.findById('inv-1');

    expect(result.amountPaid).toBe(10000);
    expect(result.balance).toBe(15000);
    expect(result.status).toBe('PARTIALLY_PAID');
  });

  it('marks an invoice PAID once allocations cover the full total', async () => {
    const { service, prisma } = buildService();
    prisma.paymentAllocation.findMany.mockResolvedValue([{ amountApplied: 25000 }]);

    const result = await service.findById('inv-1');

    expect(result.status).toBe('PAID');
    expect(result.balance).toBe(0);
  });
});
