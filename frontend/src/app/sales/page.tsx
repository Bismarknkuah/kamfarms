'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { hasFinancialVisibility } from '@/lib/nav-items';
import {
  salesOrdersApi,
  customersApi,
  masterDataApi,
  SalesOrder,
  Customer,
  Product,
  PackagingSize,
  ApiError,
} from '@/lib/api-client';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-ink-500/10 text-ink-700',
  SUBMITTED: 'bg-husk-300 text-soil-700',
  APPROVED: 'bg-paddy-100 text-paddy-700',
  PARTIALLY_APPROVED: 'bg-husk-300 text-soil-700',
  REJECTED: 'bg-red-100 text-red-700',
  RESERVED: 'bg-paddy-100 text-paddy-700',
  FULFILLED: 'bg-paddy-700 text-rice-50',
  CANCELLED: 'bg-ink-500/10 text-ink-500',
};

function fmtGHS(amount: number) {
  return `GHS ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export default function SalesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [orders, setOrders] = useState<SalesOrder[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packagingSizes, setPackagingSizes] = useState<PackagingSize[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create-order form state
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newItems, setNewItems] = useState([{ productId: '', packagingSizeId: '', bagCount: 1 }]);
  const [creating, setCreating] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const loadOrders = (token: string) => {
    salesOrdersApi
      .list(token)
      .then(setOrders)
      .catch((err: unknown) => setListError(err instanceof ApiError ? err.message : 'Failed to load sales orders.'));
  };

  useEffect(() => {
    if (!accessToken) return;
    loadOrders(accessToken);
    customersApi.list(accessToken).then(setCustomers).catch(() => {});
    masterDataApi.products(accessToken).then(setProducts).catch(() => {});
    masterDataApi.packagingSizes(accessToken).then(setPackagingSizes).catch(() => {});
  }, [accessToken]);

  const selectedOrder = orders?.find((o) => o.id === selectedId) ?? null;

  const runAction = async (fn: () => Promise<unknown>) => {
    if (!accessToken) return;
    setActionError(null);
    try {
      await fn();
      loadOrders(accessToken);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  };

  const onCreate = async () => {
    if (!accessToken || !newCustomerId) return;
    const validItems = newItems.filter((i) => i.productId && i.packagingSizeId && i.bagCount > 0);
    if (validItems.length === 0) {
      setActionError('Add at least one valid item.');
      return;
    }
    setCreating(true);
    setActionError(null);
    try {
      await salesOrdersApi.create(accessToken, { customerId: newCustomerId, items: validItems });
      setShowCreate(false);
      setNewCustomerId('');
      setNewItems([{ productId: '', packagingSizeId: '', bagCount: 1 }]);
      loadOrders(accessToken);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to create order.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  // Fulfillment (Warehouse Supervisor) genuinely needs to see WHAT to
  // fulfill — product, quantity, customer, status — but not the sale's
  // dollar value, which stays limited to the roles who actually need it
  // company-wide (Sales Officer, Finance, MD, CEO). Redacting the money
  // here, not the order itself, keeps their real job working.
  const showFinancials = hasFinancialVisibility(me);

  return (
    <DashboardShell me={me}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-paddy-900">Sales orders</h1>
          <p className="mt-1 text-sm text-ink-500">{orders ? `${orders.length} orders` : 'Loading…'}</p>
        </div>
        {hasPermission('sales.create') && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50"
          >
            {showCreate ? 'Cancel' : 'New order'}
          </button>
        )}
      </div>

      {listError && <p className="mt-4 text-sm text-red-600">{listError}</p>}
      {actionError && <p className="mt-4 text-sm text-red-600">{actionError}</p>}

      {showCreate && (
        <div className="mt-6 rounded-2xl border border-husk-300 bg-husk-100/30 p-5">
          <h2 className="font-display text-lg text-paddy-900">New sales order</h2>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-ink-700">Customer</label>
            <select
              value={newCustomerId}
              onChange={(e) => setNewCustomerId(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-paddy-100 px-3 py-2 text-sm"
            >
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.customerNumber})</option>
              ))}
            </select>
          </div>

          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium text-ink-700">Items</label>
            {newItems.map((item, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <select
                  value={item.productId}
                  onChange={(e) => setNewItems((items) => items.map((it, i) => (i === idx ? { ...it, productId: e.target.value } : it)))}
                  className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm"
                >
                  <option value="">Product…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select
                  value={item.packagingSizeId}
                  onChange={(e) => setNewItems((items) => items.map((it, i) => (i === idx ? { ...it, packagingSizeId: e.target.value } : it)))}
                  className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm"
                >
                  <option value="">Size…</option>
                  {packagingSizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <input
                  type="number"
                  min={1}
                  value={item.bagCount}
                  onChange={(e) => setNewItems((items) => items.map((it, i) => (i === idx ? { ...it, bagCount: parseInt(e.target.value, 10) || 1 } : it)))}
                  className="w-24 rounded-lg border border-paddy-100 px-2 py-1.5 text-sm"
                  placeholder="Bags"
                />
                {newItems.length > 1 && (
                  <button type="button" onClick={() => setNewItems((items) => items.filter((_, i) => i !== idx))} className="text-xs text-red-600">
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setNewItems((items) => [...items, { productId: '', packagingSizeId: '', bagCount: 1 }])}
              className="text-xs font-medium text-soil-500 underline"
            >
              + Add item
            </button>
          </div>

          <button
            type="button"
            onClick={onCreate}
            disabled={creating || !newCustomerId}
            className="mt-4 rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create order'}
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                {showFinancials && <th className="px-4 py-3">Total</th>}
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paddy-100">
              {orders?.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className={`cursor-pointer hover:bg-rice-50 ${selectedId === o.id ? 'bg-husk-100/30' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">{o.orderNumber}</td>
                  <td className="px-4 py-3 text-ink-900">{o.customer.name}</td>
                  {showFinancials && <td className="px-4 py-3 text-ink-700">{fmtGHS(o.totalAmount)}</td>}
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[o.status] ?? 'bg-ink-500/10'}`}>
                      {o.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
              {orders?.length === 0 && (
                <tr><td colSpan={showFinancials ? 4 : 3} className="px-4 py-8 text-center text-ink-500">No sales orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedOrder && (
          <div className="rounded-2xl border border-paddy-100 bg-white p-5">
            <p className="font-mono text-xs text-ink-500">{selectedOrder.orderNumber}</p>
            <h3 className="mt-1 font-display text-lg text-paddy-900">{selectedOrder.customer.name}</h3>
            <p className="text-sm text-ink-500">Sold by {selectedOrder.salesOfficer.firstName} {selectedOrder.salesOfficer.lastName}</p>

            <div className="mt-4 space-y-1 border-t border-paddy-100 pt-4">
              {selectedOrder.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-ink-700">{item.product.name} — {item.packagingSize.label} × {item.bagCount}</span>
                  {showFinancials && <span className="text-ink-900">{fmtGHS(item.lineTotal)}</span>}
                </div>
              ))}
              {showFinancials && (
                <div className="flex justify-between border-t border-paddy-100 pt-2 text-sm font-medium">
                  <span>Total</span>
                  <span>{fmtGHS(selectedOrder.totalAmount)}</span>
                </div>
              )}
            </div>

            {selectedOrder.rejectionReason && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                Rejected: {selectedOrder.rejectionReason}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-paddy-100 pt-4">
              {selectedOrder.status === 'DRAFT' && hasPermission('sales.create') && (
                <button
                  type="button"
                  onClick={() => runAction(() => salesOrdersApi.submit(accessToken!, selectedOrder.id))}
                  className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50"
                >
                  Submit for approval
                </button>
              )}
              {selectedOrder.status === 'SUBMITTED' && hasPermission('sales.approve') && (
                <>
                  <button
                    type="button"
                    onClick={() => runAction(() => salesOrdersApi.approve(accessToken!, selectedOrder.id))}
                    className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50"
                  >
                    Approve
                  </button>
                  {rejectingId === selectedOrder.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Reason…"
                        className="rounded-lg border border-paddy-100 px-2 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!rejectReason.trim()) return;
                          runAction(() => salesOrdersApi.reject(accessToken!, selectedOrder.id, rejectReason));
                          setRejectingId(null);
                          setRejectReason('');
                        }}
                        className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700"
                      >
                        Confirm reject
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRejectingId(selectedOrder.id)}
                      className="rounded-full border border-paddy-100 px-4 py-1.5 text-xs font-medium text-ink-700"
                    >
                      Reject
                    </button>
                  )}
                </>
              )}
              {['APPROVED', 'RESERVED'].includes(selectedOrder.status) && hasPermission('sales.fulfill') && (
                <button
                  type="button"
                  onClick={() => runAction(() => salesOrdersApi.fulfill(accessToken!, selectedOrder.id))}
                  className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50"
                >
                  Mark fulfilled
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
