import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaddyEntriesService } from '../paddy-entries.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

const person = (perms: string[], scopes: { scopeType: string; scopeId: string | null }[] = [{ scopeType: 'GLOBAL', scopeId: null }]) =>
  ({ id: 'fm-1', firstName: 'Yaa', lastName: 'Owusu', email: 'fm@kam.local', permissionCodes: new Set(perms), roles: [{ roleId: 'r', roleCode: 'FARM_MANAGER', permissions: perms, scopes }] }) as unknown as AuthenticatedUser;
const FM = person(['paddy.create', 'paddy.submit']);

const SIZE_4 = { id: 'g4', label: 'Size 4', isActive: true };
const SIZE_5 = { id: 'g5', label: 'Size 5', isActive: true };

/** A database that really is all-or-nothing: whatever an unfinished transaction wrote is rolled back. */
function build(opts: { failOnEntry?: number; grades?: unknown[]; farm?: unknown } = {}) {
  let seq = 0;
  const saved: Record<string, unknown>[] = [];
  const tx = {
    paddyEntry: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (opts.failOnEntry === saved.length + 1) throw new Error('the database dropped the connection');
        const row = { id: `e${saved.length + 1}`, ...data };
        saved.push(row);
        return row;
      }),
    },
  };
  const prisma = {
    farm: { findUnique: jest.fn(async () => (opts.farm === undefined ? { id: 'farm-1', name: 'Nkawkaw Farm', isActive: true } : opts.farm)) },
    paddyGrade: { findMany: jest.fn(async () => opts.grades ?? [SIZE_4, SIZE_5]) },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => {
      const before = saved.length;
      try { return await cb(tx); } catch (err) { saved.length = before; throw err; }
    }),
  };
  const ledger = { generateNumber: jest.fn(async (_t: unknown, prefix: string) => `${prefix}-2026-${String(++seq).padStart(6, '0')}`) };
  const audit = { record: jest.fn() };
  return { service: new PaddyEntriesService(prisma as any, audit as any, ledger as any), prisma, tx, ledger, audit, saved };
}

const intake = (over: Record<string, unknown> = {}) => ({
  farmId: 'farm-1', entryDate: '2026-10-05',
  lines: [{ paddyGradeId: 'g4', bagCount: 17 }, { paddyGradeId: 'g5', bagCount: 3 }],
  ...over,
}) as any;

describe('PaddyEntriesService.createIntake: ONE intake with several sizes (17 bags of Size 4 and 3 bags of Size 5)', () => {
  it('saves every size together, under one intake reference, and submits it for approval in the same step', async () => {
    const { service, saved } = build();
    const r = await service.createIntake(intake(), FM);
    expect(saved).toHaveLength(2);
    expect(new Set(saved.map((s) => s.intakeRef)).size).toBe(1);
    expect(r.intakeRef).toMatch(/^IN-2026-/);
    expect(r.status).toBe('SUBMITTED');
    expect(r.submitted).toBe(true);
    expect(saved.every((s) => s.status === 'SUBMITTED' && s.submittedAt instanceof Date && s.submittedById === 'fm-1')).toBe(true);
    expect(r.entries.map((e) => [e.gradeLabel, e.bagCount])).toEqual([['Size 4', 17], ['Size 5', 3]]);
    expect(r.totalBags).toBe(20);
    expect(r.farmName).toBe('Nkawkaw Farm');
  });

  it('counts in bags: with no scale the kilograms are worked out from the bags and marked as an estimate', async () => {
    const { service, saved } = build();
    const r = await service.createIntake(intake(), FM);
    expect(r.entries.map((e) => e.weightKg)).toEqual([850, 150]);
    expect(r.entries.every((e) => e.weightEstimated)).toBe(true);
    expect(r.anyWeightEstimated).toBe(true);
    expect(r.totalKg).toBe(1000);
    expect(saved[0]).toMatchObject({ weightEstimated: true, avgBagWeightKg: 50 });
  });

  it('keeps a weighed size as measured, and estimates only the rest', async () => {
    const { service } = build();
    const r = await service.createIntake(intake({ lines: [{ paddyGradeId: 'g4', bagCount: 17, weightKg: 861.5 }, { paddyGradeId: 'g5', bagCount: 3 }] }), FM);
    expect(r.entries[0]).toMatchObject({ weightKg: 861.5, weightEstimated: false });
    expect(r.entries[1]).toMatchObject({ weightKg: 150, weightEstimated: true });
  });

  it('gives every entry its own entry and batch number, so each keeps its own approval and traceability', async () => {
    const { service, saved } = build();
    await service.createIntake(intake(), FM);
    expect(new Set(saved.map((s) => s.entryNumber)).size).toBe(2);
    expect(new Set(saved.map((s) => s.batchNumber)).size).toBe(2);
    expect(saved.every((s) => String(s.entryNumber).startsWith('PE-') && String(s.batchNumber).startsWith('PB-'))).toBe(true);
  });

  it('shares the farm, date, moisture, supplier and notes across the sizes', async () => {
    const { service, saved } = build();
    await service.createIntake(intake({ moisturePercent: 14.2, supplierName: 'Mensah Farms', notes: 'Dry and clean' }), FM);
    for (const s of saved) expect(s).toMatchObject({ farmId: 'farm-1', moisturePercent: 14.2, supplierName: 'Mensah Farms', notes: 'Dry and clean' });
  });

  it('is ALL OR NOTHING: if the second size cannot be saved, the first is not left behind, so a retry cannot double it up', async () => {
    const { service, saved, prisma } = build({ failOnEntry: 2 });
    await expect(service.createIntake(intake(), FM)).rejects.toThrow(/dropped the connection/);
    expect(saved).toHaveLength(0);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('can be saved as a draft instead, and then nothing is submitted', async () => {
    const { service, saved, audit } = build();
    const r = await service.createIntake(intake({ submit: false }), person(['paddy.create']));
    expect(r.status).toBe('DRAFT');
    expect(saved.every((s) => s.status === 'DRAFT' && s.submittedAt === null)).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'paddy.create' }), expect.anything());
  });

  it('records each entry in the audit trail, in the same transaction', async () => {
    const { service, audit, tx } = build();
    await service.createIntake(intake(), FM);
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'paddy.create_and_submit', entity: 'PaddyEntry', userId: 'fm-1' }), tx);
  });

  it('refuses the same size twice, by name, before anything is saved', async () => {
    const { service, prisma } = build();
    await expect(service.createIntake(intake({ lines: [{ paddyGradeId: 'g4', bagCount: 10 }, { paddyGradeId: 'g4', bagCount: 7 }] }), FM)).rejects.toThrow(/Size 4 is on the list twice/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a size that does not exist or is no longer in use', async () => {
    await expect(build({ grades: [SIZE_4] }).service.createIntake(intake(), FM)).rejects.toThrow(BadRequestException);
    await expect(build({ grades: [SIZE_4, { ...SIZE_5, isActive: false }] }).service.createIntake(intake(), FM)).rejects.toThrow(/no longer in use/);
  });

  it('refuses a farm that is missing or inactive, and a farm outside the person\'s own', async () => {
    await expect(build({ farm: null }).service.createIntake(intake(), FM)).rejects.toThrow(/Farm not found or inactive/);
    await expect(build({ farm: { id: 'farm-1', name: 'X', isActive: false } }).service.createIntake(intake(), FM)).rejects.toThrow(/Farm not found or inactive/);
    await expect(build().service.createIntake(intake(), person(['paddy.create', 'paddy.submit'], [{ scopeType: 'FARM', scopeId: 'farm-9' }]))).rejects.toThrow(ForbiddenException);
  });

  it('lets someone who may create but not submit save a draft, and says so plainly when they try to submit', async () => {
    const creatorOnly = person(['paddy.create']);
    await expect(build().service.createIntake(intake(), creatorOnly)).rejects.toThrow(/save an intake as a draft, but you do not have permission to submit/);
    await expect(build().service.createIntake(intake({ submit: false }), creatorOnly)).resolves.toMatchObject({ status: 'DRAFT' });
  });
});
