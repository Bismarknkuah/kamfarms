'use client';

import { useEffect, useState } from 'react';
import { Factory, Sprout, Truck, Warehouse } from 'lucide-react';
import { ApiError, Whereabouts as WhereaboutsData, supplyApi } from '@/lib/api-client';
import { primarySizes } from '@/components/SizeBags';

const ICON = { FARM: Sprout, ROAD: Truck, WAREHOUSE: Warehouse, MILL: Factory } as const;
const TITLE = { FARM: 'At the farm', ROAD: 'On the road', WAREHOUSE: 'At the warehouse', MILL: 'At the mill' } as const;

/**
 * "Where is the paddy?": every place it is right now, size by size, in the order it travels (farm, road, warehouse, mill). Each person sees the
 * places they are responsible for; the Farm Director and management see all of them.
 */
export function Whereabouts({ accessToken }: { accessToken: string }) {
  const [data, setData] = useState<WhereaboutsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    supplyApi.whereabouts(accessToken).then(setData).catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not load where the paddy is.'));
  }, [accessToken]);
  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-ink-500">Loading...</p>;
  const sizes = primarySizes(data.sizes);
  const n = (bags: Record<string, number>, id: string) => (bags[id] ?? 0).toLocaleString('en-US');
  return (
    <div data-testid="whereabouts" className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {sizes.map((s) => (
          <div key={s.id} className="rounded-2xl bg-paddy-900 px-5 py-3 text-rice-50" data-testid="where-total">
            <p className="text-xs uppercase tracking-wide text-husk-300">All {s.label}</p>
            <p className="font-display text-3xl">{n(data.totals, s.id)} <span className="text-sm">bags</span></p>
          </div>
        ))}
      </div>
      {data.places.length === 0 && <p className="rounded-xl bg-white px-4 py-3 text-sm text-ink-500">No paddy to show yet.</p>}
      <ul className="space-y-2">
        {data.places.map((p) => {
          const Icon = ICON[p.type];
          return (
            <li key={`${p.type}-${p.id}`} data-testid="where-place" data-type={p.type} className="flex flex-wrap items-center gap-3 rounded-2xl border border-paddy-100 bg-white px-4 py-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${p.type === 'ROAD' ? 'bg-husk-300 text-soil-700' : 'bg-paddy-50 text-paddy-700'}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-500">{TITLE[p.type]}</p>
                <p className="font-medium text-ink-900">{p.name}{p.location ? <span className="text-ink-500"> ({p.location})</span> : null}</p>
                {p.detail && <p className="text-xs text-ink-500">{p.detail}</p>}
              </div>
              <div className="flex gap-4 text-right">
                {sizes.map((s) => <div key={s.id}><p className="text-[10px] uppercase text-ink-500">{s.label}</p><p className="font-display text-xl text-paddy-900">{n(p.bags, s.id)}</p></div>)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
