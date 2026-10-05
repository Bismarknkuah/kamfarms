import { ForbiddenException } from '@nestjs/common';
import { ExpensesService } from '../expenses.service';

const sc = (scopeType: string, scopeId: string | null) => [{ scopeType, scopeId }];
const actor = (id: string, scopes: any[]) => ({ id, permissionCodes: new Set(['expense.create']), roles: [{ roleId: 'r', roleCode: 'OPERATIONS_OFFICER', permissions: [], scopes }] }) as any;
function build() {
  const created: any[] = [];
  const svc: any = Object.create(ExpensesService.prototype);
  svc.prisma = {
    expenseCategory: { findUnique: jest.fn(async () => ({ id: 'c1', isActive: true })) },
    expense: { findMany: jest.fn(async () => []), findUnique: jest.fn(async ({ where }: any) => ({ ...created[0], id: where.id })) },   // create re-reads what it saved (and applies the scope rule again)
    $transaction: jest.fn(async (cb: any) => cb({ expense: { count: jest.fn(async () => 0), create: jest.fn(async ({ data }: any) => { created.push(data); return { id: 'x', ...data }; }) } })),
  };
  svc.audit = { record: jest.fn() }; svc.withFinanceDirectorFlag = async (rows: any[]) => rows;
  return { svc, created };
}
const dto = (over: any = {}) => ({ categoryId: 'c1', amount: 100, date: '2026-10-01', ...over });

describe('expenses at a milling center', () => {
  it('an Operations Officer may record spending at THEIR mill, and the expense is saved against it', async () => {
    const { svc, created } = build();
    await svc.create(dto({ millingCenterId: 'M1' }), actor('oo1', sc('MILLING_CENTER', 'M1')));
    expect(created[0]).toMatchObject({ millingCenterId: 'M1', status: 'PENDING', submittedById: 'oo1' });
  });
  it('...but not at another mill', async () => {
    const { svc, created } = build();
    await expect(svc.create(dto({ millingCenterId: 'M2' }), actor('oo1', sc('MILLING_CENTER', 'M1')))).rejects.toThrow(ForbiddenException);
    expect(created).toHaveLength(0);
  });
  it('someone who sees the whole company may record it anywhere', async () => {
    const { svc, created } = build();
    await svc.create(dto({ millingCenterId: 'M2' }), actor('fd', sc('GLOBAL', null))); expect(created[0].millingCenterId).toBe('M2');
  });
  it('a mill\'s officer sees the expenses of THEIR mill (and only them): the limit goes to the database', async () => {
    const { svc } = build();
    await svc.list(actor('oo1', sc('MILLING_CENTER', 'M1')), {});
    expect(svc.prisma.expense.findMany.mock.calls[0][0].where.OR).toEqual([{ millingCenterId: { in: ['M1'] } }]);
    expect(svc.prisma.expense.findMany.mock.calls[0][0].include.millingCenter).toBe(true);
  });
  it('someone with the whole company is not limited', async () => {
    const { svc } = build();
    await svc.list(actor('fd', sc('GLOBAL', null)), {}); expect(svc.prisma.expense.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});
