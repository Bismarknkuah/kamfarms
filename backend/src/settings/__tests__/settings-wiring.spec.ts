import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService } from '../../auth/auth.service';
import { MachinesService } from '../../machines/machines.service';
import { ShipmentsService } from '../../logistics/shipments.service';
import { ProductionRecordsService } from '../../production/production-records.service';
import { PaddyMillingReceiptsService } from '../../production/paddy-milling-receipts.service';
import { AuditService } from '../../audit/audit.service';
import { EmailService } from '../../email/email.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { InventoryLedgerService } from '../../inventory-ledger/inventory-ledger.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { defaultOf } from '../settings.registry';

/**
 * The point of the settings: when the System Administrator changes a value, the service behind it behaves
 * differently. Each case here runs the real service twice, with the standard value and with a changed one.
 */
export const settingsWith = (overrides: Record<string, number | string[]> = {}) => ({
  getNumber: jest.fn(async (k: string) => (overrides[k] as number | undefined) ?? defaultOf<number>(k)),
  getRoles: jest.fn(async (k: string) => (overrides[k] as string[] | undefined) ?? defaultOf<string[]>(k)),
});

describe('lockout policy (AuthService.login)', () => {
  const jwt = { signAsync: jest.fn().mockResolvedValue('t') } as unknown as JwtService;
  const config = { get: jest.fn((_k: string, fallback?: string) => fallback) } as unknown as ConfigService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const email = { sendPasswordReset: jest.fn() } as unknown as EmailService;

  async function wrongPassword(failedLoginCount: number, settings?: unknown) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'user@kam.local', passwordHash: await argon2.hash('correct-password-123'), status: 'ACTIVE', lockedUntil: null, failedLoginCount, deletedAt: null }), update: jest.fn() },
      loginAttempt: { create: jest.fn() },
      refreshToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    };
    const service = new AuthService(prisma as any, jwt, config, audit, email, settings as any);
    let error: any;
    try { await service.login({ email: 'user@kam.local', password: 'wrong-password' }, {}); } catch (e) { error = e; }
    return { error, data: prisma.user.update.mock.calls[0][0].data };
  }

  it('with the standard settings a third wrong password does not lock the account (it takes five)', async () => {
    const r = await wrongPassword(2);
    expect(r.data.failedLoginCount).toBe(3);
    expect(r.data.lockedUntil).toBeNull();
  });
  it('once the administrator lowers it to three, the third wrong password locks the account', async () => {
    const r = await wrongPassword(2, settingsWith({ 'auth.max_failed_attempts': 3 }));
    expect(r.error).toBeInstanceOf(ForbiddenException);
    expect(r.data.lockedUntil).toBeInstanceOf(Date);
  });
  it('and raising it to ten means five wrong passwords no longer lock it', async () => {
    const r = await wrongPassword(4, settingsWith({ 'auth.max_failed_attempts': 10 }));
    expect(r.data.lockedUntil).toBeNull();
  });
  it('locks for fifteen minutes by default, and for as long as the administrator chose otherwise, and says so', async () => {
    const standard = await wrongPassword(4);
    expect((standard.data.lockedUntil.getTime() - Date.now()) / 60_000).toBeGreaterThan(14);
    expect(standard.error.message).toContain('15 minutes');
    const chosen = await wrongPassword(4, settingsWith({ 'auth.lockout_minutes': 60 }));
    const minutes = (chosen.data.lockedUntil.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(59);
    expect(minutes).toBeLessThanOrEqual(60);
    expect(chosen.error.message).toContain('60 minutes');
  });
});

describe('delivery difference accepted without approval (ShipmentsService.receive)', () => {
  const manager = { id: 'wm-1', roles: [{ scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }] } as unknown as AuthenticatedUser;
  const shipment = { id: 'sh-1', shipmentNumber: 'SH-1', deliveryReportId: 'dr-1', farmId: 'farm-a', warehouseId: 'wh-1', paddyGradeId: 'g4', expectedKg: 20000, expectedBags: 400, receivedAt: null, farm: {}, warehouse: {}, paddyGrade: {}, deliveryReport: { vehicle: null, driver: null }, events: [] };

  async function adjustmentFor(receivedKg: number, settings?: unknown) {
    const prisma = {
      shipment: { findUnique: jest.fn().mockResolvedValue(shipment), update: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({ shipment: { update: jest.fn().mockResolvedValue({ ...shipment, receivedAt: new Date() }) }, deliveryReport: { update: jest.fn() }, shipmentEvent: { create: jest.fn() } })),
    };
    const ledger = { recordTransaction: jest.fn(), adjustBalance: jest.fn() } as unknown as InventoryLedgerService;
    const service = new ShipmentsService(prisma as any, { record: jest.fn() } as unknown as AuditService, ledger, settings as any);
    await service.receive('sh-1', { receivedKg, receivedBags: 399 }, manager);
    return (ledger.recordTransaction as jest.Mock).mock.calls.find(([, input]) => input.type === 'STOCK_ADJUSTMENT')?.[1];
  }

  it('under the standard 5 kg a 6 kg difference needs approval and a 2 kg difference does not', async () => {
    expect((await adjustmentFor(19994)).approvalStatus).toBe('PENDING');
    expect((await adjustmentFor(19998)).approvalStatus).not.toBe('PENDING');
  });
  it('after the administrator raises it to 10 kg the 6 kg difference is accepted', async () => {
    expect((await adjustmentFor(19994, settingsWith({ 'logistics.variance_tolerance_kg': 10 }))).approvalStatus).not.toBe('PENDING');
  });
  it('and after lowering it to 1 kg the 2 kg difference now needs approval', async () => {
    expect((await adjustmentFor(19998, settingsWith({ 'logistics.variance_tolerance_kg': 1 }))).approvalStatus).toBe('PENDING');
  });
});

describe('machine power checks (MachinesService.recordMeterReading)', () => {
  const operator = { id: 'operator-1' } as AuthenticatedUser;
  const baseline = (n: number) => Array.from({ length: n }, (_, i) => ({ consumption: [500, 520, 480, 510, 490][i % 5], date: new Date(`2026-08-0${i + 1}`), shift: null }));

  function build(recent: { consumption: number; date: Date; shift: string | null }[], settings?: unknown) {
    const prisma = {
      machine: { findUnique: jest.fn().mockResolvedValue({ id: 'm-1', machineName: 'Huller 1', maintenanceLogs: [], millingCenter: {} }), findUniqueOrThrow: jest.fn().mockResolvedValue({ machineName: 'Huller 1' }) },
      meterReading: { findFirst: jest.fn().mockResolvedValue({ closingReading: 0 }), findMany: jest.fn().mockResolvedValue(recent), create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mr-1', ...data })) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'ops-1' }]) },
    };
    const service = new MachinesService(prisma as any, { record: jest.fn() } as unknown as AuditService, { notify: jest.fn() } as unknown as NotificationsService, settings as any);
    return { service, prisma };
  }
  const read = (service: MachinesService, currentReading: number) => service.recordMeterReading('m-1', { date: '2026-09-01', currentReading }, operator);

  it('a reading 40% above the machine\'s average is normal under the standard 50% limit, and unusual once the administrator sets 30%', async () => {
    expect((await read(build(baseline(3)).service, 700)).isAnomalous).toBe(false);
    expect((await read(build(baseline(3), settingsWith({ 'machines.anomaly_deviation_percent': 30 })).service, 700)).isAnomalous).toBe(true);
  });
  it('a machine needs three earlier readings before it is judged, or however many the administrator asks for', async () => {
    expect((await read(build(baseline(3)).service, 900)).isAnomalous).toBe(true);
    expect((await read(build(baseline(3), settingsWith({ 'machines.min_readings_baseline': 5 })).service, 900)).isAnomalous).toBe(false);
    expect((await read(build(baseline(5), settingsWith({ 'machines.min_readings_baseline': 5 })).service, 900)).isAnomalous).toBe(true);
  });
  it('tells the roles the administrator chose, instead of the standard ones', async () => {
    const standard = build(baseline(3));
    await read(standard.service, 900);
    expect(standard.prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ roles: { some: { role: { code: { in: ['OPERATIONS_MANAGER', 'MD', 'CEO'] } } } } }) }));
    const chosen = build(baseline(3), settingsWith({ 'alerts.machine_anomaly_roles': ['FINANCE_DIRECTOR'] }));
    await read(chosen.service, 900);
    expect(chosen.prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ roles: { some: { role: { code: { in: ['FINANCE_DIRECTOR'] } } } } }) }));
  });
});

describe('milling checks (ProductionRecordsService.create)', () => {
  const operator = { id: 'operator-1' } as AuthenticatedUser;
  const dto = { millingCenterId: 'mc-1', date: '2026-09-01', paddyGradeId: 'grade-4', paddyProcessedKg: 20000, recoveredRiceKg: 14000, brokenRiceKg: 2900, riceHullKg: 2000, wasteLossKg: 500 }; // 19,400 of 20,000 kg accounted for: 3% unaccounted

  function build(settings?: unknown, created: Record<string, unknown> = { id: 'pr-1', recordNumber: 'PR-1', massBalanceFlag: false }) {
    const txCreate = jest.fn().mockResolvedValue(created);
    const prisma = {
      millingCenter: { findUnique: jest.fn().mockResolvedValue({ id: 'mc-1', isActive: true }) },
      productionRecord: { findUnique: jest.fn().mockResolvedValue({ id: 'pr-1', status: 'SUBMITTED' }), count: jest.fn().mockResolvedValue(0) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'ops-1' }]) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({ productionRecord: { create: txCreate, count: jest.fn().mockResolvedValue(0), update: jest.fn() }, product: { findFirst: jest.fn(), create: jest.fn() } })),
    };
    const service = new ProductionRecordsService(prisma as any, { record: jest.fn() } as unknown as AuditService, { recordTransaction: jest.fn(), adjustBalance: jest.fn() } as unknown as InventoryLedgerService, { notify: jest.fn() } as unknown as NotificationsService, settings as any);
    return { service, prisma, txCreate };
  }

  it('a run with 3% unaccounted is fine under the standard 5% limit, and is flagged once the administrator sets 2%', async () => {
    const standard = build();
    await standard.service.create(dto, operator);
    expect(standard.txCreate.mock.calls[0][0].data.massBalanceFlag).toBe(false);
    const stricter = build(settingsWith({ 'production.abnormal_variance_percent': 2 }));
    await stricter.service.create(dto, operator);
    expect(stricter.txCreate.mock.calls[0][0].data.massBalanceFlag).toBe(true);
  });
  it('outputs 0.8% over the paddy are refused as impossible under the standard 0.5% allowance, and accepted when the administrator allows 1%', async () => {
    const over = { ...dto, recoveredRiceKg: 14000, brokenRiceKg: 3000, riceHullKg: 2660, wasteLossKg: 500 }; // 20,160 out of 20,000
    await expect(build().service.create(over, operator)).rejects.toThrow(BadRequestException);
    await expect(build(settingsWith({ 'production.impossible_output_tolerance_percent': 1 })).service.create(over, operator)).resolves.toBeDefined();
  });
  it('tells the standard roles about a flagged run, or the roles the administrator chose', async () => {
    const flagged = { id: 'pr-1', recordNumber: 'PR-9', massBalanceFlag: true, recoveryPercent: 92.5 };
    const standard = build(undefined, flagged);
    await standard.service.create(dto, operator);
    expect(standard.prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ roles: { some: { role: { code: { in: ['OPERATIONS_MANAGER', 'MD', 'CEO'] } } } } }) }));
    const chosen = build(settingsWith({ 'alerts.mass_balance_roles': ['FINANCE_DIRECTOR', 'AUDITOR'] }), flagged);
    await chosen.service.create(dto, operator);
    expect(chosen.prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ roles: { some: { role: { code: { in: ['FINANCE_DIRECTOR', 'AUDITOR'] } } } } }) }));
  });
});

describe('standard paddy bag weight (PaddyMillingReceiptsService.create)', () => {
  const operator = { id: 'operator-1' } as AuthenticatedUser;
  function build(settings?: unknown) {
    const create = jest.fn().mockResolvedValue({ id: 'pmr-1', receiptNumber: 'PMR-1' });
    const prisma = {
      millingCenter: { findUnique: jest.fn().mockResolvedValue({ id: 'mc-1', isActive: true }) },
      paddyMillingReceipt: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({ paddyMillingReceipt: { count: jest.fn().mockResolvedValue(0), create } })),
    };
    return { service: new PaddyMillingReceiptsService(prisma as any, { record: jest.fn() } as unknown as AuditService, settings as any), create };
  }
  const kgOf = (create: jest.Mock) => create.mock.calls[0][0].data.lines.create.map((l: { kg: number }) => l.kg);

  it('estimates kilograms from bags at 50 kg a bag, or at the weight the administrator set', async () => {
    const standard = build();
    await standard.service.create({ millingCenterId: 'mc-1', date: '2026-01-01', lines: [{ paddyGradeId: 'g4', bagCount: 10 }] }, operator);
    expect(kgOf(standard.create)).toEqual([500]);
    const chosen = build(settingsWith({ 'paddy.standard_bag_kg': 40 }));
    await chosen.service.create({ millingCenterId: 'mc-1', date: '2026-01-01', lines: [{ paddyGradeId: 'g4', bagCount: 10 }] }, operator);
    expect(kgOf(chosen.create)).toEqual([400]);
  });
  it('never overrides a weight that was actually entered', async () => {
    const chosen = build(settingsWith({ 'paddy.standard_bag_kg': 40 }));
    await chosen.service.create({ millingCenterId: 'mc-1', date: '2026-01-01', lines: [{ paddyGradeId: 'g4', bagCount: 10, kg: 480 }] }, operator);
    expect(kgOf(chosen.create)).toEqual([480]);
  });
});
