import { AiAssistantService } from '../ai-assistant.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { ReportsService } from '../../reports/reports.service';
import { ReceivablesService } from '../../finance/receivables.service';
import { AiInsightsService } from '../ai-insights.service';
import { benchmarkRates, ratesFromRuns } from '../ai-yield.util';

const actorOf = (roleCode: string, scopes: { scopeType: string; scopeId: string | null }[], perms: string[]) =>
  ({ id: 'u1', roles: [{ roleId: 'r', roleCode, permissions: [], scopes }], permissionCodes: new Set(perms) }) as unknown as AuthenticatedUser;
const GLOBAL = [{ scopeType: 'GLOBAL', scopeId: null }];
const ALL = ['reports.view', 'milling.view', 'finance.view', 'sales.create', 'ai.use'];
const MD = actorOf('MD', GLOBAL, ALL);
const scoped = (perms: string[], ids = ['wh-1']) => actorOf('OPERATIONS_MANAGER', ids.map((scopeId) => ({ scopeType: 'WAREHOUSE', scopeId })), perms);

const run = { paddyKg: 1000, energyKwh: 25, riceKg: 680, brokenKg: 120, hullKg: 180, wasteKg: 20 };
const bagSizes = { paddyKg: 50, riceKg: 50, brokenKg: 50, hullKg: 20, hullBasis: 'setting' as const };

describe('AiAssistantService', () => {
  function buildService(overview: any = { available: true, overall: ratesFromRuns(Array(12).fill(run)), bagSizes, window: { runs: 12, from: '2026-08-01T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z' } }) {
    const prisma = {
      customer: { findMany: jest.fn().mockResolvedValue([{ id: 'cust-1', name: 'Adom Enterprises' }]) },
      productionRecord: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { recoveredRiceKg: 0 } }) },
      inventoryBalance: { findMany: jest.fn().mockResolvedValue([{ quantityKg: 1200 }, { quantityKg: 300 }]) },
    };
    const reports = {
      executiveSummary: jest.fn().mockResolvedValue({ totalPaddyAvailableKg: 105000, paddyInTransitKg: 20000 }),
      farmReport: jest.fn().mockResolvedValue([
        { farmName: 'Farm A', farmCode: 'FARM_A', approvedIntakeKg: 62500 },
        { farmName: 'Farm B', farmCode: 'FARM_B', approvedIntakeKg: 30000 },
      ]),
      salesReport: jest.fn().mockResolvedValue({ totalOrders: 12, totalAmount: 450000 }),
    } as unknown as ReportsService;
    const receivables = { topDebtors: jest.fn().mockResolvedValue([{ customerId: 'cust-1', outstanding: 5000 }]) } as unknown as ReceivablesService;
    const insights = {
      describeJurisdiction: jest.fn(async (j: any) => ({ companyWide: j.companyWide, label: j.companyWide ? 'Whole company' : 'Warehouse 1', farms: [], warehouses: [] })),
      overview: jest.fn().mockResolvedValue(overview),
    } as unknown as AiInsightsService;
    // The wider lookups and Claude are faked here; their own tests cover them. By default Claude is not connected.
    const tools = {
      run: jest.fn(async (name: string) => (name === 'system_help' ? { ok: true, summary: 'no guide', source: 'guide', period: 'N/A', confidencePercent: 30 } : { ok: true, summary: 'TOOL-SUMMARY', source: 'SRC', period: 'PERIOD', confidencePercent: 90 })),
      centerNamedIn: jest.fn().mockResolvedValue(undefined),
    };
    const agent = { ask: jest.fn().mockResolvedValue(null) };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    return { service: new AiAssistantService(prisma as any, reports, receivables, insights, tools as any, agent as any, audit as any), prisma, reports, receivables, insights, tools, agent, audit };
  }

  describe('the whole company (MD, CEO)', () => {
    it('answers paddy stock company-wide, and says whose activities it covers', async () => {
      const { service, reports } = buildService();
      const r = await service.ask({ question: 'What is the current paddy stock?' }, MD);
      expect(r.answer).toContain('105000 KG across all active farms');
      expect(r.answer).toContain('20000 KG is currently in transit');
      expect(r.confidencePercent).toBe(100);
      expect(r.jurisdiction).toBe('Whole company');
      expect(reports.executiveSummary).toHaveBeenCalled();
    });

    it('ranks every farm for "highest output", asking the report as the real person, not as a stand-in company-wide user', async () => {
      const { service, reports } = buildService();
      const r = await service.ask({ question: 'Which farm has the highest output?' }, MD);
      expect(r.answer).toContain('Farm A (FARM_A)');
      expect(r.answer).not.toContain('in your jurisdiction');
      expect((reports.farmReport as jest.Mock).mock.calls[0][1]).toBe(MD);
    });

    it('answers debtors, sales, recovery and production', async () => {
      const { service } = buildService();
      expect((await service.ask({ question: 'Which customers owe us money?' }, MD)).answer).toContain('Adom Enterprises: GHS 5000.00');
      expect((await service.ask({ question: 'What is our sales performance this month?' }, MD)).answer).toContain('12 fulfilled order(s) totaling GHS 450000.00');
      expect((await service.ask({ question: 'What is the recovery rate this period?' }, MD)).answer).toContain('No approved production records');
      expect((await service.ask({ question: 'production this month' }, MD)).answer).toContain('0 KG of rice recovered');
    });

    it('does not filter production by place', async () => {
      const { service, prisma } = buildService();
      await service.ask({ question: 'production this month' }, MD);
      expect(prisma.productionRecord.aggregate.mock.calls[0][0].where.millingCenter).toBeUndefined();
    });
  });

  describe('what 1 kWh of power produces', () => {
    it('says how many bags of packaged rice, broken rice and hull 1 kWh should give', async () => {
      const { service } = buildService();
      const r = await service.ask({ question: 'What does 1 kWh of power produce?' }, MD);
      expect(r.answer).toContain('1 kWh of power mills about 40.0 kg of paddy');
      expect(r.answer).toContain('0.54 bags of packaged rice (27.2 kg)');
      expect(r.answer).toContain('0.10 bags of broken rice (4.8 kg)');
      expect(r.answer).toContain('0.36 bags of hull (7.2 kg)');
      expect(r.confidencePercent).toBe(85);
      expect(r.dateRange).toBe('2026-08-01 to 2026-09-30');
    });
    it('says it is a benchmark, with low confidence, when there is too little history', async () => {
      const { service } = buildService({ available: true, overall: benchmarkRates(1), bagSizes, window: { runs: 1, from: null, to: null } });
      const r = await service.ask({ question: 'how much does electricity give' }, MD);
      expect(r.answer).toMatch(/^On an industry benchmark, 1 kWh/);
      expect(r.confidencePercent).toBe(25);
      expect(r.sourceData).toMatch(/benchmark/);
    });
    it('is refused to a role that cannot see milling figures', async () => {
      const { service, insights } = buildService();
      const r = await service.ask({ question: 'what does 1 kwh give' }, scoped(['ai.use']));
      expect(r.answer).toMatch(/does not include milling figures/);
      expect(insights.overview).not.toHaveBeenCalled();
    });
  });

  describe('a person with their own places only', () => {
    it('answers paddy stock from their own farms and warehouses, never the company total', async () => {
      const { service, prisma, reports } = buildService();
      const r = await service.ask({ question: 'What is the current paddy stock?' }, scoped(['reports.view']));
      expect(r.answer).toContain('in your jurisdiction (Warehouse 1): 1500 KG');
      expect(r.jurisdiction).toBe('Warehouse 1');
      expect(reports.executiveSummary).not.toHaveBeenCalled();
      expect(prisma.inventoryBalance.findMany.mock.calls[0][0].where.OR).toEqual([{ locationType: 'WAREHOUSE', locationId: { in: ['wh-1'] } }]);
    });
    it('has nothing to report when no farm or warehouse is assigned yet', async () => {
      const { service, prisma } = buildService();
      const r = await service.ask({ question: 'current paddy stock' }, scoped(['reports.view'], []));
      expect(r.answer).toMatch(/nothing to report in your jurisdiction/);
      expect(prisma.inventoryBalance.findMany).not.toHaveBeenCalled();
    });
    it('ranks only their own farms', async () => {
      const { service, reports } = buildService();
      const r = await service.ask({ question: 'Which farm has the highest output?' }, scoped(['reports.view']));
      expect(r.answer).toContain('among the farms in your jurisdiction');
      expect((reports.farmReport as jest.Mock).mock.calls[0][1].roles[0].scopes).toEqual([{ scopeType: 'WAREHOUSE', scopeId: 'wh-1' }]);
    });
    it('reads production only at their own milling centers', async () => {
      const { service, prisma } = buildService();
      await service.ask({ question: 'recovery rate' }, scoped(['milling.view']));
      await service.ask({ question: 'production this month' }, scoped(['milling.view']));
      expect(prisma.productionRecord.findMany.mock.calls[0][0].where.millingCenter).toEqual({ warehouseId: { in: ['wh-1'] } });
      expect(prisma.productionRecord.aggregate.mock.calls[0][0].where.millingCenter).toEqual({ warehouseId: { in: ['wh-1'] } });
    });
    it('reads no production at all when they have no warehouse', async () => {
      const { service, prisma } = buildService();
      const r = await service.ask({ question: 'recovery rate' }, scoped(['milling.view'], []));
      expect(r.answer).toMatch(/No milling centers are assigned/);
      expect(prisma.productionRecord.findMany).not.toHaveBeenCalled();
    });
    it('is told, not given the figures, for company-wide money questions, even with the finance permission', async () => {
      const { service, receivables, reports } = buildService();
      const owe = await service.ask({ question: 'Which customers owe us money?' }, scoped(['finance.view']));
      const sales = await service.ask({ question: 'sales performance this month' }, scoped(['finance.view']));
      expect(owe.answer).toMatch(/tracked for the whole company.*Your jurisdiction is: Warehouse 1/);
      expect(sales.answer).toMatch(/Sales figures are tracked for the whole company/);
      expect(receivables.topDebtors).not.toHaveBeenCalled();
      expect(reports.salesReport).not.toHaveBeenCalled();
    });
  });

  describe('the assistant is never a way round a permission', () => {
    it('refuses debtors and sales to a role without finance access, even to someone with company-wide scope', async () => {
      const { service, receivables, reports } = buildService();
      const ops = actorOf('OPERATIONS_MANAGER', GLOBAL, ['ai.use', 'reports.view', 'milling.view']);
      expect((await service.ask({ question: 'who owes us money' }, ops)).answer).toMatch(/does not include finance figures/);
      expect((await service.ask({ question: 'sales this month' }, ops)).answer).toMatch(/does not include sales figures/);
      expect(receivables.topDebtors).not.toHaveBeenCalled();
      expect(reports.salesReport).not.toHaveBeenCalled();
    });
    it('refuses production questions to a role without milling access', async () => {
      const { service, prisma } = buildService();
      const noMilling = actorOf('SALES_OFFICER', GLOBAL, ['ai.use', 'reports.view']);
      expect((await service.ask({ question: 'recovery rate' }, noMilling)).confidencePercent).toBe(0);
      expect((await service.ask({ question: 'production this month' }, noMilling)).answer).toMatch(/does not include milling figures/);
      expect(prisma.productionRecord.findMany).not.toHaveBeenCalled();
    });
  });

  it('says honestly when it does not recognise a question, and lists what it does', async () => {
    const { service } = buildService();
    const r = await service.ask({ question: 'What is the meaning of life?' }, MD);
    expect(r.confidencePercent).toBe(0);
    expect(r.answer).toContain('1 kWh of power produces');
    expect(r.answer).toContain('current paddy stock');
  });
});

describe('AiAssistantService: the wider set of questions, and Claude when connected', () => {
  const build2 = () => {
    const prisma = { customer: { findMany: jest.fn() }, productionRecord: { findMany: jest.fn(), aggregate: jest.fn() }, inventoryBalance: { findMany: jest.fn() } };
    const reports = { executiveSummary: jest.fn(), farmReport: jest.fn(), salesReport: jest.fn() } as unknown as ReportsService;
    const receivables = { topDebtors: jest.fn() } as unknown as ReceivablesService;
    const insights = { describeJurisdiction: jest.fn(async (j: any) => ({ companyWide: j.companyWide, label: j.companyWide ? 'Whole company' : 'Warehouse 1', farms: [], warehouses: [] })), overview: jest.fn() } as unknown as AiInsightsService;
    const tools = {
      run: jest.fn(async (name: string) => (name === 'system_help' ? { ok: true, summary: 'GUIDE-TEXT', source: 'The KAM-ROMS guide', period: 'N/A', confidencePercent: 90 } : { ok: true, summary: 'TOOL-SUMMARY', source: 'SRC', period: 'PERIOD', confidencePercent: 90 })),
      centerNamedIn: jest.fn().mockResolvedValue(undefined),
    };
    const agent = { ask: jest.fn().mockResolvedValue(null) };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    return { service: new AiAssistantService(prisma as any, reports, receivables, insights, tools as any, agent as any, audit as any), tools, agent, audit };
  };

  it.each([
    ['How is Mill A doing this month against what was expected?', 'output_vs_expected', { period: 'this_month', milling_center: 'Mill A' }],
    ['Did Mill A deliver what was expected last week?', 'output_vs_expected', { period: 'last_week', milling_center: 'Mill A' }],
    ['How much rice did we produce last week?', 'production_summary', { period: 'last_week', milling_center: 'Mill A' }],
    ['How much rice is in stock at Mill A?', 'stock_levels', { location: 'Mill A' }],
    ['What was the paddy intake last month?', 'paddy_intake', { period: 'last_month' }],
    ['What is waiting for approval?', 'pending_approvals', {}],
    ['Are there any unusual readings?', 'watch_outs', {}],
    ['What can I see here?', 'get_my_access', {}],
  ])('"%s" is answered by the %s lookup', async (question, tool, args) => {
    const { service, tools } = build2();
    tools.centerNamedIn.mockResolvedValue('Mill A');
    const r = await service.ask({ question: question as string }, MD);
    expect(tools.run).toHaveBeenCalledWith(tool, args, MD);
    expect(r).toMatchObject({ answer: 'TOOL-SUMMARY', engine: 'built-in', jurisdiction: 'Whole company', sourceData: 'SRC', confidencePercent: 90 });
    expect(r.toolsUsed![0].name).toBe(tool);
  });

  it('answers a "how do I" question from the guide even when it mentions milling', async () => {
    const { service, tools } = build2();
    const r = await service.ask({ question: 'How do I record a milling run?' }, MD);
    expect(tools.run).toHaveBeenCalledWith('system_help', { topic: 'How do I record a milling run?' }, MD);
    expect(r).toMatchObject({ answer: 'GUIDE-TEXT', toolsUsed: [{ name: 'system_help' }] });
    expect(tools.run).not.toHaveBeenCalledWith('production_summary', expect.anything(), expect.anything());
  });

  it('uses Claude when it is connected, and says so, with the lookups it made', async () => {
    const { service, tools, agent, audit } = build2();
    agent.ask.mockResolvedValue({ answer: 'Mill A made 33 bags.', toolsUsed: [{ name: 'production_summary', label: 'Production summary', period: 'last week' }], sources: ['Approved milling runs'], periods: ['last week'], confidencePercent: 90 });
    const history = [{ role: 'user' as const, text: 'earlier' }];
    const r = await service.ask({ question: 'And Mill B?', history }, MD);
    expect(agent.ask).toHaveBeenCalledWith('And Mill B?', history, MD);
    expect(r).toMatchObject({ answer: 'Mill A made 33 bags.', engine: 'claude', jurisdiction: 'Whole company', sourceData: 'Approved milling runs', dateRange: 'last week', confidencePercent: 90 });
    expect(r.assumptions).toMatch(/Answered by Claude using only the figures the system looked up for you/);
    expect(tools.run).not.toHaveBeenCalled(); // the built-in answerer was not needed
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', action: 'ai.ask', entity: 'AiAssistant', afterValue: { question: 'And Mill B?', engine: 'claude', tools: ['production_summary'] } }));
  });

  it('falls back to the built-in answerer when Claude is not connected or fails, and records the question either way', async () => {
    const { service, audit } = build2();
    const r = await service.ask({ question: 'What is waiting for approval?' }, MD);
    expect(r.engine).toBe('built-in');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ afterValue: { question: 'What is waiting for approval?', engine: 'built-in', tools: ['pending_approvals'] } }));
  });

  it('does not let a failure to record the question break the answer', async () => {
    const { service, audit } = build2();
    audit.record.mockRejectedValue(new Error('audit down'));
    await expect(service.ask({ question: 'What is waiting for approval?' }, MD)).resolves.toMatchObject({ engine: 'built-in' });
  });
});
