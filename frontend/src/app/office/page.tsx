'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import {
  paddyEntriesApi, farmsApi, paddyGradesApi, PaddyEntry, Farm, PaddyGrade,
  salesOrdersApi, customersApi, masterDataApi, SalesOrder, Customer, Product, PackagingSize,
  paymentsApi, Payment,
  shipmentsApi, Shipment,
  productionApi, ProductionRecord,
  warehousesApi, Warehouse,
  deliveryOrdersApi, deliveryReportsApi, DeliveryOrder, DeliveryReport,
  systemResetApi, ResetRequest,
  stockTransfersApi, StockTransfer,
  inventoryAdjustmentsApi, InventoryAdjustment,
  paddyRequestsApi, PaddyRequest,
  ApiError,
} from '@/lib/api-client';
import { StatusPill, PaddyQuickAction, DeliveryQuickAction, InventoryAdjustmentRequestAction, InventoryAdjustmentQueue } from '@/components/OfficeActions';

// ── Farm Manager: quick paddy entry ──────────────────────────────────
// ── Farm Manager: create a delivery order, then submit its advanced
// report - driver, vehicle, labour, transport, and other costs. ──────
// ── Sales Officer: quick single-item order ───────────────────────────
function SalesQuickAction({ accessToken }: { accessToken: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sizes, setSizes] = useState<PackagingSize[]>([]);
  const [recent, setRecent] = useState<SalesOrder[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [packagingSizeId, setPackagingSizeId] = useState('');
  const [bagCount, setBagCount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = () => {
    customersApi.list(accessToken).then(setCustomers).catch(() => {});
    masterDataApi.products(accessToken).then(setProducts).catch(() => {});
    masterDataApi.packagingSizes(accessToken).then(setSizes).catch(() => {});
    salesOrdersApi.list(accessToken).then((orders) => setRecent(orders.slice(0, 5))).catch(() => {});
  };
  useEffect(load, [accessToken]);

  const onSubmit = async () => {
    if (!customerId || !productId || !packagingSizeId || !bagCount) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await salesOrdersApi.create(accessToken, {
        customerId,
        items: [{ productId, packagingSizeId, bagCount: parseInt(bagCount, 10) }],
      });
      setBagCount('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">💰 Quick order</h2>
      <p className="mt-1 text-sm text-ink-500">One product, one size - for a multi-item order, use the full Sales page.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="">Customer…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="">Product…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={packagingSizeId} onChange={(e) => setPackagingSizeId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="">Bag size…</option>
          {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <input type="number" value={bagCount} onChange={(e) => setBagCount(e.target.value)} placeholder="Bag count" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
      </div>
      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">Order created ✓</p>}
      <button type="button" onClick={onSubmit} disabled={submitting || !customerId || !productId || !packagingSizeId || !bagCount} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
        {submitting ? 'Creating…' : 'Create order'}
      </button>

      {recent.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Your recent orders</p>
          <div className="space-y-1.5">
            {recent.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                <span className="text-ink-700">{o.orderNumber} · GHS {o.totalAmount.toLocaleString()}</span>
                <StatusPill status={o.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Finance Officer: quick payment ───────────────────────────────────
function PaymentQuickAction({ accessToken }: { accessToken: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recent, setRecent] = useState<Payment[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [notes, setNotes] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = () => {
    customersApi.list(accessToken).then(setCustomers).catch(() => {});
    paymentsApi.list(accessToken).then((p) => setRecent(p.slice(0, 5))).catch(() => {});
  };
  useEffect(load, [accessToken]);

  const onSubmit = async () => {
    if (!customerId || !amount) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await paymentsApi.create(accessToken, {
        customerId,
        amount: parseFloat(amount),
        method,
        paymentDate: new Date().toISOString().slice(0, 10),
        notes: notes.trim() || undefined,
        receiptUrl: receiptUrl.trim() || undefined,
      });
      setAmount('');
      setNotes('');
      setReceiptUrl('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">💳 Record a payment</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="">Customer…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (GHS)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="BANK_DEPOSIT">Bank deposit</option>
          <option value="OTHER_APPROVED_METHOD">Other approved method</option>
        </select>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="Receipt link (optional) - Drive, Dropbox, etc." className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note (optional)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
      </div>
      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">Payment recorded ✓</p>}
      <button type="button" onClick={onSubmit} disabled={submitting || !customerId || !amount} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
        {submitting ? 'Recording…' : 'Record payment'}
      </button>

      {recent.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Recent payments</p>
          <div className="space-y-1.5">
            {recent.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                <span className="text-ink-700">{p.paymentNumber} · GHS {p.amount.toLocaleString()}</span>
                <StatusPill status={p.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Warehouse Manager: receive a shipment ────────────────────────────
// ── Approval-queue roles: Farm Supervisor / Warehouse Supervisor / Operations Manager / Finance Director ──
function ApprovalQueue({
  accessToken, title, icon, items, onApprove, onReject, renderLabel,
}: {
  accessToken: string; title: string; icon: string;
  items: { id: string; label: string }[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  renderLabel?: never;
}) {
  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">{icon} {title}</h2>
      <p className="mt-1 text-sm text-ink-500">{items.length} awaiting your decision.</p>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5 text-sm">
            <span className="text-ink-900">{item.label}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => onApprove(item.id)} className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50">Approve</button>
              <button type="button" onClick={() => onReject(item.id)} className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Reject</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-ink-500">Nothing waiting - you&rsquo;re caught up.</p>}
      </div>
    </div>
  );
}

function PaddyApprovalQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<PaddyEntry[]>([]);
  const load = () => { paddyEntriesApi.list(accessToken, undefined, 'SUBMITTED').then(setItems).catch(() => {}); };
  useEffect(load, [accessToken]);
  return (
    <ApprovalQueue
      accessToken={accessToken} title="Paddy entries" icon="🌾"
      items={items.map((e) => ({ id: e.id, label: `${e.weightKg.toLocaleString()} KG - ${new Date(e.entryDate).toLocaleDateString()}` }))}
      onApprove={async (id) => { await paddyEntriesApi.approve(accessToken, id); load(); }}
      onReject={async (id) => { await paddyEntriesApi.reject(accessToken, id, 'Reviewed and rejected from My Office.'); load(); }}
    />
  );
}

function SalesApprovalQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<SalesOrder[]>([]);
  const load = () => { salesOrdersApi.list(accessToken, 'SUBMITTED').then(setItems).catch(() => {}); };
  useEffect(load, [accessToken]);
  return (
    <ApprovalQueue
      accessToken={accessToken} title="Sales orders" icon="💰"
      items={items.map((o) => ({ id: o.id, label: `${o.orderNumber} - GHS ${o.totalAmount.toLocaleString()}` }))}
      onApprove={async (id) => { await salesOrdersApi.approve(accessToken, id); load(); }}
      onReject={async (id) => { await salesOrdersApi.reject(accessToken, id, 'Reviewed and rejected from My Office.'); load(); }}
    />
  );
}

function PaymentVerificationQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<Payment[]>([]);
  const load = () => { paymentsApi.list(accessToken, 'PENDING_VERIFICATION').then(setItems).catch(() => {}); };
  useEffect(load, [accessToken]);
  return (
    <ApprovalQueue
      accessToken={accessToken} title="Payments to verify" icon="💳"
      items={items.map((p) => ({ id: p.id, label: `${p.paymentNumber} - GHS ${p.amount.toLocaleString()}` }))}
      onApprove={async (id) => { await paymentsApi.verify(accessToken, id); load(); }}
      onReject={async (id) => { await paymentsApi.reject(accessToken, id, 'Reviewed and rejected from My Office.'); load(); }}
    />
  );
}

function ProductionApprovalQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<ProductionRecord[]>([]);
  const load = () => { productionApi.list(accessToken, 'SUBMITTED').then(setItems).catch(() => {}); };
  useEffect(load, [accessToken]);
  return (
    <ApprovalQueue
      accessToken={accessToken} title="Production records" icon="🏭"
      items={items.map((r) => ({ id: r.id, label: `${r.recordNumber} - ${r.recoveryPercent.toFixed(1)}% recovery` }))}
      onApprove={async (id) => { await productionApi.approve(accessToken, id); load(); }}
      onReject={async (id) => { await productionApi.reject(accessToken, id, 'Reviewed and rejected from My Office.'); load(); }}
    />
  );
}

/** Reset requests need dual sign-off (Finance Director AND MD) before
 * Admin can execute - a plain approve/reject queue would be wrong here,
 * since one click shouldn't imply the whole thing is settled. Shows
 * both approval slots so it's clear whose sign-off is still pending,
 * and the "Approve" button only records this specific approver's own
 * decision. */
// ── Warehouse Supervisor: dispatch a transfer between two warehouses
// they oversee, then receive it at the destination - the same real
// two-step shape Section 23 of the spec describes, not a single number
// silently changing in two places. ────────────────────────────────────
// ── Farm Supervisor / Warehouse Supervisor / Operations Manager: real
// inventory correction requests, never a raw number typed over the
// existing balance - Section 24's exact requirement. ────────────────
// ── Farm Manager / Warehouse Manager: request a correction for their
// own location - never applied until an actual supervisor approves it.

function StockTransferQuickAction({ accessToken }: { accessToken: string }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sizes, setSizes] = useState<PackagingSize[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [mode, setMode] = useState<'dispatch' | 'receive'>('dispatch');

  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destWarehouseId, setDestWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [packagingSizeId, setPackagingSizeId] = useState('');
  const [bagCount, setBagCount] = useState('');
  const [totalKg, setTotalKg] = useState('');
  const [reason, setReason] = useState('');
  const [dispatching, setDispatching] = useState(false);

  const [receivingId, setReceivingId] = useState('');
  const [receivedBagCount, setReceivedBagCount] = useState('');
  const [receivedKg, setReceivedKg] = useState('');
  const [receiving, setReceiving] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = () => {
    warehousesApi.list(accessToken).then(setWarehouses).catch(() => {});
    masterDataApi.products(accessToken).then(setProducts).catch(() => {});
    masterDataApi.packagingSizes(accessToken).then(setSizes).catch(() => {});
    stockTransfersApi.list(accessToken).then(setTransfers).catch(() => {});
  };
  useEffect(load, [accessToken]);

  const pendingReceipt = transfers.filter((t) => t.status === 'DISPATCHED');

  const onDispatch = async () => {
    if (!sourceWarehouseId || !destWarehouseId || !productId || !packagingSizeId || !bagCount || !totalKg) return;
    setDispatching(true);
    setFormError(null);
    try {
      await stockTransfersApi.create(accessToken, {
        sourceWarehouseId, destWarehouseId, productId, packagingSizeId,
        bagCount: parseInt(bagCount, 10), totalKg: parseFloat(totalKg),
        reason: reason || undefined,
      });
      setBagCount(''); setTotalKg(''); setReason('');
      setSuccess('Transfer dispatched ✓');
      setTimeout(() => setSuccess(null), 3000);
      load();
      setMode('receive');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to dispatch transfer.');
    } finally {
      setDispatching(false);
    }
  };

  const onReceive = async () => {
    if (!receivingId || !receivedBagCount || !receivedKg) return;
    setReceiving(true);
    setFormError(null);
    try {
      await stockTransfersApi.receive(accessToken, receivingId, parseInt(receivedBagCount, 10), parseFloat(receivedKg));
      setReceivingId(''); setReceivedBagCount(''); setReceivedKg('');
      setSuccess('Transfer received ✓');
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to receive transfer.');
    } finally {
      setReceiving(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">🔄 Stock transfers</h2>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setMode('dispatch')} className={`rounded-full px-4 py-1.5 text-xs font-medium ${mode === 'dispatch' ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700'}`}>
          1. Dispatch
        </button>
        <button type="button" onClick={() => setMode('receive')} className={`rounded-full px-4 py-1.5 text-xs font-medium ${mode === 'receive' ? 'bg-paddy-900 text-rice-50' : 'bg-white text-ink-700'}`}>
          2. Receive ({pendingReceipt.length} pending)
        </button>
      </div>

      {mode === 'dispatch' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <select value={sourceWarehouseId} onChange={(e) => setSourceWarehouseId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">From warehouse…</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select value={destWarehouseId} onChange={(e) => setDestWarehouseId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">To warehouse…</option>
            {warehouses.filter((w) => w.id !== sourceWarehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">Product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={packagingSizeId} onChange={(e) => setPackagingSizeId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">Bag size…</option>
            {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <input type="number" value={bagCount} onChange={(e) => setBagCount(e.target.value)} placeholder="Bag count" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          <input type="number" value={totalKg} onChange={(e) => setTotalKg(e.target.value)} placeholder="Total KG" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="sm:col-span-2 rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          <button type="button" onClick={onDispatch} disabled={dispatching || !sourceWarehouseId || !destWarehouseId || !productId || !packagingSizeId || !bagCount || !totalKg} className="sm:col-span-2 mt-1 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            {dispatching ? 'Dispatching…' : 'Dispatch transfer'}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <select value={receivingId} onChange={(e) => setReceivingId(e.target.value)} className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">Which transfer arrived?…</option>
            {pendingReceipt.map((t) => (
              <option key={t.id} value={t.id}>{t.transferNumber} - {t.product.name} ({t.packagingSize.label}) from {t.sourceWarehouse.name}, {t.bagCount} bags expected</option>
            ))}
          </select>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="number" value={receivedBagCount} onChange={(e) => setReceivedBagCount(e.target.value)} placeholder="Bags actually received" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="number" value={receivedKg} onChange={(e) => setReceivedKg(e.target.value)} placeholder="KG actually received" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          </div>
          <button type="button" onClick={onReceive} disabled={receiving || !receivingId || !receivedBagCount || !receivedKg} className="mt-3 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            {receiving ? 'Recording…' : 'Confirm receipt'}
          </button>
        </div>
      )}

      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">{success}</p>}

      {transfers.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Recent transfers</p>
          <div className="space-y-1.5">
            {transfers.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                <span className="text-ink-700">{t.transferNumber} · {t.sourceWarehouse.name} → {t.destWarehouse.name}</span>
                <StatusPill status={t.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Warehouse Supervisor: request paddy from any farm, without ─────
// naming which one - the Farm Supervisor decides how to meet it. ────
function PaddyRequestQuickAction({ accessToken }: { accessToken: string }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [grades, setGrades] = useState<PaddyGrade[]>([]);
  const [myRequests, setMyRequests] = useState<PaddyRequest[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [autoSelectedWarehouse, setAutoSelectedWarehouse] = useState(false);
  const [gradeId, setGradeId] = useState('');
  const [bagCount, setBagCount] = useState('');
  const [kg, setKg] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = () => {
    warehousesApi.list(accessToken).then((list) => {
      setWarehouses(list);
      if (list.length === 1) { setWarehouseId(list[0].id); setAutoSelectedWarehouse(true); }
    }).catch(() => {});
    paddyGradesApi.list(accessToken).then(setGrades).catch(() => {});
    paddyRequestsApi.list(accessToken).then((list) => setMyRequests(list.slice(0, 5))).catch(() => {});
  };
  useEffect(load, [accessToken]);

  const onSubmit = async () => {
    if (!warehouseId || !gradeId || !bagCount || !kg) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await paddyRequestsApi.create(accessToken, {
        warehouseId, paddyGradeId: gradeId, requestedBagCount: parseInt(bagCount, 10), requestedKg: parseFloat(kg), notes: notes || undefined,
      });
      setBagCount(''); setKg(''); setNotes('');
      setSuccess('Request sent to Farm Supervisors ✓');
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to send request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">🌾 Request paddy from a farm</h2>
      <p className="mt-1 text-sm text-ink-500">Say what you need - any Farm Supervisor can accept and tell you which farm and when.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {!autoSelectedWarehouse && (
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
            <option value="">Warehouse…</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        <select value={gradeId} onChange={(e) => setGradeId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
          <option value="">Paddy grade…</option>
          {grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <input type="number" value={bagCount} onChange={(e) => setBagCount(e.target.value)} placeholder="Bags needed" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        <input type="number" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="KG needed" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="sm:col-span-2 rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
      </div>

      {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
      {success && <p className="mt-2 text-sm font-medium text-paddy-700">{success}</p>}
      <button type="button" onClick={onSubmit} disabled={submitting || !warehouseId || !gradeId || !bagCount || !kg} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
        {submitting ? 'Sending…' : 'Send request'}
      </button>

      {myRequests.length > 0 && (
        <div className="mt-5 border-t border-paddy-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Recent requests</p>
          <div className="space-y-1.5">
            {myRequests.map((r) => (
              <div key={r.id} className="rounded-lg bg-white px-3 py-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ink-700">{r.requestedBagCount} bags · {r.paddyGrade.label}</span>
                  <StatusPill status={r.status} />
                </div>
                {r.responseNote && <p className="mt-1 text-ink-500">{r.responseNote}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Farm Supervisor: respond to warehouse requests - accept with an ─
// ETA, or decline with a reason. ─────────────────────────────────────
function ResetApprovalQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<ResetRequest[]>([]);
  const load = () => {
    systemResetApi.list(accessToken).then((all) => setItems(all.filter((r) => !['APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED'].includes(r.status)))).catch(() => {});
  };
  useEffect(load, [accessToken]);

  return (
    <div className="rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-6">
      <h2 className="font-display text-lg text-paddy-900">🔒 System reset requests</h2>
      <p className="mt-1 text-sm text-ink-500">{items.length} awaiting sign-off - needs both Finance Director and MD before Admin can execute.</p>
      <div className="mt-4 space-y-3">
        {items.map((req) => (
          <div key={req.id} className="rounded-lg bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs text-ink-500">{req.requestNumber}</p>
                <p className="font-medium text-ink-900">{req.scope}</p>
                <p className="text-sm text-ink-500">{req.reason}</p>
              </div>
              <button
                type="button"
                onClick={async () => { await systemResetApi.approve(accessToken, req.id); load(); }}
                className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50"
              >
                Approve
              </button>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-ink-500">
              <span>Finance: {req.financeApprovedBy ? `✓ ${req.financeApprovedBy.firstName}` : 'Pending'}</span>
              <span>MD: {req.mdApprovedBy ? `✓ ${req.mdApprovedBy.firstName}` : 'Pending'}</span>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-ink-500">Nothing waiting - you&rsquo;re caught up.</p>}
      </div>
    </div>
  );
}

export default function MyOfficePage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me || !accessToken) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const sections: React.ReactNode[] = [];
  if (hasPermission('paddy.create')) sections.push(<PaddyQuickAction key="paddy" accessToken={accessToken} meId={me.id} />);
  if (hasPermission('sales.create')) sections.push(<SalesQuickAction key="sales" accessToken={accessToken} />);
  if (hasPermission('payment.create')) sections.push(<PaymentQuickAction key="payment" accessToken={accessToken} />);
  // ShipmentQuickAction removed from here - Warehouse Manager no
  // longer visits My Office at all (moved to the Shipments page
  // instead), and warehouse.receive is held only by that role, so
  // this line would never have rendered for anyone else anyway.
  if (hasPermission('delivery.create')) sections.push(<DeliveryQuickAction key="delivery" accessToken={accessToken} />);
  if (hasPermission('paddy.approve')) sections.push(<PaddyApprovalQueue key="paddy-approve" accessToken={accessToken} />);
  if (hasPermission('sales.approve')) sections.push(<SalesApprovalQueue key="sales-approve" accessToken={accessToken} />);
  if (hasPermission('payment.verify')) sections.push(<PaymentVerificationQueue key="payment-verify" accessToken={accessToken} />);
  if (hasPermission('production.approve')) sections.push(<ProductionApprovalQueue key="production-approve" accessToken={accessToken} />);
  if (hasPermission('reset.approve')) sections.push(<ResetApprovalQueue key="reset-approve" accessToken={accessToken} />);
  if (hasPermission('warehouse.transfer')) sections.push(<StockTransferQuickAction key="stock-transfer" accessToken={accessToken} />);
  if (hasPermission('warehouse.transfer')) sections.push(<PaddyRequestQuickAction key="paddy-request" accessToken={accessToken} />);
  // PaddyRequestApprovalQueue removed from here - a Farm Supervisor no
  // longer visits My Office at all (they get dedicated pages instead),
  // and delivery.approve is held only by that role, so this line would
  // never have rendered for anyone else anyway.
  if (hasPermission('farm.inventory.view') || hasPermission('warehouse.inventory.view')) {
    sections.push(<InventoryAdjustmentRequestAction key="inventory-adjust-request" accessToken={accessToken} meId={me.id} />);
  }
  if (hasPermission('inventory.adjust')) sections.push(<InventoryAdjustmentQueue key="inventory-adjust" accessToken={accessToken} />);

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">My Office</h1>
      <p className="mt-1 text-sm text-ink-500">Your primary task, ready to go - no navigating around to find it.</p>

      <div className="mt-6 space-y-6">
        {sections.length > 0 ? sections : (
          <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center text-sm text-ink-500">
            Your role doesn&rsquo;t have a primary data-entry or approval task - check Overview for company-wide status instead.
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
