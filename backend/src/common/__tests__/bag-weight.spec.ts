import { STANDARD_PADDY_BAG_WEIGHT_KG, estimateKg } from '../constants/bag-weight';

describe('estimateKg: kilograms worked out from bags when nothing was weighed', () => {
  it('uses one standard weight per bag, so every part of the system agrees', () => {
    expect(STANDARD_PADDY_BAG_WEIGHT_KG).toBe(50);
    expect(estimateKg(17)).toBe(850);
    expect(estimateKg(3)).toBe(150);
  });
  it('uses a better weight per bag when one is known (an order\'s own, a shipment\'s own)', () => {
    expect(estimateKg(100, 52)).toBe(5200);
    expect(estimateKg(7, 49.5)).toBe(346.5);
  });
  it('falls back to the standard if the weight per bag is missing, zero or nonsense, never to zero or NaN', () => {
    for (const bad of [0, -5, NaN, Infinity]) expect(estimateKg(10, bad)).toBe(500);
    expect(estimateKg(10, undefined)).toBe(500);
  });
  it('is free of floating-point noise', () => {
    expect(estimateKg(3, 33.333)).toBe(99.999);
  });
});
