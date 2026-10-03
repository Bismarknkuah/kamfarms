'use client';

import Link from 'next/link';
import type { Expense, Warehouse, WarehouseEquipment, WarehouseOverview } from '@/lib/api-client';
import { countEquipmentIssues, formatGhs, formatKg, inPeriod } from '@/lib/oversight-utils';

const sum = (rows: { bags: number; kg: number }[]) => ({ bags: rows.reduce((s, r) => s + r.bags, 0), kg: rows.reduce((s, r) => s + r.kg, 0) });

function Tile({ label, bags, kg }: { label: string; bags?: number; kg: number }) {
  return (
    <div className="rounded-xl bg-rice-50 px-3 py-2.5">
      <p className="text-[11px] text-ink-500">{label}</p>
      <p className="font-display text-lg leading-tight text-paddy-900">{formatKg(kg)}</p>
      {bags !== undefined && <p className="text-[11px] text-ink-500">{bags.toLocaleString()} bags</p>}
    </div>
  );
}

export function WarehousesPanel({
  warehouses,
  overviews,
  equipment,
  expenses,
}: {
  warehouses: Warehouse[];
  overviews: Record<string, WarehouseOverview>;
  equipment: WarehouseEquipment[];
  expenses: Expense[];
}) {
  const monthExpenses = expenses.filter((e) => inPeriod(e.date, 'THIS_MONTH'));
  return (
    <div className="space-y-4">
      {warehouses.map((w) => {
        const ov = overviews[w.id];
        const eq = countEquipmentIssues(equipment.filter((e) => e.warehouse.name === w.name));
        const mine = monthExpenses.filter((e) => !e.farm && e.warehouse?.name === w.name);
        const approved = mine.filter((e) => e.status === 'APPROVED').reduce((s, e) => s + e.amount, 0);
        const pending = mine.filter((e) => e.status === 'PENDING').reduce((s, e) => s + e.amount, 0);
        const available = ov ? sum(ov.paddy.available) : null;
        const arriving = ov ? sum(ov.paddy.inTransit) : null;
        const atMilling = ov ? sum(ov.atMilling) : null;
        const packaged = ov ? sum(ov.packagedRice) : null;
        return (
          <div key={w.id} className="rounded-2xl border border-paddy-100 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-ink-500">{w.code}</p>
                <h2 className="font-display text-xl text-paddy-900">{w.name}{!w.isActive && <span className="ml-2 text-xs font-normal text-ink-500">(inactive)</span>}</h2>
                <p className="text-xs text-ink-500">
                  {w.location ?? 'No location set'} &middot;{' '}
                  {w.managers.length > 0 ? `Managed by ${w.managers.map((m) => `${m.user.firstName} ${m.user.lastName}`).join(', ')}` : <span className="text-amber-800">No manager assigned</span>}
                </p>
              </div>
              <Link href={`/warehouses/${w.id}`} className="rounded-full border border-paddy-100 px-4 py-2 text-xs font-medium text-paddy-900 hover:bg-paddy-50">Open warehouse</Link>
            </div>

            {ov && available && arriving && atMilling && packaged ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Tile label="Paddy available" bags={available.bags} kg={available.kg} />
                  <Tile label="Arriving (in transit)" bags={arriving.bags} kg={arriving.kg} />
                  <Tile label="At the mill" bags={atMilling.bags} kg={atMilling.kg} />
                  <Tile label="Packaged rice" bags={packaged.bags} kg={packaged.kg} />
                </div>
                {ov.packagedRice.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ov.packagedRice.map((p) => (
                      <span key={p.label} className="rounded-full border border-paddy-100 px-3 py-1 text-xs text-ink-700">{p.label}: <span className="font-medium text-ink-900">{p.bags.toLocaleString()} bags</span></span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm text-ink-500">Stock figures for this warehouse could not be loaded just now.</p>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-500">Equipment</p>
                {eq.working + eq.issues === 0 ? <p className="text-ink-500">None recorded</p> : (
                  <p className="text-ink-900">{eq.working} working{eq.issues > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{eq.issues} need attention</span>}</p>
                )}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-500">Spend this month</p>
                <p className="text-ink-900">{formatGhs(approved)}{pending > 0 && <span className="ml-2 text-xs text-amber-800">+ {formatGhs(pending)} pending</span>}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-500">Milling centers</p>
                <p className="text-ink-900">{w.millingCenters.length > 0 ? w.millingCenters.map((m) => m.name).join(', ') : <span className="text-ink-500">None</span>}</p>
              </div>
            </div>
          </div>
        );
      })}
      {warehouses.length === 0 && <p className="rounded-2xl border border-paddy-100 bg-white p-6 text-sm text-ink-500">No warehouses found.</p>}
    </div>
  );
}
