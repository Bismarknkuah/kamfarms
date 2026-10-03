'use client';

import Link from 'next/link';
import type { Expense, Farm, FarmEquipment } from '@/lib/api-client';
import type { FarmInventory } from './types';
import { countEquipmentIssues, formatGhs, formatKg, inPeriod } from '@/lib/oversight-utils';

export function FarmsPanel({
  farms,
  inventories,
  equipment,
  expenses,
}: {
  farms: Farm[];
  inventories: Record<string, FarmInventory>;
  equipment: FarmEquipment[];
  expenses: Expense[];
}) {
  const monthExpenses = expenses.filter((e) => inPeriod(e.date, 'THIS_MONTH'));
  const loaded = farms.filter((f) => inventories[f.id]);
  const totalBags = loaded.reduce((s, f) => s + inventories[f.id].totalBags, 0);
  const totalKg = loaded.reduce((s, f) => s + inventories[f.id].totalKg, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-paddy-100 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-paddy-900">Every farm, side by side</h2>
          <p className="text-xs text-ink-500">
            {farms.length} farm{farms.length === 1 ? '' : 's'} &middot; {totalBags.toLocaleString()} bags ({formatKg(totalKg)}) on hand in total
          </p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-xs text-ink-500">
                <th className="pb-2 font-medium">Farm</th>
                <th className="pb-2 font-medium">Managed by</th>
                <th className="pb-2 font-medium">Paddy on hand</th>
                <th className="pb-2 font-medium">Sent out (all time)</th>
                <th className="pb-2 font-medium">Equipment</th>
                <th className="pb-2 font-medium">Spend this month</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {farms.map((f) => {
                const inv = inventories[f.id];
                const eq = countEquipmentIssues(equipment.filter((e) => e.farm.name === f.name));
                const mine = monthExpenses.filter((e) => e.farm?.name === f.name);
                const approved = mine.filter((e) => e.status === 'APPROVED').reduce((s, e) => s + e.amount, 0);
                const pending = mine.filter((e) => e.status === 'PENDING').reduce((s, e) => s + e.amount, 0);
                return (
                  <tr key={f.id} className="border-t border-paddy-50 align-top">
                    <td className="py-3">
                      <p className="font-medium text-ink-900">{f.name}</p>
                      <p className="text-xs text-ink-500">{f.location ?? f.code}{!f.isActive && ' - inactive'}</p>
                    </td>
                    <td className="py-3 text-ink-700">{f.managers.length > 0 ? f.managers.map((m) => `${m.user.firstName} ${m.user.lastName}`).join(', ') : <span className="text-amber-800">No manager assigned</span>}</td>
                    <td className="py-3 text-ink-900">
                      {inv ? (<><span className="font-medium">{inv.totalBags.toLocaleString()} bags</span><span className="block text-xs text-ink-500">{formatKg(inv.totalKg)}</span></>) : <span className="text-ink-500">Unavailable</span>}
                    </td>
                    <td className="py-3 text-ink-700">
                      {inv ? (<>{inv.dispatchedTotalBags.toLocaleString()} bags<span className="block text-xs text-ink-500">{formatKg(inv.dispatchedTotalKg)}</span></>) : <span className="text-ink-500">Unavailable</span>}
                    </td>
                    <td className="py-3">
                      {eq.working + eq.issues === 0 ? <span className="text-xs text-ink-500">None recorded</span> : (
                        <>
                          <span className="text-ink-900">{eq.working} working</span>
                          {eq.issues > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{eq.issues} need attention</span>}
                        </>
                      )}
                    </td>
                    <td className="py-3 text-ink-900">
                      {formatGhs(approved)}
                      {pending > 0 && <span className="block text-xs text-amber-800">+ {formatGhs(pending)} pending</span>}
                    </td>
                    <td className="py-3 text-right"><Link href={`/farms/${f.id}`} className="text-xs font-medium text-paddy-700 hover:underline">Open farm</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {farms.length === 0 && <p className="py-6 text-center text-sm text-ink-500">No farms found.</p>}
        </div>
      </div>
    </div>
  );
}
