import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TasksService } from '../tasks.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('TasksService', () => {
  const manager = { id: 'manager-1', permissionCodes: new Set(['tasks.assign', 'tasks.complete']) } as unknown as AuthenticatedUser;
  const assignee = { id: 'assignee-1', permissionCodes: new Set(['tasks.complete']) } as unknown as AuthenticatedUser;
  const bystander = { id: 'bystander-1', permissionCodes: new Set(['tasks.complete']) } as unknown as AuthenticatedUser;

  const openTask = {
    id: 'task-1',
    status: 'TODO',
    title: 'Fix the leak',
    assignedToId: 'assignee-1',
    createdById: 'manager-1',
  };

  function buildService() {
    const prisma = {
      task: {
        findUnique: jest.fn().mockResolvedValue(openTask),
        update: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ ...openTask, ...(data as object) })),
        count: jest.fn().mockResolvedValue(0),
      },
      userRole: { findMany: jest.fn().mockResolvedValue([{ userId: 'wm-1' }, { userId: 'wm-2' }]) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          task: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'task-1', title: 'Fix the leak' }) },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const notifications = { notify: jest.fn() } as unknown as NotificationsService;
    const service = new TasksService(prisma as any, audit, notifications);
    return { service, prisma, notifications };
  }

  it('rejects a task with neither an assigned user nor an assigned role', async () => {
    const { service } = buildService();

    await expect(service.create({ title: 'Untitled task' }, manager)).rejects.toThrow(BadRequestException);
  });

  it('notifies every holder of an assigned role, not just one', async () => {
    const { service, notifications } = buildService();

    await service.create({ title: 'Check warehouse stock', assignedRoleCode: 'WAREHOUSE_MANAGER' }, manager);

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['wm-1', 'wm-2'], type: 'task_assigned' }),
    );
  });

  it('lets the assignee update their own task status', async () => {
    const { service, prisma } = buildService();

    await service.updateStatus('task-1', { status: 'IN_PROGRESS' }, assignee);

    expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS' }) }));
  });

  it('blocks a bystander with no relation to the task from updating it', async () => {
    const { service } = buildService();

    await expect(service.updateStatus('task-1', { status: 'IN_PROGRESS' }, bystander)).rejects.toThrow(ForbiddenException);
  });

  it('requires completion evidence to mark a task COMPLETED', async () => {
    const { service } = buildService();

    await expect(service.updateStatus('task-1', { status: 'COMPLETED' }, assignee)).rejects.toThrow(BadRequestException);
  });

  it('notifies the task creator when it is completed by someone else', async () => {
    const { service, notifications } = buildService();

    await service.updateStatus('task-1', { status: 'COMPLETED', completionEvidence: 'Fixed and tested.' }, assignee);

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['manager-1'], type: 'task_completed' }),
    );
  });
});
