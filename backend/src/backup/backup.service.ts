import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RecordBackupDto } from './dto/record-backup.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

/**
 * This service tracks backup status — it does NOT run `pg_dump` itself.
 * Actual backup execution belongs to the hosting platform (Railway's
 * managed Postgres backup feature, or a scheduled job that runs
 * `pg_dump` and then calls `recordCompletion` here to log the result).
 * The admin dashboard fields spec section 58 asks for (last successful
 * backup, failed backup, backup size) are all real queries against this
 * table — this is a status ledger, not a simulated backup runner
 * pretending to have actually backed up anything.
 */
@Injectable()
export class BackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.backupRecord.findMany({
      include: { triggeredBy: true },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  async status() {
    const [lastSuccess, lastFailure, running] = await Promise.all([
      this.prisma.backupRecord.findFirst({ where: { status: 'SUCCESS' }, orderBy: { completedAt: 'desc' } }),
      this.prisma.backupRecord.findFirst({ where: { status: 'FAILED' }, orderBy: { completedAt: 'desc' } }),
      this.prisma.backupRecord.findFirst({ where: { status: 'RUNNING' }, orderBy: { startedAt: 'desc' } }),
    ]);
    return { lastSuccess, lastFailure, currentlyRunning: running };
  }

  async start(actor: AuthenticatedUser) {
    const record = await this.prisma.backupRecord.create({
      data: { status: 'RUNNING', triggeredById: actor.id },
    });
    await this.audit.record({ userId: actor.id, action: 'backup.start', entity: 'BackupRecord', entityId: record.id });
    return record;
  }

  async recordCompletion(id: string, dto: RecordBackupDto, actor: AuthenticatedUser) {
    const record = await this.prisma.backupRecord.update({
      where: { id },
      data: {
        status: dto.status,
        completedAt: new Date(),
        sizeBytes: dto.sizeBytes,
        location: dto.location,
        notes: dto.notes,
      },
    });
    await this.audit.record({
      userId: actor.id,
      action: 'backup.record_completion',
      entity: 'BackupRecord',
      entityId: id,
      afterValue: { status: dto.status },
    });
    return record;
  }
}
