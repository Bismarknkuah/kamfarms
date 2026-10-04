'use client';

import { useMemo, useState } from 'react';
import { Info, Layers, Package, PackageOpen, TriangleAlert, Wheat, Zap } from 'lucide-react';
import type { AiInsights } from '@/lib/api-client';
import { formatBags, formatKg, formatRange, mixOf, outputsFromEnergy, outputsFromPaddyBags } from '@/lib/ai-yield';

type Data = Extract<AiInsights, { available: true }>;
type Mode = 'power' | 'paddy';

const PRESETS: Record<Mode, number[]> = { power: [1, 10, 100, 500, 1000], paddy: [10, 50, 100, 500, 1000] };
const CONFIDENCE = {
  high: { label: 'High confidence', cls: 'bg-emerald-100 text-emerald-900' },
  medium: { label: 'Medium confidence', cls: 'bg-amber-100 text-amber-900' },
  low: { label: 'Low confidence', cls: 'bg-red-100 text-red-900' },
} as const;

const TONES = {
  rice: { ring: 'border-husk-500/60 bg-husk-100/40', icon: 'bg-husk-500', bar: 'bg-husk-500' },
  broken: { ring: 'border-soil-500/40 bg-rice-50', icon: 'bg-soil-500', bar: 'bg-soil-500' },
  hull: { ring: 'border-paddy-500/40 bg-paddy-50', icon: 'bg-paddy-700', bar: 'bg-paddy-700' },
} as const;

function OutputCard({ id, title, icon: Icon, tone, bags, kg, range, bagKg }: { id: 'rice' | 'broken' | 'hull'; title: string; icon: typeof Package; tone: keyof typeof TONES; bags: number; kg: number; range: string | null; bagKg: number }) {
  return (
    <div data-testid={`out-${id}`} className={`rounded-2xl border p-4 ${TONES[tone].ring}`}>
      <div className="flex items-center gap-2.5">
        <span className={`grid h-9 w-9 place-items-center rounded-full text-white ${TONES[tone].icon}`}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
        <p className="text-sm font-semibold text-paddy-900">{title}</p>
      </div>
      <p className="mt-3 font-display text-4xl font-medium leading-none text-paddy-900"><span data-testid={`out-${id}-bags`}>{formatBags(bags)}</span> <span className="text-base font-normal text-ink-500">bags</span></p>
      <p className="mt-1.5 text-sm text-ink-700" data-testid={`out-${id}-kg`}>{formatKg(kg)} <span className="text-ink-500">at {bagKg} kg a bag</span></p>
      {range && <p className="mt-2 text-xs text-ink-500" data-testid={`out-${id}-range`}>Typically {range} bags</p>}
    </div>
  );
}

/** Power in, bags out; or paddy in, power and bags out. Instant: the page only multiplies the rates the server worked out. */
export function PowerCalculator({ data }: { data: Data }) {
  const [mode, setMode] = useState<Mode>('power');
  const [amounts, setAmounts] = useState<Record<Mode, string>>({ power: '1', paddy: '100' });
  const [scope, setScope] = useState('all');

  const { rates, note, scopeLabel } = useMemo(() => {
    if (scope.startsWith('grade:')) {
      const g = data.byGrade.find((x) => `grade:${x.gradeId}` === scope);
      if (g) return { rates: g.rates, note: g.note, scopeLabel: `grade ${g.label}` };
    }
    if (scope.startsWith('center:')) {
      const c = data.byCenter.find((x) => `center:${x.centerId}` === scope);
      if (c) return { rates: c.rates, note: c.note, scopeLabel: c.name };
    }
    return { rates: data.overall, note: data.overallNote, scopeLabel: data.jurisdiction.companyWide ? 'the whole company' : data.jurisdiction.label };
  }, [scope, data]);

  const amount = Number(amounts[mode]);
  const valid = Number.isFinite(amount) && amount > 0;
  const out = valid ? (mode === 'power' ? outputsFromEnergy(rates, amount, data.bagSizes) : outputsFromPaddyBags(rates, amount, data.bagSizes)) : null;
  const mix = mixOf(rates);
  const conf = CONFIDENCE[rates.confidence];
  const range = out?.typicalBags;

  return (
    <section data-testid="calculator" className="rounded-3xl border border-paddy-100 bg-white p-5 shadow-sm sm:p-7" aria-label="Predict bags of rice, broken rice and hull">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium text-paddy-900">Work it out</h2>
          <p className="mt-0.5 text-sm text-ink-500">Type an amount and see the bags it should give. It changes as you type.</p>
        </div>
        <div role="tablist" aria-label="What do you know?" className="inline-flex rounded-full bg-rice-50 p-1 text-sm font-medium">
          {([['power', 'I know the power used', Zap], ['paddy', 'I know the paddy', Wheat]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} data-testid={`mode-${id}`} onClick={() => setMode(id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 transition ${mode === id ? 'bg-paddy-900 text-rice-50 shadow' : 'text-ink-700 hover:text-paddy-900'}`}>
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4 rounded-2xl bg-rice-50 p-5">
          <div>
            <label htmlFor="calc-amount" className="text-xs font-semibold uppercase tracking-wide text-ink-500">{mode === 'power' ? 'Electricity used' : 'Paddy to be milled'}</label>
            <div className="mt-1.5 flex items-stretch overflow-hidden rounded-xl border-2 border-paddy-100 bg-white focus-within:border-paddy-500">
              <input id="calc-amount" data-testid="calc-input" inputMode="decimal" autoComplete="off" value={amounts[mode]}
                onChange={(e) => setAmounts((a) => ({ ...a, [mode]: e.target.value.replace(/[^0-9.]/g, '') }))}
                size={1} className="min-w-0 flex-1 bg-transparent px-4 py-3 font-display text-3xl font-medium text-paddy-900 outline-none" />
              <span className="grid place-items-center bg-paddy-50 px-4 text-sm font-semibold text-paddy-700">{mode === 'power' ? 'kWh' : 'bags'}</span>
            </div>
            <p className="mt-1.5 text-xs text-ink-500">{mode === 'power' ? 'kWh is the unit on the electricity meter (kilowatt-hours).' : `One bag of paddy is ${data.bagSizes.paddyKg} kg.`}</p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
            {PRESETS[mode].map((p) => (
              <button key={p} type="button" data-testid="calc-preset" aria-pressed={amount === p} onClick={() => setAmounts((a) => ({ ...a, [mode]: String(p) }))}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${amount === p ? 'border-paddy-900 bg-paddy-900 text-rice-50' : 'border-paddy-100 bg-white text-ink-700 hover:border-paddy-500'}`}>
                {p.toLocaleString('en-US')}
              </button>
            ))}
          </div>
          {(data.byGrade.length > 0 || data.byCenter.length > 1) && (
            <div>
              <label htmlFor="calc-scope" className="text-xs font-semibold uppercase tracking-wide text-ink-500">Based on</label>
              <select id="calc-scope" data-testid="calc-scope" value={scope} onChange={(e) => setScope(e.target.value)}
                className="mt-1.5 w-full rounded-xl border-2 border-paddy-100 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-paddy-500">
                <option value="all">{data.jurisdiction.companyWide ? 'All runs in the company' : 'All runs in my places'}</option>
                {data.byGrade.length > 0 && <optgroup label="One grade of paddy">{data.byGrade.map((g) => <option key={g.gradeId} value={`grade:${g.gradeId}`}>{g.label}</option>)}</optgroup>}
                {data.byCenter.length > 1 && <optgroup label="One milling center">{data.byCenter.map((c) => <option key={c.centerId} value={`center:${c.centerId}`}>{c.name}</option>)}</optgroup>}
              </select>
            </div>
          )}
        </div>

        <div aria-live="polite" className="min-w-0">
          {!out ? (
            <div className="grid h-full min-h-[200px] place-items-center rounded-2xl border-2 border-dashed border-paddy-100 p-6 text-center text-sm text-ink-500" data-testid="calc-empty">
              Enter an amount above zero to see the bags.
            </div>
          ) : (
            <>
              <p className="text-sm text-ink-700" data-testid="calc-headline">
                {mode === 'power' ? (
                  <><strong className="text-paddy-900">{amount.toLocaleString('en-US')} kWh</strong> mills about <strong data-testid="calc-paddy-bags" className="text-paddy-900">{formatBags(out.paddyBags)} bags</strong> of paddy ({formatKg(out.paddyKg)}) and should give</>
                ) : (
                  <><strong className="text-paddy-900">{amount.toLocaleString('en-US')} bags</strong> of paddy needs about <strong data-testid="calc-kwh" className="text-paddy-900">{formatBags(out.kwh)} kWh</strong> and should give</>
                )}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <OutputCard id="rice" title="Packaged rice" icon={Package} tone="rice" bags={out.riceBags} kg={out.riceKg} range={formatRange(range?.rice)} bagKg={data.bagSizes.riceKg} />
                <OutputCard id="broken" title="Broken rice" icon={PackageOpen} tone="broken" bags={out.brokenBags} kg={out.brokenKg} range={formatRange(range?.broken)} bagKg={data.bagSizes.brokenKg} />
                <OutputCard id="hull" title="Hull" icon={Layers} tone="hull" bags={out.hullBags} kg={out.hullKg} range={formatRange(range?.hull)} bagKg={data.bagSizes.hullKg} />
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Where the paddy goes</p>
                <div data-testid="mix-bar" role="img" aria-label={`Of the paddy: ${mix.rice.toFixed(0)} percent packaged rice, ${mix.broken.toFixed(0)} percent broken rice, ${mix.hull.toFixed(0)} percent hull, ${mix.waste.toFixed(0)} percent lost`}
                  className="mt-2 flex h-3.5 overflow-hidden rounded-full bg-ink-500/10">
                  <div className={TONES.rice.bar} style={{ width: `${mix.rice}%` }} />
                  <div className={TONES.broken.bar} style={{ width: `${mix.broken}%` }} />
                  <div className={TONES.hull.bar} style={{ width: `${mix.hull}%` }} />
                  <div className="bg-ink-500/40" style={{ width: `${mix.waste}%` }} />
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-700" data-testid="mix-legend">
                  <li><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-husk-500" />Packaged rice {mix.rice.toFixed(0)}%</li>
                  <li><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-soil-500" />Broken rice {mix.broken.toFixed(0)}%</li>
                  <li><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-paddy-700" />Hull {mix.hull.toFixed(0)}%</li>
                  <li><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-ink-500/40" />Lost {mix.waste.toFixed(0)}%</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-paddy-100 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {rates.basis === 'benchmark' ? (
            <span data-testid="calc-benchmark" className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-950"><TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /> Industry benchmark, not your data yet</span>
          ) : (
            <span data-testid="calc-confidence" className={`rounded-full px-3 py-1 text-xs font-bold ${conf.cls}`}>{conf.label}</span>
          )}
          <span className="text-xs text-ink-500" data-testid="calc-runs">{rates.runs} run{rates.runs === 1 ? '' : 's'}{rates.basis === 'history' ? `, ${Math.round(rates.energyKwh).toLocaleString('en-US')} kWh metered` : ''} · {scopeLabel}</span>
        </div>
        <p className="mt-2 flex items-start gap-2 text-sm text-ink-700" data-testid="calc-basis"><Info className="mt-0.5 h-4 w-4 shrink-0 text-paddy-700" aria-hidden="true" />{note}</p>
        {data.bagSizes.hullBasis === 'history' && <p className="mt-1 pl-6 text-xs text-ink-500">Hull bags are counted at {data.bagSizes.hullKg} kg, the weight your own runs recorded.</p>}
      </div>
    </section>
  );
}
