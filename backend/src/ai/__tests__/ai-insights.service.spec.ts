import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { AiInsightsService } from '../ai-insights.service';

const actorOf = (roleCode: string, scopes: { scopeType: string; scopeId: string | null }[], perms: string[] = ['milling.view', 'ai.view', 'ai.use']) =>
  ({ id: 'u1', roles: [{ roleId: 'r', roleCode, permissions: [], scopes }], permissionCodes: new Set(perms) }) as unknown as AuthenticatedUser;
const MD = actorOf('MD', [{ scopeType: 'GLOBAL', scopeId: null }]);
const OPS = (ids: string[]) => actorOf('OPERATIONS_MANAGER', ids.map((scopeId) => ({ scopeType: 'WAREHOUSE', scopeId })));

// 1,000 kg of paddy -> 25 kWh -> 680 rice, 120 broken, 180 hull (9 bags of 20 kg), 20 waste
const row = (over: Record<string, unknown> = {}) => ({
  date: new Date('2026-09-15'), paddyGradeId: 'g1', millingCenterId: 'c1', paddyProcessedKg: 1000, energyConsumptionKwh: 25,
  recoveredRiceKg: 680, brokenRiceKg: 120, riceHullKg: 180, riceHullBags: 9, wasteLossKg: 20,
  paddyGrade: { code: 'SIZE_4', label: 'Size 4' }, millingCenter: { code: 'MC1', name: 'Mill 1' }, ...over,
});
const rows = (n: number, over: Record<string, unknown> = {}) => Array.from({ length: n }, () => row(over));

function build(records: unknown[], settings?: Record<string, number>) {
  const prisma = {
    productionRecord: { findMany: jest.fn().mockResolvedValue(records) },
    millingCenter: { findUnique: jest.fn().mockResolvedValue({ warehouseId: 'wh-1' }) },
    warehouse: { findMany: jest.fn().mockResolvedValue([{ name: 'Warehouse 1' }]) },
    farm: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const settingsSvc = settings ? ({ getNumber: jest.fn(async (k: string) => settings[k]) } as any) : undefined;
  return { service: new AiInsightsService(prisma as any, settingsSvc), prisma };
}

describe('AiInsightsService.overview', () => {
  it('shows the whole company to the MD, from approved runs that recorded their power', async () => {
    const { service, prisma } = build(rows(12));
    const out: any = await service.overview(MD);
    expect(out.available).toBe(true);
    expect(out.jurisdiction).toEqual({ companyWide: true, label: 'Whole company', farms: [], warehouses: [] });
    expect(out.overall.perKwh.riceKg).toBe(27.2);
    expect(out.window.runs).toBe(12);
    expect(out.overallNote).toMatch(/Based on 12 approved milling runs for the whole company/);
    const where = prisma.productionRecord.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'APPROVED', energyConsumptionKwh: { gt: 0 }, paddyProcessedKg: { gt: 0 } });
    expect(where.millingCenter).toBeUndefined(); // no jurisdiction filter for the MD
  });

  it('limits a scoped person to the runs at their own warehouses, and names their places', async () => {
    const { service, prisma } = build(rows(5));
    const out: any = await service.overview(OPS(['wh-1']));
    expect(prisma.productionRecord.findMany.mock.calls[0][0].where.millingCenter).toEqual({ warehouseId: { in: ['wh-1'] } });
    expect(out.jurisdiction).toMatchObject({ companyWide: false, label: 'Warehouse 1', warehouses: ['Warehouse 1'] });
  });

  it('shows nothing, and does not even query, for a person with no warehouse', async () => {
    const { service, prisma } = build(rows(5));
    const out: any = await service.overview(OPS([]));
    expect(prisma.productionRecord.findMany).not.toHaveBeenCalled();
    expect(out.available).toBe(true);
    expect(out.window.runs).toBe(0);
    expect(out.overall.basis).toBe('benchmark');
    expect(out.jurisdiction.label).toBe('No places assigned yet');
  });

  it('is unavailable, with the reason, to a role that cannot see milling figures', async () => {
    const { service, prisma } = build(rows(5));
    const out: any = await service.overview(actorOf('FINANCE_DIRECTOR', [{ scopeType: 'GLOBAL', scopeId: null }], ['ai.view']));
    expect(out.available).toBe(false);
    expect(out.reason).toMatch(/does not include milling figures/);
    expect(prisma.productionRecord.findMany).not.toHaveBeenCalled();
  });

  it('breaks the figures down by grade and by milling center, best centers first', async () => {
    const good = rows(6, { millingCenterId: 'c1', millingCenter: { code: 'MC1', name: 'Mill 1' } });
    const poor = rows(6, { millingCenterId: 'c2', millingCenter: { code: 'MC2', name: 'Mill 2' }, recoveredRiceKg: 600, paddyGradeId: 'g2', paddyGrade: { code: 'SIZE_6', label: 'Size 6' } });
    const out: any = await build([...good, ...poor]).service.overview(MD);
    expect(out.byCenter.map((c: any) => c.name)).toEqual(['Mill 1', 'Mill 2']);
    expect(out.byCenter[0].rates.perKwh.riceKg).toBeGreaterThan(out.byCenter[1].rates.perKwh.riceKg);
    expect(out.byGrade.map((g: any) => g.label)).toEqual(['Size 4', 'Size 6']);
    expect(out.byGrade[1].rates.runs).toBe(6);
    expect(out.byCenter[1].note).toMatch(/for Mill 2/);
  });

  it('uses the System Administrator\'s bag weights, and the hull weight the runs actually show once there are enough of them', async () => {
    const withBags = (await build(rows(12), { 'paddy.standard_bag_kg': 80, 'ai.rice_bag_kg': 25, 'ai.broken_bag_kg': 10, 'ai.hull_bag_kg': 30 }).service.overview(MD)) as any;
    expect(withBags.bagSizes).toEqual({ paddyKg: 80, riceKg: 25, brokenKg: 10, hullKg: 20, hullBasis: 'history' }); // 180 kg / 9 bags
    const noHullBags = (await build(rows(12, { riceHullBags: null }), { 'paddy.standard_bag_kg': 80, 'ai.rice_bag_kg': 25, 'ai.broken_bag_kg': 10, 'ai.hull_bag_kg': 30 }).service.overview(MD)) as any;
    expect(noHullBags.bagSizes).toMatchObject({ hullKg: 30, hullBasis: 'setting' });
  });

  it('falls back to the built-in default bag weights when no settings service is available', async () => {
    const out: any = await build(rows(12)).service.overview(MD);
    expect(out.bagSizes).toMatchObject({ paddyKg: 50, riceKg: 50, brokenKg: 50 });
  });
});

describe('AiInsightsService.predictFromEnergy / predictFromPaddy', () => {
  it('says how many bags of packaged rice, broken rice and hull a given amount of power should give', async () => {
    const out = await build(rows(12)).service.predictFromEnergy({ kwh: 100 }, MD);
    expect(out.outputs).toMatchObject({ kwh: 100, riceBags: 54.4, brokenBags: 9.6, hullBags: 36, paddyBags: 80 });
    expect(out.basis).toBe('history');
    expect(out.confidence).toBe('high');
    expect(out.sampleSize).toBe(12);
    expect(out.assumptions).toMatch(/Based on 12 approved milling runs/);
    expect(out.jurisdiction).toBe('Whole company');
  });

  it('works backwards from bags of paddy to the power needed', async () => {
    const out = await build(rows(12)).service.predictFromPaddy({ bags: 80 }, MD);
    expect(out.outputs.kwh).toBe(100);
    expect(out.outputs.riceBags).toBe(54.4);
  });

  it('narrows to the grade and milling center asked for', async () => {
    const { service, prisma } = build(rows(12));
    await service.predictFromEnergy({ kwh: 1, paddyGradeId: 'g1', millingCenterId: 'c1' }, MD);
    expect(prisma.productionRecord.findMany.mock.calls[0][0].where).toMatchObject({ paddyGradeId: 'g1', millingCenterId: 'c1' });
  });

  it('refuses a milling center outside the asker\'s jurisdiction, before reading any production data', async () => {
    const { service, prisma } = build(rows(12));
    prisma.millingCenter.findUnique.mockResolvedValue({ warehouseId: 'wh-OTHER' });
    await expect(service.predictFromEnergy({ kwh: 1, millingCenterId: 'c-other' }, OPS(['wh-1']))).rejects.toThrow(ForbiddenException);
    expect(prisma.productionRecord.findMany).not.toHaveBeenCalled();
  });

  it('is labelled as a benchmark, with the reason, when there are too few runs', async () => {
    const out = await build(rows(2)).service.predictFromEnergy({ kwh: 1 }, MD);
    expect(out.basis).toBe('benchmark');
    expect(out.confidence).toBe('low');
    expect(out.outputs.typicalBags).toBeNull();
    expect(out.assumptions).toMatch(/industry benchmark/);
  });

  it('refuses a role that cannot see milling figures', async () => {
    const { service } = build(rows(12));
    const noMilling = actorOf('FARM_DIRECTOR', [{ scopeType: 'GLOBAL', scopeId: null }], ['ai.use']);
    await expect(service.predictFromEnergy({ kwh: 1 }, noMilling)).rejects.toThrow(/does not include milling figures/);
    await expect(service.predictFromPaddy({ bags: 1 }, noMilling)).rejects.toThrow(ForbiddenException);
  });
});

describe('AiInsightsService.feedback: did each run give what was expected?', () => {
  // newest first, as the database returns them. Eight approved runs of 680 kg of rice, then a better one, then a weaker one waiting for approval.
  const fbRow = (i: number, over: Record<string, unknown> = {}) => ({
    id: `r${i}`, recordNumber: `PR-${i}`, date: new Date(Date.UTC(2026, 8, 1 + i)), status: 'APPROVED', massBalanceFlag: false,
    paddyGradeId: 'g1', millingCenterId: 'c1', paddyProcessedKg: 1000, energyConsumptionKwh: 25, recoveredRiceKg: 680, brokenRiceKg: 120, riceHullKg: 180, riceHullBags: 9, wasteLossKg: 20,
    paddyGrade: { label: 'Size 4' }, millingCenter: { name: 'Mill A' }, ...over,
  });
  const history = () => [
    fbRow(10, { status: 'SUBMITTED', millingCenterId: 'c2', millingCenter: { name: 'Mill B' }, recoveredRiceKg: 600 }),
    fbRow(9, { recoveredRiceKg: 750 }),
    ...[8, 7, 6, 5, 4, 3, 2, 1].map((i) => fbRow(i)),
  ];
  const NOW = new Date(Date.UTC(2026, 8, 12)).getTime();
  beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(NOW); });
  afterEach(() => jest.restoreAllMocks());

  it('tells the MD, per milling center, whether each run gave more than, as much as, or less than expected', async () => {
    const out: any = await build(history()).service.feedback(MD, { days: 30 });
    expect(out.available).toBe(true);
    // 3 early estimates (no history yet) are counted apart; of the 7 real verdicts: 5 as expected, 1 more, 1 less.
    expect(out.summary).toMatchObject({ runs: 10, early: 3, more: 1, asExpected: 5, less: 1, pendingApproval: 1 });
    const byName = Object.fromEntries(out.centers.map((c: any) => [c.centerName, c]));
    expect(byName['Mill A']).toMatchObject({ verdict: 'as_expected', more: 1, early: false }); // one good run among five exact ones
    expect(byName['Mill B'].verdict).toBe('less');
    expect(out.centers[0].centerName).toBe('Mill B'); // the one that fell short comes first
    expect(out.runs[0]).toMatchObject({ recordNumber: 'PR-10', approved: false, verdict: 'less' });
    expect(out.runs[0].sentence).toMatch(/^Mill B used 25 kWh and was expected to give .* That is less packaged rice than expected/);
  });

  it('shows the AI\'s own learning: how many approved runs it has learned from, and its accuracy', async () => {
    const out: any = await build(history()).service.feedback(MD);
    expect(out.learning.trainedOnRuns).toBe(9); // the submitted run is judged but not learned from
    expect(out.learning.lastRunAt).toBe(new Date(Date.UTC(2026, 8, 11)).toISOString());
    expect(out.learning.explanation).toMatch(/learned from 9 approved runs/);
    expect(out.tolerancePercent).toBe(5);
  });

  it('judges inside the asker\'s jurisdiction only, and asks the database for nothing outside it', async () => {
    const { service, prisma } = build(history());
    await service.feedback(OPS(['wh-1']));
    expect(prisma.productionRecord.findMany.mock.calls[0][0].where.millingCenter).toEqual({ warehouseId: { in: ['wh-1'] } });
    const none = build(history());
    const out: any = await none.service.feedback(OPS([]));
    expect(none.prisma.productionRecord.findMany).not.toHaveBeenCalled();
    expect(out.runs).toEqual([]);
    expect(out.summary.runs).toBe(0);
  });

  it('refuses a milling center outside the jurisdiction, and a role without milling access', async () => {
    const { service, prisma } = build(history());
    prisma.millingCenter.findUnique.mockResolvedValue({ warehouseId: 'wh-OTHER' });
    await expect(service.feedback(OPS(['wh-1']), { millingCenterId: 'c-other' })).rejects.toThrow(ForbiddenException);
    const out: any = await build(history()).service.feedback(actorOf('FINANCE_DIRECTOR', [{ scopeType: 'GLOBAL', scopeId: null }], ['ai.view']));
    expect(out.available).toBe(false);
    expect(out.reason).toMatch(/does not include milling figures/);
  });

  it('narrows to one milling center, and to the days asked for', async () => {
    const { service } = build(history());
    const one: any = await service.feedback(MD, { millingCenterId: 'c2' });
    expect(one.centers.map((c: any) => c.centerName)).toEqual(['Mill B']);
    const recent: any = await build(history()).service.feedback(MD, { days: 3 });
    expect(recent.summary.runs).toBe(3); // 10, 9 and 8 fall in the last 3 days
  });

  it('uses the Administrator\'s tolerance and learning speed from System settings', async () => {
    const lenient: any = await build(history(), { 'ai.expected_tolerance_percent': 20, 'ai.learning_half_life_runs': 10, 'paddy.standard_bag_kg': 50, 'ai.rice_bag_kg': 50, 'ai.broken_bag_kg': 50, 'ai.hull_bag_kg': 20 }).service.feedback(MD);
    expect(lenient.tolerancePercent).toBe(20);
    expect(lenient.summary.more).toBe(0); // +10% is within 20%
    expect(lenient.learning.halfLifeRuns).toBe(10);
  });

  it('keeps runs flagged as not adding up out of what the AI learns from', async () => {
    const rows = history(); rows[2] = fbRow(8, { massBalanceFlag: true, recoveredRiceKg: 100 });
    const out: any = await build(rows).service.feedback(MD);
    expect(out.learning.trainedOnRuns).toBe(8);
    const { service, prisma } = build(history());
    await service.overview(MD);
    expect(prisma.productionRecord.findMany.mock.calls[0][0].where.massBalanceFlag).toBe(false);
  });
});

describe('AiInsightsService.predictFromRice: from the rice recovered to the paddy, the power and the by-products', () => {
  it('says how much paddy to send, the power it takes, and the broken rice and hull that come with it', async () => {
    const out = await build(rows(12)).service.predictFromRice({ bags: 54.4 }, MD);
    expect(out.outputs).toMatchObject({ kwh: 100, paddyBags: 80, riceBags: 54.4, brokenBags: 9.6, hullBags: 36 });
    expect(out.basis).toBe('history');
    expect(out.confidence).toBe('high');
    expect(out.jurisdiction).toBe('Whole company');
  });

  it('takes the rice as a weight in kg just as well', async () => {
    const out = await build(rows(12)).service.predictFromRice({ kg: 2720 }, MD);
    expect(out.outputs).toMatchObject({ kwh: 100, paddyBags: 80 });
  });

  it('needs the rice, in bags or kg', async () => {
    await expect(build(rows(12)).service.predictFromRice({}, MD)).rejects.toThrow(/Give either the bags of packaged rice or its weight/);
  });

  it('is the same answer as milling that paddy: bags in, power out, then the rice back in', async () => {
    const { service } = build(rows(12));
    const forward = await service.predictFromPaddy({ bags: 5 }, MD);
    const back = await service.predictFromRice({ kg: forward.outputs.riceKg }, MD);
    expect(back.outputs.paddyBags).toBeCloseTo(5, 1);
    expect(back.outputs.kwh).toBeCloseTo(forward.outputs.kwh, 1);
  });

  it('narrows to the grade and milling center asked for, and refuses one outside the asker\'s jurisdiction', async () => {
    const { service, prisma } = build(rows(12));
    await service.predictFromRice({ bags: 10, paddyGradeId: 'g1', millingCenterId: 'c1' }, MD);
    expect(prisma.productionRecord.findMany.mock.calls[0][0].where).toMatchObject({ paddyGradeId: 'g1', millingCenterId: 'c1' });
    prisma.millingCenter.findUnique.mockResolvedValue({ warehouseId: 'wh-OTHER' });
    await expect(service.predictFromRice({ bags: 1, millingCenterId: 'c-other' }, OPS(['wh-1']))).rejects.toThrow(ForbiddenException);
  });

  it('is open to the Operations Manager (company-wide scope) and refused to someone who cannot see milling figures', async () => {
    const ops = actorOf('OPERATIONS_MANAGER', [{ scopeType: 'GLOBAL', scopeId: null }]);
    await expect(build(rows(12)).service.predictFromRice({ bags: 10 }, ops)).resolves.toMatchObject({ jurisdiction: 'Whole company' });
    const noMilling = actorOf('FARM_DIRECTOR', [{ scopeType: 'GLOBAL', scopeId: null }], ['ai.use']);
    await expect(build(rows(12)).service.predictFromRice({ bags: 1 }, noMilling)).rejects.toThrow(ForbiddenException);
  });

  it('says plainly when it is only a benchmark, with too few runs to learn from', async () => {
    const out = await build(rows(2)).service.predictFromRice({ bags: 10 }, MD);
    expect(out.basis).toBe('benchmark');
    expect(out.confidence).toBe('low');
    expect(out.assumptions).toMatch(/benchmark/i);
  });
});
