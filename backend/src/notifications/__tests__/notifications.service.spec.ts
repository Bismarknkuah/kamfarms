import { NotificationsService } from '../notifications.service';

describe('NotificationsService', () => {
  function buildService() {
    const prisma = {
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const service = new NotificationsService(prisma as any);
    return { service, prisma };
  }

  it('fans one event out to every recipient in a single bulk insert', async () => {
    const { service, prisma } = buildService();

    await service.notify({ userIds: ['u1', 'u2'], type: 'task_assigned', title: 'New task', body: 'Do the thing' });

    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'u1', type: 'task_assigned' }),
        expect.objectContaining({ userId: 'u2', type: 'task_assigned' }),
      ],
    });
  });

  it('does nothing (no DB call) when there are no recipients', async () => {
    const { service, prisma } = buildService();

    const result = await service.notify({ userIds: [], type: 'task_assigned', title: 'x', body: 'y' });

    expect(result).toEqual({ count: 0 });
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('scopes markRead to the owning user in the query itself, not a separate check', async () => {
    const { service, prisma } = buildService();

    await service.markRead('notif-1', 'user-1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'notif-1', userId: 'user-1' } }),
    );
  });

  describe('deleting old notifications', () => {
    it('deletes one notification only if it belongs to the caller', async () => {
      const { service, prisma } = buildService();
      await service.remove('n1', 'u1');
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { id: 'n1', userId: 'u1' } });
    });

    it('clears only read notifications by default, always scoped to the caller', async () => {
      const { service, prisma } = buildService();
      const res = await service.clear('u1');
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', isRead: true } });
      expect(res.data.deleted).toBe(3);
    });

    it('clears everything older than N days, read or not', async () => {
      const { service, prisma } = buildService();
      await service.clear('u1', 'older', 7);
      const where = prisma.notification.deleteMany.mock.calls[0][0].where;
      expect(where.userId).toBe('u1');
      expect(where.isRead).toBeUndefined();
      const ageDays = (Date.now() - where.createdAt.lt.getTime()) / 86_400_000;
      expect(ageDays).toBeGreaterThan(6.99);
      expect(ageDays).toBeLessThan(7.01);
    });

    it('falls back to 30 days for a nonsense number of days', async () => {
      const { service, prisma } = buildService();
      await service.clear('u1', 'older', Number.NaN);
      const where = prisma.notification.deleteMany.mock.calls[0][0].where;
      expect(Math.round((Date.now() - where.createdAt.lt.getTime()) / 86_400_000)).toBe(30);
    });

    it('can clear all of the caller\'s own notifications and never anyone else\'s', async () => {
      const { service, prisma } = buildService();
      await service.clear('u1', 'all');
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    });
  });
});
