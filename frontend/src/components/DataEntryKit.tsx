'use client';

// One small kit shared by every data-entry form in the pipeline - paddy
// intake, dispatch, warehouse receipt, milling receipt. Built for the
// way these forms are actually used: on a phone, outdoors, by someone
// counting bags. Every control here has a large tap target, bags are
// always the primary number, and kilos are never required.

export const STANDARD_PADDY_BAG_WEIGHT_KG = 50;

/** Tappable grade/size chips - a dropdown is the wrong control for two
 * or three fixed options on a phone in the sun. `disabledIds` greys out
 * grades already used on another row of the same form. */
export function GradeChips({
  grades, value, onChange, disabledIds = [],
}: {
  grades: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  disabledIds?: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {grades.map((g) => {
        const active = g.id === value;
        const disabled = !active && disabledIds.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(g.id)}
            aria-pressed={active}
            className={`min-w-[5.5rem] rounded-xl border-2 px-4 py-3 text-sm font-semibold transition ${
              active
                ? 'border-paddy-900 bg-paddy-900 text-rice-50 shadow-sm'
                : 'border-paddy-100 bg-white text-paddy-900 hover:border-paddy-500'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}

/** Bag count with big +/- targets. Typing still works for large counts;
 * the buttons exist for the one-handed, phone-in-the-field case. */
export function BagStepper({
  value, onChange, min = 0, label = 'Bags',
}: {
  value: string;
  onChange: (next: string) => void;
  min?: number;
  label?: string;
}) {
  const n = parseInt(value || '0', 10) || 0;
  const set = (next: number) => onChange(String(Math.max(min, next)));
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-xl border-2 border-paddy-100 bg-white">
      <button type="button" onClick={() => set(n - 1)} aria-label={`Decrease ${label}`} className="w-12 text-xl font-semibold text-paddy-900 hover:bg-paddy-50 active:bg-paddy-100">−</button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        aria-label={label}
        className="w-24 border-x border-paddy-100 text-center text-lg font-semibold text-ink-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => set(n + 1)} aria-label={`Increase ${label}`} className="w-12 text-xl font-semibold text-paddy-900 hover:bg-paddy-50 active:bg-paddy-100">+</button>
    </div>
  );
}

/** Live weight hint. When no weight is typed, shows what the system
 * will record as an estimate - so nobody is surprised later by the
 * "(estimated)" tag, and nobody feels they must find a scale. */
export function EstimatedWeightHint({ bags, weightKg }: { bags: string; weightKg: string }) {
  const n = parseInt(bags || '0', 10) || 0;
  if (weightKg) return <p className="text-xs text-ink-500">Measured weight recorded.</p>;
  if (n <= 0) return <p className="text-xs text-ink-500">Weight is optional - leave it blank and we estimate at {STANDARD_PADDY_BAG_WEIGHT_KG} KG per bag.</p>;
  return (
    <p className="text-xs text-ink-700">
      ≈ <span className="font-semibold">{(n * STANDARD_PADDY_BAG_WEIGHT_KG).toLocaleString()} KG</span> estimated at {STANDARD_PADDY_BAG_WEIGHT_KG} KG/bag - type a measured weight to override.
    </p>
  );
}

/** Sticky running total for multi-row forms - always visible, so the
 * person never scrolls back up to check what they've entered. */
export function RunningTotal({ rows, label = 'This intake' }: { rows: { bagCount: string; weightKg?: string }[]; label?: string }) {
  const bags = rows.reduce((s, r) => s + (parseInt(r.bagCount || '0', 10) || 0), 0);
  const measured = rows.reduce((s, r) => s + (parseFloat(r.weightKg || '0') || 0), 0);
  const estimated = rows.reduce((s, r) => s + (r.weightKg ? 0 : (parseInt(r.bagCount || '0', 10) || 0) * STANDARD_PADDY_BAG_WEIGHT_KG), 0);
  const sizes = rows.filter((r) => (parseInt(r.bagCount || '0', 10) || 0) > 0).length;
  return (
    <div className="sticky bottom-3 z-10 mt-4 flex items-center justify-between rounded-xl border border-paddy-900/20 bg-paddy-900 px-4 py-3 text-rice-50 shadow-lg">
      <span className="text-xs font-medium uppercase tracking-wide text-paddy-100">{label}</span>
      <span className="text-right text-sm">
        <span className="text-lg font-semibold">{bags.toLocaleString()}</span> bag{bags === 1 ? '' : 's'}
        {sizes > 1 && <span className="text-paddy-200"> across {sizes} sizes</span>}
        <span className="block text-xs text-paddy-200">
          ≈ {(measured + estimated).toLocaleString()} KG{estimated > 0 && measured === 0 ? ' (estimated)' : estimated > 0 ? ' (part estimated)' : ''}
        </span>
      </span>
    </div>
  );
}

/** Expected-vs-received variance for receivers. Colour says the story
 * before the number does: green exact, amber short, red badly short. */
export function VarianceBadge({ expected, received, unit = 'bags' }: { expected: number; received: number; unit?: string }) {
  if (!received && received !== 0) return null;
  const diff = received - expected;
  const pct = expected > 0 ? Math.abs(diff) / expected : 0;
  const tone = diff === 0 ? 'bg-green-50 text-green-800 border-green-200' : pct <= 0.02 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-red-50 text-red-800 border-red-200';
  const text = diff === 0 ? `Exactly as expected (${expected} ${unit})` : `${diff > 0 ? '+' : ''}${diff} ${unit} vs expected ${expected}`;
  return <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{text}</span>;
}

/** Condition-on-arrival as chips. Free text was the wrong control here:
 * receivers typed "good", "Good", "ok", "fine" for the same thing, which
 * made the data useless for reporting. Fixed options, plus a free-text
 * escape hatch for anything genuinely unusual. */
export const ARRIVAL_CONDITIONS = ['Good', 'Wet', 'Damaged bags', 'Short count', 'Mixed grades'] as const;

export function ConditionChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ARRIVAL_CONDITIONS.map((c) => {
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(active ? '' : c)}
            aria-pressed={active}
            className={`rounded-full border-2 px-3.5 py-2 text-sm font-medium transition ${
              active ? 'border-paddy-900 bg-paddy-900 text-rice-50' : 'border-paddy-100 bg-white text-paddy-900 hover:border-paddy-500'
            }`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}
