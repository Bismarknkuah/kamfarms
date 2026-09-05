import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AgingBuckets {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
}

/** Accounts receivable — every number here is computed at read time from
 * invoices + VERIFIED payment allocations, exactly like InvoicesService.
 * Nothing here is a separately maintained running balance that could
 * drift out of sync with the underlying transactions (spec section 28). */
@Injectable()
export class ReceivablesService {
  constructor(private readonly prisma: PrismaService) {}

  private daysOverdue(dueDateOrIssueDate: Date): number {
    const diffMs = Date.now() - dueDateOrIssueDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private bucketFor(days: number): keyof AgingBuckets {
    if (days <= 0) return 'current';
    if (days <= 30) return 'days1to30';
    if (days <= 60) return 'days31to60';
    if (days <= 90) return 'days61to90';
    return 'days90plus';
  }

  /** Per-customer summary: total invoiced, total paid (verified only),
   * outstanding, and the aging breakdown of the outstanding balance. */
  async forCustomer(customerId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { customerId },
      include: { allocations: { include: { payment: true } } },
    });

    let totalInvoiced = 0;
    let totalPaid = 0;
    const aging: AgingBuckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };

    for (const invoice of invoices) {
      const invoiceTotal = Number(invoice.totalAmount);
      totalInvoiced += invoiceTotal;

      const verifiedPaid = invoice.allocations
        .filter((a) => a.payment.status === 'VERIFIED')
        .reduce((sum, a) => sum + Number(a.amountApplied), 0);
      totalPaid += verifiedPaid;

      const outstanding = invoiceTotal - verifiedPaid;
      if (outstanding > 0.001) {
        const anchor = invoice.dueDate ?? invoice.issueDate;
        const bucket = this.bucketFor(this.daysOverdue(anchor));
        aging[bucket] += outstanding;
      }
    }

    return {
      customerId,
      totalInvoiced,
      totalPaid,
      outstanding: totalInvoiced - totalPaid,
      aging,
    };
  }

  /** Top debtors across all customers — the management dashboard view
   * (spec section 28: "Management dashboard must show top debtors"). */
  async topDebtors(limit = 10) {
    const customers = await this.prisma.customer.findMany({ where: { isActive: true } });
    const summaries = await Promise.all(customers.map((c) => this.forCustomer(c.id)));
    return summaries
      .filter((s) => s.outstanding > 0.001)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, limit);
  }
}
