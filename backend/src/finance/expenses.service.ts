import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { scopedLocationIds, assertScope } from '../common/utils/scope.util';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { RejectExpenseDto } from './dto/reject-expense.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Was returning every expense company-wide to anyone who could reach
   * this endpoint at all — including a Farm Manager who should only
   * ever see their own farm's expenses. finance.view holders (Finance
   * Officer/Director, MD, CEO) are unaffected: they have no location
   * scope at all, so scopedLocationIds correctly treats them as global
   * for both FARM and WAREHOUSE and nothing is filtered. A
   * location-scoped caller's farmId/warehouseId filter is intersected
   * with what they can actually see, not trusted outright. */
  list(actor: AuthenticatedUser, filters: { status?: string; farmId?: string; warehouseId?: string }) {
    const where: Record<string, unknown> = { status: filters.status as any };

    const farmScope = scopedLocationIds(actor, 'FARM');
    const warehouseScope = scopedLocationIds(actor, 'WAREHOUSE');
    const isFullyGlobal = farmScope.isGlobal && warehouseScope.isGlobal;

    if (isFullyGlobal) {
      where.farmId = filters.farmId;
      where.warehouseId = filters.warehouseId;
    } else {
      const allowedFarmIds = farmScope.isGlobal ? null : farmScope.ids;
      const allowedWarehouseIds = warehouseScope.isGlobal ? null : warehouseScope.ids;
      const or: Record<string, unknown>[] = [];
      if (allowedFarmIds && allowedFarmIds.length > 0) {
        or.push({ farmId: filters.farmId && allowedFarmIds.includes(filters.farmId) ? filters.farmId : { in: allowedFarmIds } });
      }
      if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
        or.push({ warehouseId: filters.warehouseId && allowedWarehouseIds.includes(filters.warehouseId) ? filters.warehouseId : { in: allowedWarehouseIds } });
      }
      if (or.length === 0) return Promise.resolve([]);
      where.OR = or;
    }

    return this.prisma.expense.findMany({
      where,
      include: { category: true, farm: true, warehouse: true, submittedBy: true, approvedBy: true },
      orderBy: { date: 'desc' },
    });
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { category: true, farm: true, warehouse: true, submittedBy: true, approvedBy: true },
    });
    if (!expense) throw new NotFoundException('Expense not found.');

    const farmScope = scopedLocationIds(actor, 'FARM');
    const warehouseScope = scopedLocationIds(actor, 'WAREHOUSE');
    const isGlobal = farmScope.isGlobal; // same value for both calls — see scopedLocationIds
    if (!isGlobal) {
      const okViaFarm = expense.farmId && farmScope.ids.includes(expense.farmId);
      const okViaWarehouse = expense.warehouseId && warehouseScope.ids.includes(expense.warehouseId);
      if (!okViaFarm && !okViaWarehouse) {
        throw new ForbiddenException({ message: 'You are not authorized for this expense.', errorCode: 'SCOPE_DENIED' });
      }
    }
    return expense;
  }

  async create(dto: CreateExpenseDto, actor: AuthenticatedUser) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category || !category.isActive) throw new BadRequestException('Expense category not found or inactive.');

    // A location-scoped caller (Farm Manager, Warehouse Manager) could
    // otherwise name any farmId/warehouseId in the request body — this
    // is exactly the same class of gap assertScope closes for other
    // create endpoints (PaddyEntriesService.create is the precedent),
    // just not applied here until now.
    if (dto.farmId) assertScope(actor, 'FARM', dto.farmId, 'this farm');
    if (dto.warehouseId) assertScope(actor, 'WAREHOUSE', dto.warehouseId, 'this warehouse');

    const expense = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const prefix = `EXP-${year}-`;
      const count = await tx.expense.count({ where: { expenseNumber: { startsWith: prefix } } });
      const expenseNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;

      const created = await tx.expense.create({
        data: {
          expenseNumber,
          categoryId: dto.categoryId,
          amount: dto.amount,
          date: new Date(dto.date),
          farmId: dto.farmId,
          warehouseId: dto.warehouseId,
          paymentMethod: dto.paymentMethod,
          reference: dto.reference,
          customCategoryLabel: dto.customCategoryLabel,
          itemDescription: dto.itemDescription,
          notes: dto.notes,
          status: 'PENDING',
          submittedById: actor.id,
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'expense.create', entity: 'Expense', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    return this.findById(expense.id, actor);
  }

  async approve(id: string, actor: AuthenticatedUser) {
    const expense = await this.findById(id, actor);
    if (expense.status !== 'PENDING') {
      throw new BadRequestException(`Only PENDING expenses can be approved (current status: ${expense.status}).`);
    }
    if (expense.submittedById === actor.id) {
      throw new ForbiddenException('You cannot approve your own expense.');
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'expense.approve',
      entity: 'Expense',
      entityId: id,
      afterValue: { status: 'APPROVED' },
    });

    return this.findById(updated.id, actor);
  }

  async reject(id: string, dto: RejectExpenseDto, actor: AuthenticatedUser) {
    const expense = await this.findById(id, actor);
    if (expense.status !== 'PENDING') {
      throw new BadRequestException(`Only PENDING expenses can be rejected (current status: ${expense.status}).`);
    }
    if (expense.submittedById === actor.id) {
      throw new ForbiddenException('You cannot reject your own expense.');
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: dto.reason },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'expense.reject',
      entity: 'Expense',
      entityId: id,
      afterValue: { status: 'REJECTED' },
      reason: dto.reason,
    });

    return this.findById(updated.id, actor);
  }
}
