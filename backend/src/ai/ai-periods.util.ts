/** Time periods people name in questions ("last week", "this month"), worked out in GMT, which is Ghana's time all year. */
export type PeriodKey = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_7_days' | 'last_30_days' | 'last_90_days' | 'this_year' | 'all_time';
export const PERIOD_KEYS: PeriodKey[] = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_7_days', 'last_30_days', 'last_90_days', 'this_year', 'all_time'];

export interface Period { key: PeriodKey; from: Date | null; to: Date; label: string; days: number }

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfWeek = (d: Date) => new Date(startOfDay(d).getTime() - ((d.getUTCDay() + 6) % 7) * DAY); // Monday
const startOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

export function resolvePeriod(key: PeriodKey | undefined, now: Date = new Date()): Period {
  const make = (k: PeriodKey, from: Date | null, to: Date, label: string): Period => ({
    key: k, from, to, label, days: from ? Math.min(365, Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY))) : 365,
  });
  const sod = startOfDay(now);
  switch (key ?? 'last_30_days') {
    case 'today': return make('today', sod, now, 'today');
    case 'yesterday': return make('yesterday', new Date(sod.getTime() - DAY), new Date(sod.getTime() - 1), 'yesterday');
    case 'this_week': return make('this_week', startOfWeek(now), now, 'this week (since Monday)');
    case 'last_week': { const s = startOfWeek(now); return make('last_week', new Date(s.getTime() - 7 * DAY), new Date(s.getTime() - 1), 'last week (Monday to Sunday)'); }
    case 'this_month': return make('this_month', startOfMonth(now), now, 'this month');
    case 'last_month': { const s = startOfMonth(now); return make('last_month', new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - 1, 1)), new Date(s.getTime() - 1), 'last month'); }
    case 'last_7_days': return make('last_7_days', new Date(now.getTime() - 7 * DAY), now, 'the last 7 days');
    case 'last_90_days': return make('last_90_days', new Date(now.getTime() - 90 * DAY), now, 'the last 90 days');
    case 'this_year': return make('this_year', new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), now, 'this year');
    case 'all_time': return make('all_time', null, now, 'all time');
    default: return make('last_30_days', new Date(now.getTime() - 30 * DAY), now, 'the last 30 days');
  }
}

/** The period a question names, or null when it names none. */
export function periodFromText(text: string): PeriodKey | null {
  const q = text.toLowerCase();
  const rules: [RegExp, PeriodKey][] = [
    [/\byesterday\b/, 'yesterday'], [/\btoday\b|\bright now\b/, 'today'],
    [/\blast week\b|\bprevious week\b/, 'last_week'], [/\bthis week\b/, 'this_week'],
    [/\blast month\b|\bprevious month\b/, 'last_month'], [/\bthis month\b|\bmonth to date\b/, 'this_month'],
    [/\blast 7 days\b|\bpast 7 days\b|\bpast week\b|\b7 days\b/, 'last_7_days'],
    [/\blast 90 days\b|\bpast 90 days\b|\b90 days\b|\bquarter\b|\bthree months\b/, 'last_90_days'],
    [/\blast 30 days\b|\bpast 30 days\b|\b30 days\b|\bpast month\b/, 'last_30_days'],
    [/\bthis year\b|\byear to date\b|\bytd\b/, 'this_year'], [/\ball time\b|\bever\b|\bsince the start\b|\bso far\b/, 'all_time'],
  ];
  return rules.find(([re]) => re.test(q))?.[1] ?? null;
}
