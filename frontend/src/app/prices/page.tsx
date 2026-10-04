'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, Tag, TriangleAlert } from 'lucide-react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { ApiError, type Customer, type PackagingSize, type Product, type ProductPrice, customersApi, masterDataApi, productPricesApi } from '@/lib/api-client';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const inForce = (p: ProductPrice, now: number) => p.isActive && new Date(p.effectiveFrom).getTime() <= now;

type Load = { kind: 'loading' } | { kind: 'ok' } | { kind: 'error'; message: string };

/**
 * What each product and size sells for. An order cannot be created for a size that has no price, so this screen shows the
 * whole grid at once and makes every missing price impossible to miss. The Administrator sets prices here; sales staff
 * see them (read-only).
 */
export default function PricesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const canManage = !!me && hasPermission('masterdata.manage');
  const [products, setProducts] = useState<Product[]>([]);
  const [sizes, setSizes] = useState<PackagingSize[]>([]);
  const [prices, setPrices] = useState<ProductPrice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [form, setForm] = useState({ productId: '', sizeId: '', customerId: '', price: '', from: today() });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const priceRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [p, s, pr] = await Promise.all([masterDataApi.products(accessToken), masterDataApi.packagingSizes(accessToken), productPricesApi.list(accessToken)]);
      setProducts(p); setSizes(s); setPrices(pr);
      customersApi.list(accessToken).then(setCustomers).catch(() => undefined);
      setLoad({ kind: 'ok' });
    } catch (e) {
      setLoad({ kind: 'error', message: e instanceof ApiError ? e.message : 'The price list could not be loaded.' });
    }
  }, [accessToken]);
  useEffect(() => { reload(); }, [reload]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const now = Date.now();
  const activeProducts = products.filter((p) => p.isActive);
  const activeSizes = sizes.filter((s) => s.isActive).sort((a, b) => a.sizeKg - b.sizeKg);
  const listPrice = (productId: string, sizeId: string) =>
    prices.filter((p) => inForce(p, now) && !p.customerId && p.productId === productId && p.packagingSizeId === sizeId).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const missing = activeProducts.flatMap((p) => activeSizes.filter((s) => !listPrice(p.id, s.id)).map((s) => ({ p, s })));
  const customerPrices = prices.filter((p) => inForce(p, now) && p.customerId);
  const history = prices.filter((p) => !inForce(p, now)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  const pick = (productId: string, sizeId: string, existing?: ProductPrice) => {
    setStatus(null);
    setForm((f) => ({ ...f, productId, sizeId, customerId: '', price: existing ? String(Number(existing.pricePerBag)) : '' }));
    setTimeout(() => priceRef.current?.focus(), 0);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    const price = Number(form.price);
    if (!form.productId || !form.sizeId) return setStatus({ kind: 'error', text: 'Choose a product and a size.' });
    if (!Number.isFinite(price) || price <= 0) return setStatus({ kind: 'error', text: 'Enter a price above zero.' });
    setSaving(true);
    setStatus(null);
    try {
      await productPricesApi.create(accessToken, { productId: form.productId, packagingSizeId: form.sizeId, ...(form.customerId ? { customerId: form.customerId } : {}), pricePerBag: price, effectiveFrom: form.from });
      const who = form.customerId ? customers.find((c) => c.id === form.customerId)?.name ?? 'that customer' : 'everyone';
      setStatus({ kind: 'ok', text: `Saved: ${products.find((p) => p.id === form.productId)?.name} ${sizes.find((s) => s.id === form.sizeId)?.label} is now GHS ${money(price)} a bag for ${who}, from ${when(form.from)}.` });
      setForm((f) => ({ ...f, price: '' }));
      await reload();
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof ApiError ? err.message : 'The price could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell me={me}>
      <div className="mx-auto max-w-5xl space-y-6" data-testid="prices-page">
        <header>
          <p className="flex items-center gap-2 font-display text-base italic text-soil-500"><Tag className="h-4 w-4" aria-hidden="true" /> Price list</p>
          <h1 className="font-display text-2xl font-medium text-paddy-900">What each product and size sells for</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-500">Prices are per bag. An order cannot be created for a size that has no price. {canManage ? 'Click any box to set or change its price.' : 'Only the System Administrator can change prices.'}</p>
        </header>

        {load.kind === 'loading' && <div className="h-40 animate-pulse rounded-2xl bg-white" aria-hidden="true" data-testid="prices-loading" />}
        {load.kind === 'error' && <p role="alert" data-testid="prices-error" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{load.message}</p>}

        {load.kind === 'ok' && (
          <>
            {missing.length > 0 && (
              <p role="status" data-testid="missing-banner" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <span><strong>{missing.length} product and size combination{missing.length === 1 ? ' has' : 's have'} no price yet.</strong> Orders for {missing.length === 1 ? 'it' : 'them'} cannot be created until a price is set. {canManage ? 'Click a "Not set" box to set it.' : 'Ask the System Administrator to set it.'}</span>
              </p>
            )}
            {missing.length === 0 && activeProducts.length > 0 && activeSizes.length > 0 && (
              <p data-testid="all-priced" className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-5 py-3 text-sm text-emerald-900"><CircleCheck className="h-4 w-4" aria-hidden="true" /> Every product and size has a price.</p>
            )}

            {activeProducts.length === 0 || activeSizes.length === 0 ? (
              <p data-testid="prices-empty" className="rounded-2xl border-2 border-dashed border-paddy-100 bg-white p-6 text-center text-sm text-ink-500">There are no products or package sizes yet. Add them in Master data first.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-paddy-100 bg-white" data-testid="price-matrix">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-rice-50 text-xs uppercase tracking-wide text-ink-500">
                    <tr><th className="px-3 py-2.5 text-left font-semibold">Product</th>{activeSizes.map((s) => <th key={s.id} className="px-3 py-2.5 text-right font-semibold">{s.label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-paddy-100">
                    {activeProducts.map((p) => (
                      <tr key={p.id} data-testid="price-row">
                        <th scope="row" className="px-3 py-3 text-left font-medium text-ink-900">{p.name}</th>
                        {activeSizes.map((s) => {
                          const lp = listPrice(p.id, s.id);
                          const cell = lp
                            ? <span data-testid="price-cell" className="font-semibold text-paddy-900">GHS {money(Number(lp.pricePerBag))}</span>
                            : <span data-testid="price-missing" className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">Not set</span>;
                          return (
                            <td key={s.id} className="px-3 py-2 text-right">
                              {canManage ? <button type="button" data-testid="price-pick" onClick={() => pick(p.id, s.id, lp)} className="rounded-lg px-2 py-1 transition hover:bg-husk-100" aria-label={`${lp ? 'Change' : 'Set'} the price of ${p.name} ${s.label}`}>{cell}</button> : cell}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {canManage && (
              <form onSubmit={save} data-testid="price-form" className="rounded-2xl border border-paddy-100 bg-white p-5">
                <h2 className="font-display text-lg font-medium text-paddy-900">Set a price</h2>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-ink-500">Product
                    <select data-testid="pf-product" value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))} className="mt-1 w-full rounded-lg border border-paddy-100 bg-white px-2 py-2 text-sm font-normal normal-case text-ink-900">
                      <option value="">Choose…</option>{activeProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-ink-500">Size
                    <select data-testid="pf-size" value={form.sizeId} onChange={(e) => setForm((f) => ({ ...f, sizeId: e.target.value }))} className="mt-1 w-full rounded-lg border border-paddy-100 bg-white px-2 py-2 text-sm font-normal normal-case text-ink-900">
                      <option value="">Choose…</option>{activeSizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-ink-500">For
                    <select data-testid="pf-customer" value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))} className="mt-1 w-full rounded-lg border border-paddy-100 bg-white px-2 py-2 text-sm font-normal normal-case text-ink-900">
                      <option value="">Everyone (the list price)</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-ink-500">Price per bag (GHS)
                    <input ref={priceRef} data-testid="pf-price" inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value.replace(/[^0-9.]/g, '') }))} className="mt-1 w-full rounded-lg border border-paddy-100 px-2 py-2 text-sm font-normal normal-case text-ink-900" placeholder="0.00" />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-ink-500">From
                    <input data-testid="pf-from" type="date" value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} className="mt-1 w-full rounded-lg border border-paddy-100 px-2 py-2 text-sm font-normal normal-case text-ink-900" />
                  </label>
                </div>
                <p className="mt-2 text-xs text-ink-500">The new price replaces the one now in force from the date chosen. A date in the future schedules it.</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="submit" data-testid="pf-save" disabled={saving} className="rounded-full bg-paddy-900 px-5 py-2.5 text-sm font-semibold text-rice-50 transition hover:bg-paddy-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save price'}</button>
                  {status && <p role="status" data-testid="pf-status" className={`text-sm ${status.kind === 'ok' ? 'text-emerald-800' : 'text-red-700'}`}>{status.text}</p>}
                </div>
              </form>
            )}

            {customerPrices.length > 0 && (
              <div data-testid="customer-prices">
                <h2 className="font-display text-lg font-medium text-paddy-900">Customer prices</h2>
                <p className="text-xs text-ink-500">These customers pay their own price instead of the list price.</p>
                <ul className="mt-2 space-y-1.5">{customerPrices.map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-white px-4 py-2.5 text-sm"><span><strong>{p.customer?.name}</strong> · {p.product.name} {p.packagingSize.label}</span><span className="font-semibold text-paddy-900">GHS {money(Number(p.pricePerBag))} <span className="font-normal text-ink-500">from {when(p.effectiveFrom)}</span></span></li>)}</ul>
              </div>
            )}

            {history.length > 0 && (
              <details className="rounded-2xl border border-paddy-100 bg-white px-5 py-3 text-sm" data-testid="price-history">
                <summary className="cursor-pointer font-medium text-paddy-900">Earlier and scheduled prices ({history.length})</summary>
                <ul className="mt-2 space-y-1">{history.map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-2 text-ink-700"><span>{p.product.name} {p.packagingSize.label}{p.customer ? ` · ${p.customer.name}` : ''}</span><span>GHS {money(Number(p.pricePerBag))} · {p.isActive ? `starts ${when(p.effectiveFrom)}` : `replaced ${p.effectiveTo ? when(p.effectiveTo) : ''}`}</span></li>)}</ul>
              </details>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
