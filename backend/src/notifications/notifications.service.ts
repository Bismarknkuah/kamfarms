import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface NotifyInput {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  channel?: NotificationChannel;
}

/**
 * Global service — any module can inject NotificationsService directly
 * without importing NotificationsModule, same pattern as AuditService.
 * `notify()` fans one event out to any number of recipients in a single
 * bulk insert.
 *
 * Email/SMS delivery is architected via NotificationChannel + the
 * EMAIL_* env vars from Phase 1's .env.example, but actual outbound
 * delivery (an email/SMS provider integration) is not wired in this
 * phase — IN_APP notifications are fully functional; EMAIL/SMS rows are
 * recorded with that channel but no external send happens yet. This is a
 * deliberate, documented scope boundary, not a silent gap.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotifyInput) {
    if (input.userIds.length === 0) return { count: 0 };

    return this.prisma.notification.createMany({
      data: input.userIds.map((userId) => ({
        userId,
        channel: input.channel ?? 'IN_APP',
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      })),
    });
  }

  listForUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, isRead: unreadOnly ? false : undefined },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markRead(id: string, userId: string) {
    // Scoped to the owning user in the WHERE clause itself — updateMany
    // silently affects zero rows rather than needing a separate
    // ownership check + throw, which is fine here since "already read or
    // not yours" isn't a distinction the caller needs to see.
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true, message: 'Marked as read.', errorCode: null, data: null };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true, message: 'All notifications marked as read.', errorCode: null, data: null };
  }
}
