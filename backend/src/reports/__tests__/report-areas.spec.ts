import { reportAreas, coversArea, ROLE_AREAS } from '../report-areas';
import { REPORTS, ReportCatalogService } from '../report-catalog.service';

const user = (roleCode: string, permissions: string[] = []) => ({ id: 'u', roles: [{ roleId: 'r', roleCode, permissions, scopes: [] }], permissionCodes: new Set([...permissions, 'reports.export']) }) as any;
const everyPermission = [...new Set(REPORTS.flatMap((r) => r.anyOf))];
const offered = (roleCode: string) => new ReportCatalogService({} as any).list(user(roleCode, everyPermission)).map((r) => r.id);

describe('reports are kept to the area of work of each role', () => {
  it('gives a Farm Supervisor the farm areas and not the warehouse, milling, sales or finance ones', () => {
    const a = reportAreas(user('FARM_DIRECTOR'));
    expect([...a]).toEqual(['farm']);
    expect(coversArea(user('FARM_DIRECTOR'), ['warehouse'])).toBe(false);
    expect(coversArea(user('FARM_DIRECTOR'), ['finance', 'sales', 'milling'])).toBe(false);
  });

  it('shows a Farm Supervisor the farm reports only, even if they hold every permission', () => {
    const ids = offered('FARM_DIRECTOR');
    expect(ids).toEqual(expect.arrayContaining(['paddy-intake', 'deliveries']));
    for (const never of ['production-runs', 'machine-power', 'audit-log', 'users-and-access', 'watchlist']) expect(ids).not.toContain(never);
  });

  it('shows a Warehouse Manager no farm intake, no finance and no administration reports', () => {
    const ids = offered('WAREHOUSE_MANAGER');
    expect(ids).toContain('deliveries');
    for (const never of ['paddy-intake', 'production-runs', 'audit-log', 'users-and-access', 'watchlist']) expect(ids).not.toContain(never);
  });

  it('shows an Operations Manager the milling reports only', () => {
    const ids = offered('OPERATIONS_MANAGER');
    expect(ids).toEqual(expect.arrayContaining(['production-runs', 'machine-power']));
    for (const never of ['paddy-intake', 'deliveries', 'audit-log', 'users-and-access']) expect(ids).not.toContain(never);
  });

  it('shows the Finance Officer the expenses and nothing from the farms, warehouses or mills', () => {
    const ids = offered('FINANCE_OFFICER');
    expect(ids).toContain('expenses');
    for (const never of ['paddy-intake', 'deliveries', 'production-runs', 'machine-power', 'audit-log', 'watchlist']) expect(ids).not.toContain(never);
  });

  it('shows the MD, the CEO and the Auditor every report', () => {
    for (const code of ['MD', 'CEO', 'AUDITOR']) expect(offered(code).sort()).toEqual(REPORTS.map((r) => r.id).sort());
  });

  it('keeps the administration reports to the Administrator (and top management)', () => {
    expect(offered('ADMIN')).toEqual(expect.arrayContaining(['audit-log', 'users-and-access']));
    expect(offered('SALES_OFFICER')).not.toContain('audit-log');
  });

  it('refuses to build a report outside the person\'s area, even by asking for it by name', async () => {
    const svc = new ReportCatalogService({} as any);
    await expect(svc.build('production-runs', user('FARM_DIRECTOR', everyPermission), {})).rejects.toThrow(/does not include/);
  });

  it('adds up the areas of someone who holds two roles', () => {
    const both = { id: 'u', roles: [{ roleId: 'a', roleCode: 'WAREHOUSE_MANAGER', permissions: [], scopes: [] }, { roleId: 'b', roleCode: 'SALES_OFFICER', permissions: [], scopes: [] }], permissionCodes: new Set() } as any;
    expect([...reportAreas(both)].sort()).toEqual(['sales', 'warehouse']);
  });

  it('works out the area of a custom role from the permissions it holds', () => {
    expect([...reportAreas(user('CUSTOM_STORE_CLERK', ['warehouse.view', 'warehouse.receive']))]).toEqual(['warehouse']);
    expect([...reportAreas(user('CUSTOM_NOTHING', ['tasks.complete']))]).toEqual([]);
  });

  it('defines every built-in role', () => {
    expect(Object.keys(ROLE_AREAS).sort()).toEqual(['ADMIN', 'AUDITOR', 'CEO', 'FARM_DIRECTOR', 'FARM_MANAGER', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'MD', 'OPERATIONS_MANAGER', 'OPERATIONS_OFFICER', 'SALES_OFFICER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_SUPERVISOR']);
  });
});
