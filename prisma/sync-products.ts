/**
 * Makes sure the two milling by-products exist as products, so they can be packaged, stocked, priced and sold like the rice:
 * Broken Rice and Rice Hull. A database seeded before they were added to the seed has neither. Safe to run on every start:
 * it only ADDS what is missing (judged by name, so "Rice Husk" or "Broken rice 50kg" already counts), and never changes,
 * renames or re-activates a product that is already there.
 *
 * Run by docker/prepare.sh before the API starts. Also runnable by hand:  npx ts-node --transpile-only prisma/sync-products.ts
 */
import { PrismaClient } from '@prisma/client';
import { missingByProducts } from '../backend/dist/common/constants/by-products';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking the by-product products...');
  const existing = await prisma.product.findMany({ select: { name: true } });
  const missing = missingByProducts(existing.map((p) => p.name));
  if (missing.length === 0) console.log('  Broken Rice and Rice Hull are both already products.');
  for (const byProduct of missing) {
    await prisma.product.create({ data: { name: byProduct.name, description: byProduct.description } });
    console.log(`  Added the product "${byProduct.name}".`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
