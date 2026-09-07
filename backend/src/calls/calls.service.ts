import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CallsGateway } from './calls.gateway';
import { CreateCallRequestDto } from './dto/create-call-request.dto';
import { RespondToCallRequestDto } from './dto/respond-to-call-request.dto';
import { InitiateCallDto } from './dto/initiate-call.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

// Not a permission - deliberately an explicit role-code allowlist,
// matching the same reasoning already established for
// FINANCIAL_VISIBILITY_ROLES on the frontend: this needs to be a real,
// specific gate ("is this literally the MD or CEO"), not something a
// broadly-held permission could accidentally satisfy.
const TOP_MANAGEMENT_ROLES = new Set(['MD', 'CEO']);

const CALL_INCLUDE = { participants: { include: { user: true } }, initiatedBy: true } as const;

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly gateway: CallsGateway,
  ) {}

  private async isTopManagement(userId: string): Promise<boolean> {
    const roles = await this.prisma.userRole.findMany({ where: { userId }, include: { role: true } });
    return roles.some((ur) => TOP_MANAGEMENT_ROLES.has(ur.role.code));
  }

  findCallById(id: string) {
    return this.prisma.callSession.findUnique({ where: { id }, include: CALL_INCLUDE });
  }

  async myActiveCall(actor: AuthenticatedUser) {
    const participant = await this.prisma.callParticipant.findFirst({
      where: { userId: actor.id, status: { in: ['INVITED', 'JOINED'] }, call: { status: { in: ['RINGING', 'ACTIVE'] } } },
      include: { call: { include: CALL_INCLUDE } },
    });
    return participant?.call ?? null;
  }

  listMyCallRequests(actor: AuthenticatedUser) {
    return this.prisma.callRequest.findMany({
      where: { OR: [{ requestedById: actor.id }, { requestedToId: actor.id }] },
      include: { requestedBy: true, requestedTo: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async requestCall(dto: CreateCallRequestDto, actor: AuthenticatedUser) {
    if (await this.isTopManagement(actor.id)) {
      throw new BadRequestException('You can call directly - there is no need to request a call.');
    }
    if (!(await this.isTopManagement(dto.requestedToId))) {
      throw new BadRequestException('A call request is only needed to reach the Managing Director or CEO - call this person directly instead.');
    }

    const request = await this.prisma.callRequest.create({
      data: { requestedById: actor.id, requestedToId: dto.requestedToId, reason: dto.reason },
      include: { requestedBy: true, requestedTo: true },
    });

    await this.notifications.notify({
      userIds: [dto.requestedToId],
      type: 'call_request',
      title: 'Call request',
      body: `${request.requestedBy.firstName} ${request.requestedBy.lastName} would like to call you${dto.reason ? `: ${dto.reason}` : '.'}`,
      entityType: 'CallRequest',
      entityId: request.id,
    });

    await this.audit.record({ userId: actor.id, action: 'call_request.create', entity: 'CallRequest', entityId: request.id, afterValue: { requestedToId: dto.requestedToId } });

    return request;
  }

  async respondToCallRequest(id: string, dto: RespondToCallRequestDto, actor: AuthenticatedUser) {
    const request = await this.prisma.callRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Call request not found.');
    if (request.requestedToId !== actor.id) throw new ForbiddenException('Only the person this request was sent to can respond to it.');
    if (request.status !== 'PENDING') throw new BadRequestException(`This request was already ${request.status.toLowerCase()}.`);

    if (!dto.approve) {
      await this.prisma.callRequest.update({ where: { id }, data: { status: 'DECLINED', respondedAt: new Date() } });
      await this.audit.record({ userId: actor.id, action: 'call_request.decline', entity: 'CallRequest', entityId: id });
      return { approved: false, call: null };
    }

    // Approving is what actually starts the call - the Managing
    // Director/CEO is the one initiating it, matching the real
    // direction the hierarchy rule requires, not just a label on an
    // otherwise-symmetric call.
    const call = await this.prisma.$transaction(async (tx) => {
      const created = await tx.callSession.create({
        data: {
          type: 'DIRECT',
          initiatedById: actor.id,
          status: 'RINGING',
          participants: {
            create: [
              { userId: actor.id, status: 'JOINED', joinedAt: new Date() },
              { userId: request.requestedById, status: 'INVITED' },
            ],
          },
        },
      });
      await tx.callRequest.update({ where: { id }, data: { status: 'APPROVED', respondedAt: new Date(), resultingCallId: created.id } });
      return created;
    });

    await this.notifications.notify({
      userIds: [request.requestedById],
      type: 'call_incoming',
      title: 'Incoming call',
      body: 'Your call request was approved - calling you now.',
      entityType: 'CallSession',
      entityId: call.id,
    });

    const fullCall = await this.findCallById(call.id);
    this.gateway.notifyIncomingCall([request.requestedById], fullCall);

    return { approved: true, call: fullCall };
  }

  async initiateCall(dto: InitiateCallDto, actor: AuthenticatedUser) {
    const type = dto.type ?? 'DIRECT';
    const isActorTop = await this.isTopManagement(actor.id);

    if (type === 'GROUP' && !isActorTop) {
      throw new ForbiddenException('Only the Managing Director or CEO can start a group call.');
    }
    if (type === 'GROUP' && !dto.title?.trim()) {
      throw new BadRequestException('A group call needs a title.');
    }

    if (!isActorTop) {
      for (const participantId of dto.participantIds) {
        if (await this.isTopManagement(participantId)) {
          throw new ForbiddenException('You cannot call the Managing Director or CEO directly - send a call request instead, from the Messages page.');
        }
      }
    }

    const call = await this.prisma.$transaction(async (tx) => {
      const created = await tx.callSession.create({
        data: {
          type: type as 'DIRECT' | 'GROUP',
          title: dto.title,
          initiatedById: actor.id,
          status: 'RINGING',
          participants: {
            create: [
              { userId: actor.id, status: 'JOINED', joinedAt: new Date() },
              ...dto.participantIds.map((participantId) => ({ userId: participantId, status: 'INVITED' as const })),
            ],
          },
        },
      });
      return created;
    });

    await this.notifications.notify({
      userIds: dto.participantIds,
      type: 'call_incoming',
      title: type === 'GROUP' ? `Incoming group call: ${dto.title}` : 'Incoming call',
      body: `${actor.id === call.initiatedById ? '' : ''}Calling you now.`,
      entityType: 'CallSession',
      entityId: call.id,
    });

    await this.audit.record({ userId: actor.id, action: 'call.initiate', entity: 'CallSession', entityId: call.id, afterValue: { type, participantIds: dto.participantIds } });

    const fullCall = await this.findCallById(call.id);
    this.gateway.notifyIncomingCall(dto.participantIds, fullCall);

    return fullCall;
  }

  async joinCall(id: string, actor: AuthenticatedUser) {
    const participant = await this.prisma.callParticipant.findUnique({ where: { callId_userId: { callId: id, userId: actor.id } } });
    if (!participant) throw new ForbiddenException('You were not invited to this call.');

    await this.prisma.$transaction([
      this.prisma.callParticipant.update({ where: { id: participant.id }, data: { status: 'JOINED', joinedAt: new Date() } }),
      this.prisma.callSession.update({ where: { id }, data: { status: 'ACTIVE' } }),
    ]);

    return this.findCallById(id);
  }

  async declineCall(id: string, actor: AuthenticatedUser) {
    const participant = await this.prisma.callParticipant.findUnique({ where: { callId_userId: { callId: id, userId: actor.id } } });
    if (!participant) throw new ForbiddenException('You were not invited to this call.');

    await this.prisma.callParticipant.update({ where: { id: participant.id }, data: { status: 'DECLINED' } });
    return this.findCallById(id);
  }

  async leaveCall(id: string, actor: AuthenticatedUser) {
    const participant = await this.prisma.callParticipant.findUnique({ where: { callId_userId: { callId: id, userId: actor.id } } });
    if (!participant) throw new ForbiddenException('You are not part of this call.');

    await this.prisma.callParticipant.update({ where: { id: participant.id }, data: { status: 'LEFT', leftAt: new Date() } });

    const stillIn = await this.prisma.callParticipant.count({ where: { callId: id, status: { in: ['INVITED', 'JOINED'] } } });
    if (stillIn === 0) {
      await this.prisma.callSession.update({ where: { id }, data: { status: 'ENDED', endedAt: new Date() } });
      const allParticipants = await this.prisma.callParticipant.findMany({ where: { callId: id } });
      this.gateway.notifyCallEnded(allParticipants.map((p) => p.userId), id);
    }

    return this.findCallById(id);
  }
}
