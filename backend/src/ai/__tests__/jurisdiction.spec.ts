import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { assertCenterInJurisdiction, assertWarehouseInJurisdiction, hasPermission, jurisdictionOf, productionScope } from '../jurisdiction';

const actor = (roleCode: string, scopes: { scopeType: string; scopeId: string | null }[], perms: string[] = []) =>
  ({ id: 'u', roles: [{ roleId: 'r', roleCode, permissions: [], scopes }], permissionCodes: new Set(perms) }) as unknown as AuthenticatedUser;
const GLOBAL = [{ scopeType: 'GLOBAL', scopeId: null }];

describe('jurisdictionOf', () => {
  it('lets the MD, CEO and Administrator see every activity, even if their account carries a narrow scope', () => {
    for (const role of ['MD', 'CEO', 'ADMIN']) {
      expect(jurisdictionOf(actor(role, [{ scopeType: 'WAREHOUSE', scopeId: 'wh-1' }])).companyWide).toBe(true);
    }
  });
  it('lets anyone holding a company-wide scope see everything', () => {
    expect(jurisdictionOf(actor('OPERATIONS_MANAGER', GLOBAL)).companyWide).toBe(true);
  });
  it('limits everyone else to the farms and warehouses they are assigned to', () => {
    const j = jurisdictionOf(actor('OPERATIONS_MANAGER', [{ scopeType: 'WAREHOUSE', scopeId: 'wh-1' }, { scopeType: 'WAREHOUSE', scopeId: 'wh-2' }, { scopeType: 'FARM', scopeId: 'f-1' }]));
    expect(j).toEqual({ companyWide: false, farmIds: ['f-1'], warehouseIds: ['wh-1', 'wh-2'] });
  });
  it('treats someone with no scope at all as having no places, never as having everything', () => {
    expect(jurisdictionOf(actor('OPERATIONS_MANAGER', []))).toEqual({ companyWide: false, farmIds: [], warehouseIds: [] });
    expect(jurisdictionOf({ id: 'u' } as AuthenticatedUser).companyWide).toBe(false);
  });
});

describe('productionScope', () => {
  it('has no filter for the whole company', () => expect(productionScope({ companyWide: true, farmIds: [], warehouseIds: [] })).toEqual({}));
  it('filters through the milling center\'s warehouse for a scoped person', () => {
    expect(productionScope({ companyWide: false, farmIds: [], warehouseIds: ['wh-1'] })).toEqual({ millingCenter: { warehouseId: { in: ['wh-1'] } } });
  });
  it('says nothing is visible (so callers skip the query) for a person with no warehouse', () => {
    expect(productionScope({ companyWide: false, farmIds: ['f-1'], warehouseIds: [] })).toBeNull();
  });
});

describe('assertWarehouseInJurisdiction / assertCenterInJurisdiction', () => {
  const scoped = { companyWide: false, farmIds: [], warehouseIds: ['wh-1'] };
  it('allows an own warehouse and anything for the whole company', () => {
    expect(() => assertWarehouseInJurisdiction(scoped, 'wh-1')).not.toThrow();
    expect(() => assertWarehouseInJurisdiction({ companyWide: true, farmIds: [], warehouseIds: [] }, 'wh-9')).not.toThrow();
  });
  it('refuses another warehouse, saying it is outside the jurisdiction', () => {
    expect(() => assertWarehouseInJurisdiction(scoped, 'wh-9', 'this machine')).toThrow(ForbiddenException);
    expect(() => assertWarehouseInJurisdiction(scoped, 'wh-9', 'this machine')).toThrow(/This machine is outside your jurisdiction/);
  });
  it('checks a milling center through its warehouse, and skips the lookup for the whole company', async () => {
    const findUnique = jest.fn().mockResolvedValue({ warehouseId: 'wh-9' });
    const prisma = { millingCenter: { findUnique } } as any;
    await expect(assertCenterInJurisdiction(prisma, scoped, 'c-9')).rejects.toThrow(ForbiddenException);
    findUnique.mockResolvedValue({ warehouseId: 'wh-1' });
    await expect(assertCenterInJurisdiction(prisma, scoped, 'c-1')).resolves.toBeUndefined();
    findUnique.mockResolvedValue(null);
    await expect(assertCenterInJurisdiction(prisma, scoped, 'nope')).rejects.toThrow(NotFoundException);
    findUnique.mockClear();
    await assertCenterInJurisdiction(prisma, { companyWide: true, farmIds: [], warehouseIds: [] }, 'c-9');
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('hasPermission', () => {
  it('is true when any listed permission is held', () => {
    expect(hasPermission(actor('X', GLOBAL, ['a']), 'b', 'a')).toBe(true);
    expect(hasPermission(actor('X', GLOBAL, ['a']), 'b')).toBe(false);
  });
});
