import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { AiToolsService, TOOL_DEFS } from '../ai-tools.service';

const actorOf = (roleCode: string, scopes: { scopeType: string; scopeId: string | null }[], perms: string[]) =>
  ({ id: 'u1', firstName: 'A', lastName: 'B', roles: [{ roleId: 'r', roleCode, permissions: [], scopes }], permissionCodes: new Set(perms) }) as unknown as AuthenticatedUser;
const GLOBAL = [{ scopeType: 'GLOBAL', scopeId: null }];
const ALL = ['milling.view', 'machine.view', 'reports.view', 'finance.view', 'sales.create', 'ai.use', 'ai.view'];
const MD = actorOf('MD', GLOBAL, ALL);
const scoped = (perms: string[] = ALL, ids = ['wh-1']) => actorOf('OPERATIONS_MANAGER', ids.map((scopeId) => ({ scopeType: 'WAREHOUSE', scopeId })), perms);
const bagSizes = { paddyKg: 50, riceKg: 50, brokenKg: 50, hullKg: 20, hullBasis: 'setting' };

const run = (c: string, over: Record<string, unknown> = {}) => ({ millingCenterId: c, millingCenter: { name: c === 'c1' ? 'Mill A' : 'Mill B' }, paddyProcessedKg: 1000, energyConsumptionKwh: 25, recoveredRiceKg: 680, brokenRiceKg: 120, riceHullKg: 180, riceHullBags: 9, wasteLossKg: 20, ...over });

function build() {
  const prisma = {
    millingCenter: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Mill A', code: 'MA' }, { id: 'c2', name: 'Mill B', code: 'MB' }]) },
    productionRecord: { findMany: jest.fn().mockResolvedValue([run('c1'), run('c1'), run('c2', { paddyProcessedKg: 500, energyConsumptionKwh: null, recoveredRiceKg: 300, brokenRiceKg: 60, riceHullKg: 120, riceHullBags: null })]) },
    customer: { findMany: jest.fn().mockResolvedValue([{ id: 'cu1', name: 'Adom Enterprises' }]) },
  };
  const reports = {
    inventoryByLocation: jest.fn().mockResolvedValue({
      farms: [{ locationName: 'Farm A', itemLabel: 'Size 4', quantityKg: 5000, bagCount: 100 }],
      warehouses: [{ locationName: 'Warehouse 1', itemLabel: 'Pectra (50kg)', quantityKg: 2000, bagCount: 40 }, { locationName: 'Warehouse 1', itemLabel: 'Size 4', quantityKg: 1000, bagCount: 20 }],
      millingCenters: [],
    }),
    farmReport: jest.fn().mockResolvedValue([{ farmName: 'Farm B', approvedIntakeKg: 30000 }, { farmName: 'Farm A', approvedIntakeKg: 62500 }]),
    salesReport: jest.fn().mockResolvedValue({ totalOrders: 12, totalAmount: 450000 }),
  };
  const receivables = { topDebtors: jest.fn().mockResolvedValue([{ customerId: 'cu1', outstanding: 5000 }]) };
  const rates = (basis: string) => ({ runs: 12, basis, confidence: 'high', energyKwh: 300, paddyKg: 12000, perKwh: { paddyKg: 40, riceKg: 27.2, brokenKg: 4.8, hullKg: 7.2, wasteKg: 0.8 }, typical: null });
  const insights = {
    describeJurisdiction: jest.fn(async (j: any) => ({ companyWide: j.companyWide, label: j.companyWide ? 'Whole company' : 'Warehouse 1', farms: [], warehouses: [] })),
    bagSizes: jest.fn().mockResolvedValue(bagSizes),
    overview: jest.fn().mockResolvedValue({
      available: true, bagSizes, window: { runs: 12, from: '2026-08-01T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z' }, overall: rates('history'), overallNote: 'NOTE-ALL',
      byGrade: [{ gradeId: 'g4', code: 'SIZE_4', label: 'Size 4', rates: { ...rates('history'), perKwh: { paddyKg: 40, riceKg: 28, brokenKg: 4, hullKg: 6.8, wasteKg: 1.2 } }, note: 'NOTE-S4' }],
      byCenter: [{ centerId: 'c1', code: 'MA', name: 'Mill A', rates: { ...rates('history'), perKwh: { paddyKg: 40, riceKg: 29, brokenKg: 4.5, hullKg: 6.5, wasteKg: 0 } }, note: 'NOTE-MA' }],
    }),
    feedback: jest.fn().mockResolvedValue({
      available: true, tolerancePercent: 5, summary: { runs: 7, early: 0, more: 1, asExpected: 5, less: 1, pendingApproval: 0 },
      centers: [{ sentence: 'Mill B: 1 run, 25 kWh used. Expected 13.6 bags and got 12 (-12%), which is less than expected.' }, { sentence: 'Mill A: 6 runs, 150 kWh used. Expected 81.6 bags and got 82 (+0%), which is as expected.' }],
      runs: [{ early: false, recordNumber: 'PR-10', sentence: 'Mill B used 25 kWh ...', variance: { ricePercent: -12 } }],
      learning: { accuracyPercent: 94.5, trend: 'improving' },
    }),
  };
  const predictions = { recentAnomalies: jest.fn().mockResolvedValue({ meterAnomalies: [{ machine: { machineName: 'Huller 1' }, anomalyReason: 'Reading 80% above usual' }], productionAnomalies: [{ recordNumber: 'PR-9', millingCenter: { name: 'Mill A' } }] }) };
  return { service: new AiToolsService(prisma as any, reports as any, receivables as any, insights as any, predictions as any), prisma, reports, receivables, insights, predictions };
}

describe('the assistant\'s tools', () => {
  it('describes every tool with a name, a label, a description and an input shape', () => {
    expect(TOOL_DEFS.map((t) => t.name)).toEqual(['get_my_access', 'production_summary', 'power_yield', 'output_vs_expected', 'stock_levels', 'paddy_intake', 'sales_summary', 'top_debtors', 'pending_approvals', 'watch_outs', 'system_help']);
    TOOL_DEFS.forEach((t) => { expect(t.description.length).toBeGreaterThan(30); expect(t.input_schema).toMatchObject({ type: 'object' }); });
  });

  describe('production_summary', () => {
    it('adds up the approved runs of a period, in bags and kilograms, with a line per center', async () => {
      const { service, prisma } = build();
      const r = await service.run('production_summary', {}, MD);
      expect(r.ok).toBe(true);
      expect(r.summary).toContain('the whole company, the last 30 days: 3 approved milling runs.');
      expect(r.summary).toContain('50.0 bags of paddy (2,500 kg)');
      expect(r.summary).toContain('33.2 bags of packaged rice (1,660 kg)');
      expect(r.summary).toContain('6.00 bags of broken rice (300 kg)');
      expect(r.summary).toContain('24.0 bags of hull (480 kg)');
      expect(r.summary).toContain('Recovery was 66.4%.');
      expect(r.summary).toContain('Power recorded: 50 kWh across 2 runs.');
      expect(r.summary).toContain('By center: Mill A 2 runs, 2,000 kg paddy, 1,360 kg rice (68.0%); Mill B 1 run, 500 kg paddy, 300 kg rice (60.0%).');
      const where = prisma.productionRecord.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ status: 'APPROVED' });
      expect(where.date.gte).toBeInstanceOf(Date);
      expect(where.millingCenter).toBeUndefined();
    });
    it('uses the period and the milling center named', async () => {
      const { service, prisma } = build();
      const r = await service.run('production_summary', { period: 'last_week', milling_center: 'mill a' }, MD);
      expect(r.period).toBe('last week (Monday to Sunday)');
      expect(prisma.productionRecord.findMany.mock.calls[0][0].where).toMatchObject({ millingCenterId: 'c1' });
    });
    it('says so, and lists the centers, when the center named does not exist in the jurisdiction', async () => {
      const r = await build().service.run('production_summary', { milling_center: 'Mill Z' }, MD);
      expect(r.ok).toBe(false);
      expect(r.summary).toMatch(/could not find a milling center called "Mill Z".*Mill A, Mill B/);
    });
    it('reports honestly when nothing was recorded', async () => {
      const { service, prisma } = build(); prisma.productionRecord.findMany.mockResolvedValue([]);
      expect((await service.run('production_summary', { period: 'yesterday' }, MD)).summary).toBe('No approved milling runs were recorded in yesterday for the whole company.');
    });
    it('only reads the milling centers at a scoped person\'s own warehouses', async () => {
      const { service, prisma } = build();
      await service.run('production_summary', {}, scoped());
      expect(prisma.productionRecord.findMany.mock.calls[0][0].where.millingCenter).toEqual({ warehouseId: { in: ['wh-1'] } });
      expect(prisma.millingCenter.findMany).not.toHaveBeenCalled(); // no center was named
    });
    it('only looks for a named center among the person\'s own', async () => {
      const { service, prisma } = build();
      await service.run('production_summary', { milling_center: 'Mill B' }, scoped());
      expect(prisma.millingCenter.findMany.mock.calls[0][0].where.warehouseId).toEqual({ in: ['wh-1'] });
    });
    it('reads nothing for a person with no warehouse, and is refused to a role without milling access', async () => {
      const { service, prisma } = build();
      const none = await service.run('production_summary', {}, scoped(ALL, []));
      expect(none.summary).toMatch(/No milling center is assigned to you yet/);
      const noMilling = await service.run('production_summary', {}, scoped(['reports.view']));
      expect(noMilling).toMatchObject({ ok: false, denied: true });
      expect(prisma.productionRecord.findMany).not.toHaveBeenCalled();
    });
  });

  describe('power_yield', () => {
    it('says what 1 kWh gives, and where that comes from', async () => {
      const r = await build().service.run('power_yield', {}, MD);
      expect(r.summary).toContain('for the whole company, 1 kWh of power mills about 40.0 kg of paddy and should give 0.54 bags of packaged rice (27.2 kg), 0.10 bags of broken rice (4.8 kg) and 0.36 bags of hull (7.2 kg). NOTE-ALL');
      expect(r.confidencePercent).toBe(85);
    });
    it('can be asked about one grade or one milling center', async () => {
      const { service } = build();
      expect((await service.run('power_yield', { grade: 'Size 4' }, MD)).summary).toContain('for grade Size 4');
      expect((await service.run('power_yield', { milling_center: 'Mill A' }, MD)).summary).toContain('for Mill A, 1 kWh of power mills about 40.0 kg of paddy and should give 0.58 bags');
      expect((await service.run('power_yield', { milling_center: 'Mill Q' }, MD)).ok).toBe(false);
    });
    it('is refused to a role that cannot see milling figures', async () => {
      expect(await build().service.run('power_yield', {}, scoped(['ai.use']))).toMatchObject({ denied: true });
    });
  });

  describe('output_vs_expected', () => {
    it('tells the MD whether each milling center gave more than, as much as, or less than expected', async () => {
      const { service, insights } = build();
      const r = await service.run('output_vs_expected', { period: 'this_month', milling_center: 'Mill A' }, MD);
      expect(insights.feedback).toHaveBeenCalledWith(MD, { days: expect.any(Number), millingCenterId: 'c1' });
      expect(r.summary).toContain('7 milling runs in this month: 5 as expected, 1 more than expected, 1 less than expected.');
      expect(r.summary).toContain('Mill B: 1 run, 25 kWh used.');
      expect(r.summary).toContain('The biggest difference was PR-10: Mill B used 25 kWh');
      expect(r.summary).toContain('about 94.5% accurate on its latest runs (improving)');
    });
    it('says early estimates are not real verdicts, and when there is nothing to compare', async () => {
      const { service, insights } = build();
      insights.feedback.mockResolvedValueOnce({ available: true, tolerancePercent: 5, summary: { runs: 2, early: 2, more: 0, asExpected: 0, less: 0, pendingApproval: 1 }, centers: [], runs: [], learning: { accuracyPercent: null, trend: 'learning' } });
      const r = await service.run('output_vs_expected', {}, MD);
      expect(r.summary).toContain('2 early estimates (not enough history yet to judge)');
      expect(r.summary).toContain('1 still waiting for approval');
      expect(r.summary).toContain('still learning, so it has no accuracy figure yet');
      insights.feedback.mockResolvedValueOnce({ available: true, tolerancePercent: 5, summary: { runs: 0, early: 0, more: 0, asExpected: 0, less: 0, pendingApproval: 0 }, centers: [], runs: [], learning: {} });
      expect((await service.run('output_vs_expected', {}, MD)).summary).toMatch(/No milling runs with a power reading were recorded/);
    });
    it('is refused to a role without milling access, and a center outside the jurisdiction is not found', async () => {
      const { service, insights } = build();
      expect(await service.run('output_vs_expected', {}, scoped(['ai.use']))).toMatchObject({ denied: true });
      const r = await service.run('output_vs_expected', { milling_center: 'Mill B' }, scoped());
      expect(insights.feedback).toHaveBeenCalledWith(expect.anything(), { days: 30, millingCenterId: 'c2' });
      expect(r.ok).toBe(true);
    });
  });

  describe('stock_levels, paddy_intake, pending_approvals, watch_outs', () => {
    it('reports stock by place, biggest first, and can be narrowed to one place', async () => {
      const { service, reports } = build();
      const r = await service.run('stock_levels', {}, MD);
      expect(r.summary).toMatch(/^Stock at 2 places: Farm A holds 5,000 kg \(Size 4 5,000 kg, 100 bags\)\. Warehouse 1 holds 3,000 kg \(Pectra \(50kg\) 2,000 kg, 40 bags; Size 4 1,000 kg, 20 bags\)\.$/);
      expect((await service.run('stock_levels', { location: 'warehouse' }, MD)).summary).toMatch(/^Stock at 1 place: Warehouse 1/);
      expect((await service.run('stock_levels', { location: 'nowhere' }, MD)).summary).toMatch(/found no stock/);
      expect(reports.inventoryByLocation).toHaveBeenCalledWith(MD); // the report applies the person's own places
      expect(await service.run('stock_levels', {}, actorOf('X', GLOBAL, []))).toMatchObject({ denied: true });
    });
    it('reports approved paddy intake for the period, asking the report as the real person', async () => {
      const { service, reports } = build();
      const r = await service.run('paddy_intake', { period: 'this_month' }, scoped());
      expect(r.summary).toBe('Approved paddy intake in this month: 92,500 kg across 2 farms. Farm A 62,500 kg; Farm B 30,000 kg.');
      const [filters, who] = reports.farmReport.mock.calls[0];
      expect(filters.from).toMatch(/^\d{4}-\d{2}-01T00:00:00\.000Z$/);
      expect(who.roles[0].scopes).toEqual([{ scopeType: 'WAREHOUSE', scopeId: 'wh-1' }]);
    });
    it('counts runs waiting for approval by milling center', async () => {
      const { service, prisma } = build();
      prisma.productionRecord.findMany.mockResolvedValue([run('c1'), run('c1'), run('c2')]);
      expect((await service.run('pending_approvals', {}, MD)).summary).toBe('3 milling runs are waiting for approval: Mill A 2; Mill B 1.');
      expect(prisma.productionRecord.findMany.mock.calls[0][0].where.status).toBe('SUBMITTED');
      prisma.productionRecord.findMany.mockResolvedValue([]);
      expect((await service.run('pending_approvals', {}, MD)).summary).toBe('No milling runs are waiting for approval.');
    });
    it('lists unusual readings and runs that did not add up', async () => {
      const r = await build().service.run('watch_outs', {}, MD);
      expect(r.summary).toBe('In the last 30 days: 1 unusual power reading and 1 milling run that did not add up. Power: Huller 1 (Reading 80% above usual). Runs: PR-9 at Mill A.');
      expect(await build().service.run('watch_outs', {}, actorOf('X', GLOBAL, ['ai.use']))).toMatchObject({ denied: true });
    });
  });

  describe('sales_summary and top_debtors: whole-company money figures', () => {
    it('answers the MD, with the period asked for', async () => {
      const { service, reports, receivables } = build();
      expect((await service.run('sales_summary', { period: 'last_month' }, MD)).summary).toBe('last month: 12 fulfilled orders totalling GHS 450,000.00.');
      expect(reports.salesReport.mock.calls[0][0].from).toMatch(/^\d{4}-\d{2}-01T/);
      expect((await service.run('top_debtors', {}, MD)).summary).toBe('Top outstanding balances: Adom Enterprises GHS 5000.00.');
      expect(receivables.topDebtors).toHaveBeenCalledWith(5);
    });
    it('is refused to a role without finance access, even company-wide, and never given to someone limited to their own places', async () => {
      const { service, reports, receivables } = build();
      const noFinance = actorOf('OPERATIONS_MANAGER', GLOBAL, ['ai.use', 'milling.view']);
      expect(await service.run('sales_summary', {}, noFinance)).toMatchObject({ denied: true });
      expect(await service.run('top_debtors', {}, noFinance)).toMatchObject({ denied: true });
      const own = await service.run('top_debtors', {}, scoped());
      expect(own).toMatchObject({ denied: true });
      expect(own.summary).toMatch(/whole company/);
      expect(await service.run('sales_summary', {}, scoped())).toMatchObject({ denied: true });
      expect(reports.salesReport).not.toHaveBeenCalled();
      expect(receivables.topDebtors).not.toHaveBeenCalled();
    });
  });

  describe('get_my_access and system_help', () => {
    it('says who is asking, what they can see, and what can be looked up', async () => {
      const r = await build().service.run('get_my_access', {}, scoped(['milling.view', 'reports.view', 'finance.view']));
      expect(r.summary).toContain('signed in as OPERATIONS_MANAGER. You can see: Warehouse 1.');
      expect(r.summary).toContain('stock and paddy intake');
      expect(r.summary).toContain('not available when you are limited to your own places');
    });
    it('answers how-to questions from the guide, and says plainly when it has none', async () => {
      const { service } = build();
      const hit = await service.run('system_help', { topic: 'how does a sale get approved' }, MD);
      expect(hit.summary).toContain('Finance Director');
      expect(hit.confidencePercent).toBe(90);
      const miss = await service.run('system_help', { topic: 'purple monkey dishwasher' }, MD);
      expect(miss.summary).toMatch(/^I do not have a guide for that\. I can explain:/);
      expect(miss.confidencePercent).toBe(30);
    });
  });

  describe('run(): failures are contained', () => {
    it('turns a refusal from deeper in the system into a "denied" result, and anything else into a plain apology', async () => {
      const { service, insights, prisma } = build();
      insights.overview.mockRejectedValueOnce(new ForbiddenException('Not for you.'));
      expect(await service.run('power_yield', {}, MD)).toMatchObject({ ok: false, denied: true, summary: 'Not for you.' });
      prisma.productionRecord.findMany.mockRejectedValueOnce(new Error('database exploded'));
      const r = await service.run('production_summary', {}, MD);
      expect(r).toMatchObject({ ok: false });
      expect(r.denied).toBeUndefined();
      expect(r.summary).not.toMatch(/exploded/); // internals are never shown
      expect(await service.run('nope', {}, MD)).toMatchObject({ ok: false });
    });
  });

  it('finds the milling center a question names, within the person\'s own places', async () => {
    const { service, prisma } = build();
    expect(await service.centerNamedIn(MD, 'How is mill a doing this month?')).toBe('Mill A');
    expect(await service.centerNamedIn(MD, 'what about MB?')).toBe('Mill B');
    expect(await service.centerNamedIn(MD, 'Which farm is best?')).toBeUndefined();
    await service.centerNamedIn(scoped(), 'how is mill a');
    expect(prisma.millingCenter.findMany.mock.calls[3][0].where.warehouseId).toEqual({ in: ['wh-1'] });
  });
});
