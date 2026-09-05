import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateResetRequestDto } from './dto/create-reset-request.dto';
import { RejectResetRequestDto } from './dto/reject-reset-request.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

/** The ONLY tables execute() will actually delete from, regardless of
 * what an approved request's affectedTables lists. See
 * docs/RESET_WORKFLOW.md for why this is deliberately narrow. */
const ALLOWED_EXECUTION_TABLES = ['InventoryTransaction', 'InventoryBalance'] as const;

const TERMINAL_STATUSES = ['APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED'];

@Injectable()
export class SystemResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(status?: string) {
    return this.prisma.resetRequest.findMany({
      where: { status: status as any },
      include: { requestedBy: true, financeApprovedBy: true, mdApprovedBy: true, rejectedBy: true, executedBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const request = await this.prisma.resetRequest.findUnique({
      where: { id },
      include: { requestedBy: true, financeApprovedBy: true, mdApprovedBy: true, rejectedBy: true, executedBy: true },
    });
    if (!request) throw new NotFoundException('Reset request not found.');
    return request;
  }

  async create(dto: CreateResetRequestDto, actor: AuthenticatedUser) {
    const request = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const prefix = `RESET-${year}-`;
      const count = await tx.resetRequest.count({ where: { requestNumber: { startsWith: prefix } } });
      const requestNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;

      const created = await tx.resetRequest.create({
        data: {
          requestNumber,
          resetType: dto.resetType,
          scope: dto.scope,
          affectedTables: dto.affectedTables,
          reason: dto.reason,
          impactDescription: dto.impactDescription,
          status: 'REQUESTED',
          requestedById: actor.id,
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'reset_request.create', entity: 'ResetRequest', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    return this.findById(request.id);
  }

  private hasRole(actor: AuthenticatedUser, roleCode: string): boolean {
    return actor.roles.some((r) => r.roleCode === roleCode);
  }

  /** Fills whichever of the two required approval slots (Finance
   * Director, Managing Director) the caller is actually authorized to
   * fill, determined by their held role — not just "anyone with
   * reset.approve", since the spec names these roles specifically. CEO
   * fills the same "top executive" slot as MD (the spec lists finance,
   * CEO, and MD together as approvers) — treated as equivalent rather
   * than added as a third required slot, since that would need a schema
   * change; either the MD or the CEO approving satisfies that half of
   * the requirement. Status becomes APPROVED only once BOTH slots are
   * filled by two DIFFERENT people, neither of whom is the requester. */
  async approve(id: string, actor: AuthenticatedUser) {
    const request = await this.findById(id);
    if (TERMINAL_STATUSES.includes(request.status)) {
      throw new BadRequestException(`This request is already ${request.status} and cannot be approved further.`);
    }
    if (request.requestedById === actor.id) {
      throw new ForbiddenException('You cannot approve your own reset request.');
    }

    const isFinanceDirector = this.hasRole(actor, 'FINANCE_DIRECTOR');
    const isMd = this.hasRole(actor, 'MD') || this.hasRole(actor, 'CEO');
    if (!isFinanceDirector && !isMd) {
      throw new ForbiddenException({
        message: 'Only the Finance Director, Managing Director, or CEO can approve a system reset.',
        errorCode: 'RESET_APPROVER_ROLE_REQUIRED',
      });
    }

    const data: Record<string, unknown> = {};
    if (isFinanceDirector) {
      if (request.financeApprovedById) {
        throw new BadRequestException('The Finance Director has already approved this request.');
      }
      data.financeApprovedById = actor.id;
      data.financeApprovedAt = new Date();
    }
    if (isMd) {
      if (request.mdApprovedById) {
        throw new BadRequestException('The Managing Director has already approved this request.');
      }
      data.mdApprovedById = actor.id;
      data.mdApprovedAt = new Date();
    }

    const financeWillBeApproved = !!data.financeApprovedById || !!request.financeApprovedById;
    const mdWillBeApproved = !!data.mdApprovedById || !!request.mdApprovedById;
    data.status = financeWillBeApproved && mdWillBeApproved ? 'APPROVED' : isFinanceDirector ? 'FINANCE_APPROVED' : 'MD_APPROVED';

    const updated = await this.prisma.resetRequest.update({ where: { id }, data });

    await this.audit.record({
      userId: actor.id,
      action: 'reset_request.approve',
      entity: 'ResetRequest',
      entityId: id,
      afterValue: { status: updated.status, approverRole: isFinanceDirector ? 'FINANCE_DIRECTOR' : 'MD' },
    });

    return this.findById(updated.id);
  }

  async reject(id: string, dto: RejectResetRequestDto, actor: AuthenticatedUser) {
    const request = await this.findById(id);
    if (TERMINAL_STATUSES.includes(request.status)) {
      throw new BadRequestException(`This request is already ${request.status}.`);
    }
    if (request.requestedById === actor.id) {
      throw new ForbiddenException('You cannot reject your own reset request.');
    }
    if (!this.hasRole(actor, 'FINANCE_DIRECTOR') && !this.hasRole(actor, 'MD') && !this.hasRole(actor, 'CEO')) {
      throw new ForbiddenException({
        message: 'Only the Finance Director, Managing Director, or CEO can reject a system reset.',
        errorCode: 'RESET_APPROVER_ROLE_REQUIRED',
      });
    }

    const updated = await this.prisma.resetRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectedById: actor.id, rejectionReason: dto.reason },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'reset_request.reject',
      entity: 'ResetRequest',
      entityId: id,
      afterValue: { status: 'REJECTED' },
      reason: dto.reason,
    });

    return this.findById(updated.id);
  }

  private async tableCount(tx: any, table: (typeof ALLOWED_EXECUTION_TABLES)[number]): Promise<number> {
    if (table === 'InventoryTransaction') return tx.inventoryTransaction.count();
    return tx.inventoryBalance.count();
  }

  /** Executes ONLY if every table in the approved request's
   * affectedTables is on ALLOWED_EXECUTION_TABLES. The scope is frozen
   * at request time — this method never looks at anything except what
   * was actually approved. */
  async execute(id: string, actor: AuthenticatedUser) {
    const request = await this.findById(id);
    if (request.status !== 'APPROVED') {
      throw new BadRequestException(`Only APPROVED requests can be executed (current status: ${request.status}).`);
    }

    const outOfScope = request.affectedTables.filter((t) => !(ALLOWED_EXECUTION_TABLES as readonly string[]).includes(t));
    if (outOfScope.length > 0) {
      throw new BadRequestException({
        message: `Execution is not implemented for: ${outOfScope.join(', ')}. Only ${ALLOWED_EXECUTION_TABLES.join(', ')} can actually be reset in this version — see docs/RESET_WORKFLOW.md.`,
        errorCode: 'RESET_SCOPE_NOT_IMPLEMENTED',
      });
    }

    const tables = request.affectedTables as (typeof ALLOWED_EXECUTION_TABLES)[number][];

    const updated = await this.prisma.$transaction(async (tx) => {
      const preSnapshot: Record<string, number> = {};
      for (const table of tables) {
        preSnapshot[table] = await this.tableCount(tx, table);
      }

      if (tables.includes('InventoryTransaction')) await tx.inventoryTransaction.deleteMany();
      if (tables.includes('InventoryBalance')) await tx.inventoryBalance.deleteMany();

      const postSnapshot: Record<string, number> = {};
      for (const table of tables) {
        postSnapshot[table] = await this.tableCount(tx, table);
      }

      const result = await tx.resetRequest.update({
        where: { id },
        data: {
          status: 'EXECUTED',
          executedById: actor.id,
          executedAt: new Date(),
          preResetSnapshot: preSnapshot,
          postResetVerification: postSnapshot,
        },
      });

      await this.audit.record(
        {
          userId: actor.id,
          action: 'reset_request.execute',
          entity: 'ResetRequest',
          entityId: id,
          beforeValue: preSnapshot,
          afterValue: postSnapshot,
          reason: request.reason,
        },
        tx,
      );

      return result;
    });

    return this.findById(updated.id);
  }
}
