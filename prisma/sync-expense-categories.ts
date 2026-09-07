/* eslint-disable no-console */
// Mirrors sync-permissions.ts's pattern exactly, for the same reason:
// seed.ts itself is NOT run automatically on every deploy (only this
// kind of idempotent sync script is, per the Railway startup
// command), and seed.ts also creates non-idempotent demo data (users,
// farms) that would duplicate on a second run. This script only ever
// upserts by name, so it's safe to run on every single deploy.
//
// Farm-input categories (Fertilizer, Seeds, Agrochemicals) added here
// - a real, confirmed gap: a Farm Manager logging a genuinely common
// farm expense had no matching category at all before this, only
// "Other" with a free-text label as a fallback.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXPENSE_CATEGORIES = [
  'Farm Labour', 'Fertilizer', 'Seeds', 'Agrochemicals', 'Transportation', 'Milling Expenses',
  'Electricity', 'Fuel', 'Maintenance', 'Packaging', 'Warehouse Expenses', 'Salaries',
  'Miscellaneous', 'Other',
];

async function main() {
  console.log('Syncing expense categories...');
  for (const name of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Synced ${EXPENSE_CATEGORIES.length} expense categories - any other existing category in the database is left untouched.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
