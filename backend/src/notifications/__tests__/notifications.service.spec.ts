import { NotificationsService } from '../notifications.service';

describe('NotificationsService', () => {
  function buildService() {
    const prisma = {
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
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
});
