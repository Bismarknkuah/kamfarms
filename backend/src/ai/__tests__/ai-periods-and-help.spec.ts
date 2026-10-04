import { HELP, searchHelp } from '../ai-help';
import { PERIOD_KEYS, periodFromText, resolvePeriod } from '../ai-periods.util';

const WED = new Date('2026-10-07T15:30:00.000Z'); // a Wednesday
const iso = (d: Date | null) => d?.toISOString();

describe('resolvePeriod (Ghana time is GMT all year)', () => {
  it('works out the days people name', () => {
    expect(iso(resolvePeriod('today', WED).from)).toBe('2026-10-07T00:00:00.000Z');
    const y = resolvePeriod('yesterday', WED);
    expect([iso(y.from), iso(y.to)]).toEqual(['2026-10-06T00:00:00.000Z', '2026-10-06T23:59:59.999Z']);
  });
  it('starts a week on Monday, including when today is a Sunday', () => {
    expect(iso(resolvePeriod('this_week', WED).from)).toBe('2026-10-05T00:00:00.000Z');
    expect(iso(resolvePeriod('this_week', new Date('2026-10-04T10:00:00.000Z')).from)).toBe('2026-09-28T00:00:00.000Z');
    const last = resolvePeriod('last_week', WED);
    expect([iso(last.from), iso(last.to)]).toEqual(['2026-09-28T00:00:00.000Z', '2026-10-04T23:59:59.999Z']);
  });
  it('works out months and years', () => {
    expect(iso(resolvePeriod('this_month', WED).from)).toBe('2026-10-01T00:00:00.000Z');
    const lm = resolvePeriod('last_month', WED);
    expect([iso(lm.from), iso(lm.to)]).toEqual(['2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z']);
    expect(iso(resolvePeriod('this_year', WED).from)).toBe('2026-01-01T00:00:00.000Z');
    expect(iso(resolvePeriod('last_month', new Date('2026-01-15T00:00:00.000Z')).from)).toBe('2025-12-01T00:00:00.000Z');
  });
  it('defaults to the last 30 days, and "all time" has no start', () => {
    const d = resolvePeriod(undefined, WED);
    expect([d.key, d.days, d.label]).toEqual(['last_30_days', 30, 'the last 30 days']);
    expect(resolvePeriod('all_time', WED)).toMatchObject({ from: null, days: 365 });
    expect(resolvePeriod('last_7_days', WED).days).toBe(7);
  });
  it('knows every period it advertises', () => PERIOD_KEYS.forEach((k) => expect(resolvePeriod(k, WED).key).toBe(k)));
});

describe('periodFromText', () => {
  it.each([
    ['What was production yesterday?', 'yesterday'], ['rice milled today', 'today'], ['output last week', 'last_week'], ['sales this week', 'this_week'],
    ['intake last month', 'last_month'], ['How did we do this month?', 'this_month'], ['in the last 7 days', 'last_7_days'], ['over the past 90 days', 'last_90_days'],
    ['this year so far', 'this_year'], ['all time totals', 'all_time'],
  ])('%s -> %s', (text, key) => expect(periodFromText(text as string)).toBe(key));
  it('says nothing when no period is named', () => expect(periodFromText('Which farm has the most paddy?')).toBeNull());
});

describe('the how-the-system-works guide', () => {
  it.each([
    ['How does a sale get approved?', 'sales-chain'], ['What does the watchlist do?', 'watchlist'], ['How does the AI learn from runs?', 'ai-learning'],
    ['How do I download a report?', 'reports'], ['Where do I record a milling run?', 'milling-run'], ['I forgot my password', 'password'],
    ['How do I create an account for a new person?', 'users'], ['What is the Oversight page?', 'oversight'], ['how do I record an expense', 'expenses'],
  ])('"%s" finds %s first', (q, id) => expect(searchHelp(q as string)[0]?.entry.id).toBe(id));
  it('finds nothing, rather than guessing, for a question it has no guide for', () => expect(searchHelp('purple monkey dishwasher')).toEqual([]));
  it('has a real answer and a unique id for every guide', () => {
    expect(new Set(HELP.map((h) => h.id)).size).toBe(HELP.length);
    HELP.forEach((h) => { expect(h.body.length).toBeGreaterThan(60); expect(h.keywords.length).toBeGreaterThan(1); });
  });
});
