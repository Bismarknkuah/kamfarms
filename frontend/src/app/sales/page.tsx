'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { hasFinancialVisibility } from '@/lib/nav-items';
import { OrderDetail } from '@/components/sales/OrderDetail';
import { ageLabel, isSlow, needsMyAction, salesStatusLabel, salesStatusTone, waitingOn, waitingSince } from '@/lib/sales-flow';
import {
  salesOrdersApi,
  customersApi,
  masterDataApi,
  SalesOrder,
  Customer,
  Product,
  PackagingSize,
  ApiError, productPricesApi, type EffectivePrice, } from '@/lib/api-client';

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
  // The price in force for each product and size, for the customer chosen. Null until it loads, or if the server cannot say
  // (then nothing is blocked here and the server decides, as it always did).
  const [prices, setPrices] = useState<EffectivePrice[] | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    let live = true;
    productPricesApi.effective(accessToken, newCustomerId || undefined).then((r) => { if (live) setPrices(r); }).catch(() => { if (live) setPrices(null); });
    return () => { live = false; };
  }, [accessToken, newCustomerId]);
  const priceFor = (productId: string, packagingSizeId: string) => prices?.find((x) => x.productId === productId && x.packagingSizeId === packagingSizeId) ?? null;
  const unpricedItems = prices === null ? [] : newItems.filter((i) => i.productId && i.packagingSizeId && !priceFor(i.productId, i.packagingSizeId));
  const moneyOf = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [creating, setCreating] = useState(false);
  // "Needs my action" or "All orders". Null means automatic: show what is
  // waiting on this person if there is anything, otherwise everything.
  const [view, setView] = useState<'mine' | 'all' | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  // Delivery details - pre-filled from the selected customer's stored
  // address/location when one exists, but always editable, since a
  // specific order can genuinely need to go somewhere else.
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');

  // New-customer inline form, with live duplicate detection - as the
  // officer types a name or phone, matching existing customers are
  // searched for and surfaced, so a real customer who already ordered
  // before doesn't silently get entered twice under a new record.
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustCompany, setNewCustCompany] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [possibleDuplicates, setPossibleDuplicates] = useState<Customer[]>([]);
  const [creatingCustomer, setCreatingCustomer] = useState(false);

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

  // Live duplicate detection - debounced, so it doesn't fire on every
  // keystroke. Searches by whichever of name/phone the officer has
  // actually typed enough of to be a meaningful match; either one
  // alone is a real, common way a returning customer gets recognized.
  useEffect(() => {
    if (!accessToken || !showNewCustomer) return;
    const query = newCustPhone.trim().length >= 4 ? newCustPhone.trim() : newCustName.trim();
    if (query.length < 3) {
      setPossibleDuplicates([]);
      return;
    }
    const handle = setTimeout(() => {
      customersApi.list(accessToken, query).then(setPossibleDuplicates).catch(() => {});
    }, 400);
    return () => clearTimeout(handle);
  }, [accessToken, showNewCustomer, newCustName, newCustPhone]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('order');
    if (id) setSelectedId(id);
  }, []);

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

  const onSelectCustomer = (customerId: string) => {
    setNewCustomerId(customerId);
    const customer = customers.find((c) => c.id === customerId);
    // Pre-fill from whichever the customer actually has on file -
    // location is the more specific field when both exist.
    setDeliveryLocation(customer?.location || customer?.address || '');
  };

  const onLoadDuplicateCustomer = (customer: Customer) => {
    onSelectCustomer(customer.id);
    setShowNewCustomer(false);
    setNewCustName(''); setNewCustPhone(''); setNewCustCompany(''); setNewCustEmail(''); setNewCustAddress('');
    setPossibleDuplicates([]);
  };

  const onCreateCustomer = async () => {
    if (!accessToken || !newCustName.trim()) return;
    setCreatingCustomer(true);
    setActionError(null);
    try {
      const created = await customersApi.create(accessToken, {
        name: newCustName.trim(),
        phone: newCustPhone.trim() || undefined,
        company: newCustCompany.trim() || undefined,
        email: newCustEmail.trim() || undefined,
        address: newCustAddress.trim() || undefined,
        location: newCustAddress.trim() || undefined,
      });
      customersApi.list(accessToken).then(setCustomers).catch(() => {});
      onSelectCustomer(created.id);
      setShowNewCustomer(false);
      setNewCustName(''); setNewCustPhone(''); setNewCustCompany(''); setNewCustEmail(''); setNewCustAddress('');
      setPossibleDuplicates([]);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to add customer.');
    } finally {
      setCreatingCustomer(false);
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
      await salesOrdersApi.create(accessToken, {
        customerId: newCustomerId,
        items: validItems,
        deliveryLocation: deliveryLocation.trim() || undefined,
        requestedDeliveryDate: requestedDeliveryDate || undefined,
      });
      setShowCreate(false);
      setNewCustomerId('');
      setDeliveryLocation('');
      setRequestedDeliveryDate('');
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
  // fulfill - product, quantity, customer, status - but not the sale's
  // dollar value, which stays limited to the roles who actually need it
  // company-wide (Sales Officer, Finance, MD, CEO). Redacting the money
  // here, not the order itself, keeps their real job working.
  const showFinancials = hasFinancialVisibility(me);

  const isMine = (o: SalesOrder) => needsMyAction(o, hasPermission, me.id);
  const mineCount = orders?.filter(isMine).length ?? 0;
  const activeView = view ?? (mineCount > 0 ? 'mine' : 'all');
  const visibleOrders = activeView === 'mine' ? orders?.filter(isMine) : orders;

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
            <div className="flex items-center justify-between">
              <label className="mb-1 block text-sm font-medium text-ink-700">Customer</label>
              <button type="button" onClick={() => setShowNewCustomer((v) => !v)} className="text-xs font-medium text-paddy-700 underline">
                {showNewCustomer ? 'Select existing instead' : '+ New customer'}
              </button>
            </div>

            {!showNewCustomer ? (
              <select
                value={newCustomerId}
                onChange={(e) => onSelectCustomer(e.target.value)}
                className="w-full max-w-sm rounded-lg border border-paddy-100 px-3 py-2 text-sm"
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.customerNumber})</option>
                ))}
              </select>
            ) : (
              <div className="space-y-2 rounded-lg border border-husk-300 bg-white p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="Customer name" className="rounded-lg border border-paddy-100 px-3 py-1.5 text-sm" />
                  <input value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="Phone" className="rounded-lg border border-paddy-100 px-3 py-1.5 text-sm" />
                  <input value={newCustCompany} onChange={(e) => setNewCustCompany(e.target.value)} placeholder="Company (optional)" className="rounded-lg border border-paddy-100 px-3 py-1.5 text-sm" />
                  <input value={newCustEmail} onChange={(e) => setNewCustEmail(e.target.value)} placeholder="Email (optional)" className="rounded-lg border border-paddy-100 px-3 py-1.5 text-sm" />
                </div>
                <input value={newCustAddress} onChange={(e) => setNewCustAddress(e.target.value)} placeholder="Address / delivery location" className="w-full rounded-lg border border-paddy-100 px-3 py-1.5 text-sm" />

                {possibleDuplicates.length > 0 && (
                  <div className="rounded-lg border border-husk-500 bg-husk-100/50 p-2">
                    <p className="text-xs font-medium text-soil-700">This might already be a customer - load their existing record instead of creating a duplicate?</p>
                    <div className="mt-1.5 space-y-1">
                      {possibleDuplicates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onLoadDuplicateCustomer(c)}
                          className="flex w-full items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-left text-xs hover:bg-rice-50"
                        >
                          <span>{c.name}{c.phone ? ` · ${c.phone}` : ''}</span>
                          <span className="font-medium text-paddy-700">Load this customer</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onCreateCustomer}
                  disabled={creatingCustomer || !newCustName.trim()}
                  className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50"
                >
                  {creatingCustomer ? 'Adding…' : 'Add this customer'}
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700">Delivery location</label>
              <input
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
                placeholder="Where this order should actually go"
                className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700">Requested delivery date (optional)</label>
              <input
                type="date"
                value={requestedDeliveryDate}
                onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium text-ink-700">Items - as many different sizes as this order needs</label>
            {newItems.map((item, idx) => {
              const size = packagingSizes.find((s) => s.id === item.packagingSizeId);
              const lineKg = size ? size.sizeKg * item.bagCount : null;
              return (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <select
                    value={item.productId}
                    onChange={(e) => setNewItems((items) => items.map((it, i) => (i === idx ? { ...it, productId: e.target.value } : it)))}
                    className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm"
                  >
                    <option value="">Product…</option>
                    {products.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                  {lineKg !== null && <span className="text-xs text-ink-500">= {lineKg.toLocaleString()} KG</span>}
                  {item.productId && item.packagingSizeId && prices !== null && (() => {
                    const price = priceFor(item.productId, item.packagingSizeId);
                    return price ? (
                      <span data-testid="item-price" className="text-xs text-ink-700">GHS {moneyOf(price.pricePerBag)} a bag{price.source === 'customer' ? ' (this customer\'s price)' : ''} = <strong>GHS {moneyOf(price.pricePerBag * item.bagCount)}</strong></span>
                    ) : (
                      <span data-testid="item-no-price" className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">No price set yet</span>
                    );
                  })()}
                  {newItems.length > 1 && (
                    <button type="button" onClick={() => setNewItems((items) => items.filter((_, i) => i !== idx))} className="text-xs text-red-600">
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
            {newItems.some((item) => item.packagingSizeId) && (
              <p className="text-xs font-medium text-ink-700">
                Total: {newItems.reduce((sum, item) => {
                  const size = packagingSizes.find((s) => s.id === item.packagingSizeId);
                  return sum + (size ? size.sizeKg * item.bagCount : 0);
                }, 0).toLocaleString()} KG
              </p>
            )}
            {prices !== null && unpricedItems.length === 0 && newItems.some((i) => i.productId && i.packagingSizeId) && (
              <p className="text-xs font-semibold text-paddy-900" data-testid="order-total">
                Order total: GHS {moneyOf(newItems.reduce((sum, i) => sum + (priceFor(i.productId, i.packagingSizeId)?.pricePerBag ?? 0) * i.bagCount, 0))}
              </p>
            )}
            <button
              type="button"
              onClick={() => setNewItems((items) => [...items, { productId: '', packagingSizeId: '', bagCount: 1 }])}
              className="text-xs font-medium text-soil-500 underline"
            >
              + Add item
            </button>
          </div>

          {unpricedItems.length > 0 && (
            <p role="alert" data-testid="unpriced-notice" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {unpricedItems.map((i) => `${products.find((x) => x.id === i.productId)?.name ?? 'This product'} ${packagingSizes.find((x) => x.id === i.packagingSizeId)?.label ?? ''}`.trim()).join(', ')}{' '}
              {unpricedItems.length === 1 ? 'has' : 'have'} no price yet, so this order cannot be created.{' '}
              {hasPermission('masterdata.manage') ? <Link href="/prices" className="font-semibold underline">Set the price now</Link> : 'Ask the System Administrator to set it in the Price list.'}
            </p>
          )}
          <button
            type="button"
            onClick={onCreate}
            disabled={creating || !newCustomerId || unpricedItems.length > 0}
            className="mt-4 rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create order'}
          </button>
        </div>
      )}

      <div className="mt-6 flex gap-2" role="group" aria-label="Which orders to show">
        {([['mine', `Needs my action (${mineCount})`], ['all', `${['sales.approve', 'sales.release', 'sales.assign', 'sales.view'].some(hasPermission) ? 'All orders' : hasPermission('sales.create') ? 'My orders' : 'Orders at my warehouse'} (${orders?.length ?? 0})`]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={activeView === key}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${activeView === key ? 'bg-paddy-900 text-rice-50' : 'border border-paddy-100 bg-white text-ink-700 hover:bg-rice-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                {showFinancials && <th className="px-4 py-3">Total</th>}
                <th className="px-4 py-3">Status</th>
                <th className="hidden px-4 py-3 md:table-cell">With</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paddy-100">
              {visibleOrders?.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className={`cursor-pointer hover:bg-rice-50 ${selectedId === o.id ? 'bg-husk-100/30' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">{o.orderNumber}</td>
                  <td className="px-4 py-3 text-ink-900">{o.customer.name}</td>
                  {showFinancials && <td className="px-4 py-3 text-ink-700">{fmtGHS(o.totalAmount)}</td>}
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${salesStatusTone(o.status)}`}>
                      {salesStatusLabel(o.status)}
                    </span>
                    {isMine(o) && <span className="ml-2 rounded-full bg-paddy-900 px-2 py-0.5 text-[10px] font-medium text-rice-50">Your turn</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-ink-500 md:table-cell">
                    {waitingOn(o.status) ? <>{waitingOn(o.status)}{waitingSince(o) ? <span className={`block ${isSlow(o) ? 'font-medium text-amber-700' : ''}`} data-testid={isSlow(o) ? 'slow-flag' : undefined}>{ageLabel(waitingSince(o))}{isSlow(o) ? ' - waiting a while' : ''}</span> : null}</> : '-'}
                  </td>
                </tr>
              ))}
              {orders && visibleOrders?.length === 0 && (
                <tr><td colSpan={showFinancials ? 5 : 4} className="px-4 py-8 text-center text-ink-500">{activeView === 'mine' ? 'Nothing is waiting on you.' : 'No sales orders yet.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedOrder && accessToken && (
          <OrderDetail key={selectedOrder.id} summary={selectedOrder} accessToken={accessToken} meId={me.id} hasPermission={hasPermission} showFinancials={showFinancials} onChanged={() => loadOrders(accessToken)} />
        )}
      </div>
    </DashboardShell>
  );
}
