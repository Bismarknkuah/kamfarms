'use client';

import { Eye, MapPin, Package, PackageOpen, Layers, Sparkles, Zap } from 'lucide-react';
import type { AiBagSizes, AiJurisdiction, AiYieldRates } from '@/lib/api-client';
import { formatBags, formatKg, outputsFromEnergy } from '@/lib/ai-yield';

/**
 * The top of the AI page. For the MD and CEO the first thing on it is the answer they ask most: what every single
 * kWh of power turns into, in bags of packaged rice, broken rice and hull.
 */
export function AiHero({ jurisdiction, rates, bags, runs }: { jurisdiction: AiJurisdiction; rates?: AiYieldRates; bags?: AiBagSizes; runs?: number }) {
  const one = rates && bags ? outputsFromEnergy(rates, 1, bags) : null;
  const items = one
    ? [
        { id: 'rice', icon: Package, label: 'Packaged rice', bags: one.riceBags, kg: one.riceKg },
        { id: 'broken', icon: PackageOpen, label: 'Broken rice', bags: one.brokenBags, kg: one.brokenKg },
        { id: 'hull', icon: Layers, label: 'Hull', bags: one.hullBags, kg: one.hullKg },
      ]
    : [];
  return (
    <header
      data-testid="ai-hero"
      className="relative overflow-hidden rounded-3xl bg-paddy-900 px-6 py-7 text-rice-50 sm:px-9 sm:py-9"
      style={{ backgroundImage: 'radial-gradient(120% 90% at 100% 0%, rgba(214,170,60,0.30), transparent 55%), radial-gradient(70% 80% at 0% 100%, rgba(255,255,255,0.07), transparent 60%)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-husk-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-husk-300">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI Insights
        </span>
        <span data-testid="ai-jurisdiction" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
          {jurisdiction.companyWide ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <MapPin className="h-3.5 w-3.5" aria-hidden="true" />}
          {jurisdiction.companyWide ? 'Whole company' : jurisdiction.label}
        </span>
        {runs !== undefined && (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium" data-testid="ai-runs">{runs.toLocaleString('en-US')} milling run{runs === 1 ? '' : 's'} read</span>
        )}
      </div>
      <h1 className="mt-4 max-w-3xl font-display text-3xl font-medium leading-tight sm:text-4xl">What your power and paddy should produce</h1>
      <p className="mt-2 max-w-2xl text-sm text-paddy-100">
        Predictions built from your own approved milling runs. Every figure says how many runs it comes from, so you know how far to trust it.
      </p>

      {one && (
        <div data-testid="ai-glance" className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4 sm:p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-husk-300">
            <Zap className="h-4 w-4" aria-hidden="true" /> Every 1 kWh of power gives
            {rates?.basis === 'benchmark' && <span className="rounded-full bg-amber-300/90 px-2 py-0.5 text-[10px] font-bold text-amber-950">Industry benchmark</span>}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {items.map((i) => (
              <div key={i.id} data-testid={`glance-${i.id}`} className="flex items-center gap-3 rounded-xl bg-paddy-900/50 px-4 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-husk-500 text-white"><i.icon className="h-5 w-5" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-medium leading-none"><span data-testid={`glance-${i.id}-bags`}>{formatBags(i.bags)}</span> <span className="text-sm font-normal text-paddy-100">bags</span></p>
                  <p className="mt-1 truncate text-xs text-paddy-100">{i.label} · {formatKg(i.kg)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
