import { BadRequestException } from '@nestjs/common';
import { PaddyRequestsService } from '../paddy-requests.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('PaddyRequestsService.assignToFarm', () => {
  const supervisor = { id: 'supervisor-1', roles: [{ scopes: [{ scopeType: 'GLOBAL', scopeId: null }] }] } as unknown as AuthenticatedUser;

  const pendingRequest = {
    id: 'req-1',
    requestNumber: 'PR-REQ-2026-000001',
    warehouseId: 'wh-1',
    warehouse: { name: 'Central Warehouse' },
    paddyGradeId: 'grade-4',
    paddyGrade: { label: 'Size 4' },
    requestedBagCount: 100,
    requestedKg: 5000,
    status: 'PENDING',
    respondedById: null,
    linkedOrder: null,
    requestedBy: {},
    respondedBy: {},
  };

  function buildService(request = pendingRequest, farmManagers: { userId: string }[] = [{ userId: 'manager-1' }]) {
    const taskCreate = jest.fn().mockResolvedValue({ id: 'task-1', taskNumber: 'TASK-2026-000001', title: 'Dispatch task' });
    const prisma = {
      paddyRequest: {
        findUnique: jest.fn().mockResolvedValue(request),
        update: jest.fn().mockResolvedValue({ ...request, status: 'ACCEPTED' }),
        count: jest.fn(),
      },
      farmManager: { findMany: jest.fn().mockResolvedValue(farmManagers) },
      task: { count: jest.fn().mockResolvedValue(0), create: taskCreate },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          paddyRequest: { update: jest.fn().mockResolvedValue({ ...request, status: 'ACCEPTED' }) },
          task: { count: jest.fn().mockResolvedValue(0), create: taskCreate },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const notifications = { notify: jest.fn() } as unknown as NotificationsService;
    const service = new PaddyRequestsService(prisma as any, audit, notifications);
    return { service, prisma, taskCreate, notifications };
  }

  it('creates a real task assigned to the farm manager, never a dispatch order, when the request is PENDING', async () => {
    const { service, taskCreate } = buildService();
    await service.assignToFarm('req-1', { farmId: 'farm-a', bagCount: 100 }, supervisor);

    expect(taskCreate).toHaveBeenCalledTimes(1);
    const createArgs = taskCreate.mock.calls[0][0].data;
    expect(createArgs.assignedToId).toBe('manager-1');
    expect(createArgs.farmId).toBe('farm-a');
    expect(createArgs.paddyRequestId).toBe('req-1');
  });

  it('notifies the farm manager that a real dispatch task now exists', async () => {
    const { service, notifications } = buildService();
    await service.assignToFarm('req-1', { farmId: 'farm-a', bagCount: 100 }, supervisor);
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['manager-1'], type: 'task.assigned' }));
  });

  it('estimates weight from bag count at 50 KG per bag when not given', async () => {
    const { service, taskCreate } = buildService();
    await service.assignToFarm('req-1', { farmId: 'farm-a', bagCount: 40 }, supervisor);
    const description = taskCreate.mock.calls[0][0].data.description as string;
    expect(description).toContain('2000 KG');
  });

  it('allows assigning a second farm to the same request once it is already ACCEPTED', async () => {
    const acceptedRequest = { ...pendingRequest, status: 'ACCEPTED' };
    const { service, taskCreate } = buildService(acceptedRequest);
    await expect(service.assignToFarm('req-1', { farmId: 'farm-b', bagCount: 60 }, supervisor)).resolves.toBeDefined();
    expect(taskCreate).toHaveBeenCalledTimes(1);
  });

  it('refuses to assign a request that has already been declined', async () => {
    const declinedRequest = { ...pendingRequest, status: 'DECLINED' };
    const { service } = buildService(declinedRequest);
    await expect(service.assignToFarm('req-1', { farmId: 'farm-a', bagCount: 100 }, supervisor)).rejects.toThrow(BadRequestException);
  });

  it('refuses to assign a request that has already been fully fulfilled', async () => {
    const fulfilledRequest = { ...pendingRequest, status: 'FULFILLED' };
    const { service } = buildService(fulfilledRequest);
    await expect(service.assignToFarm('req-1', { farmId: 'farm-a', bagCount: 100 }, supervisor)).rejects.toThrow(BadRequestException);
  });

  it('refuses to assign a farm that has no manager on record', async () => {
    const { service } = buildService(pendingRequest, []);
    await expect(service.assignToFarm('req-1', { farmId: 'farm-a', bagCount: 100 }, supervisor)).rejects.toThrow(BadRequestException);
  });
});
