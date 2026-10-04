import type { AiBagSizes, AiYieldRates } from './api-client';

/**
 * What power and paddy turn into. The server works out the rates (what 1 kWh gives) from the company's own approved
 * milling runs; the page only multiplies them, so a figure changes the instant a number is typed. This is the same
 * arithmetic as backend/src/ai/ai-yield.util.ts, and the same worked examples are tested on both sides.
 */
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface AiOutputs {
  kwh: number;
  paddyKg: number; paddyBags: number;
  riceKg: number; riceBags: number;
  brokenKg: number; brokenBags: number;
  hullKg: number; hullBags: number;
  wasteKg: number;
  typicalBags: { rice: [number, number]; broken: [number, number]; hull: [number, number] } | null;
}

export function outputsFromEnergy(rates: AiYieldRates, kwh: number, bags: AiBagSizes): AiOutputs {
  const kg = (perKwh: number) => round3(perKwh * kwh);
  const inBags = (perKwh: number, bagKg: number) => round3((perKwh * kwh) / bagKg);
  const paddyKg = kg(rates.perKwh.paddyKg), riceKg = kg(rates.perKwh.riceKg), brokenKg = kg(rates.perKwh.brokenKg), hullKg = kg(rates.perKwh.hullKg);
  const t = rates.typical;
  return {
    kwh: round3(kwh),
    paddyKg, paddyBags: round3(paddyKg / bags.paddyKg),
    riceKg, riceBags: round3(riceKg / bags.riceKg),
    brokenKg, brokenBags: round3(brokenKg / bags.brokenKg),
    hullKg, hullBags: round3(hullKg / bags.hullKg),
    wasteKg: kg(rates.perKwh.wasteKg),
    typicalBags: t && {
      rice: [inBags(t.riceKg[0], bags.riceKg), inBags(t.riceKg[1], bags.riceKg)],
      broken: [inBags(t.brokenKg[0], bags.brokenKg), inBags(t.brokenKg[1], bags.brokenKg)],
      hull: [inBags(t.hullKg[0], bags.hullKg), inBags(t.hullKg[1], bags.hullKg)],
    },
  };
}

/** Paddy in (in bags), the power it should take and the bags it should give. */
export function outputsFromPaddyBags(rates: AiYieldRates, paddyBags: number, bags: AiBagSizes): AiOutputs {
  return outputsFromEnergy(rates, (paddyBags * bags.paddyKg) / rates.perKwh.paddyKg, bags);
}

/**
 * Packaged rice (in bags) recovered or wanted: the paddy to send, the power it should take, and the broken rice and hull that come with
 * it. The same rates as the other two directions, read the other way round (same arithmetic as outputsFromRice on the server).
 */
export function outputsFromRiceBags(rates: AiYieldRates, riceBags: number, bags: AiBagSizes): AiOutputs {
  const riceKgPerKwh = rates.perKwh.riceKg;
  return outputsFromEnergy(rates, riceKgPerKwh > 0 ? (riceBags * bags.riceKg) / riceKgPerKwh : 0, bags);
}

/** Bags to a readable figure: two decimals under 10, one under 100, whole numbers above. */
export function formatBags(n: number): string {
  if (!Number.isFinite(n)) return '-';
  if (n < 10) return n.toFixed(2);
  if (n < 100) return n.toFixed(1);
  return Math.round(n).toLocaleString('en-US');
}

export function formatKg(n: number): string {
  if (!Number.isFinite(n)) return '-';
  return `${n < 100 ? n.toFixed(1) : Math.round(n).toLocaleString('en-US')} kg`;
}

export function formatRange(range: [number, number] | undefined): string | null {
  return range ? `${formatBags(range[0])} to ${formatBags(range[1])}` : null;
}

/** How a place's rice per kWh compares with the whole: a percentage, positive when it does better. */
export function versusCompany(place: AiYieldRates, company: AiYieldRates): number | null {
  if (place.basis !== 'history' || company.basis !== 'history' || company.perKwh.riceKg <= 0) return null;
  return ((place.perKwh.riceKg - company.perKwh.riceKg) / company.perKwh.riceKg) * 100;
}

/** Share of the paddy that ends up as each product, for the colour bar. */
export function mixOf(rates: AiYieldRates) {
  const p = rates.perKwh.paddyKg || 1;
  return {
    rice: (rates.perKwh.riceKg / p) * 100,
    broken: (rates.perKwh.brokenKg / p) * 100,
    hull: (rates.perKwh.hullKg / p) * 100,
    waste: (rates.perKwh.wasteKg / p) * 100,
  };
}
