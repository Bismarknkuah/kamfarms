import type { Task } from '@/lib/api-client';

/**
 * Where the work behind a task or a notification is done, so one tap takes the person straight there: no reading, no hunting through menus.
 * Most of the people using the system do not want to read; they want a button that opens the work.
 */
export function taskHref(t: Pick<Task, 'deliveryRequestRef' | 'supplyRequestNumber' | 'salesOrderId' | 'paddyRequestId'>): string | null {
  if (t.deliveryRequestRef) return `/deliveries?request=${encodeURIComponent(t.deliveryRequestRef)}`;
  if (t.supplyRequestNumber) return `/warehouse-requests?request=${encodeURIComponent(t.supplyRequestNumber)}`;
  if (t.salesOrderId) return `/sales?order=${encodeURIComponent(t.salesOrderId)}`;
  if (t.paddyRequestId) return '/warehouse-requests';
  return null;
}

export function notificationHref(n: { entityType?: string | null; entityId?: string | null }): string | null {
  const id = n.entityId ?? '';
  switch (n.entityType) {
    case 'SupplyRequest': return `/warehouse-requests?request=${encodeURIComponent(id)}`;
    case 'PaddyTransfer': return `/site-deliveries?transfer=${encodeURIComponent(id)}`;
    case 'Task': return '/tasks';
    case 'DeliveryReport':
    case 'DeliveryOrder': return '/deliveries';
    case 'Shipment': return '/shipments';
    case 'SalesOrder': return id ? `/sales?order=${encodeURIComponent(id)}` : '/sales';
    case 'PaddyEntry': return '/paddy-entries';
    default: return null;
  }
}
