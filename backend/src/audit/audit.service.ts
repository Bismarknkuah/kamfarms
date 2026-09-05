import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface AuditEntryInput {
  userId?: string | null;
  roleSnapshot?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  beforeValue?: unknown;
  afterValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  reason?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Write an audit record. Accepts an optional Prisma transaction client so
   * callers can include the audit write inside the same DB transaction as
   * the business change it documents (see spec section 90). */
  async record(entry: AuditEntryInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        roleSnapshot: entry.roleSnapshot ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        beforeValue: entry.beforeValue as Prisma.InputJsonValue,
        afterValue: entry.afterValue as Prisma.InputJsonValue,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        reason: entry.reason ?? null,
      },
    });
  }
}
