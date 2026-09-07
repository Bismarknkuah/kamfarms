import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CallsService } from '../calls.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CallsGateway } from '../calls.gateway';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('CallsService - hierarchy rules', () => {
  const leastUser = { id: 'least-1' } as AuthenticatedUser;
  const anotherLeastUser = { id: 'least-2' } as AuthenticatedUser;
  const md = { id: 'md-1' } as AuthenticatedUser;

  // A single, shared role lookup that every test configures via
  // roleCodesByUserId - avoids re-declaring the same mock shape
  // per test while still letting each test express exactly who is
  // "top management" for that scenario.
  function buildService(roleCodesByUserId: Record<string, string[]>) {
    const prisma = {
      userRole: {
        findMany: jest.fn().mockImplementation(({ where }: { where: { userId: string } }) =>
          Promise.resolve((roleCodesByUserId[where.userId] ?? []).map((code) => ({ role: { code } }))),
        ),
      },
      callRequest: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'req-1', ...data, requestedBy: { firstName: 'A', lastName: 'B' }, requestedTo: {} })),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      callSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 'call-1', participants: [] }),
      },
      callParticipant: {
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          callSession: { create: jest.fn().mockResolvedValue({ id: 'call-1', initiatedById: 'x' }) },
          callRequest: { update: jest.fn() },
        }),
      ),
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const notifications = { notify: jest.fn() } as unknown as NotificationsService;
    const gateway = { notifyIncomingCall: jest.fn(), notifyCallEnded: jest.fn() } as unknown as CallsGateway;
    const service = new CallsService(prisma as any, audit, notifications, gateway);
    return { service, prisma, notifications, gateway };
  }

  it('refuses a least user directly initiating a call to MD', async () => {
    const { service } = buildService({ 'least-1': [], 'md-1': ['MD'] });

    await expect(
      service.initiateCall({ participantIds: ['md-1'] }, leastUser),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a least user to directly initiate a call to another least user (peer)', async () => {
    const { service, gateway } = buildService({ 'least-1': [], 'least-2': [] });

    await service.initiateCall({ participantIds: ['least-2'] }, leastUser);

    expect(gateway.notifyIncomingCall).toHaveBeenCalled();
  });

  it('refuses a least user starting a GROUP call', async () => {
    const { service } = buildService({ 'least-1': [] });

    await expect(
      service.initiateCall({ participantIds: ['least-2'], type: 'GROUP', title: 'Team sync' }, leastUser),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows MD to directly initiate a call to a least user', async () => {
    const { service, gateway } = buildService({ 'md-1': ['MD'], 'least-1': [] });

    await service.initiateCall({ participantIds: ['least-1'] }, md);

    expect(gateway.notifyIncomingCall).toHaveBeenCalled();
  });

  it('allows MD to start a GROUP call', async () => {
    const { service, gateway } = buildService({ 'md-1': ['MD'], 'least-1': [], 'least-2': [] });

    await service.initiateCall({ participantIds: ['least-1', 'least-2'], type: 'GROUP', title: 'All-hands' }, md);

    expect(gateway.notifyIncomingCall).toHaveBeenCalled();
  });

  it('refuses MD requesting a call - MD should call directly instead', async () => {
    const { service } = buildService({ 'md-1': ['MD'] });

    await expect(
      service.requestCall({ requestedToId: 'least-1' }, md),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a call request whose target is not top management', async () => {
    const { service } = buildService({ 'least-1': [], 'least-2': [] });

    await expect(
      service.requestCall({ requestedToId: 'least-2' }, leastUser),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows a least user to request a call with MD, and creates it pending', async () => {
    const { service, prisma } = buildService({ 'least-1': [], 'md-1': ['MD'] });

    await service.requestCall({ requestedToId: 'md-1', reason: 'Urgent budget question' }, leastUser);

    expect(prisma.callRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ requestedById: 'least-1', requestedToId: 'md-1' }) }),
    );
  });

  it('only lets the person the request was sent to respond to it', async () => {
    const { service, prisma } = buildService({ 'md-1': ['MD'] });
    prisma.callRequest.findUnique.mockResolvedValue({ id: 'req-1', requestedToId: 'md-1', requestedById: 'least-1', status: 'PENDING' });

    await expect(
      service.respondToCallRequest('req-1', { approve: true }, anotherLeastUser),
    ).rejects.toThrow(ForbiddenException);
  });

  it('approving a call request creates the call initiated by the approver (MD), not the requester', async () => {
    const { service, prisma, gateway } = buildService({ 'md-1': ['MD'] });
    prisma.callRequest.findUnique.mockResolvedValue({ id: 'req-1', requestedToId: 'md-1', requestedById: 'least-1', status: 'PENDING' });
    let capturedCreateData: Record<string, unknown> | null = null;
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb({
        callSession: {
          create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            capturedCreateData = data;
            return Promise.resolve({ id: 'call-1', initiatedById: data.initiatedById });
          }),
        },
        callRequest: { update: jest.fn() },
      }),
    );

    const result = await service.respondToCallRequest('req-1', { approve: true }, md);

    expect(result.approved).toBe(true);
    expect(capturedCreateData).toEqual(expect.objectContaining({ initiatedById: 'md-1' }));
    expect(gateway.notifyIncomingCall).toHaveBeenCalledWith(['least-1'], expect.anything());
  });

  it('declining a call request does not create a call', async () => {
    const { service, prisma, gateway } = buildService({ 'md-1': ['MD'] });
    prisma.callRequest.findUnique.mockResolvedValue({ id: 'req-1', requestedToId: 'md-1', requestedById: 'least-1', status: 'PENDING' });

    const result = await service.respondToCallRequest('req-1', { approve: false }, md);

    expect(result.approved).toBe(false);
    expect(result.call).toBeNull();
    expect(gateway.notifyIncomingCall).not.toHaveBeenCalled();
  });
});
