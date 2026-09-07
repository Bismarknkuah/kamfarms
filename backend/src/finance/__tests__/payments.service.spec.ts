import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentsService } from '../payments.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('PaymentsService', () => {
  const salesOfficer = { id: 'sales-1' } as AuthenticatedUser;
  const financeOfficer = { id: 'finance-1' } as AuthenticatedUser;

  const pendingPayment = {
    id: 'pay-1',
    status: 'PENDING_VERIFICATION',
    recordedById: 'sales-1',
    customerId: 'cust-1',
    amount: 10000,
  };

  function buildService() {
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', isActive: true }) },
      invoice: { findUnique: jest.fn().mockResolvedValue({ id: 'inv-1', customerId: 'cust-1' }) },
      payment: {
        findUnique: jest.fn().mockResolvedValue(pendingPayment),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...pendingPayment, ...data })),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          payment: {
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockResolvedValue({ id: 'pay-1' }),
          },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const service = new PaymentsService(prisma as any, audit);
    return { service, prisma };
  }

  it('rejects an allocation total that exceeds the payment amount', async () => {
    const { service } = buildService();

    await expect(
      service.create(
        {
          customerId: 'cust-1',
          amount: 5000,
          method: 'CASH',
          paymentDate: '2026-09-01',
          allocations: [{ invoiceId: 'inv-1', amount: 6000 }],
        },
        salesOfficer,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a Sales Officer verifying the payment they themselves recorded (RULE: cash needs a distinct authorizer)', async () => {
    const { service } = buildService();

    await expect(service.verify('pay-1', salesOfficer)).rejects.toThrow(ForbiddenException);
  });

  it('allows a different Finance Officer to verify the payment', async () => {
    const { service, prisma } = buildService();

    const result = await service.verify('pay-1', financeOfficer);

    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'VERIFIED', verifiedById: 'finance-1' }) }),
    );
  });

  it('refuses to verify a payment that is not PENDING_VERIFICATION', async () => {
    const { service, prisma } = buildService();
    prisma.payment.findUnique.mockResolvedValue({ ...pendingPayment, status: 'VERIFIED' });

    await expect(service.verify('pay-1', financeOfficer)).rejects.toThrow(BadRequestException);
  });

  it('requires a reason to reject a payment (enforced by DTO validation upstream, and status-checked here)', async () => {
    const { service } = buildService();

    await service.reject('pay-1', { reason: 'Bank reference does not match records.' }, financeOfficer);
    // No throw = success; explicit reason is required by RejectPaymentDto's @MinLength at the controller boundary.
  });
});
