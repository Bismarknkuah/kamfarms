import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { RespondMessageDto } from './dto/respond-message.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

const BROADCAST_TYPES = ['BROADCAST', 'ANNOUNCEMENT'];

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async assertMember(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) {
      throw new ForbiddenException({ message: 'You are not a member of this conversation.', errorCode: 'NOT_A_MEMBER' });
    }
    return member;
  }

  async listConversations(actor: AuthenticatedUser) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId: actor.id },
      include: {
        conversation: {
          include: { members: { include: { user: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
        },
      },
      orderBy: { conversation: { createdAt: 'desc' } },
    });

    return Promise.all(
      memberships.map(async (m) => {
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: m.conversationId,
            createdAt: m.lastReadAt ? { gt: m.lastReadAt } : undefined,
            senderId: { not: actor.id },
          },
        });
        return { ...m.conversation, unreadCount, lastReadAt: m.lastReadAt };
      }),
    );
  }

  /** Broadcasts/announcements require messages.broadcast — a role/
   * department/farm/warehouse "audience" conversation is still only a
   * privileged action when it fans out beyond the people who explicitly
   * consented to be in a group. */
  async createConversation(dto: CreateConversationDto, actor: AuthenticatedUser) {
    if (BROADCAST_TYPES.includes(dto.type) && !actor.permissionCodes.has('messages.broadcast')) {
      throw new ForbiddenException({
        message: 'You do not have permission to create broadcasts or announcements.',
        errorCode: 'PERMISSION_DENIED',
      });
    }

    const memberIds = Array.from(new Set([...dto.memberIds, actor.id]));
    const users = await this.prisma.user.findMany({ where: { id: { in: memberIds }, deletedAt: null } });
    if (users.length !== memberIds.length) {
      throw new BadRequestException('One or more member ids are invalid.');
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        type: dto.type,
        title: dto.title,
        requiresResponse: dto.requiresResponse ?? false,
        createdById: actor.id,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
      include: { members: { include: { user: true } } },
    });

    return conversation;
  }

  /** Fetching messages is also how a member's receipts progress to READ
   * — a deliberate simplification of the SENT -> DELIVERED -> READ chain
   * (spec section 34): opening the conversation IS reading it. */
  async listMessages(conversationId: string, actor: AuthenticatedUser) {
    await this.assertMember(conversationId, actor.id);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      include: { sender: true, receipts: true },
      orderBy: { createdAt: 'asc' },
    });

    await this.prisma.$transaction([
      this.prisma.messageReceipt.updateMany({
        where: { message: { conversationId }, userId: actor.id, status: { in: ['SENT', 'DELIVERED'] } },
        data: { status: 'READ' },
      }),
      this.prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: actor.id } },
        data: { lastReadAt: new Date() },
      }),
    ]);

    return messages;
  }

  async sendMessage(conversationId: string, dto: SendMessageDto, actor: AuthenticatedUser) {
    await this.assertMember(conversationId, actor.id);

    const otherMembers = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: actor.id } },
    });

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: actor.id,
          body: dto.body,
          requiresAcknowledgment: dto.requiresAcknowledgment ?? false,
        },
      });

      if (otherMembers.length > 0) {
        await tx.messageReceipt.createMany({
          data: otherMembers.map((m) => ({ messageId: created.id, userId: m.userId, status: 'SENT' })),
        });
      }

      return created;
    });

    await this.notifications.notify({
      userIds: otherMembers.map((m) => m.userId),
      type: 'message_received',
      title: 'New message',
      body: dto.body.length > 140 ? `${dto.body.slice(0, 140)}...` : dto.body,
      entityType: 'Conversation',
      entityId: conversationId,
    });

    return message;
  }

  /** Acknowledging without a written reply — for messages that just need
   * a "seen and understood", not a response (spec's ACKNOWLEDGED vs
   * RESPONDED distinction). */
  async acknowledge(messageId: string, actor: AuthenticatedUser) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found.');
    if (!message.requiresAcknowledgment) {
      throw new BadRequestException('This message does not require acknowledgment.');
    }

    await this.prisma.messageReceipt.updateMany({
      where: { messageId, userId: actor.id, status: { not: 'RESPONDED' } },
      data: { status: 'ACKNOWLEDGED' },
    });

    return { success: true, message: 'Acknowledged.', errorCode: null, data: null };
  }

  /** Responding posts an actual reply message in the conversation AND
   * marks the original message's receipt RESPONDED for this user — the
   * strongest of the five states (spec: "user must acknowledge/respond"). */
  async respond(messageId: string, dto: RespondMessageDto, actor: AuthenticatedUser) {
    const original = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!original) throw new NotFoundException('Message not found.');
    await this.assertMember(original.conversationId, actor.id);

    const reply = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { conversationId: original.conversationId, senderId: actor.id, body: dto.response },
      });
      await tx.messageReceipt.updateMany({
        where: { messageId, userId: actor.id },
        data: { status: 'RESPONDED', respondedAt: new Date() },
      });
      return created;
    });

    return reply;
  }
}
