import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { defaultOf } from '../settings/settings.registry';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PERMISSIONS } from '../common/constants/permissions';
import { Jurisdiction, assertCenterInJurisdiction, hasPermission, jurisdictionOf, productionScope } from './jurisdiction';
import { BagSizes, Outputs, RunSample, YieldRates, describeBasis, outputsFromEnergy, outputsFromPaddy, ratesFromRuns, round3 } from './ai-yield.util';
import { PredictFromEnergyDto } from './dto/predict-from-energy.dto';
import { PredictFromPaddyDto } from './dto/predict-from-paddy.dto';

/** The most recent approved runs with a power reading that the figures are drawn from. */
const MAX_RUNS = 300;
const MIN_HULL_BAG_RUNS = 3;

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
  private async bagSizes(rows: RunRow[]): Promise<BagSizes> {
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
    const overall = ratesFromRuns(rows.map(toSample));

    const gradeIds = [...new Set(rows.map((r) => r.gradeId))];
    const centerIds = [...new Set(rows.map((r) => r.centerId))];
    const byGrade = gradeIds
      .map((id) => { const own = rows.filter((r) => r.gradeId === id); const rates = ratesFromRuns(own.map(toSample)); return { gradeId: id, code: own[0].gradeCode, label: own[0].gradeLabel, rates, note: describeBasis(rates, `grade ${own[0].gradeLabel}`) }; })
      .sort((a, b) => a.label.localeCompare(b.label));
    const byCenter = centerIds
      .map((id) => { const own = rows.filter((r) => r.centerId === id); const rates = ratesFromRuns(own.map(toSample)); return { centerId: id, code: own[0].centerCode, name: own[0].centerName, rates, note: describeBasis(rates, own[0].centerName) }; })
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
    const rates = ratesFromRuns(rows.map(toSample));
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
}
