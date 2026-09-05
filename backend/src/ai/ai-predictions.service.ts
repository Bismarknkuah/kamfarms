import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildBalanceDimensionKey } from '../inventory-ledger/balance-key.util';
import { PredictProductionDto } from './dto/predict-production.dto';
import { PredictEnergyDto } from './dto/predict-energy.dto';
import { ForecastStockDto } from './dto/forecast-stock.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

const MIN_RECORDS_FOR_STATS = 5;
const MIN_SALES_DAYS_FOR_FORECAST = 3;

// Documented industry-typical benchmarks used ONLY when there isn't
// enough history yet (spec section 21's required cold-start fallback).
// These are NOT derived from this company's data and are always
// reported with low confidence and an explicit note saying so.
const COLD_START_BENCHMARKS = {
  recoveryPercent: 68,
  brokenPercent: 12,
  hullPercent: 18,
  wastePercent: 2,
  kwhPerKg: 0.028, // ~28 kWh/ton, a commonly cited rice-mill figure
};

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Confidence grows with sample size but is deliberately capped well
 * short of 100% — even a large rolling sample is still a statistical
 * estimate, not a certainty, and the spec's own worked example (72,400
 * KG predicted, 87% confidence) is in this same range, not near 100. */
function confidenceForSampleSize(n: number): number {
  return Math.min(90, 40 + n * 5);
}

@Injectable()
export class AiPredictionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOrCreateModel(name: string, type: 'rolling_average' | 'cold_start_benchmark', sampleSize: number, metrics?: Record<string, number>) {
    const version = type === 'rolling_average' ? `rolling-n${sampleSize}` : 'cold-start-v1';
    return this.prisma.aiModel.upsert({
      where: { name_version: { name, version } },
      update: { sampleSize, metrics: metrics as any, isActive: true },
      create: { name, version, type, sampleSize, metrics: metrics as any },
    });
  }

  /** Spec section 21's worked example: paddy in, expected recovered
   * rice/broken/hull out, with a range and confidence — using this
   * grade's (and optionally this milling center's) own recent history,
   * falling back to a documented benchmark when there isn't enough of
   * it yet. */
  async predictProduction(dto: PredictProductionDto, actor: AuthenticatedUser) {
    const records = await this.prisma.productionRecord.findMany({
      where: {
        paddyGradeId: dto.paddyGradeId,
        millingCenterId: dto.millingCenterId,
        status: 'APPROVED',
      },
      orderBy: { date: 'desc' },
      take: 30,
      select: { recoveryPercent: true, brokenPercent: true, hullPercent: true, wastePercent: true },
    });

    let recoveryPercent: number;
    let brokenPercent: number;
    let hullPercent: number;
    let confidence: number;
    let assumptions: string;
    let modelType: 'rolling_average' | 'cold_start_benchmark';
    let recoveryStdDev = 0;

    if (records.length >= MIN_RECORDS_FOR_STATS) {
      const recoveries = records.map((r) => Number(r.recoveryPercent));
      const brokens = records.map((r) => Number(r.brokenPercent));
      const hulls = records.map((r) => Number(r.hullPercent));
      recoveryPercent = mean(recoveries);
      brokenPercent = mean(brokens);
      hullPercent = mean(hulls);
      recoveryStdDev = stdDev(recoveries, recoveryPercent);
      confidence = confidenceForSampleSize(records.length);
      assumptions = `Based on the rolling average of the last ${records.length} approved production records for this grade${dto.millingCenterId ? ' at this milling center' : ' across all milling centers'}.`;
      modelType = 'rolling_average';
    } else {
      recoveryPercent = COLD_START_BENCHMARKS.recoveryPercent;
      brokenPercent = COLD_START_BENCHMARKS.brokenPercent;
      hullPercent = COLD_START_BENCHMARKS.hullPercent;
      confidence = 25;
      assumptions = `Only ${records.length} historical record(s) exist for this grade — below the ${MIN_RECORDS_FOR_STATS} needed for a statistical estimate. Using a documented industry-typical benchmark instead (not derived from this company's own data). Confidence is intentionally low.`;
      modelType = 'cold_start_benchmark';
    }

    const predictedRecoveredKg = dto.paddyKg * (recoveryPercent / 100);
    const predictedBrokenKg = dto.paddyKg * (brokenPercent / 100);
    const predictedHullKg = dto.paddyKg * (hullPercent / 100);
    const rangeLow = predictedRecoveredKg - dto.paddyKg * (recoveryStdDev / 100);
    const rangeHigh = predictedRecoveredKg + dto.paddyKg * (recoveryStdDev / 100);

    const model = await this.getOrCreateModel('production_yield', modelType, records.length, { recoveryStdDev });

    const prediction = await this.prisma.aiPrediction.create({
      data: {
        modelId: model.id,
        predictionType: 'production_yield',
        inputData: dto as any,
        predictedValue: { predictedRecoveredKg, predictedBrokenKg, predictedHullKg, recoveryPercent, brokenPercent, hullPercent },
        confidencePercent: confidence,
        expectedRangeLow: Math.max(rangeLow, 0),
        expectedRangeHigh: rangeHigh,
        assumptions,
        requestedById: actor.id,
      },
    });

    return {
      predictedRecoveredKg,
      predictedBrokenKg,
      predictedHullKg,
      expectedRange: { low: Math.max(rangeLow, 0), high: rangeHigh },
      confidencePercent: confidence,
      assumptions,
      sampleSize: records.length,
      predictionId: prediction.id,
    };
  }

  async predictEnergyConsumption(dto: PredictEnergyDto, actor: AuthenticatedUser) {
    const records = await this.prisma.productionRecord.findMany({
      where: { machineId: dto.machineId, status: 'APPROVED', energyConsumptionKwh: { not: null } },
      orderBy: { date: 'desc' },
      take: 30,
      select: { energyConsumptionKwh: true, paddyProcessedKg: true },
    });

    const ratios = records
      .filter((r) => Number(r.paddyProcessedKg) > 0)
      .map((r) => Number(r.energyConsumptionKwh) / Number(r.paddyProcessedKg));

    let kwhPerKg: number;
    let confidence: number;
    let assumptions: string;
    let modelType: 'rolling_average' | 'cold_start_benchmark';
    let ratioStdDev = 0;

    if (ratios.length >= MIN_RECORDS_FOR_STATS) {
      kwhPerKg = mean(ratios);
      ratioStdDev = stdDev(ratios, kwhPerKg);
      confidence = confidenceForSampleSize(ratios.length);
      assumptions = `Based on this machine's own energy-per-KG ratio across its last ${ratios.length} approved production records.`;
      modelType = 'rolling_average';
    } else {
      kwhPerKg = COLD_START_BENCHMARKS.kwhPerKg;
      confidence = 25;
      assumptions = `Only ${ratios.length} historical energy reading(s) exist for this machine — below the ${MIN_RECORDS_FOR_STATS} needed for a statistical estimate. Using a documented industry-typical rice-mill energy benchmark instead. Confidence is intentionally low.`;
      modelType = 'cold_start_benchmark';
    }

    const predictedKwh = dto.paddyKg * kwhPerKg;
    const model = await this.getOrCreateModel('energy_consumption', modelType, ratios.length, { ratioStdDev });

    const prediction = await this.prisma.aiPrediction.create({
      data: {
        modelId: model.id,
        predictionType: 'energy_consumption',
        inputData: dto as any,
        predictedValue: { predictedKwh, kwhPerKg },
        confidencePercent: confidence,
        expectedRangeLow: Math.max(predictedKwh - dto.paddyKg * ratioStdDev, 0),
        expectedRangeHigh: predictedKwh + dto.paddyKg * ratioStdDev,
        assumptions,
        requestedById: actor.id,
      },
    });

    return {
      predictedKwh,
      confidencePercent: confidence,
      assumptions,
      sampleSize: ratios.length,
      predictionId: prediction.id,
    };
  }

  /** Sales-velocity-based days-to-stockout — genuinely different math
   * from the two production-side predictions above (rate-of-depletion
   * against a live balance, not a historical ratio). */
  async forecastStockDepletion(dto: ForecastStockDto, actor: AuthenticatedUser) {
    const windowDays = 30;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [balance, recentSales] = await Promise.all([
      this.prisma.inventoryBalance.findUnique({
        where: {
          balance_key: {
            locationType: 'WAREHOUSE',
            locationId: dto.warehouseId,
            dimensionKey: buildBalanceDimensionKey({ productId: dto.productId, packagingSizeId: dto.packagingSizeId }),
          },
        },
      }),
      this.prisma.salesOrderItem.findMany({
        where: {
          productId: dto.productId,
          packagingSizeId: dto.packagingSizeId,
          salesOrder: { status: 'FULFILLED', allocatedWarehouseId: dto.warehouseId, fulfilledAt: { gte: since } },
        },
        select: { bagCount: true },
      }),
    ]);

    const currentBags = balance?.bagCount ?? 0;
    const soldBags = recentSales.reduce((sum, item) => sum + item.bagCount, 0);
    const dailyVelocity = soldBags / windowDays;

    let daysUntilStockout: number | null;
    let confidence: number;
    let assumptions: string;

    if (recentSales.length === 0 || dailyVelocity <= 0) {
      daysUntilStockout = null;
      confidence = 0;
      assumptions = `No fulfilled sales for this product/size at this warehouse in the last ${windowDays} days — depletion cannot be forecast from sales velocity.`;
    } else {
      daysUntilStockout = currentBags / dailyVelocity;
      confidence = recentSales.length >= MIN_SALES_DAYS_FOR_FORECAST ? 60 : 30;
      assumptions = `Based on ${soldBags} bags sold over the last ${windowDays} days (${dailyVelocity.toFixed(2)} bags/day average) against a current balance of ${currentBags} bags. Assumes recent sales velocity continues unchanged.`;
    }

    const model = await this.getOrCreateModel('stock_depletion', 'rolling_average', recentSales.length);

    const prediction = await this.prisma.aiPrediction.create({
      data: {
        modelId: model.id,
        predictionType: 'stock_depletion',
        inputData: dto as any,
        predictedValue: { daysUntilStockout, currentBags, dailyVelocity },
        confidencePercent: confidence,
        assumptions,
        requestedById: actor.id,
      },
    });

    return { daysUntilStockout, currentBags, dailyVelocity, confidencePercent: confidence, assumptions, predictionId: prediction.id };
  }

  /** Surfaces anomalies already detected and flagged by Phase 5's own
   * logic (meter reading deviation, production mass-balance variance) —
   * deliberately not a second, competing anomaly-detection
   * implementation; spec section 21 calls this "machine anomaly
   * detection" and "unusual production variance", both of which already
   * exist as real, tested logic elsewhere in this codebase. */
  async recentAnomalies() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [meterAnomalies, productionAnomalies] = await Promise.all([
      this.prisma.meterReading.findMany({
        where: { isAnomalous: true, createdAt: { gte: since } },
        include: { machine: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.productionRecord.findMany({
        where: { massBalanceFlag: true, createdAt: { gte: since } },
        include: { millingCenter: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return { meterAnomalies, productionAnomalies };
  }
}
