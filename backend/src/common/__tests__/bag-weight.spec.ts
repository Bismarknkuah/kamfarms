import { STANDARD_PADDY_BAG_WEIGHT_KG, estimateKg, getStandardBagWeightKg, setStandardBagWeightKg } from '../constants/bag-weight';

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

describe('the bag weight follows the Settings value', () => {
  afterEach(() => setStandardBagWeightKg(STANDARD_PADDY_BAG_WEIGHT_KG));
  it('starts at the default of 50 kg', () => expect(getStandardBagWeightKg()).toBe(50));
  it('every estimate follows a change, with no code change', () => {
    setStandardBagWeightKg(80);
    expect(getStandardBagWeightKg()).toBe(80);
    expect(estimateKg(17)).toBe(1360);
    expect(estimateKg(3, undefined)).toBe(240);
  });
  it('a better figure (an order\'s own weight per bag) still wins over the setting', () => {
    setStandardBagWeightKg(80);
    expect(estimateKg(100, 52)).toBe(5200);
  });
  it('a bad value (zero, negative, not a number) is ignored, so it can never zero every estimate', () => {
    setStandardBagWeightKg(80);
    for (const bad of [0, -3, NaN, Infinity]) setStandardBagWeightKg(bad);
    expect(getStandardBagWeightKg()).toBe(80);
    expect(estimateKg(10)).toBe(800);
  });
});
