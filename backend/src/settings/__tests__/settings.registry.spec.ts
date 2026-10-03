import { SERIOUS_AFTER, SETTING_BY_KEY, SETTING_DEFS, SETTING_GROUPS, defaultOf } from '../settings.registry';
import { WATCH } from '../../insights/watchlist.engine';

describe('the settings registry', () => {
  it('has unique keys, and every setting belongs to a group that has a title and an introduction', () => {
    expect(new Set(SETTING_DEFS.map((d) => d.key)).size).toBe(SETTING_DEFS.length);
    const groups = new Set(SETTING_GROUPS.map((g) => g.id));
    expect(SETTING_DEFS.every((d) => groups.has(d.group))).toBe(true);
    expect(SETTING_GROUPS.every((g) => g.title && g.intro && SETTING_DEFS.some((d) => d.group === g.id))).toBe(true);
  });

  it('keeps every default inside its own limits, so the screen can always show it', () => {
    for (const d of SETTING_DEFS) {
      if (d.type === 'number') {
        expect(d.default as number).toBeGreaterThanOrEqual(d.min as number);
        expect(d.default as number).toBeLessThanOrEqual(d.max as number);
        expect(d.unit).toBeTruthy();
      } else {
        expect((d.default as string[]).length).toBeGreaterThan(0);
      }
    }
  });

  it('defaults to exactly the numbers that used to be fixed in the code, so nothing changes until an administrator changes it', () => {
    const was: Record<string, number | string[]> = {
      'auth.max_failed_attempts': 5, 'auth.lockout_minutes': 15,
      'logistics.variance_tolerance_kg': 5, 'paddy.standard_bag_kg': 50,
      'production.abnormal_variance_percent': 5, 'production.impossible_output_tolerance_percent': 0.5, // 1.005 as a multiplier
      'machines.anomaly_deviation_percent': 50, 'machines.min_readings_baseline': 3,
      'alerts.mass_balance_roles': ['OPERATIONS_MANAGER', 'MD', 'CEO'], 'alerts.machine_anomaly_roles': ['OPERATIONS_MANAGER', 'MD', 'CEO'],
    };
    for (const [key, value] of Object.entries(was)) expect(defaultOf(key)).toEqual(value);
  });

  it('keeps the watchlist screen\'s defaults identical to the engine\'s built-in limits (no drift between the two)', () => {
    const pairs: [string, number][] = [
      ['watchlist.recovery_drop_points', WATCH.recoveryDropPoints], ['watchlist.power_over_percent', WATCH.powerMedium * 100], ['watchlist.power_high_percent', WATCH.powerHigh * 100],
      ['watchlist.shortfall_percent', WATCH.shortfallMediumPct], ['watchlist.shortfall_high_percent', WATCH.shortfallHighPct],
      ['watchlist.write_down_bags', WATCH.writeDownMediumBags], ['watchlist.write_down_high_bags', WATCH.writeDownHighBags],
      ['watchlist.reserved_days', WATCH.reservedDays], ['watchlist.reserved_high_days', WATCH.reservedHighDays],
      ['watchlist.intake_drop_percent', WATCH.intakeDropRatio * 100], ['watchlist.rejection_percent', WATCH.rejectMedium * 100], ['watchlist.spend_factor', WATCH.spikeMediumFactor],
    ];
    for (const [key, engine] of pairs) expect(defaultOf<number>(key)).toBeCloseTo(engine, 6);
  });

  it('names real settings in the "serious must not be lower" rules', () => {
    for (const r of SERIOUS_AFTER) {
      expect(SETTING_BY_KEY.has(r.flag) && SETTING_BY_KEY.has(r.serious)).toBe(true);
      expect(defaultOf<number>(r.serious)).toBeGreaterThanOrEqual(defaultOf<number>(r.flag));
    }
  });
});
