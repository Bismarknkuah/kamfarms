import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { AddTaskCommentDto } from './dto/add-task-comment.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  list(actor: AuthenticatedUser, filters: { status?: string; mineOnly?: boolean; overdueOnly?: boolean }) {
    const where: Record<string, unknown> = { status: filters.status as any };
    if (filters.mineOnly) where.assignedToId = actor.id;
    if (filters.overdueOnly) {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] };
    }

    return this.prisma.task.findMany({
      where,
      include: { assignedTo: true, createdBy: true, farm: true, warehouse: true },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findById(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignedTo: true,
        createdBy: true,
        completedBy: true,
        farm: true,
        warehouse: true,
        comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!task) throw new NotFoundException('Task not found.');
    return task;
  }

  private async recipientsForAssignment(assignedToId?: string, assignedRoleCode?: string): Promise<string[]> {
    if (assignedToId) return [assignedToId];
    if (!assignedRoleCode) return [];
    const holders = await this.prisma.userRole.findMany({
      where: { role: { code: assignedRoleCode } },
      select: { userId: true },
    });
    return holders.map((h) => h.userId);
  }

  async create(dto: CreateTaskDto, actor: AuthenticatedUser) {
    if (!dto.assignedToId && !dto.assignedRoleCode) {
      throw new BadRequestException('A task must be assigned to either a specific user or a role.');
    }

    const task = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const prefix = `TASK-${year}-`;
      const count = await tx.task.count({ where: { taskNumber: { startsWith: prefix } } });
      const taskNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;

      const created = await tx.task.create({
        data: {
          taskNumber,
          title: dto.title,
          description: dto.description,
          assignedToId: dto.assignedToId,
          assignedRoleCode: dto.assignedRoleCode,
          farmId: dto.farmId,
          warehouseId: dto.warehouseId,
          priority: dto.priority,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          status: 'TODO',
          createdById: actor.id,
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'task.create', entity: 'Task', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    const recipients = await this.recipientsForAssignment(dto.assignedToId, dto.assignedRoleCode);
    await this.notifications.notify({
      userIds: recipients,
      type: 'task_assigned',
      title: 'New task assigned',
      body: task.title,
      entityType: 'Task',
      entityId: task.id,
    });

    return this.findById(task.id);
  }

  async updateStatus(id: string, dto: UpdateTaskStatusDto, actor: AuthenticatedUser) {
    const task = await this.findById(id);

    const isAssignee = task.assignedToId === actor.id;
    const isCreator = task.createdById === actor.id;
    const canManageAnyTask = actor.permissionCodes.has('tasks.assign');
    if (!isAssignee && !isCreator && !canManageAnyTask) {
      throw new ForbiddenException('You are not authorized to update this task.');
    }

    if (dto.status === 'COMPLETED' && !actor.permissionCodes.has('tasks.complete') && !canManageAnyTask) {
      throw new ForbiddenException('You do not have permission to complete tasks.');
    }
    if (dto.status === 'COMPLETED' && !dto.completionEvidence) {
      throw new BadRequestException('Completion evidence is required to mark a task COMPLETED.');
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: dto.status,
        completionEvidence: dto.completionEvidence,
        completedById: dto.status === 'COMPLETED' ? actor.id : undefined,
        completedAt: dto.status === 'COMPLETED' ? new Date() : undefined,
      },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'task.update_status',
      entity: 'Task',
      entityId: id,
      beforeValue: { status: task.status },
      afterValue: { status: dto.status },
    });

    if (dto.status === 'COMPLETED' && task.createdById !== actor.id) {
      await this.notifications.notify({
        userIds: [task.createdById],
        type: 'task_completed',
        title: 'Task completed',
        body: task.title,
        entityType: 'Task',
        entityId: id,
      });
    }

    return this.findById(updated.id);
  }

  async addComment(taskId: string, dto: AddTaskCommentDto, actor: AuthenticatedUser) {
    await this.findById(taskId);
    const comment = await this.prisma.taskComment.create({
      data: { taskId, authorId: actor.id, body: dto.body },
    });
    return comment;
  }
}
