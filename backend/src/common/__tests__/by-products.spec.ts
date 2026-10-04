import { BY_PRODUCTS, missingByProducts } from '../constants/by-products';

describe('the by-products that must exist as products (Broken Rice and Rice Hull)', () => {
  const names = (list: { name: string }[]) => list.map((p) => p.name);

  it('adds both to a database that has only the rice', () => {
    expect(names(missingByProducts(['Pectra Rice']))).toEqual(['Broken Rice', 'Rice Hull']);
    expect(names(missingByProducts([]))).toEqual(['Broken Rice', 'Rice Hull']);
  });

  it('adds nothing when both are already there, so running it on every start changes nothing', () => {
    expect(missingByProducts(['Pectra Rice', 'Broken Rice', 'Rice Hull'])).toEqual([]);
  });

  it('adds only the one that is missing', () => {
    expect(names(missingByProducts(['Pectra Rice', 'Broken Rice']))).toEqual(['Rice Hull']);
    expect(names(missingByProducts(['Pectra Rice', 'Rice Hull']))).toEqual(['Broken Rice']);
  });

  it.each(['broken rice', 'BROKEN RICE', 'Broken Rice 50KG', 'Pectra Broken'])('counts "%s" as the broken rice that is already there', (existing) => {
    expect(names(missingByProducts([existing]))).toEqual(['Rice Hull']);
  });

  it.each(['Rice Hull', 'Rice Hulls', 'Rice Husk', 'rice husks', 'Hull', 'Hulls (bagged)'])('counts "%s" as the hull that is already there, so it is not added twice', (existing) => {
    expect(names(missingByProducts([existing]))).toEqual(['Broken Rice']);
  });

  it('does not mistake an ordinary rice product for either by-product', () => {
    expect(names(missingByProducts(['Pectra Rice', 'Superfine Perfumed Rice', 'Husky Rice Mix']))).toEqual(['Broken Rice', 'Rice Hull']);
  });

  it('names and describes them for the Price list and the order form', () => {
    expect(BY_PRODUCTS.map((p) => p.name)).toEqual(['Broken Rice', 'Rice Hull']);
    expect(BY_PRODUCTS.every((p) => p.description.startsWith('Milling by-product'))).toBe(true);
  });
});
