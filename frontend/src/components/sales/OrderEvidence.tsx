'use client';

import { useCallback, useEffect, useState } from 'react';
import { SalesOrder, salesOrdersApi } from '@/lib/api-client';
import { ReceiptsPanel } from '@/components/sales/ReceiptsPanel';
import { OrderTimeline } from '@/components/sales/Timeline';

/** For the desk rows, which hold only a summary of an order: loads the whole order and shows what a decision should rest on,
 * the payment receipts and the activity trail so far. */
export function OrderEvidence({ orderId, accessToken }: { orderId: string; accessToken: string }) {
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    salesOrdersApi.findById(accessToken, orderId).then((o) => { setOrder(o); setFailed(false); }).catch(() => setFailed(true));
  }, [accessToken, orderId]);
  useEffect(load, [load]);

  if (failed) return <p role="alert" className="text-xs text-red-600">Could not load the receipts and history for this order.</p>;
  if (!order) return <p className="text-xs text-ink-500">Loading the receipts and history...</p>;
  return (
    <div className="space-y-4">
      <ReceiptsPanel order={order} accessToken={accessToken} canUpload={false} canRemove={false} onChanged={load} />
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Who has handled it so far</p>
        <OrderTimeline events={order.events} />
      </div>
    </div>
  );
}
