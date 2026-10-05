'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { ApiError, type MoneyLedger, financeCenterApi } from '@/lib/api-client';
import { cedis, cedis2, when } from '@/components/executive/money';

const FIELD = 'rounded-xl border border-paddy-100 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20';
const STATE: Record<string, string> = { confirmed: 'bg-emerald-100 text-emerald-800', waiting: 'bg-amber-100 text-amber-900', refused: 'bg-red-100 text-red-800' };
const STATE_LABEL: Record<string, string> = { confirmed: 'Confirmed', waiting: 'Waiting', refused: 'Refused' };

export default function MoneyLedgerPage() {
  const { me, accessToken, loading, error } = useCurrentUser();
  const [f, setF] = useState({ kind: '', place: '', status: '', from: '', to: '', q: '' });
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<MoneyLedger | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The dashboard links here with a place or a kind already chosen (for example /money?place=farm:ID).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setF((x) => ({ ...x, kind: q.get('kind') ?? '', place: q.get('place') ?? '', status: q.get('status') ?? '' })); setReady(true);
  }, []);

  const load = useCallback(() => {
    if (!accessToken) return;
    setBusy(true);
    financeCenterApi.ledger(accessToken, { ...f, limit: '200' })
      .then((v) => { setData(v); setProblem(null); })
      .catch((e: unknown) => setProblem(e instanceof ApiError ? e.message : 'The ledger could not be loaded.'))
      .finally(() => setBusy(false));
  }, [accessToken, f]);
  useEffect(() => { if (!ready) return; const t = setTimeout(load, f.q ? 250 : 0); return () => clearTimeout(t); }, [ready, load, f.q]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading...</p></main>;
  if (error || !me || !accessToken) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <DashboardShell me={me}>
      <section className="space-y-5" data-testid="ledger-page" aria-busy={busy}>
        <div>
          <p className="font-display text-base italic text-soil-500">Money</p>
          <h1 className="font-display text-2xl font-medium text-paddy-900">Money ledger</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-500">Every payment received from customers and every expense, across all farms, warehouses and milling centers. Totals count what is confirmed; what is waiting for a decision is shown apart.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-paddy-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6" data-testid="ledger-filters">
          <label className="text-xs font-medium text-ink-700">Money<select data-testid="ledger-filter-kind" value={f.kind} onChange={set('kind')} className={`${FIELD} mt-1 w-full`}><option value="">In and out</option><option value="in">Money in</option><option value="out">Money out</option></select></label>
          <label className="text-xs font-medium text-ink-700 lg:col-span-2">Place (spending only)
            <select data-testid="ledger-filter-place" value={f.place} onChange={set('place')} className={`${FIELD} mt-1 w-full`}>
              <option value="">All places</option><option value="office">Head office</option>
              {(data?.places.farms.length ?? 0) > 0 && <optgroup label="Farms">{data?.places.farms.map((p) => <option key={p.id} value={`farm:${p.id}`}>{p.name}</option>)}</optgroup>}
              {(data?.places.warehouses.length ?? 0) > 0 && <optgroup label="Warehouses">{data?.places.warehouses.map((p) => <option key={p.id} value={`warehouse:${p.id}`}>{p.name}</option>)}</optgroup>}
              {(data?.places.millingCenters.length ?? 0) > 0 && <optgroup label="Milling centers">{data?.places.millingCenters.map((p) => <option key={p.id} value={`mill:${p.id}`}>{p.name}</option>)}</optgroup>}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-700">State<select data-testid="ledger-filter-status" value={f.status} onChange={set('status')} className={`${FIELD} mt-1 w-full`}><option value="">Any</option><option value="confirmed">Confirmed</option><option value="waiting">Waiting for a decision</option><option value="refused">Refused</option></select></label>
          <label className="text-xs font-medium text-ink-700">From<input data-testid="ledger-from" type="date" value={f.from} onChange={set('from')} className={`${FIELD} mt-1 w-full`} /></label>
          <label className="text-xs font-medium text-ink-700">To<input data-testid="ledger-to" type="date" value={f.to} onChange={set('to')} className={`${FIELD} mt-1 w-full`} /></label>
          <label className="text-xs font-medium text-ink-700 sm:col-span-2 lg:col-span-6">Search<input data-testid="ledger-q" value={f.q} onChange={set('q')} placeholder="A number, a customer, a kind of cost, a place..." className={`${FIELD} mt-1 w-full`} /></label>
        </div>

        {problem && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="ledger-error">{problem}</p>}
        {f.place && <p className="text-xs text-ink-500" data-testid="ledger-place-note">Payments from customers are not tied to a place, so only spending is shown for a place.</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['in', 'Money in', cedis2(data.totals.in), data.totals.waitingIn > 0 ? `${cedis2(data.totals.waitingIn)} waiting to be verified` : 'Verified payments'],
                ['out', 'Money out', cedis2(data.totals.out), data.totals.waitingOut > 0 ? `${cedis2(data.totals.waitingOut)} waiting for approval` : 'Approved expenses'],
                ['net', 'Net', `${data.totals.net < 0 ? '-' : ''}${cedis2(Math.abs(data.totals.net))}`, 'Money in, less money out'],
                ['count', 'Entries', data.count.toLocaleString(), data.truncated ? `The latest ${data.rows.length} are shown` : 'All shown'],
              ].map(([k, label, value, note]) => (
                <div key={k} className="rounded-2xl border border-paddy-100 bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p><p className="mt-1 font-display text-2xl font-medium text-paddy-900" data-testid={`ledger-total-${k}`}>{value}</p><p className="mt-1 text-xs text-ink-500">{note}</p></div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
              <table className="w-full min-w-[46rem] text-sm" data-testid="ledger-table">
                <thead><tr className="border-b border-paddy-100 text-left text-xs uppercase tracking-wide text-ink-500"><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Number</th><th className="px-4 py-3 font-medium">What</th><th className="px-4 py-3 font-medium">Place</th><th className="px-4 py-3 text-right font-medium">In</th><th className="px-4 py-3 text-right font-medium">Out</th><th className="px-4 py-3 font-medium">State</th></tr></thead>
                <tbody>
                  {data.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-500" data-testid="ledger-empty">Nothing matches these filters.</td></tr>}
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-b border-paddy-100/60" data-testid="ledger-row" data-kind={r.kind} data-number={r.number} data-state={r.state} data-amount={r.amount}>
                      <td className="px-4 py-2.5 text-ink-700">{when(r.date)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs"><Link href={r.link} className="text-paddy-700 hover:underline">{r.number}</Link></td>
                      <td className="px-4 py-2.5"><span className="flex items-center gap-2"><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${r.kind === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-husk-100 text-husk-700'}`}>{r.kind === 'IN' ? <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />}</span><span><span className="block text-ink-900">{r.title}</span>{r.detail && <span className="block text-xs text-ink-500">{r.detail}</span>}</span></span></td>
                      <td className="px-4 py-2.5 text-ink-700">{r.place?.name ?? ' - '}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">{r.kind === 'IN' ? cedis2(r.amount) : ''}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-ink-900">{r.kind === 'OUT' ? cedis2(r.amount) : ''}</td>
                      <td className="px-4 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE[r.state]}`}>{STATE_LABEL[r.state]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.truncated && <p className="text-sm text-amber-800" data-testid="ledger-truncated">Showing the latest {data.rows.length} of {data.count.toLocaleString()} entries. The totals above cover all {data.count.toLocaleString()}. Narrow the filters to see the rest.</p>}
          </>
        )}
        {!data && !problem && <p className="text-sm text-ink-500" data-testid="ledger-loading">Loading the ledger...</p>}
      </section>
    </DashboardShell>
  );
}
