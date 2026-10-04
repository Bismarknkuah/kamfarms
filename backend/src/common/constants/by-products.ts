/**
 * The two milling by-products that must exist as products, so they can be packaged, stocked, priced and sold like the rice.
 * Kept free of any database code so the "is it already there?" rule can be tested; prisma/sync-products.ts uses it at start-up.
 */
export interface ByProduct {
  name: string;
  description: string;
  /** Matches the name of a product that already counts as this by-product (so "Rice Husk" is not added a second time as "Rice Hull"). */
  alreadyThere: RegExp;
}

export const BY_PRODUCTS: ByProduct[] = [
  { name: 'Broken Rice', description: 'Milling by-product: broken grains', alreadyThere: /broken/i },
  { name: 'Rice Hull', description: 'Milling by-product: rice hulls (husks)', alreadyThere: /\bhulls?\b|\bhusks?\b/i },
];

/** The by-products still missing, judged by the names of the products that exist. Never matches by anything but the name. */
export function missingByProducts(existingNames: string[]): ByProduct[] {
  return BY_PRODUCTS.filter((byProduct) => !existingNames.some((name) => byProduct.alreadyThere.test(name)));
}
