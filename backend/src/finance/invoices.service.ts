import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async withComputedTotals<T extends { id: string; totalAmount: unknown }>(invoice: T) {
    const allocations = await this.prisma.paymentAllocation.findMany({
      where: { invoiceId: invoice.id, payment: { status: 'VERIFIED' } },
      select: { amountApplied: true },
    });
    const amountPaid = allocations.reduce((sum, a) => sum + Number(a.amountApplied), 0);
    const totalAmount = Number(invoice.totalAmount);
    const balance = Math.max(totalAmount - amountPaid, 0);
    const status = balance <= 0.001 ? 'PAID' : amountPaid > 0 ? 'PARTIALLY_PAID' : 'OPEN';

    return { ...invoice, amountPaid, balance, status };
  }

  async list(customerId?: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: customerId ? { customerId } : undefined,
      include: { customer: true, items: { include: { product: true, packagingSize: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(invoices.map((i) => this.withComputedTotals(i)));
  }

  async findById(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, items: { include: { product: true, packagingSize: true } }, salesOrder: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    return this.withComputedTotals(invoice);
  }

  async createFromSalesOrder(dto: CreateInvoiceDto, actor: AuthenticatedUser) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id: dto.salesOrderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Sales order not found.');
    if (order.status !== 'FULFILLED') {
      throw new BadRequestException(`Only FULFILLED orders can be invoiced (current status: ${order.status}).`);
    }

    const existing = await this.prisma.invoice.findFirst({ where: { salesOrderId: order.id } });
    if (existing) throw new BadRequestException('This sales order already has an invoice.');

    const subtotal = order.items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
    const discount = dto.discount ?? 0;
    const taxRate = dto.taxRatePercent ?? 0;
    const taxAmount = (subtotal - discount) * (taxRate / 100);
    const totalAmount = subtotal - discount + taxAmount;

    const invoice = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const prefix = `INV-${year}-`;
      const count = await tx.invoice.count({ where: { invoiceNumber: { startsWith: prefix } } });
      const invoiceNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;

      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          salesOrderId: order.id,
          customerId: order.customerId,
          subtotal,
          discount,
          taxRate,
          taxAmount,
          totalAmount,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          createdById: actor.id,
          items: {
            create: order.items.map((item) => ({
              productId: item.productId,
              packagingSizeId: item.packagingSizeId,
              bagCount: item.bagCount,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
            })),
          },
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'invoice.create', entity: 'Invoice', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    return this.findById(invoice.id);
  }
}
