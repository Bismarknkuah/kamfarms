import { BadRequestException } from '@nestjs/common';
import { MachinesService } from '../machines.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('MachinesService.recordMeterReading', () => {
  const operator = { id: 'operator-1' } as AuthenticatedUser;

  function buildService(
    lastReading: { closingReading: number } | null,
    recentReadings: { consumption: number; date: Date; shift: string | null }[] = [],
  ) {
    const prisma = {
      machine: {
        findUnique: jest.fn().mockResolvedValue({ id: 'm-1', machineName: 'Huller 1', maintenanceLogs: [], millingCenter: {} }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ machineName: 'Huller 1' }),
      },
      meterReading: {
        findFirst: jest.fn().mockResolvedValue(lastReading),
        findMany: jest.fn().mockResolvedValue(recentReadings),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mr-1', ...data })),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'ops-mgr-1' }, { id: 'md-1' }]) },
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const notifications = { notify: jest.fn() } as unknown as NotificationsService;
    const service = new MachinesService(prisma as any, audit, notifications);
    return { service, prisma, notifications };
  }

  it('the actual redesign: the operator only supplies the current reading — opening reading and consumption are derived automatically from the last reading on file, not typed by hand', async () => {
    const { service, prisma } = buildService({ closingReading: 1000 });

    const result = await service.recordMeterReading('m-1', { date: '2026-09-04', currentReading: 1150 }, operator);

    expect(prisma.meterReading.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ openingReading: 1000, closingReading: 1150, consumption: 150 }) }),
    );
    expect(result.consumption).toBe(150);
  });

  it('the very first reading ever logged for a machine has nothing to subtract from — opening reading defaults to the current value and consumption starts at zero, not an error or a guess', async () => {
    const { service, prisma } = buildService(null);

    const result = await service.recordMeterReading('m-1', { date: '2026-09-01', currentReading: 500 }, operator);

    expect(prisma.meterReading.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ openingReading: 500, closingReading: 500, consumption: 0 }) }),
    );
  });

  it('rejects a new reading lower than the last recorded reading (meter rollback / data-entry error)', async () => {
    const { service } = buildService({ closingReading: 500 });

    await expect(
      service.recordMeterReading('m-1', { date: '2026-09-01', currentReading: 400 }, operator),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not flag anything during cold start (fewer than 3 prior readings)', async () => {
    const { service } = buildService({ closingReading: 0 }, [{ consumption: 100, date: new Date('2026-08-01'), shift: null }]);

    const result = await service.recordMeterReading('m-1', { date: '2026-09-01', currentReading: 900 }, operator);

    expect(result.isAnomalous).toBe(false);
  });

  it('flags a reading that deviates sharply from the machine\'s own recent average once a baseline exists', async () => {
    const { service, notifications } = buildService({ closingReading: 0 }, [
      { consumption: 500, date: new Date('2026-08-01'), shift: null },
      { consumption: 520, date: new Date('2026-08-02'), shift: null },
      { consumption: 480, date: new Date('2026-08-03'), shift: null },
    ]);

    // Baseline ~500 kWh; this reading is 900 kWh — 80% above average.
    const result = await service.recordMeterReading('m-1', { date: '2026-09-01', currentReading: 900 }, operator);

    expect(result.isAnomalous).toBe(true);
    expect(result.anomalyReason).toContain('deviates');
  });

  it('alerts Operations Manager and top executives — not the operator who logged it — when a reading is flagged', async () => {
    const { service, prisma, notifications } = buildService({ closingReading: 0 }, [
      { consumption: 500, date: new Date('2026-08-01'), shift: null },
      { consumption: 520, date: new Date('2026-08-02'), shift: null },
      { consumption: 480, date: new Date('2026-08-03'), shift: null },
    ]);

    await service.recordMeterReading('m-1', { date: '2026-09-01', currentReading: 900 }, operator);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roles: { some: { role: { code: { in: ['OPERATIONS_MANAGER', 'MD', 'CEO'] } } } },
        }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['ops-mgr-1', 'md-1'],
        title: expect.stringContaining('Huller 1'),
      }),
    );
  });

  it('does not send any alert for a perfectly normal reading', async () => {
    const { service, notifications } = buildService({ closingReading: 0 }, [
      { consumption: 500, date: new Date('2026-08-01'), shift: null },
      { consumption: 510, date: new Date('2026-08-02'), shift: null },
      { consumption: 495, date: new Date('2026-08-03'), shift: null },
    ]);

    await service.recordMeterReading('m-1', { date: '2026-09-01', currentReading: 505 }, operator);

    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('does not flag a reading that stays within normal range of the baseline', async () => {
    const { service } = buildService({ closingReading: 0 }, [
      { consumption: 500, date: new Date('2026-08-01'), shift: null },
      { consumption: 510, date: new Date('2026-08-02'), shift: null },
      { consumption: 495, date: new Date('2026-08-03'), shift: null },
    ]);

    const result = await service.recordMeterReading('m-1', { date: '2026-09-01', currentReading: 505 }, operator);

    expect(result.isAnomalous).toBe(false);
  });
});
