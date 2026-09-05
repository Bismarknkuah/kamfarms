import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(customerId?: string, status?: string) {
    return this.prisma.payment.findMany({
      where: { customerId, status: status as any },
      include: { customer: true, allocations: { include: { invoice: true } }, recordedBy: true, verifiedBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { customer: true, allocations: { include: { invoice: true } }, recordedBy: true, verifiedBy: true },
    });
    if (!payment) throw new NotFoundException('Payment not found.');
    return payment;
  }

  /** Sales Officer records the payment (spec section 27) — Finance must
   * verify/clear it. The allocation intent is captured now, but it has no
   * financial effect until verified — InvoicesService only counts VERIFIED
   * payments' allocations toward any invoice balance. */
  async create(dto: CreatePaymentDto, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer || !customer.isActive) throw new BadRequestException('Customer not found or inactive.');

    if (dto.allocations && dto.allocations.length > 0) {
      const totalAllocated = dto.allocations.reduce((sum, a) => sum + a.amount, 0);
      if (totalAllocated > dto.amount + 0.001) {
        throw new BadRequestException({
          message: `Allocated amount (${totalAllocated}) cannot exceed the payment amount (${dto.amount}).`,
          errorCode: 'ALLOCATION_EXCEEDS_PAYMENT',
        });
      }
      for (const alloc of dto.allocations) {
        const invoice = await this.prisma.invoice.findUnique({ where: { id: alloc.invoiceId } });
        if (!invoice) throw new BadRequestException(`Invoice ${alloc.invoiceId} not found.`);
        if (invoice.customerId !== dto.customerId) {
          throw new BadRequestException("Cannot allocate a payment to another customer's invoice.");
        }
      }
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const prefix = `PAY-${year}-`;
      const count = await tx.payment.count({ where: { paymentNumber: { startsWith: prefix } } });
      const paymentNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;

      const created = await tx.payment.create({
        data: {
          paymentNumber,
          customerId: dto.customerId,
          amount: dto.amount,
          method: dto.method,
          transactionReference: dto.transactionReference,
          bank: dto.bank,
          paymentDate: new Date(dto.paymentDate),
          notes: dto.notes,
          recordedById: actor.id,
          status: 'PENDING_VERIFICATION',
          allocations: dto.allocations && dto.allocations.length > 0
            ? { create: dto.allocations.map((a) => ({ invoiceId: a.invoiceId, amountApplied: a.amount })) }
            : undefined,
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'payment.create', entity: 'Payment', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    return this.findById(payment.id);
  }

  /** Cash payments in particular need proper authorization (spec section
   * 27) — this verification step IS that authorization: a Finance
   * Officer distinct from whoever recorded the payment must sign off
   * before it counts toward any invoice balance. */
  async verify(id: string, actor: AuthenticatedUser) {
    const payment = await this.findById(id);
    if (payment.status !== 'PENDING_VERIFICATION') {
      throw new BadRequestException(`Only PENDING_VERIFICATION payments can be verified (current status: ${payment.status}).`);
    }
    if (payment.recordedById === actor.id) {
      throw new ForbiddenException('You cannot verify a payment you recorded yourself.');
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'VERIFIED', verifiedById: actor.id, verifiedAt: new Date() },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'payment.verify',
      entity: 'Payment',
      entityId: id,
      afterValue: { status: 'VERIFIED' },
    });

    return this.findById(updated.id);
  }

  async reject(id: string, dto: RejectPaymentDto, actor: AuthenticatedUser) {
    const payment = await this.findById(id);
    if (payment.status !== 'PENDING_VERIFICATION') {
      throw new BadRequestException(`Only PENDING_VERIFICATION payments can be rejected (current status: ${payment.status}).`);
    }
    if (payment.recordedById === actor.id) {
      throw new ForbiddenException('You cannot reject a payment you recorded yourself.');
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: dto.reason },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'payment.reject',
      entity: 'Payment',
      entityId: id,
      afterValue: { status: 'REJECTED' },
      reason: dto.reason,
    });

    return this.findById(updated.id);
  }
}
