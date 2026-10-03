import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PDF_ROW_LIMIT, REPORTS, ROW_LIMIT, ReportCatalogService } from '../report-catalog.service';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { PERMISSIONS as P } from '../../common/constants/permissions';

const GLOBAL = [{ scopeType: 'GLOBAL', scopeId: null }];
const farms = (...ids: string[]) => ids.map((scopeId) => ({ scopeType: 'FARM', scopeId }));
const warehouses = (...ids: string[]) => ids.map((scopeId) => ({ scopeType: 'WAREHOUSE', scopeId }));
const actor = (perms: string[], scopes: { scopeType: string; scopeId: string | null }[]) => ({ id: 'u1', permissionCodes: new Set(perms), roles: [{ roleId: 'r', roleCode: 'X', permissions: perms, scopes }] }) as any;
const ALL = [P.REPORTS_EXPORT, P.FARM_INVENTORY_VIEW, P.WAREHOUSE_INVENTORY_VIEW, P.MILLING_VIEW, P.MACHINE_VIEW, P.FINANCE_VIEW, P.AUDIT_VIEW, P.USERS_MANAGE, P.INSIGHTS_VIEW];

function build(rows: Record<string, any[]> = {}, insights?: unknown) {
  const calls: Record<string, any[]> = {};
  const model = (name: string) => ({ findMany: jest.fn(async (args: any) => { (calls[name] ??= []).push(args); return rows[name] ?? []; }) });
  const prisma: any = {};
  for (const m of ['paddyEntry', 'shipment', 'inventoryAdjustment', 'farm', 'warehouse', 'millingCenter', 'productionRecord', 'meterReading', 'expense', 'auditLog', 'user']) prisma[m] = model(m);
  return { service: new ReportCatalogService(prisma, insights as any), calls };
}
const ids = (a: any, service = build().service) => service.list(a).map((r) => r.id);

describe('which reports each person is offered', () => {
  it('offers everything to someone who holds every permission', () => {
    expect(ids(actor(ALL, GLOBAL)).sort()).toEqual(REPORTS.map((r) => r.id).sort());
  });
  it('offers a Farm Manager the farm reports their own work gives them: paddy intake, their deliveries, stock corrections and their expenses', () => {
    // a Farm Manager logs paddy, creates deliveries and expenses: they need no separate "view" permission to download their own
    expect(ids(actor([P.REPORTS_EXPORT, P.REPORTS_VIEW, P.FARM_INVENTORY_VIEW, P.DELIVERY_CREATE, P.EXPENSE_CREATE], farms('f1')))).toEqual(['paddy-intake', 'deliveries', 'stock-corrections', 'expenses']);
  });
  it('offers a Warehouse Manager their deliveries and stock corrections, and a Finance Director the expenses', () => {
    expect(ids(actor([P.REPORTS_EXPORT, P.WAREHOUSE_INVENTORY_VIEW], warehouses('w1')))).toEqual(['deliveries', 'stock-corrections']);
    expect(ids(actor([P.REPORTS_EXPORT, P.FINANCE_VIEW, P.AUDIT_VIEW], GLOBAL))).toEqual(['expenses', 'audit-log']);
  });
  it('offers a Sales Officer none of them: their own sales report is on the Reports page already', () => {
    expect(ids(actor([P.REPORTS_EXPORT, P.REPORTS_VIEW, P.SALES_CREATE], GLOBAL))).toEqual([]);
  });
  it('offers nothing to anyone who may not export, whatever else they can see', () => {
    expect(ids(actor(ALL.filter((p) => p !== P.REPORTS_EXPORT), GLOBAL))).toEqual([]);
  });
  it('keeps administration reports to the people who may see that data', () => {
    const admin = ids(actor([P.REPORTS_EXPORT, P.AUDIT_VIEW, P.USERS_MANAGE], GLOBAL));
    expect(admin).toEqual(['audit-log', 'users-and-access']);
    expect(ids(actor([P.REPORTS_EXPORT, P.FARM_INVENTORY_VIEW], farms('f1')))).not.toEqual(expect.arrayContaining(['audit-log', 'users-and-access', 'watchlist']));
  });
  it('says in words what each report covers for this person', () => {
    const where = (a: any, id: string) => build().service.list(a).find((r) => r.id === id)?.jurisdiction;
    expect(where(actor(ALL, GLOBAL), 'paddy-intake')).toBe('Everything in the company');
    expect(where(actor(ALL, farms('f1')), 'paddy-intake')).toBe('Only your 1 farm');
    expect(where(actor(ALL, [...farms('f1', 'f2'), ...warehouses('w1')]), 'deliveries')).toBe('Only your 2 farms and 1 warehouse');
    expect(where(actor(ALL, farms('f1')), 'audit-log')).toBe('Company-wide');
    expect(where(actor(ALL, []), 'paddy-intake')).toMatch(/^None yet/);
  });
});

describe('what is in a report: only the person\'s own jurisdiction', () => {
  it('cuts paddy intake down to the farms the person is assigned to', async () => {
    const { service, calls } = build();
    await service.build('paddy-intake', actor(ALL, farms('f1', 'f2')), {});
    expect(calls.paddyEntry[0].where.farmId).toEqual({ in: ['f1', 'f2'] });
    expect(calls.paddyEntry[0].take).toBe(ROW_LIMIT);
  });
  it('applies no farm filter to someone with company-wide access', async () => {
    const { service, calls } = build();
    await service.build('paddy-intake', actor(ALL, GLOBAL), {});
    expect(calls.paddyEntry[0].where.farmId).toBeUndefined();
  });
  it('gives nothing to someone who is assigned to no place, rather than everything', async () => {
    const { service, calls } = build();
    await service.build('paddy-intake', actor(ALL, []), {});
    expect(calls.paddyEntry[0].where.farmId).toEqual({ in: [] });
  });
  it('covers both the farms and the warehouses a person holds for deliveries and expenses', async () => {
    const { service, calls } = build();
    await service.build('deliveries', actor(ALL, [...farms('f1'), ...warehouses('w1')]), {});
    expect(calls.shipment[0].where.OR).toEqual([{ farmId: { in: ['f1'] } }, { warehouseId: { in: ['w1'] } }]);
    await service.build('expenses', actor(ALL, warehouses('w1')), {});
    expect(calls.expense[0].where).toEqual({ warehouseId: { in: ['w1'] } });
  });
  it('matches nothing at all for deliveries when the person holds no place', async () => {
    const { service, calls } = build();
    await service.build('deliveries', actor(ALL, []), {});
    expect(calls.shipment[0].where).toEqual({ id: { in: [] } });
  });
  it('reaches a warehouse manager\'s milling centers through their warehouse', async () => {
    const { service, calls } = build({ millingCenter: [{ id: 'mc1' }, { id: 'mc2' }] });
    await service.build('production-runs', actor(ALL, warehouses('w1')), {});
    expect(calls.millingCenter[0].where).toEqual({ warehouseId: { in: ['w1'] } });
    expect(calls.productionRecord[0].where.millingCenterId).toEqual({ in: ['mc1', 'mc2'] });
    await service.build('machine-power', actor(ALL, warehouses('w1')), {});
    expect(calls.meterReading[0].where.machine).toEqual({ millingCenterId: { in: ['mc1', 'mc2'] } });
  });
  it('looks at every milling center for someone with company-wide access, without extra lookups', async () => {
    const { service, calls } = build();
    await service.build('production-runs', actor(ALL, GLOBAL), {});
    expect(calls.productionRecord[0].where.millingCenterId).toBeUndefined();
    expect(calls.millingCenter).toBeUndefined();
  });
  it('limits stock corrections to the places the person holds, of each kind', async () => {
    const { service, calls } = build();
    await service.build('stock-corrections', actor(ALL, [...farms('f1'), ...warehouses('w1')]), {});
    expect(calls.inventoryAdjustment[0].where.OR).toEqual([{ locationType: 'FARM', locationId: { in: ['f1'] } }, { locationType: 'WAREHOUSE', locationId: { in: ['w1'] } }]);
  });
  it('never asks the database for receipt photos in the expenses report', async () => {
    const { service, calls } = build();
    await service.build('expenses', actor(ALL, GLOBAL), {});
    expect(JSON.stringify(calls.expense[0].select)).not.toContain('attachmentUrl');
  });
});

describe('asking for a report', () => {
  it('refuses a report that does not exist, and one the person\'s role does not include', async () => {
    const { service } = build();
    await expect(service.build('nope', actor(ALL, GLOBAL), {})).rejects.toThrow(NotFoundException);
    await expect(service.build('audit-log', actor([P.REPORTS_EXPORT, P.FARM_INVENTORY_VIEW], farms('f1')), {})).rejects.toThrow(ForbiddenException);
    await expect(service.build('paddy-intake', actor(ALL.filter((p) => p !== P.REPORTS_EXPORT), GLOBAL), {})).rejects.toThrow(ForbiddenException);
  });
  it('applies a date range, including the whole of the last day', async () => {
    const { service, calls } = build();
    await service.build('paddy-intake', actor(ALL, GLOBAL), { from: '2026-09-01', to: '2026-09-30' });
    expect(calls.paddyEntry[0].where.entryDate).toEqual({ gte: new Date('2026-09-01T00:00:00.000Z'), lte: new Date('2026-09-30T23:59:59.999Z') });
  });
  it.each(['30/09/2026', 'yesterday', '2026-13-45', '2026-9-1'])('refuses the date %p in plain words', async (bad) => {
    await expect(build().service.build('paddy-intake', actor(ALL, GLOBAL), { from: bad })).rejects.toThrow(/Dates must look like 2026-09-30/);
  });
  it('refuses a start date after the end date', async () => {
    await expect(build().service.build('paddy-intake', actor(ALL, GLOBAL), { from: '2026-10-01', to: '2026-09-01' })).rejects.toThrow(/start date must not be after the end date/);
  });
  it('turns database rows into readable columns', async () => {
    const { service } = build({ productionRecord: [{ recordNumber: 'PR-1', date: new Date('2026-09-02T10:00:00Z'), millingCenter: { name: 'Mill 1' }, paddyGrade: { label: 'Grade A' }, paddyProcessedKg: '10000.000', recoveredRiceKg: '6800.000', energyConsumptionKwh: '370.000', status: 'APPROVED' }] });
    const r = await service.build('production-runs', actor(ALL, GLOBAL), {});
    expect(r.rows[0]).toEqual({ Run: 'PR-1', Date: '2026-09-02', 'Milling center': 'Mill 1', Grade: 'Grade A', 'Paddy in (kg)': 10000, 'Rice out (kg)': 6800, 'Recovery (%)': 68, 'Power (kWh)': 370, Status: 'APPROVED' });
    expect(r.filenameBase).toMatch(/^production-runs-\d{4}-\d{2}-\d{2}$/);
  });
  it('names the place in a stock correction', async () => {
    const { service } = build({ inventoryAdjustment: [{ adjustmentNumber: 'ADJ-1', locationType: 'FARM', locationId: 'f1', adjustmentBags: -4, adjustmentKg: '-200', reason: 'Rats', status: 'APPROVED', requestedAt: new Date('2026-09-02'), approvedAt: null, rejectionReason: null }], farm: [{ id: 'f1', name: 'Farm A' }] });
    expect((await service.build('stock-corrections', actor(ALL, GLOBAL), {})).rows[0]).toMatchObject({ Place: 'Farm A', Bags: -4, Reason: 'Rats' });
  });
  it('says why a file is empty instead of handing over a blank one', async () => {
    expect((await build().service.build('paddy-intake', actor(ALL, GLOBAL), {})).rows).toEqual([{ Note: 'No records match your access and the dates chosen.' }]);
  });
  it('will not make a PDF too big to be useful, but will make the same report as a spreadsheet', async () => {
    const many = Array.from({ length: PDF_ROW_LIMIT + 1 }, (_, i) => ({ entryNumber: `E${i}`, entryDate: new Date('2026-09-02'), farm: { name: 'A' }, paddyGrade: { label: 'G' }, bagCount: 1, weightKg: '50', weightEstimated: false, moisturePercent: null, status: 'APPROVED', rejectionReason: null }));
    const { service } = build({ paddyEntry: many });
    await expect(service.build('paddy-intake', actor(ALL, GLOBAL), { format: 'pdf' })).rejects.toThrow(/too many for a PDF/);
    expect((await service.build('paddy-intake', actor(ALL, GLOBAL), { format: 'xlsx' })).rows).toHaveLength(PDF_ROW_LIMIT + 1);
  });
  it('lists the watchlist flags for those who may see them', async () => {
    const insights = { watchlist: jest.fn(async () => ({ signals: [{ severity: 'HIGH', locationName: 'Mill 1', title: 'Mill 1: some runs gave less rice than usual', detail: 'd', expected: '68%', actual: '59%', evidence: ['PR-1', 'PR-2'], whatToCheck: 'Compare weights' }] })) };
    const { service } = build({}, insights);
    expect((await service.build('watchlist', actor(ALL, GLOBAL), {})).rows[0]).toMatchObject({ Level: 'Look into this', Place: 'Mill 1', Records: 'PR-1; PR-2' });
  });
});

describe('a report grants exactly what the app\'s own screen for that data grants', () => {
  const SRC = join(__dirname, '..', '..');
  const find = (name: string, dir = SRC): string | null => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { if (entry !== '__tests__') { const hit = find(name, full); if (hit) return hit; } }
      else if (entry === name) return full;
    }
    return null;
  };
  /** The permissions on a controller's root `@Get()` list route. */
  const listPermissions = (file: string): string[] => {
    const lines = readFileSync(find(file) as string, 'utf8').split('\n');
    const at = lines.findIndex((l) => l.trim() === '@Get()');
    const block: string[] = [lines[at]];
    for (let i = at - 1; i >= 0 && lines[i].trim().startsWith('@'); i--) block.unshift(lines[i]);
    for (let i = at + 1; i < lines.length && lines[i].trim().startsWith('@'); i++) block.push(lines[i]);
    const names = [...block.join(' ').matchAll(/PERMISSIONS\.([A-Z_]+)/g)].map((m) => m[1]);
    return names.map((n) => (P as Record<string, string>)[n]);
  };
  const SCREEN: Record<string, string> = {
    'paddy-intake': 'paddy-entries.controller.ts', deliveries: 'shipments.controller.ts', 'stock-corrections': 'inventory-adjustments.controller.ts',
    'production-runs': 'production-records.controller.ts', 'machine-power': 'machines.controller.ts', expenses: 'expenses.controller.ts',
  };
  it.each(Object.entries(SCREEN))('%s offers the same permissions as %s', (id, file) => {
    const report = REPORTS.find((r) => r.id === id) as (typeof REPORTS)[number];
    expect([...report.anyOf].sort()).toEqual([...listPermissions(file)].sort());
  });
});
