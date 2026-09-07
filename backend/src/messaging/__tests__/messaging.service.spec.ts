import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MessagingService } from '../messaging.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('MessagingService', () => {
  const regularUser = { id: 'user-1', permissionCodes: new Set(['messages.send']) } as unknown as AuthenticatedUser;
  const mdUser = { id: 'md-1', permissionCodes: new Set(['messages.send', 'messages.broadcast']) } as unknown as AuthenticatedUser;

  function buildService() {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]) },
      conversation: { create: jest.fn().mockResolvedValue({ id: 'conv-1' }) },
      conversationMember: { findUnique: jest.fn().mockResolvedValue({ conversationId: 'conv-1', userId: 'user-1' }), findMany: jest.fn().mockResolvedValue([{ userId: 'user-2' }]) },
      message: { create: jest.fn().mockResolvedValue({ id: 'msg-1', requiresAcknowledgment: true }), findUnique: jest.fn() },
      messageReceipt: { createMany: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((cbOrArr: any) => {
        if (typeof cbOrArr === 'function') {
          return cbOrArr({
            message: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
            messageReceipt: { createMany: jest.fn(), updateMany: jest.fn() },
          });
        }
        return Promise.all(cbOrArr);
      }),
    };
    const notifications = { notify: jest.fn() } as unknown as NotificationsService;
    const service = new MessagingService(prisma as any, notifications);
    return { service, prisma, notifications };
  }

  it('blocks a regular user without messages.broadcast from creating a BROADCAST conversation', async () => {
    const { service } = buildService();

    await expect(
      service.createConversation({ type: 'BROADCAST', memberIds: ['user-2'] }, regularUser),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a user with messages.broadcast to create an ANNOUNCEMENT', async () => {
    const { service, prisma } = buildService();

    await service.createConversation({ type: 'ANNOUNCEMENT', memberIds: ['user-2'] }, mdUser);

    expect(prisma.conversation.create).toHaveBeenCalled();
  });

  it('allows any member (regardless of broadcast permission) to create a DIRECT or GROUP conversation', async () => {
    const { service, prisma } = buildService();

    await service.createConversation({ type: 'DIRECT', memberIds: ['user-2'] }, regularUser);

    expect(prisma.conversation.create).toHaveBeenCalled();
  });

  it('refuses to send a message on behalf of a non-member', async () => {
    const { service, prisma } = buildService();
    prisma.conversationMember.findUnique.mockResolvedValue(null);

    await expect(service.sendMessage('conv-1', { body: 'hello' }, regularUser)).rejects.toThrow(ForbiddenException);
  });

  it('notifies every other member (never the sender) when a message is sent', async () => {
    const { service, notifications } = buildService();

    await service.sendMessage('conv-1', { body: 'hello team' }, regularUser);

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['user-2'], type: 'message_received' }),
    );
  });

  it('persists a voice note (attachmentType and its data: URI in attachmentUrl) same as a document attachment', async () => {
    const createFn = jest.fn().mockResolvedValue({ id: 'msg-1' });
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]) },
      conversationMember: { findUnique: jest.fn().mockResolvedValue({ conversationId: 'conv-1', userId: 'user-1' }), findMany: jest.fn().mockResolvedValue([{ userId: 'user-2' }]) },
      messageReceipt: { createMany: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({ message: { create: createFn }, messageReceipt: { createMany: jest.fn(), updateMany: jest.fn() } }),
      ),
    };
    const notifications = { notify: jest.fn() } as unknown as NotificationsService;
    const service = new MessagingService(prisma as any, notifications);

    await service.sendMessage('conv-1', { body: '🎤 Voice message', attachmentUrl: 'data:audio/webm;base64,ABC', attachmentType: 'VOICE_NOTE' }, regularUser);

    expect(createFn).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attachmentType: 'VOICE_NOTE', attachmentUrl: 'data:audio/webm;base64,ABC' }) }),
    );
  });

  it('refuses to acknowledge a message that does not require acknowledgment', async () => {
    const { service, prisma } = buildService();
    prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', requiresAcknowledgment: false });

    await expect(service.acknowledge('msg-1', regularUser)).rejects.toThrow(BadRequestException);
  });
});
