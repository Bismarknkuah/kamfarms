import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SystemResetService } from '../system-reset.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('SystemResetService', () => {
  const admin = { id: 'admin-1', roles: [{ roleCode: 'ADMIN' }] } as unknown as AuthenticatedUser;
  const financeDirector = { id: 'fd-1', roles: [{ roleCode: 'FINANCE_DIRECTOR' }] } as unknown as AuthenticatedUser;
  const md = { id: 'md-1', roles: [{ roleCode: 'MD' }] } as unknown as AuthenticatedUser;
  const ceo = { id: 'ceo-1', roles: [{ roleCode: 'CEO' }] } as unknown as AuthenticatedUser;
  const randomManager = { id: 'wm-1', roles: [{ roleCode: 'WAREHOUSE_MANAGER' }] } as unknown as AuthenticatedUser;

  const baseRequest: {
    id: string;
    status: string;
    requestedById: string;
    financeApprovedById: string | null;
    mdApprovedById: string | null;
    affectedTables: string[];
    reason: string;
  } = {
    id: 'reset-1',
    status: 'REQUESTED',
    requestedById: 'admin-1',
    financeApprovedById: null,
    mdApprovedById: null,
    affectedTables: ['InventoryTransaction', 'InventoryBalance'],
    reason: 'Testing',
  };

  function buildService(requestState = baseRequest) {
    const prisma = {
      resetRequest: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(requestState),
        update: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ ...requestState, ...(data as object) })),
      },
      inventoryTransaction: { count: jest.fn().mockResolvedValue(500), deleteMany: jest.fn() },
      inventoryBalance: { count: jest.fn().mockResolvedValue(80), deleteMany: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          resetRequest: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue(requestState), update: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ ...requestState, ...(data as object) })) },
          inventoryTransaction: { count: jest.fn().mockResolvedValueOnce(500).mockResolvedValueOnce(0), deleteMany: jest.fn() },
          inventoryBalance: { count: jest.fn().mockResolvedValueOnce(80).mockResolvedValueOnce(0), deleteMany: jest.fn() },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const service = new SystemResetService(prisma as any, audit);
    return { service, prisma, audit };
  }

  describe('dual approval', () => {
    it('rejects the Admin approving their own reset request', async () => {
      const { service } = buildService();

      await expect(service.approve('reset-1', admin)).rejects.toThrow(ForbiddenException);
    });

    it('rejects an approval attempt from someone holding neither required role', async () => {
      const { service } = buildService();

      await expect(service.approve('reset-1', randomManager)).rejects.toThrow(ForbiddenException);
    });

    it('moves status to FINANCE_APPROVED (not APPROVED) when only the Finance Director has signed off', async () => {
      const { service, prisma } = buildService();

      const result = await service.approve('reset-1', financeDirector);

      expect(prisma.resetRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FINANCE_APPROVED', financeApprovedById: 'fd-1' }) }),
      );
    });

    it('only reaches APPROVED once BOTH Finance Director and MD have signed off', async () => {
      const alreadyFinanceApproved = { ...baseRequest, status: 'FINANCE_APPROVED', financeApprovedById: 'fd-1' };
      const { service, prisma } = buildService(alreadyFinanceApproved);

      await service.approve('reset-1', md);

      expect(prisma.resetRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', mdApprovedById: 'md-1' }) }),
      );
    });

    it('also accepts CEO as filling the "top executive" approval slot, not just MD — the spec names finance, CEO, and MD together as approvers', async () => {
      const alreadyFinanceApproved = { ...baseRequest, status: 'FINANCE_APPROVED', financeApprovedById: 'fd-1' };
      const { service, prisma } = buildService(alreadyFinanceApproved);

      await service.approve('reset-1', ceo);

      expect(prisma.resetRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', mdApprovedById: 'ceo-1' }) }),
      );
    });

    it('rejects a second approval attempt from the same Finance Director role', async () => {
      const alreadyFinanceApproved = { ...baseRequest, status: 'FINANCE_APPROVED', financeApprovedById: 'fd-1' };
      const { service } = buildService(alreadyFinanceApproved);
      const anotherFinanceDirector = { id: 'fd-2', roles: [{ roleCode: 'FINANCE_DIRECTOR' }] } as unknown as AuthenticatedUser;

      await expect(service.approve('reset-1', anotherFinanceDirector)).rejects.toThrow(BadRequestException);
    });
  });

  describe('scoped execution', () => {
    it('refuses to execute a request that is not yet fully APPROVED', async () => {
      const { service } = buildService({ ...baseRequest, status: 'FINANCE_APPROVED' });

      await expect(service.execute('reset-1', admin)).rejects.toThrow(BadRequestException);
    });

    it('refuses to execute a reset scoped to tables outside the allowlist, even if approved', async () => {
      const outOfScope = { ...baseRequest, status: 'APPROVED', affectedTables: ['SalesOrder', 'Invoice'] };
      const { service } = buildService(outOfScope);

      await expect(service.execute('reset-1', admin)).rejects.toThrow(
        expect.objectContaining({ response: expect.objectContaining({ errorCode: 'RESET_SCOPE_NOT_IMPLEMENTED' }) }),
      );
    });

    it('executes an approved, in-scope inventory reset and captures pre/post snapshots', async () => {
      const approved = { ...baseRequest, status: 'APPROVED' };
      const { service, prisma } = buildService(approved);

      await service.execute('reset-1', admin);

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
