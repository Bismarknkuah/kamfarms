// scope.util imports a Prisma-generated type, which cannot be generated in
// every environment these tests run in. Replaced with the same global-scope
// rule it implements (every actor in this suite has a GLOBAL scope).
jest.mock('../../common/utils/scope.util', () => ({
  scopedLocationIds: (actor: any) => ({ isGlobal: actor.roles.flatMap((r: any) => r.scopes).some((s: any) => s.scopeType === 'GLOBAL'), ids: [] }),
  assertScope: jest.fn(),
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExpensesService } from '../expenses.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const actor = (id: string, role: string, permissions: string[]) =>
  ({ id, roles: [{ roleCode: role, permissions, scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }], permissionCodes: new Set(permissions) }) as unknown as AuthenticatedUser;

// Real permission sets, as the seed defines them.
const financeDirector = actor('fd-1', 'FINANCE_DIRECTOR', ['finance.approve', 'finance.view', 'expense.create']);
const managingDirector = actor('md-1', 'MD', ['finance.approve.director', 'finance.view']);
const farmManager = actor('fm-1', 'FARM_MANAGER', ['expense.create']);

function build(expense: Record<string, unknown>) {
  let current = { id: 'exp-1', status: 'PENDING', farmId: null, warehouseId: null, category: {}, ...expense };
  const prisma = {
    expense: {
      findUnique: jest.fn(async () => current),
      findMany: jest.fn(async () => [current]),
      update: jest.fn(async ({ data }: any) => (current = { ...current, ...data })),
    },
    // Only Kwesi (fd-1) holds the Finance Director role.
    userRole: { findMany: jest.fn(async ({ where }: any) => (where.userId.in as string[]).filter((id) => id === 'fd-1').map((userId) => ({ userId }))) },
  };
  const audit = { record: jest.fn() } as unknown as AuditService;
  return { service: new ExpensesService(prisma as any, audit), prisma, audit };
}

describe('ExpensesService: who may decide an expense', () => {
  describe('an ordinary expense (entered by someone else)', () => {
    it('the Finance Director approves it', async () => {
      const { service } = build({ submittedById: 'fm-1' });
      await expect(service.approve('exp-1', financeDirector)).resolves.toMatchObject({ status: 'APPROVED', approvedById: 'fd-1' });
    });

    it('the Finance Director can reject it, with a reason', async () => {
      const { service } = build({ submittedById: 'fm-1' });
      await expect(service.reject('exp-1', { reason: 'No receipt' }, financeDirector)).resolves.toMatchObject({ status: 'REJECTED' });
    });

    it('the Managing Director cannot approve it: expenses are the Finance Director\'s to decide', async () => {
      const { service, prisma } = build({ submittedById: 'fm-1' });
      await expect(service.approve('exp-1', managingDirector)).rejects.toThrow(/decided by the Finance Director/);
      expect(prisma.expense.update).not.toHaveBeenCalled();
    });

    it('nor can the Managing Director reject it', async () => {
      const { service } = build({ submittedById: 'fm-1' });
      await expect(service.reject('exp-1', { reason: 'no' }, managingDirector)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('an expense the Finance Director entered personally', () => {
    it('the Finance Director cannot approve their own entry', async () => {
      const { service } = build({ submittedById: 'fd-1' });
      await expect(service.approve('exp-1', financeDirector)).rejects.toThrow('You cannot approve your own expense.');
    });

    it('nor reject their own entry', async () => {
      const { service } = build({ submittedById: 'fd-1' });
      await expect(service.reject('exp-1', { reason: 'x' }, financeDirector)).rejects.toThrow('You cannot reject your own expense.');
    });

    it('the Managing Director approves it, so it is never left stuck', async () => {
      const { service } = build({ submittedById: 'fd-1' });
      await expect(service.approve('exp-1', managingDirector)).resolves.toMatchObject({ status: 'APPROVED', approvedById: 'md-1' });
    });

    it('the Managing Director can also reject it', async () => {
      const { service } = build({ submittedById: 'fd-1' });
      await expect(service.reject('exp-1', { reason: 'Personal item' }, managingDirector)).resolves.toMatchObject({ status: 'REJECTED' });
    });

    it('is recorded in the audit trail under whoever decided it', async () => {
      const { service, audit } = build({ submittedById: 'fd-1' });
      await service.approve('exp-1', managingDirector);
      expect((audit.record as jest.Mock).mock.calls[0][0]).toMatchObject({ userId: 'md-1', action: 'expense.approve' });
    });
  });

  it('only a PENDING expense can be decided, whoever is deciding', async () => {
    const { service } = build({ submittedById: 'fm-1', status: 'APPROVED' });
    await expect(service.approve('exp-1', financeDirector)).rejects.toThrow(BadRequestException);
  });

  describe('telling the screen who may act', () => {
    it('flags an expense the Finance Director entered, and only that', async () => {
      const mine = build({ submittedById: 'fd-1' });
      const theirs = build({ submittedById: 'fm-1' });
      expect(await mine.service.list(financeDirector, {})).toEqual([expect.objectContaining({ submittedByFinanceDirector: true })]);
      expect(await theirs.service.list(financeDirector, {})).toEqual([expect.objectContaining({ submittedByFinanceDirector: false })]);
    });

    it('carries the same flag on a single expense', async () => {
      const { service } = build({ submittedById: 'fd-1' });
      expect(await service.findById('exp-1', managingDirector)).toMatchObject({ submittedByFinanceDirector: true });
    });
  });
});
