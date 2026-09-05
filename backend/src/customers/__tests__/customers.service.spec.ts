import { NotFoundException } from '@nestjs/common';
import { CustomersService } from '../customers.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('CustomersService', () => {
  const actor = { id: 'sales-1' } as AuthenticatedUser;

  function buildService() {
    const prisma = {
      customer: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          customer: {
            count: jest.fn().mockResolvedValue(4), // 4 existing customers this year
            create: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'cust-5', ...(data as object) })),
          },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const service = new CustomersService(prisma as any, audit);
    return { service, prisma, audit };
  }

  it('assigns a sequential, year-scoped customer number', async () => {
    const { service } = buildService();

    const result = await service.create({ name: 'Adom Enterprises' }, actor);

    // 4 existing -> 5th customer this year.
    expect(result.customerNumber).toMatch(/^CUST-\d{4}-000005$/);
  });

  it('defaults credit limit to 0 when not supplied — never assumes unlimited credit', async () => {
    const { service } = buildService();

    const result = await service.create({ name: 'Adom Enterprises' }, actor);

    expect(result.creditLimit).toBe(0);
  });

  it('throws NotFoundException for an unknown customer id', async () => {
    const { service, prisma } = buildService();
    prisma.customer.findUnique.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
  });
});
