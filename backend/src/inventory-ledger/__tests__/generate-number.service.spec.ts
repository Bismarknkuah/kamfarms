import { InventoryLedgerService } from '../inventory-ledger.service';

function buildTx(initialSequences: Record<string, number> = {}) {
  const sequences = new Map<string, number>(Object.entries(initialSequences));
  const upsert = jest.fn(async ({ where, create, update }: any) => {
    const key = where.id;
    if (!sequences.has(key)) {
      sequences.set(key, create.value);
      return { id: key, value: create.value };
    }
    const next = sequences.get(key)! + (update.value.increment as number);
    sequences.set(key, next);
    return { id: key, value: next };
  });
  const tx = { numberSequence: { upsert } };
  return { tx, sequences };
}

describe('InventoryLedgerService.generateNumber - the real fix behind a production bug', () => {
  const service = new InventoryLedgerService({} as any);

  it('never produces the same number twice for the same prefix, even called back-to-back with no delay - the exact scenario that broke in production (two paddy grades in one multi-row intake submission both generating a batch number)', async () => {
    const { tx } = buildTx();

    const first = await service.generateNumber(tx as any, 'PB', 'paddyBatch');
    const second = await service.generateNumber(tx as any, 'PB', 'paddyBatch');
    const third = await service.generateNumber(tx as any, 'PB', 'paddyBatch');

    const numbers = [first, second, third];
    expect(new Set(numbers).size).toBe(3);
    expect(numbers).toEqual(['PB-2026-000001', 'PB-2026-000002', 'PB-2026-000003']);
  });

  it('keeps independent, non-interfering sequences per prefix', async () => {
    const { tx } = buildTx();

    const paddyEntry = await service.generateNumber(tx as any, 'PE', 'paddyEntry');
    const paddyBatch = await service.generateNumber(tx as any, 'PB', 'paddyBatch');
    const secondEntry = await service.generateNumber(tx as any, 'PE', 'paddyEntry');

    expect(paddyEntry).toBe('PE-2026-000001');
    expect(paddyBatch).toBe('PB-2026-000001');
    expect(secondEntry).toBe('PE-2026-000002');
  });

  it('continues correctly from an existing sequence value rather than restarting at 1', async () => {
    const { tx } = buildTx({ 'PB-2026': 41 });

    const next = await service.generateNumber(tx as any, 'PB', 'paddyBatch');

    expect(next).toBe('PB-2026-000042');
  });
});
