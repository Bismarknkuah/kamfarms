export interface BalanceDimension {
  paddyGradeId?: string | null;
  productId?: string | null;
  packagingSizeId?: string | null;
}

const NONE = '-';

/**
 * Deterministic, non-nullable encoding of which single dimension (a
 * paddy grade, a bulk product, or a product+packaging-size combination)
 * an InventoryBalance row tracks.
 *
 * Why this exists: Postgres treats every NULL as distinct from every
 * other NULL, so a unique constraint — or a Prisma findUnique/upsert —
 * spanning nullable columns can never reliably target "the one row for
 * this combination." InventoryBalance.dimensionKey is the non-nullable
 * column the compound unique constraint actually keys on; the three FK
 * columns (paddyGradeId/productId/packagingSizeId) stay nullable for
 * normal filtering and joins elsewhere in the codebase.
 *
 * Must produce the exact same string for the exact same dimension every
 * time, from every module that touches InventoryBalance — this is the
 * single shared source of that encoding, not duplicated per call site.
 */
export function buildBalanceDimensionKey(dim: BalanceDimension): string {
  return [dim.paddyGradeId ?? NONE, dim.productId ?? NONE, dim.packagingSizeId ?? NONE].join('|');
}
