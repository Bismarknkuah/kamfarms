/**
 * What a bag of paddy is taken to weigh when nobody put it on a scale. Most farms and warehouses have no scale, so intake, dispatch and
 * delivery are counted in BAGS, and the kilograms are worked out from the bags and flagged as an estimate, never passed off as a
 * measurement. One place to change it.
 */
export const STANDARD_PADDY_BAG_WEIGHT_KG = 50;

/** Kilograms for a number of bags at a given weight per bag (the standard one unless a better figure is known, such as the order's own). */
export function estimateKg(bags: number, kgPerBag: number = STANDARD_PADDY_BAG_WEIGHT_KG): number {
  const perBag = Number.isFinite(kgPerBag) && kgPerBag > 0 ? kgPerBag : STANDARD_PADDY_BAG_WEIGHT_KG;
  return Math.round(bags * perBag * 1000) / 1000;
}
