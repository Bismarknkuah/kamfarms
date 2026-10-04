import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { defaultOf } from '../settings/settings.registry';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PERMISSIONS } from '../common/constants/permissions';
import { Jurisdiction, assertCenterInJurisdiction, hasPermission, jurisdictionOf, productionScope } from './jurisdiction';
import { BagSizes, Outputs, RunSample, YieldRates, describeBasis, outputsFromEnergy, outputsFromPaddy, ratesFromRuns, round3 } from './ai-yield.util';
import { LearnRun, Learning, RunFeedback, Scorecard, learningStats, scorecards, walkForward } from './ai-learning.util';
import { PredictFromEnergyDto } from './dto/predict-from-energy.dto';
import { PredictFromPaddyDto } from './dto/predict-from-paddy.dto';

/** The most recent approved runs with a power reading that the figures are drawn from. */
const MAX_RUNS = 300;
const MIN_HULL_BAG_RUNS = 3;
/** How many recent runs the feedback replays. */
const MAX_FEEDBACK_RUNS = 500;

export interface JurisdictionInfo { companyWide: boolean; label: string; farms: string[]; warehouses: string[] }

interface RunRow extends RunSample {
  date: Date;
  gradeId: string; gradeLabel: string; gradeCode: string;
  centerId: string; centerName: string; centerCode: string;
  hullBags: number | null;
}

export type AiInsights =
  | { available: false; reason: string; jurisdiction: JurisdictionInfo }
  | {
      available: true;
      generatedAt: string;
      jurisdiction: JurisdictionInfo;
      bagSizes: BagSizes;
      window: { runs: number; from: string | null; to: string | null };
      overall: YieldRates;
      /** Plain words saying where each set of figures comes from. */
      overallNote: string;
      byGrade: { gradeId: string; code: string; label: string; rates: YieldRates; note: string }[];
      byCenter: { centerId: string; code: string; name: string; rates: YieldRates; note: string }[];
    };

export type AiFeedback =
  | { available: false; reason: string; jurisdiction: JurisdictionInfo }
  | {
      available: true;
      generatedAt: string;
      jurisdiction: JurisdictionInfo;
      days: number;
      tolerancePercent: number;
      bagSizes: BagSizes;
      summary: { runs: number; early: number; more: number; asExpected: number; less: number; pendingApproval: number };
      learning: Learning;
      centers: Scorecard[];
      runs: RunFeedback[];
    };

export interface EnergyPrediction {
  basis: YieldRates['basis'];
  confidence: YieldRates['confidence'];
  sampleSize: number;
  outputs: Outputs;
  bagSizes: BagSizes;
  assumptions: string;
  jurisdiction: string;
}

const toSample = (r: RunRow): RunSample => ({ paddyKg: r.paddyKg, energyKwh: r.energyKwh, riceKg: r.riceKg, brokenKg: r.brokenKg, hullKg: r.hullKg, wasteKg: r.wasteKg });

/**
 * "If this much power is used, how many bags of packaged rice, broken rice and hull should come out?" and the same
 * question starting from paddy. Built only from the company's own approved milling runs, and only from the runs
 * inside the asker's jurisdiction: the MD, CEO and Administrator see the whole company, everyone else their own places.
 */
@Injectable()
export class AiInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  async describeJurisdiction(j: Jurisdiction): Promise<JurisdictionInfo> {
    if (j.companyWide) return { companyWide: true, label: 'Whole company', farms: [], warehouses: [] };
    const [farms, warehouses] = await Promise.all([
      j.farmIds.length ? this.prisma.farm.findMany({ where: { id: { in: j.farmIds } }, select: { name: true } }) : Promise.resolve([] as { name: string }[]),
      j.warehouseIds.length ? this.prisma.warehouse.findMany({ where: { id: { in: j.warehouseIds } }, select: { name: true } }) : Promise.resolve([] as { name: string }[]),
    ]);
    const names = [...warehouses.map((w) => w.name), ...farms.map((f) => f.name)];
    return { companyWide: false, label: names.length ? names.join(', ') : 'No places assigned yet', farms: farms.map((f) => f.name), warehouses: warehouses.map((w) => w.name) };
  }

  private setting(key: string): Promise<number> {
    return this.settings ? this.settings.getNumber(key) : Promise.resolve(defaultOf<number>(key));
  }

  private requireProduction(actor: AuthenticatedUser) {
    if (!hasPermission(actor, PERMISSIONS.MILLING_VIEW)) {
      throw new ForbiddenException('Predictions are built from milling runs, and your role does not include milling figures.');
    }
  }

  private async loadRuns(j: Jurisdiction, filters: { paddyGradeId?: string; millingCenterId?: string } = {}): Promise<RunRow[]> {
    const scope = productionScope(j);
    if (scope === null) return [];
    const rows = await this.prisma.productionRecord.findMany({
      where: {
        ...scope,
        status: 'APPROVED',
        massBalanceFlag: false,
        energyConsumptionKwh: { gt: 0 },
        paddyProcessedKg: { gt: 0 },
        ...(filters.paddyGradeId ? { paddyGradeId: filters.paddyGradeId } : {}),
        ...(filters.millingCenterId ? { millingCenterId: filters.millingCenterId } : {}),
      },
      orderBy: { date: 'desc' },
      take: MAX_RUNS,
      select: {
        date: true, paddyGradeId: true, millingCenterId: true, paddyProcessedKg: true, energyConsumptionKwh: true,
        recoveredRiceKg: true, brokenRiceKg: true, riceHullKg: true, riceHullBags: true, wasteLossKg: true,
        paddyGrade: { select: { code: true, label: true } },
        millingCenter: { select: { code: true, name: true } },
      },
    });
    return rows.map((r) => ({
      date: r.date,
      gradeId: r.paddyGradeId, gradeLabel: r.paddyGrade?.label ?? 'Unspecified', gradeCode: r.paddyGrade?.code ?? '',
      centerId: r.millingCenterId, centerName: r.millingCenter?.name ?? 'Unknown', centerCode: r.millingCenter?.code ?? '',
      paddyKg: Number(r.paddyProcessedKg), energyKwh: Number(r.energyConsumptionKwh), riceKg: Number(r.recoveredRiceKg),
      brokenKg: Number(r.brokenRiceKg), hullKg: Number(r.riceHullKg), wasteKg: Number(r.wasteLossKg), hullBags: r.riceHullBags ?? null,
    }));
  }

  /** Bag weights come from the System Administrator's settings; hulls use the weight the runs actually recorded when there are enough of them. */
  async bagSizes(rows: { hullKg: number; hullBags: number | null }[]): Promise<BagSizes> {
    const num = (key: string) => (this.settings ? this.settings.getNumber(key) : Promise.resolve(defaultOf<number>(key)));
    const [paddyKg, riceKg, brokenKg, hullSetting] = await Promise.all([num('paddy.standard_bag_kg'), num('ai.rice_bag_kg'), num('ai.broken_bag_kg'), num('ai.hull_bag_kg')]);
    const counted = rows.filter((r) => r.hullBags && r.hullBags > 0);
    const measured = counted.length >= MIN_HULL_BAG_RUNS ? counted.reduce((s, r) => s + r.hullKg, 0) / counted.reduce((s, r) => s + (r.hullBags ?? 0), 0) : null;
    return { paddyKg, riceKg, brokenKg, hullKg: measured ? round3(measured) : hullSetting, hullBasis: measured ? 'history' : 'setting' };
  }

  async overview(actor: AuthenticatedUser): Promise<AiInsights> {
    const j = jurisdictionOf(actor);
    const jurisdiction = await this.describeJurisdiction(j);
    if (!hasPermission(actor, PERMISSIONS.MILLING_VIEW)) {
      return { available: false, reason: 'Predictions are built from milling runs, and your role does not include milling figures.', jurisdiction };
    }
    const rows = await this.loadRuns(j);
    const bagSizes = await this.bagSizes(rows);
    const halfLifeRuns = await this.setting('ai.learning_half_life_runs');
    const overall = ratesFromRuns(rows.map(toSample), { halfLifeRuns });

    const gradeIds = [...new Set(rows.map((r) => r.gradeId))];
    const centerIds = [...new Set(rows.map((r) => r.centerId))];
    const byGrade = gradeIds
      .map((id) => { const own = rows.filter((r) => r.gradeId === id); const rates = ratesFromRuns(own.map(toSample), { halfLifeRuns }); return { gradeId: id, code: own[0].gradeCode, label: own[0].gradeLabel, rates, note: describeBasis(rates, `grade ${own[0].gradeLabel}`) }; })
      .sort((a, b) => a.label.localeCompare(b.label));
    const byCenter = centerIds
      .map((id) => { const own = rows.filter((r) => r.centerId === id); const rates = ratesFromRuns(own.map(toSample), { halfLifeRuns }); return { centerId: id, code: own[0].centerCode, name: own[0].centerName, rates, note: describeBasis(rates, own[0].centerName) }; })
      .sort((a, b) => b.rates.perKwh.riceKg - a.rates.perKwh.riceKg);

    return {
      available: true,
      generatedAt: new Date().toISOString(),
      jurisdiction,
      bagSizes,
      window: { runs: rows.length, from: rows.length ? rows[rows.length - 1].date.toISOString() : null, to: rows.length ? rows[0].date.toISOString() : null },
      overall,
      overallNote: describeBasis(overall, jurisdiction.companyWide ? 'the whole company' : jurisdiction.label),
      byGrade,
      byCenter,
    };
  }

  private async ratesFor(actor: AuthenticatedUser, filters: { paddyGradeId?: string; millingCenterId?: string }) {
    this.requireProduction(actor);
    const j = jurisdictionOf(actor);
    if (filters.millingCenterId) await assertCenterInJurisdiction(this.prisma, j, filters.millingCenterId);
    const rows = await this.loadRuns(j, filters);
    const jurisdiction = (await this.describeJurisdiction(j)).label;
    const rates = ratesFromRuns(rows.map(toSample), { halfLifeRuns: await this.setting('ai.learning_half_life_runs') });
    const subject = filters.paddyGradeId || filters.millingCenterId ? 'the grade and place you chose' : jurisdiction === 'Whole company' ? 'the whole company' : jurisdiction;
    return { rates, bagSizes: await this.bagSizes(rows), jurisdiction, assumptions: describeBasis(rates, subject) };
  }

  /** Power in, bags out. */
  async predictFromEnergy(dto: PredictFromEnergyDto, actor: AuthenticatedUser): Promise<EnergyPrediction> {
    const { rates, bagSizes, jurisdiction, assumptions } = await this.ratesFor(actor, dto);
    return { basis: rates.basis, confidence: rates.confidence, sampleSize: rates.runs, outputs: outputsFromEnergy(rates, dto.kwh, bagSizes), bagSizes, assumptions, jurisdiction };
  }

  /** Paddy in, bags out and the power it should take. */
  async predictFromPaddy(dto: PredictFromPaddyDto, actor: AuthenticatedUser): Promise<EnergyPrediction> {
    const { rates, bagSizes, jurisdiction, assumptions } = await this.ratesFor(actor, dto);
    return { basis: rates.basis, confidence: rates.confidence, sampleSize: rates.runs, outputs: outputsFromPaddy(rates, dto.bags * bagSizes.paddyKg, bagSizes), bagSizes, assumptions, jurisdiction };
  }

  /**
   * Did each milling run give what the AI expected for the power it used? Every run is judged against what the approved
   * runs BEFORE it had taught (see ai-learning.util.ts), so the MD and CEO see, per milling center, whether it gave more
   * than, as much as, or less than expected, and the AI's own accuracy and whether it is improving.
   */
  async feedback(actor: AuthenticatedUser, opts: { days?: number; millingCenterId?: string } = {}): Promise<AiFeedback> {
    const j = jurisdictionOf(actor);
    const jurisdiction = await this.describeJurisdiction(j);
    if (!hasPermission(actor, PERMISSIONS.MILLING_VIEW)) {
      return { available: false, reason: 'Feedback is built from milling runs, and your role does not include milling figures.', jurisdiction };
    }
    if (opts.millingCenterId) await assertCenterInJurisdiction(this.prisma, j, opts.millingCenterId);
    const days = Math.min(365, Math.max(1, Math.round(opts.days ?? 30)));
    const [halfLifeRuns, tolerancePercent] = await Promise.all([this.setting('ai.learning_half_life_runs'), this.setting('ai.expected_tolerance_percent')]);
    const scope = productionScope(j);
    const rows = scope === null ? [] : await this.prisma.productionRecord.findMany({
      where: { ...scope, status: { in: ['SUBMITTED', 'APPROVED'] }, energyConsumptionKwh: { gt: 0 }, paddyProcessedKg: { gt: 0 } },
      orderBy: [{ date: 'desc' }, { recordNumber: 'desc' }],
      take: MAX_FEEDBACK_RUNS,
      select: {
        id: true, recordNumber: true, date: true, status: true, massBalanceFlag: true, paddyGradeId: true, millingCenterId: true,
        paddyProcessedKg: true, energyConsumptionKwh: true, recoveredRiceKg: true, brokenRiceKg: true, riceHullKg: true, riceHullBags: true, wasteLossKg: true,
        paddyGrade: { select: { label: true } }, millingCenter: { select: { name: true } },
      },
    });
    const ordered = [...rows].reverse(); // oldest first, so each run is judged by what came before it
    const asc: LearnRun[] = ordered.map((r) => ({
      id: r.id, recordNumber: r.recordNumber, date: r.date, approved: r.status === 'APPROVED', flagged: r.massBalanceFlag,
      gradeId: r.paddyGradeId, gradeLabel: r.paddyGrade?.label ?? 'Unspecified', centerId: r.millingCenterId, centerName: r.millingCenter?.name ?? 'Unknown',
      paddyKg: Number(r.paddyProcessedKg), energyKwh: Number(r.energyConsumptionKwh), riceKg: Number(r.recoveredRiceKg),
      brokenKg: Number(r.brokenRiceKg), hullKg: Number(r.riceHullKg), wasteKg: Number(r.wasteLossKg),
    }));
    const bags = await this.bagSizes(ordered.map((r) => ({ hullKg: Number(r.riceHullKg), hullBags: r.riceHullBags ?? null })));
    const all = walkForward(asc, { halfLifeRuns, tolerancePercent, bags });
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const inPeriod = all.filter((f) => new Date(f.date).getTime() >= since && (!opts.millingCenterId || f.centerId === opts.millingCenterId));
    const trained = asc.filter((r) => r.approved && !r.flagged).length;
    return {
      available: true,
      generatedAt: new Date().toISOString(),
      jurisdiction,
      days,
      tolerancePercent,
      bagSizes: bags,
      summary: {
        runs: inPeriod.length,
        // Early estimates (judged only against the benchmark) are counted apart, never as a verdict.
        early: inPeriod.filter((f) => f.early).length,
        more: inPeriod.filter((f) => !f.early && f.verdict === 'more').length,
        asExpected: inPeriod.filter((f) => !f.early && f.verdict === 'as_expected').length,
        less: inPeriod.filter((f) => !f.early && f.verdict === 'less').length,
        pendingApproval: inPeriod.filter((f) => !f.approved).length,
      },
      learning: learningStats(all, trained, asc.length ? asc[asc.length - 1].date.toISOString() : null, { halfLifeRuns, tolerancePercent }),
      centers: scorecards(inPeriod, tolerancePercent),
      runs: [...inPeriod].reverse().slice(0, 40),
    };
  }
}
