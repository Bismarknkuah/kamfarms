import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { scopedLocationIds } from '../common/utils/scope.util';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineStatusDto } from './dto/update-machine-status.dto';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { CreateMeterReadingDto } from './dto/create-meter-reading.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

/** A reading whose consumption deviates from the machine's own trailing
 * average by more than this fraction is flagged (spec section 20: detect
 * unusually high/low consumption, sudden changes). Needs at least 3 prior
 * readings before a baseline is trusted — cold-start, same principle as
 * the AI module's cold-start rule in section 21. */
const ANOMALY_DEVIATION_THRESHOLD = 0.5; // 50%
const MIN_READINGS_FOR_BASELINE = 3;

/** Who actually supervises an Operations Officer, plus the top
 * executives — the exact people who should hear about a suspicious
 * meter reading, not just whoever happens to hold machine.view. */
const ANOMALY_ALERT_ROLE_CODES = ['OPERATIONS_MANAGER', 'MD', 'CEO'];

@Injectable()
export class MachinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Was returning machines from every milling center, company-wide, to
   * anyone with machine.view — including an Operations Officer scoped
   * to just one warehouse's milling center. Same fix shape as
   * ProductionRecordsService.list(): filtered through
   * millingCenter.warehouseId since machines don't carry their own
   * scope type. */
  list(actor: AuthenticatedUser, millingCenterId?: string) {
    const where: Record<string, unknown> = millingCenterId ? { millingCenterId } : {};
    const { isGlobal, ids } = scopedLocationIds(actor, 'WAREHOUSE');
    if (!isGlobal) {
      if (ids.length === 0) return Promise.resolve([]);
      where.millingCenter = { warehouseId: { in: ids } };
    }
    return this.prisma.machine.findMany({
      where,
      include: { millingCenter: true },
      orderBy: { machineCode: 'asc' },
    });
  }

  async findById(id: string) {
    const machine = await this.prisma.machine.findUnique({
      where: { id },
      include: {
        millingCenter: true,
        maintenanceLogs: { orderBy: { createdAt: 'desc' } },
        // Was missing entirely before this fix — meant even the single-
        // machine detail fetch couldn't show reading history, on top of
        // there being no frontend page for it at all.
        meterReadings: { orderBy: { date: 'desc' }, take: 30, include: { operator: true } },
      },
    });
    if (!machine) throw new NotFoundException('Machine not found.');
    return machine;
  }

  async create(dto: CreateMachineDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.machine.findUnique({ where: { machineCode: dto.machineCode } });
    if (existing) throw new ConflictException('A machine with this code already exists.');

    const center = await this.prisma.millingCenter.findUnique({ where: { id: dto.millingCenterId } });
    if (!center || !center.isActive) throw new BadRequestException('Milling center not found or inactive.');

    const machine = await this.prisma.machine.create({
      data: {
        machineCode: dto.machineCode,
        machineName: dto.machineName,
        millingCenterId: dto.millingCenterId,
        type: dto.type,
        manufacturer: dto.manufacturer,
        model: dto.model,
        serialNumber: dto.serialNumber,
        installationDate: dto.installationDate ? new Date(dto.installationDate) : null,
        ratedCapacity: dto.ratedCapacity,
        meterType: dto.meterType,
      },
    });
    await this.audit.record({ userId: actor.id, action: 'machine.create', entity: 'Machine', entityId: machine.id, afterValue: machine });
    return machine;
  }

  async updateStatus(id: string, dto: UpdateMachineStatusDto, actor: AuthenticatedUser) {
    const before = await this.findById(id);
    const updated = await this.prisma.machine.update({ where: { id }, data: { status: dto.status } });
    await this.audit.record({
      userId: actor.id,
      action: 'machine.update_status',
      entity: 'Machine',
      entityId: id,
      beforeValue: { status: before.status },
      afterValue: { status: dto.status, notes: dto.notes },
      reason: dto.notes,
    });
    return updated;
  }

  async recordMaintenance(machineId: string, dto: CreateMaintenanceDto, actor: AuthenticatedUser) {
    await this.findById(machineId);

    const log = await this.prisma.$transaction(async (tx) => {
      const created = await tx.machineMaintenance.create({
        data: {
          machineId,
          type: dto.type,
          scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
          completedDate: dto.completedDate ? new Date(dto.completedDate) : null,
          technician: dto.technician,
          cost: dto.cost,
          downtimeHours: dto.downtimeHours,
          notes: dto.notes,
          createdById: actor.id,
        },
      });

      // A breakdown or an in-progress scheduled maintenance takes the
      // machine offline; a completed one returns it to service.
      const nowUnderMaintenance = dto.type === 'BREAKDOWN' || (dto.type === 'SCHEDULED' && !dto.completedDate);
      await tx.machine.update({
        where: { id: machineId },
        data: {
          status: dto.completedDate ? 'IDLE' : nowUnderMaintenance ? (dto.type === 'BREAKDOWN' ? 'FAULT' : 'MAINTENANCE') : undefined,
          lastMaintenanceAt: dto.completedDate ? new Date(dto.completedDate) : undefined,
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'machine.record_maintenance', entity: 'Machine', entityId: machineId, afterValue: created },
        tx,
      );
      return created;
    });

    return log;
  }

  /** Records a meter reading and flags it if consumption deviates sharply
   * from the machine's own recent history — cold-start rule: no flag
   * possible until MIN_READINGS_FOR_BASELINE prior readings exist. */
  /** Redesigned so the operator only ever types the meter's current
   * cumulative reading — never both an opening and closing value by
   * hand, which was error-prone busywork the meter itself already
   * makes unnecessary (the "opening reading" for a new entry is, by
   * definition, whatever the meter already showed at the end of the
   * last recorded entry). The system finds that last reading itself
   * and derives everything else — matching how a real utility meter
   * actually works, not asking the operator to do subtraction. */
  async recordMeterReading(machineId: string, dto: CreateMeterReadingDto, actor: AuthenticatedUser) {
    await this.findById(machineId); // throws NotFoundException if it doesn't exist
    // Fetched separately with an explicit select rather than reusing
    // findById()'s deeply-nested include result — that type carries
    // meterReadings/maintenanceLogs/millingCenter relations three
    // levels deep, and a real build against the actual generated
    // Prisma client (which this sandbox can't produce) surfaced that
    // TypeScript couldn't resolve `.name` cleanly off that shape. A
    // minimal, unambiguous query for exactly the one field needed here
    // sidesteps the inference issue entirely rather than fighting it.
    const machine = await this.prisma.machine.findUniqueOrThrow({
      where: { id: machineId },
      select: { machineName: true },
    });

    const lastReading = await this.prisma.meterReading.findFirst({
      where: { machineId },
      orderBy: { date: 'desc' },
    });

    // First reading ever logged for this machine — there is nothing to
    // subtract from yet, so the opening reading is the current value
    // itself and consumption starts at zero, rather than guessing at a
    // baseline that doesn't exist.
    const openingReading = lastReading ? Number(lastReading.closingReading) : dto.currentReading;
    const closingReading = dto.currentReading;

    if (closingReading < openingReading) {
      throw new BadRequestException({
        message: `The new reading (${closingReading}) is lower than the last recorded reading (${openingReading}) for this machine. Meters only count up — check the number, or note in the report if the meter was actually replaced/reset.`,
        errorCode: 'METER_ROLLBACK_SUSPECTED',
      });
    }
    const consumption = closingReading - openingReading;

    const recentReadings = await this.prisma.meterReading.findMany({
      where: { machineId },
      orderBy: { date: 'desc' },
      take: 10,
    });

    let isAnomalous = false;
    let anomalyReason: string | null = null;

    if (recentReadings.length >= MIN_READINGS_FOR_BASELINE) {
      const avg = recentReadings.reduce((sum, r) => sum + Number(r.consumption), 0) / recentReadings.length;
      if (avg > 0) {
        const deviation = Math.abs(consumption - avg) / avg;
        if (deviation > ANOMALY_DEVIATION_THRESHOLD) {
          isAnomalous = true;
          anomalyReason = `Consumption ${consumption.toFixed(2)} ${dto.unit ?? 'kWh'} deviates ${(deviation * 100).toFixed(0)}% from this machine's recent average of ${avg.toFixed(2)}.`;
        }
      }
    }

    const duplicate = recentReadings.find(
      (r) => r.date.toISOString().slice(0, 10) === dto.date.slice(0, 10) && r.shift === dto.shift,
    );
    if (duplicate) {
      anomalyReason = anomalyReason
        ? `${anomalyReason} Also: a reading already exists for this machine/date/shift.`
        : 'A reading already exists for this machine/date/shift (possible duplicate).';
      isAnomalous = true;
    }

    const reading = await this.prisma.meterReading.create({
      data: {
        machineId,
        date: new Date(dto.date),
        shift: dto.shift,
        openingReading,
        closingReading,
        consumption,
        unit: dto.unit ?? 'kWh',
        operatorId: actor.id,
        isAnomalous,
        anomalyReason,
        notes: dto.notes,
      },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'meter_reading.create',
      entity: 'MeterReading',
      entityId: reading.id,
      afterValue: reading,
    });

    // A suspicious reading shouldn't just sit flagged in a table nobody
    // opens — routed directly to the people who can actually act on it:
    // whoever supervises Operations Officers, and the top executives.
    // Not everyone who happens to hold machine.view (that would include
    // the operator who logged it, and other roles with no supervisory
    // stake in this specific anomaly).
    if (isAnomalous) {
      const supervisors = await this.prisma.user.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          roles: { some: { role: { code: { in: ANOMALY_ALERT_ROLE_CODES } } } },
        },
        select: { id: true },
      });
      if (supervisors.length > 0) {
        await this.notifications.notify({
          userIds: supervisors.map((u) => u.id),
          type: 'meter_reading.anomaly',
          title: `Suspicious meter reading — ${machine.machineName}`,
          body: anomalyReason ?? `An unusual reading was logged for ${machine.machineName}.`,
          entityType: 'MeterReading',
          entityId: reading.id,
        });
      }
    }

    return reading;
  }
}
