'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Factory, Package, Truck, Wheat } from 'lucide-react';
import { type MeResponse, inventoryApi, type InventorySummary } from '@/lib/api-client';
import { useEffect, useState } from 'react';
import { ControlCenter, hasControlCenter } from '@/components/ControlCenter';
import { ReleaseDesk } from '@/components/SalesDesks';
import { ResetApprovalQueue } from '@/components/review/ResetApprovalQueue';
import { WatchlistCard } from '@/components/WatchlistCard';
import { OutputFeedbackCard } from '@/components/OutputFeedbackCard';
import { DonutChart } from '@/components/StatCard';
import { BroadcastPanel, DelegateTask } from './desks';
import { Controls, GoTo, Greeting, KpiRow, Panel, SalesRecord, SpendByPlace, Tile, TrendPanel } from './parts';
import { dispatchFacts, useDispatch, useMoney } from './hooks';

function Pulse({ id, href, icon: Icon, label, value, note, warn }: { id: string; href: string; icon: typeof Truck; label: string; value: number | null; note: string; warn?: boolean }) {
  return (
    <Link href={href} data-testid="pulse-tile" data-key={id} data-value={value ?? ''} className={`rounded-2xl border p-4 transition hover:border-paddy-500 ${warn ? 'border-amber-300 bg-amber-50' : 'border-husk-500/40 bg-husk-100/40'}`}>
      <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-paddy-800"><Icon className="h-4 w-4" aria-hidden="true" /></span><p className="text-xs font-medium uppercase tracking-wide text-ink-700">{label}</p></div>
      <p className={`mt-2 font-display text-3xl font-medium ${warn ? 'text-amber-800' : 'text-paddy-900'}`} data-testid="pulse-value">{value === null ? '...' : value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-ink-700">{note}</p>
    </Link>
  );
}

/**
 * The Managing Director's dashboard: running the business. What is moving (trucks, late deliveries, damaged-bag reports, stock), the decisions that are his
 * (release orders, director-level expenses, resets), the people (give a task, announce to the team), and the only things he alone manages: the company's
 * places and master lists. The money is here, but as one part of the picture.
 */
export function MdDashboard({ me, accessToken, hasPermission }: { me: MeResponse; accessToken: string; hasPermission: (c: string | string[]) => boolean }) {
  const { period, setPeriod, data, error, loading, refresh } = useMoney(accessToken);
  const facts = dispatchFacts(useDispatch(accessToken));
  const [inventory, setInventory] = useState<InventorySummary | null>(null);
  useEffect(() => { inventoryApi.getSummary(accessToken).then(setInventory).catch(() => {}); }, [accessToken]);

  return (
    <div className="space-y-6" data-testid="exec-dashboard" data-role="MD" aria-busy={loading}>
      <Greeting me={me} copy="You run the business: release what is ready, keep the trucks and the mills moving, direct your people, and set up the places the company works in." />

      <div data-testid="exec-pulse">
        <h2 className="font-display text-lg font-medium text-paddy-900">The business in motion</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Pulse id="road" href="/track-dispatch" icon={Truck} label="On the way" value={facts?.open ?? null} note="Trucks and transfers not yet counted in" />
          <Pulse id="late" href="/track-dispatch" icon={AlertTriangle} label="Running late" value={facts?.lateNow.length ?? null} note={facts && facts.lateNow.length > 0 ? `Longest: ${facts.lateNow[0].ref}` : 'Nothing is overdue'} warn={(facts?.lateNow.length ?? 0) > 0} />
          <Pulse id="reports" href="/track-dispatch" icon={Package} label="Damaged-bag reports" value={facts?.waitingReview ?? null} note="Waiting for a Warehouse Supervisor" warn={(facts?.waitingReview ?? 0) > 0} />
          <Pulse id="delivered" href="/track-dispatch" icon={CheckCircle2} label="Delivered" value={facts?.delivered ?? null} note={facts && facts.onTimePct !== null ? `${Math.round(facts.onTimePct)}% on time` : 'Counted in at the warehouse'} />
        </div>
      </div>

      {hasControlCenter(me) && <ControlCenter accessToken={accessToken} me={me} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2" data-testid="exec-desk">
          <h2 className="font-display text-lg font-medium text-paddy-900">Decide here</h2>
          <p className="mb-3 text-sm text-ink-500">Release approved orders and decide on the expenses that are yours to decide.</p>
          <ReleaseDesk accessToken={accessToken} canApproveDirectorExpenses={hasPermission('finance.approve.director')} />
        </div>
        <div data-testid="exec-resets"><ResetApprovalQueue accessToken={accessToken} /></div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><DelegateTask accessToken={accessToken} meId={me.id} /><BroadcastPanel accessToken={accessToken} meId={me.id} /></div>

      <div data-testid="exec-operations">
        <h2 className="font-display text-lg font-medium text-paddy-900">The company on the ground</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-3 lg:col-span-2">
            <Tile id="paddy-farms" href="/inventory" icon={Wheat} label="Paddy on farms" value={`${(inventory?.paddy?.farmKg ?? 0).toLocaleString()} kg`} note="At the farms now" />
            <Tile id="paddy-transit" href="/track-dispatch" icon={Truck} label="Paddy in transit" value={`${(inventory?.paddy?.inTransitKg ?? 0).toLocaleString()} kg`} note="On the road" />
            <Tile id="paddy-mill" href="/production" icon={Factory} label="At the mills" value={`${(inventory?.paddy?.atMillingKg ?? 0).toLocaleString()} kg`} note="Being milled" />
            <Tile id="rice" href="/inventory" icon={Package} label="Packaged rice" value={`${((inventory?.finishedRice ?? []).reduce((s, r) => s + r.availableKg, 0)).toLocaleString()} kg`} note="Ready to sell" />
          </div>
          <Panel title="Stock at a glance">
            {inventory?.paddy && Array.isArray(inventory.finishedRice) ? <DonutChart centerLabel={`${(inventory.paddy.farmKg + inventory.paddy.warehouseKg + inventory.finishedRice.reduce((s, r) => s + r.totalKg, 0)).toLocaleString()} kg`} data={[
              { name: 'Paddy (farms)', value: inventory.paddy.farmKg }, { name: 'Paddy (warehouses)', value: inventory.paddy.warehouseKg }, { name: 'Packaged rice', value: inventory.finishedRice.reduce((s, r) => s + r.totalKg, 0) },
              { name: 'Rice hull', value: inventory.riceHullKg }, { name: 'Broken rice', value: inventory.brokenRiceKg }]} /> : <p className="text-sm text-ink-500">Loading...</p>}
          </Panel>
        </div>
      </div>

      <GoTo me={me} id="exec-setup" title="Set up the company" hrefs={['/organization', '/master-data']} />

      <div>
        <h2 className="font-display text-lg font-medium text-paddy-900">The money, briefly</h2>
        <div className="mt-3 space-y-4">
          <Controls period={period} setPeriod={setPeriod} data={data} loading={loading} refresh={refresh} />
          {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="exec-error">{error}</p>}
          <KpiRow data={data} period={period} />
          {data && (<><SpendByPlace data={data} /><div className="grid grid-cols-1 gap-4 xl:grid-cols-5"><div className="xl:col-span-3"><TrendPanel data={data} /></div><div className="xl:col-span-2"><SalesRecord data={data} /></div></div></>)}
        </div>
      </div>

      <div className="space-y-4" data-testid="exec-watch"><WatchlistCard accessToken={accessToken} /><OutputFeedbackCard accessToken={accessToken} /></div>
      <GoTo me={me} hrefs={['/oversight', '/track-dispatch', '/sales', '/finance', '/money', '/analytics', '/reports', '/assistant', '/audit-log']} />
    </div>
  );
}
