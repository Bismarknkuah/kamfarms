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
// A real, confirmed second gap fixed here too: PaddyEntry has its own
// batchNumber field (assigned at creation, even in DRAFT, for
// traceability before an actual PaddyBatch record exists) - a
// genuinely separate column from PaddyBatch's own batchNumber, but
// both draw from the exact same "PB-2026" number space. The first
// version of this script only checked the PaddyBatch table, so an old
// PaddyEntry created before this fix (with its own PB-2026-000001
// already stored) was invisible to the backfill, and the "PB" counter
// restarted at 1 and collided with it - traced directly from a real
// Railway log: "Unique constraint failed on the fields:
// (batch_number)", recurring even after the first backfill run.
//
// Safe to run more than once - always recalculates from the actual
// current max in each table, never just increments blindly.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const YEAR = new Date().getFullYear();

const TARGETS: { prefix: string; sources: { model: keyof PrismaClient; field: string }[] }[] = [
  { prefix: 'TXN', sources: [{ model: 'inventoryTransaction', field: 'transactionNumber' }] },
  // PE and PB both draw candidates from the PaddyEntry table - it
  // carries both its own entryNumber and its own batchNumber - plus PB
  // also checks the separate PaddyBatch table, since both share the
  // same "PB-2026" sequence.
  { prefix: 'PE', sources: [{ model: 'paddyEntry', field: 'entryNumber' }] },
  { prefix: 'PB', sources: [{ model: 'paddyEntry', field: 'batchNumber' }, { model: 'paddyBatch', field: 'batchNumber' }] },
  { prefix: 'DO', sources: [{ model: 'deliveryOrder', field: 'orderNumber' }] },
  { prefix: 'DR', sources: [{ model: 'deliveryReport', field: 'reportNumber' }] },
  { prefix: 'SH', sources: [{ model: 'shipment', field: 'shipmentNumber' }] },
];

async function main() {
  console.log(`Backfilling number sequences for ${YEAR}...`);
  for (const { prefix, sources } of TARGETS) {
    const yearPrefix = `${prefix}-${YEAR}-`;
    let highest = 0;
    let totalFound = 0;
    for (const { model, field } of sources) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegate = (prisma as any)[model];
      const rows: { [key: string]: string }[] = await delegate.findMany({
        where: { [field]: { startsWith: yearPrefix } },
        select: { [field]: true },
      });
      totalFound += rows.length;
      for (const row of rows) {
        const numPart = parseInt(row[field].slice(yearPrefix.length), 10);
        if (Number.isFinite(numPart) && numPart > highest) highest = numPart;
      }
    }

    const key = `${prefix}-${YEAR}`;
    await prisma.numberSequence.upsert({
      where: { id: key },
      create: { id: key, value: highest },
      update: { value: highest },
    });
    console.log(`  ${key}: found ${totalFound} existing record(s) across ${sources.length} table(s), highest number ${highest} - next generated number will be ${highest + 1}.`);
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
