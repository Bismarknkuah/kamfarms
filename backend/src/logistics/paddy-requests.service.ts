import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { CreatePaddyRequestDto } from './dto/create-paddy-request.dto';
import { RespondPaddyRequestDto } from './dto/respond-paddy-request.dto';
import { AssignPaddyRequestDto } from './dto/assign-paddy-request.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

const FARM_SUPERVISOR_ROLE_CODES = ['FARM_DIRECTOR', 'MD', 'CEO'];

@Injectable()
export class PaddyRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(actor: AuthenticatedUser, warehouseId?: string) {
    const { isGlobal, ids } = scopedLocationIds(actor, 'WAREHOUSE');
    const where: Record<string, unknown> = warehouseId ? { warehouseId } : {};
    if (!isGlobal) {
      if (ids.length === 0) return [];
      where.warehouseId = warehouseId && ids.includes(warehouseId) ? warehouseId : { in: ids };
    }
    return this.prisma.paddyRequest.findMany({
      where,
      include: { warehouse: true, paddyGrade: true, requestedBy: true, respondedBy: true, linkedOrder: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const request = await this.prisma.paddyRequest.findUnique({
      where: { id },
      include: { warehouse: true, paddyGrade: true, requestedBy: true, respondedBy: true, linkedOrder: true },
    });
    if (!request) throw new NotFoundException('Paddy request not found.');
    assertScope(actor, 'WAREHOUSE', request.warehouseId, 'this warehouse');
    return request;
  }

  async create(dto: CreatePaddyRequestDto, actor: AuthenticatedUser) {
    assertScope(actor, 'WAREHOUSE', dto.warehouseId, 'this warehouse');

    const request = await this.prisma.$transaction(async (tx) => {
      const count = await tx.paddyRequest.count();
      const requestNumber = `PR-REQ-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
      const created = await tx.paddyRequest.create({
        data: {
          requestNumber,
          warehouseId: dto.warehouseId,
          paddyGradeId: dto.paddyGradeId,
          requestedBagCount: dto.requestedBagCount,
          requestedKg: dto.requestedKg,
          notes: dto.notes,
          requestedById: actor.id,
        },
      });
      await this.audit.record(
        { userId: actor.id, action: 'paddy_request.create', entity: 'PaddyRequest', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    const supervisors = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { code: { in: FARM_SUPERVISOR_ROLE_CODES } } } } },
      select: { id: true },
    });
    if (supervisors.length > 0) {
      await this.notifications.notify({
        userIds: supervisors.map((u) => u.id),
        type: 'paddy_request.created',
        title: `Paddy request - ${request.requestNumber}`,
        body: `A warehouse needs ${dto.requestedBagCount} bags (${dto.requestedKg} KG) - awaiting your response.`,
        entityType: 'PaddyRequest',
        entityId: request.id,
      });
    }

    return this.findById(request.id, actor);
  }

  async respond(id: string, dto: RespondPaddyRequestDto, actor: AuthenticatedUser) {
    const request = await this.findById(id, actor);
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`This request has already been ${request.status.toLowerCase()}.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.paddyRequest.update({
        where: { id },
        data: {
          status: dto.decision,
          respondedById: actor.id,
          responseNote: dto.responseNote,
          respondedAt: new Date(),
        },
      });
      await this.audit.record(
        {
          userId: actor.id,
          action: 'paddy_request.respond',
          entity: 'PaddyRequest',
          entityId: id,
          beforeValue: { status: 'PENDING' },
          afterValue: { status: dto.decision, responseNote: dto.responseNote },
        },
        tx,
      );
      return result;
    });

    const warehouseManagers = await this.prisma.warehouseManager.findMany({ where: { warehouseId: request.warehouseId }, select: { userId: true } });
    const recipientIds = Array.from(new Set([request.requestedById, ...warehouseManagers.map((m) => m.userId)])).filter((uid) => uid !== actor.id);
    if (recipientIds.length > 0) {
      await this.notifications.notify({
        userIds: recipientIds,
        type: 'paddy_request.responded',
        title: `Paddy request ${dto.decision === 'ACCEPTED' ? 'accepted' : 'declined'} - ${request.requestNumber}`,
        body: dto.responseNote ?? (dto.decision === 'ACCEPTED' ? 'Accepted, no further detail given.' : 'Declined, no reason given.'),
        entityType: 'PaddyRequest',
        entityId: id,
      });
    }

    return this.findById(updated.id, actor);
  }

  async linkOrder(id: string, orderId: string, actor: AuthenticatedUser) {
    const request = await this.findById(id, actor);
    if (request.status !== 'ACCEPTED') {
      throw new BadRequestException('Only an accepted request can be linked to a dispatch order.');
    }
    const order = await this.prisma.deliveryOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Delivery order not found.');

    const updated = await this.prisma.paddyRequest.update({
      where: { id },
      data: { linkedOrderId: orderId, status: 'FULFILLED' },
    });
    await this.audit.record({ userId: actor.id, action: 'paddy_request.link_order', entity: 'PaddyRequest', entityId: id, afterValue: { linkedOrderId: orderId } });
    return this.findById(updated.id, actor);
  }

  /** The real workflow this project actually needs, not the direct
   * "Farm Supervisor places the order" shortcut built earlier: a Farm
   * Supervisor cannot dispatch paddy themselves - they decide which
   * farm(s) can meet a warehouse's request (possibly splitting it
   * across more than one, hence this being callable more than once
   * per request) and hand each farm a concrete task. The farm's own
   * manager reviews it and creates the real dispatch order themselves;
   * this method only creates the instruction, never the order. */
  async assignToFarm(id: string, dto: AssignPaddyRequestDto, actor: AuthenticatedUser) {
    const request = await this.findById(id, actor);
    if (!['PENDING', 'ACCEPTED'].includes(request.status)) {
      throw new BadRequestException(`This request has already been ${request.status.toLowerCase()} and can no longer be assigned.`);
    }

    const farmManagers = await this.prisma.farmManager.findMany({ where: { farmId: dto.farmId }, select: { userId: true } });
    if (farmManagers.length === 0) {
      throw new BadRequestException('This farm has no manager assigned yet - assign one before sending a dispatch task.');
    }

    const STANDARD_PADDY_BAG_WEIGHT_KG = 50;
    const kg = dto.kg ?? dto.bagCount * STANDARD_PADDY_BAG_WEIGHT_KG;

    const task = await this.prisma.$transaction(async (tx) => {
      if (request.status === 'PENDING') {
        await tx.paddyRequest.update({ where: { id }, data: { status: 'ACCEPTED', respondedById: actor.id, respondedAt: new Date() } });
      }

      const year = new Date().getFullYear();
      const prefix = `TASK-${year}-`;
      const count = await tx.task.count({ where: { taskNumber: { startsWith: prefix } } });
      const taskNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;

      const created = await tx.task.create({
        data: {
          taskNumber,
          title: `Dispatch ${dto.bagCount} bags of ${request.paddyGrade.label} to ${request.warehouse.name}`,
          description: dto.note ?? `Warehouse request ${request.requestNumber}: ${dto.bagCount} bags (${kg} KG) of ${request.paddyGrade.label} needed at ${request.warehouse.name}. Review and confirm you can provide this, then start the dispatch.`,
          assignedToId: farmManagers[0].userId,
          farmId: dto.farmId,
          status: 'TODO',
          createdById: actor.id,
          paddyRequestId: id,
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'paddy_request.assign_task', entity: 'Task', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    await this.notifications.notify({
      userIds: farmManagers.map((m) => m.userId),
      type: 'task.assigned',
      title: `New dispatch task - ${task.taskNumber}`,
      body: task.title,
      entityType: 'Task',
      entityId: task.id,
    });

    return { task, request: await this.findById(id, actor) };
  }
}
