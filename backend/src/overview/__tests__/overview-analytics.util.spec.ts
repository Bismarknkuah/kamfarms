import { bucketKeys, bucketOf, clampDays, kwhPerTonne, pct, weekStart } from '../overview-analytics.util';

describe('overview analytics helpers', () => {
  it('only allows 7, 30 or 90 days', () => {
    expect(clampDays('7')).toBe(7);
    expect(clampDays(90)).toBe(90);
    expect(clampDays('45')).toBe(30);
    expect(clampDays(undefined)).toBe(30);
    expect(clampDays('abc')).toBe(30);
  });

  it('puts a date in the Monday of its week (UTC)', () => {
    expect(weekStart(new Date('2026-10-24T10:00:00Z')).toISOString().slice(0, 10)).toBe('2026-10-19'); // Saturday
    expect(weekStart(new Date('2026-10-19T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-10-19'); // Monday
    expect(weekStart(new Date('2026-10-25T23:59:59Z')).toISOString().slice(0, 10)).toBe('2026-10-19'); // Sunday
  });

  it('shows 7 days day by day and longer windows week by week, oldest first, with no gaps', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    const d7 = bucketKeys(7, now);
    expect(d7.unit).toBe('day');
    expect(d7.keys).toHaveLength(7);
    expect(d7.keys[0]).toBe('2026-10-18');
    expect(d7.keys[6]).toBe('2026-10-24');
    const d30 = bucketKeys(30, now);
    expect(d30.unit).toBe('week');
    expect([...d30.keys].sort()).toEqual(d30.keys);
    expect(d30.keys[d30.keys.length - 1]).toBe('2026-10-19');
    for (let i = 1; i < d30.keys.length; i++) expect((Date.parse(d30.keys[i]) - Date.parse(d30.keys[i - 1])) / 86_400_000).toBe(7);
  });

  it('files a date in the same bucket the key list uses', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    const { keys, unit } = bucketKeys(30, now);
    expect(keys).toContain(bucketOf(new Date('2026-10-21T08:00:00Z'), unit));
    expect(keys).toContain(bucketOf(new Date('2026-10-02T08:00:00Z'), unit));
  });

  it('gives a percentage, or null when there is nothing to divide by', () => {
    expect(pct(70, 100)).toBe(70);
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(5, 0)).toBeNull();
    expect(pct(Number.NaN, 10)).toBeNull();
  });

  it('works out kWh per tonne, and null when a figure is missing', () => {
    expect(kwhPerTonne(500, 10_000)).toBe(50);
    expect(kwhPerTonne(0, 10_000)).toBeNull();
    expect(kwhPerTonne(500, 0)).toBeNull();
  });
});
