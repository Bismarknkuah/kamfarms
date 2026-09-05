import { buildBalanceDimensionKey } from '../balance-key.util';

describe('buildBalanceDimensionKey', () => {
  it('produces distinct keys for a paddy grade vs. a product vs. a product+packaging-size combination', () => {
    const paddyKey = buildBalanceDimensionKey({ paddyGradeId: 'grade-4' });
    const bulkProductKey = buildBalanceDimensionKey({ productId: 'prod-1' });
    const packagedKey = buildBalanceDimensionKey({ productId: 'prod-1', packagingSizeId: 'size-25' });

    expect(new Set([paddyKey, bulkProductKey, packagedKey]).size).toBe(3);
  });

  it('produces the exact same key for the exact same dimension, regardless of how the object is constructed', () => {
    const a = buildBalanceDimensionKey({ productId: 'prod-1', packagingSizeId: 'size-25' });
    const b = buildBalanceDimensionKey({ paddyGradeId: null, productId: 'prod-1', packagingSizeId: 'size-25' });
    const c = buildBalanceDimensionKey({ productId: 'prod-1', packagingSizeId: 'size-25', paddyGradeId: undefined });

    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('never produces an empty or null-ish string, even for a fully empty dimension', () => {
    const key = buildBalanceDimensionKey({});

    expect(key).toBeTruthy();
    expect(key).not.toContain('null');
    expect(key).not.toContain('undefined');
  });

  it('treats a bulk product (no packaging size) as distinct from the same product packaged', () => {
    const bulk = buildBalanceDimensionKey({ productId: 'prod-1' });
    const packaged = buildBalanceDimensionKey({ productId: 'prod-1', packagingSizeId: 'size-25' });

    expect(bulk).not.toBe(packaged);
  });
});
