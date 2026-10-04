/**
 * What a bag of paddy is taken to weigh when nobody put it on a scale. Most farms and warehouses have no scale, so intake, dispatch and
 * delivery are counted in BAGS, and the kilograms are worked out from the bags and flagged as an estimate, never passed off as a
 * measurement.
 *
 * The figure is the "Standard paddy bag weight" in Settings (default 50 kg): change it there and every estimate follows, with no code change.
 * The settings service keeps it up to date (at start-up and whenever the setting is changed).
 */
export const STANDARD_PADDY_BAG_WEIGHT_KG = 50;

let current = STANDARD_PADDY_BAG_WEIGHT_KG;

/** The bag weight in force right now (the Settings value). */
export const getStandardBagWeightKg = () => current;

/** Called by the settings service. A figure that is not a positive number is ignored, so a bad value can never zero every estimate. */
export function setStandardBagWeightKg(kg: number): void {
  if (Number.isFinite(kg) && kg > 0) current = kg;
}

/** Kilograms for a number of bags at a given weight per bag (the one in Settings unless a better figure is known, such as the order's own). */
export function estimateKg(bags: number, kgPerBag: number = current): number {
  const perBag = Number.isFinite(kgPerBag) && kgPerBag > 0 ? kgPerBag : current;
  return Math.round(bags * perBag * 1000) / 1000;
}
