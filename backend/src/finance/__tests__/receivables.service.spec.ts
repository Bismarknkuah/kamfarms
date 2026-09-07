import { ReceivablesService } from '../receivables.service';

describe('ReceivablesService.forCustomer', () => {
  function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  }

  function buildService(invoices: unknown[]) {
    const prisma = {
      invoice: { findMany: jest.fn().mockResolvedValue(invoices) },
    };
    return new ReceivablesService(prisma as any);
  }

  it('buckets an unpaid invoice 45 days past its due date into the 31-60 day bucket', async () => {
    const service = buildService([
      {
        totalAmount: 10000,
        dueDate: daysAgo(45),
        issueDate: daysAgo(60),
        allocations: [],
      },
    ]);

    const result = await service.forCustomer('cust-1');

    expect(result.outstanding).toBe(10000);
    expect(result.aging.days31to60).toBe(10000);
    expect(result.aging.current).toBe(0);
  });

  it('excludes a fully-paid invoice from the outstanding aging entirely', async () => {
    const service = buildService([
      {
        totalAmount: 10000,
        dueDate: daysAgo(45),
        issueDate: daysAgo(60),
        allocations: [{ amountApplied: 10000, payment: { status: 'VERIFIED' } }],
      },
    ]);

    const result = await service.forCustomer('cust-1');

    expect(result.outstanding).toBe(0);
    expect(Object.values(result.aging).every((v) => v === 0)).toBe(true);
  });

  it('does not count a PENDING_VERIFICATION payment toward totalPaid', async () => {
    const service = buildService([
      {
        totalAmount: 10000,
        dueDate: daysAgo(10),
        issueDate: daysAgo(20),
        allocations: [{ amountApplied: 10000, payment: { status: 'PENDING_VERIFICATION' } }],
      },
    ]);

    const result = await service.forCustomer('cust-1');

    expect(result.totalPaid).toBe(0);
    expect(result.outstanding).toBe(10000);
    expect(result.aging.days1to30).toBe(10000);
  });

  it('places a not-yet-due invoice in the current bucket', async () => {
    const service = buildService([
      {
        totalAmount: 5000,
        dueDate: daysAgo(-5), // due 5 days from now
        issueDate: daysAgo(5),
        allocations: [],
      },
    ]);

    const result = await service.forCustomer('cust-1');

    expect(result.aging.current).toBe(5000);
  });
});

describe('ReceivablesService.topDebtors', () => {
  it('includes the customer name and number - a real, confirmed gap fixed here, not just an opaque id a dashboard could not display', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cust-1', isActive: true, name: 'Adjei Rice Traders', customerNumber: 'CUST-2026-000001' }]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          { totalAmount: 10000, dueDate: new Date(), issueDate: new Date(), allocations: [] },
        ]),
      },
    };
    const service = new ReceivablesService(prisma as any);

    const result = await service.topDebtors();

    expect(result).toEqual([
      expect.objectContaining({ customerName: 'Adjei Rice Traders', customerNumber: 'CUST-2026-000001', outstanding: 10000 }),
    ]);
  });

  it('excludes a customer with nothing outstanding from the list entirely', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cust-1', isActive: true, name: 'Settled Customer', customerNumber: 'CUST-2026-000002' }]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          { totalAmount: 10000, dueDate: new Date(), issueDate: new Date(), allocations: [{ amountApplied: 10000, payment: { status: 'VERIFIED' } }] },
        ]),
      },
    };
    const service = new ReceivablesService(prisma as any);

    const result = await service.topDebtors();

    expect(result).toHaveLength(0);
  });
});
