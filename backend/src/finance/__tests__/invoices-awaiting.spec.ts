import { InvoicesService } from '../invoices.service';
import { InvoicesController } from '../invoices.controller';

const order = (id: string, amount: number, fulfilledAt: string | null) => ({ id, orderNumber: `SO-${id}`, totalAmount: amount, fulfilledAt: fulfilledAt ? new Date(fulfilledAt) : null, customer: { name: `Customer ${id}` } });
function build(rows: any[]) {
  const svc: any = Object.create(InvoicesService.prototype);
  svc.prisma = { salesOrder: { findMany: jest.fn(async () => rows) } };
  return svc;
}

describe('invoices still to be raised', () => {
  it('asks the database for FULFILLED orders that have no invoice, newest first, at most 100', async () => {
    const svc = build([]); await svc.awaitingInvoice();
    const q = svc.prisma.salesOrder.findMany.mock.calls[0][0];
    expect(q.where).toEqual({ status: 'FULFILLED', invoices: { none: {} } });
    expect(q.orderBy).toEqual({ fulfilledAt: 'desc' }); expect(q.take).toBe(100);
  });
  it('gives the Finance Director what he needs to invoice: the order, the customer, the amount and when it was delivered', async () => {
    const out = await build([order('1', 2500.5, '2026-10-12T10:00:00Z'), order('2', 900, null)]).awaitingInvoice();
    expect(out).toEqual([
      { id: '1', orderNumber: 'SO-1', customer: 'Customer 1', amount: 2500.5, fulfilledAt: '2026-10-12T10:00:00.000Z' },
      { id: '2', orderNumber: 'SO-2', customer: 'Customer 2', amount: 900, fulfilledAt: null },
    ]);
  });
  it('is declared before the route that takes an invoice id, so "awaiting" is never read as an id', () => {
    const order = Object.getOwnPropertyNames(InvoicesController.prototype);
    expect(order.indexOf('awaiting')).toBeGreaterThan(-1); expect(order.indexOf('awaiting')).toBeLessThan(order.indexOf('findOne'));
  });
});
