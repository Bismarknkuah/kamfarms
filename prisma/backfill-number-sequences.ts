/* eslint-disable no-console */
// A one-time backfill, run once after the number-generation fix - NOT
// part of every-deploy sync like sync-permissions.ts and
// sync-expense-categories.ts. The new NumberSequence counter starts
// fresh at zero, but any paddy entries, batches, delivery orders/
// reports, shipments, or inventory transactions created before this
// fix already occupy those same low numbers (PE-2026-000001, etc.) -
// without this backfill, the very first new record created after the
// fix collides with pre-existing data, exactly the confirmed bug this
// closes ("Unique constraint failed on the fields: (entry_number)").
//
// Safe to run more than once - always recalculates from the actual
// current max in each table, never just increments blindly.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const YEAR = new Date().getFullYear();

const TARGETS: { prefix: string; model: keyof PrismaClient; field: string }[] = [
  { prefix: 'TXN', model: 'inventoryTransaction', field: 'transactionNumber' },
  { prefix: 'PE', model: 'paddyEntry', field: 'entryNumber' },
  { prefix: 'PB', model: 'paddyBatch', field: 'batchNumber' },
  { prefix: 'DO', model: 'deliveryOrder', field: 'orderNumber' },
  { prefix: 'DR', model: 'deliveryReport', field: 'reportNumber' },
  { prefix: 'SH', model: 'shipment', field: 'shipmentNumber' },
];

async function main() {
  console.log(`Backfilling number sequences for ${YEAR}...`);
  for (const { prefix, model, field } of TARGETS) {
    const yearPrefix = `${prefix}-${YEAR}-`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[model];
    const rows: { [key: string]: string }[] = await delegate.findMany({
      where: { [field]: { startsWith: yearPrefix } },
      select: { [field]: true },
    });
    const highest = rows.reduce((max, row) => {
      const numPart = parseInt(row[field].slice(yearPrefix.length), 10);
      return Number.isFinite(numPart) && numPart > max ? numPart : max;
    }, 0);

    const key = `${prefix}-${YEAR}`;
    await prisma.numberSequence.upsert({
      where: { id: key },
      create: { id: key, value: highest },
      update: { value: highest },
    });
    console.log(`  ${key}: found ${rows.length} existing record(s), highest number ${highest} - next generated number will be ${highest + 1}.`);
  }
  console.log('Done. New records will now continue past all existing numbers, not collide with them.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
