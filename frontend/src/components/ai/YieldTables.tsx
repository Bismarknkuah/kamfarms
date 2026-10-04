'use client';

import { useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { AiInsights, AiYieldRates } from '@/lib/api-client';
import { formatBags, formatKg, outputsFromEnergy, versusCompany } from '@/lib/ai-yield';

type Data = Extract<AiInsights, { available: true }>;
const UNITS = [1, 100, 1000] as const;

function Cell({ bags, kg }: { bags: number; kg: number }) {
  return <td className="px-3 py-3 text-right align-top"><span className="font-semibold text-paddy-900">{formatBags(bags)}</span><span className="block text-xs text-ink-500">{formatKg(kg)}</span></td>;
}

function Versus({ place, company }: { place: AiYieldRates; company: AiYieldRates }) {
  const v = versusCompany(place, company);
  if (v === null) return <span className="text-xs text-ink-500">Not enough runs</span>;
  if (Math.abs(v) < 3) return <span className="text-xs font-medium text-ink-700">In line</span>;
  const up = v > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-1 text-xs font-bold ${up ? 'text-emerald-700' : 'text-red-700'}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{up ? '+' : ''}{v.toFixed(0)}%</span>;
}

function Table({ testId, title, intro, rows, data, unit, compare }: { testId: string; title: string; intro: string; rows: { key: string; name: string; sub?: string; rates: AiYieldRates }[]; data: Data; unit: number; compare: boolean }) {
  return (
    <div data-testid={testId}>
      <h3 className="font-display text-lg font-medium text-paddy-900">{title}</h3>
      <p className="mt-0.5 text-xs text-ink-500">{intro}</p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-paddy-100">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-rice-50 text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">&nbsp;</th>
              <th className="px-3 py-2.5 text-right font-semibold">Packaged rice (bags)</th>
              <th className="px-3 py-2.5 text-right font-semibold">Broken rice (bags)</th>
              <th className="px-3 py-2.5 text-right font-semibold">Hull (bags)</th>
              <th className="px-3 py-2.5 text-right font-semibold">Paddy milled (bags)</th>
              <th className="px-3 py-2.5 text-right font-semibold">Runs</th>
              {compare && <th className="px-3 py-2.5 text-right font-semibold">Rice per kWh vs company</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-paddy-100">
            {rows.map((r) => {
              const o = outputsFromEnergy(r.rates, unit, data.bagSizes);
              return (
                <tr key={r.key} data-testid="yield-row" className="bg-white">
                  <th scope="row" className="px-3 py-3 text-left align-top font-medium text-ink-900">{r.name}{r.sub && <span className="block text-xs font-normal text-ink-500">{r.sub}</span>}</th>
                  <Cell bags={o.riceBags} kg={o.riceKg} />
                  <Cell bags={o.brokenBags} kg={o.brokenKg} />
                  <Cell bags={o.hullBags} kg={o.hullKg} />
                  <Cell bags={o.paddyBags} kg={o.paddyKg} />
                  <td className="px-3 py-3 text-right align-top text-ink-700">{r.rates.runs}{r.rates.basis === 'benchmark' && <span className="block text-xs text-amber-800">benchmark</span>}</td>
                  {compare && <td className="px-3 py-3 text-right align-top" data-testid="vs-company"><Versus place={r.rates} company={data.overall} /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The same rates laid side by side: by grade of paddy, and (when there is more than one) by milling center. */
export function YieldTables({ data }: { data: Data }) {
  const [unit, setUnit] = useState<number>(100);
  const centers = data.byCenter;
  return (
    <section data-testid="yield-tables" className="rounded-3xl border border-paddy-100 bg-white p-5 shadow-sm sm:p-7" aria-label="What each amount of power gives">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium text-paddy-900">What the power gives, side by side</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-500">Bags of each product for the amount of power on the right, by grade of paddy{centers.length > 1 ? ' and by milling center' : ''}.</p>
        </div>
        <div role="group" aria-label="Amount of power" className="inline-flex rounded-full bg-rice-50 p-1 text-sm font-medium" data-testid="unit-toggle">
          {UNITS.map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} data-testid={`unit-${u}`} onClick={() => setUnit(u)}
              className={`rounded-full px-4 py-2 transition ${unit === u ? 'bg-paddy-900 text-rice-50 shadow' : 'text-ink-700 hover:text-paddy-900'}`}>
              {u.toLocaleString('en-US')} kWh
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 space-y-8">
        <Table testId="table-grade" title="By grade of paddy" intro="A grade that mills differently gives a different mix, so read each row on its own." compare={false} unit={unit} data={data}
          rows={[{ key: 'all', name: data.jurisdiction.companyWide ? 'All grades, whole company' : 'All grades, my places', rates: data.overall }, ...data.byGrade.map((g) => ({ key: g.gradeId, name: g.label, sub: g.code, rates: g.rates }))]} />
        {centers.length > 0 && (
          <Table testId="table-center" title={data.jurisdiction.companyWide ? 'By milling center' : 'My milling centers'}
            intro={centers.length > 1 ? 'Best rice per kWh first. The last column shows how far each center is above or below the company as a whole.' : 'Your milling center.'}
            compare={centers.length > 1} unit={unit} data={data} rows={centers.map((c) => ({ key: c.centerId, name: c.name, sub: c.code, rates: c.rates }))} />
        )}
      </div>
    </section>
  );
}
