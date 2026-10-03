/**
 * Every business number and policy the System Administrator may change from the screen, instead of asking a
 * developer to edit code and redeploy. This is the single source of truth: the screen is drawn from this list,
 * the server validates against it, and the services read their values through it. The default of each entry is
 * exactly the number that used to be fixed in the code, so nothing changes until an administrator changes it.
 */
export type SettingType = 'number' | 'roles';
export type SettingGroup = 'security' | 'logistics' | 'production' | 'machines' | 'alerts' | 'watchlist';

export interface SettingDef {
  key: string;
  group: SettingGroup;
  label: string;
  help: string;
  type: SettingType;
  default: number | string[];
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

export const SETTING_GROUPS: { id: SettingGroup; title: string; intro: string }[] = [
  { id: 'security', title: 'Sign-in security', intro: 'How the system protects accounts from guessed passwords.' },
  { id: 'logistics', title: 'Deliveries and weights', intro: 'How much difference between what was sent and what arrived is accepted, and the weight used when only bags are counted.' },
  { id: 'production', title: 'Milling checks', intro: 'When a milling run is flagged because its inputs and outputs do not add up.' },
  { id: 'machines', title: 'Machine power checks', intro: 'When a machine\'s power reading is flagged as unusual.' },
  { id: 'alerts', title: 'Who is alerted', intro: 'The roles whose members receive these alerts the moment they happen.' },
  { id: 'watchlist', title: 'Watchlist limits', intro: 'How far a place has to drift from its own usual before the MD and CEO Watchlist flags it. See the Watchlist guide for what each check compares.' },
];

const ALERT_ROLES = ['OPERATIONS_MANAGER', 'MD', 'CEO'];

export const SETTING_DEFS: SettingDef[] = [
  { key: 'auth.max_failed_attempts', group: 'security', label: 'Wrong passwords before an account is locked', help: 'After this many wrong passwords in a row the account is locked for a while.', type: 'number', default: 5, unit: 'attempts', min: 3, max: 20, step: 1 },
  { key: 'auth.lockout_minutes', group: 'security', label: 'How long a locked account stays locked', help: 'The person can try again after this long, or an administrator can unlock the account sooner.', type: 'number', default: 15, unit: 'minutes', min: 1, max: 1440, step: 1 },

  { key: 'logistics.variance_tolerance_kg', group: 'logistics', label: 'Delivery difference accepted without approval', help: 'If a warehouse receives this many kilograms more or less than a farm sent, the receipt is accepted. A bigger gap needs approval.', type: 'number', default: 5, unit: 'kg', min: 0, max: 1000, step: 0.5 },
  { key: 'paddy.standard_bag_kg', group: 'logistics', label: 'Standard paddy bag weight', help: 'Used to estimate kilograms when only a number of bags is entered.', type: 'number', default: 50, unit: 'kg', min: 10, max: 100, step: 0.5 },

  { key: 'production.abnormal_variance_percent', group: 'production', label: 'Milling gap that raises a flag', help: 'If the paddy put in and the rice, broken rice, husk and waste taken out differ by more than this share, the run is flagged for checking.', type: 'number', default: 5, unit: '%', min: 0.5, max: 50, step: 0.5 },
  { key: 'production.impossible_output_tolerance_percent', group: 'production', label: 'Extra output allowed before a run is rejected', help: 'A run whose outputs add up to more than the paddy put in (plus this allowance for rounding) is impossible and is refused.', type: 'number', default: 0.5, unit: '%', min: 0, max: 10, step: 0.1 },

  { key: 'machines.anomaly_deviation_percent', group: 'machines', label: 'Power reading that counts as unusual', help: 'A reading this far from the machine\'s recent average is flagged.', type: 'number', default: 50, unit: '%', min: 10, max: 300, step: 5 },
  { key: 'machines.min_readings_baseline', group: 'machines', label: 'Readings needed before judging a machine', help: 'A machine needs at least this many earlier readings before a new one can be called unusual.', type: 'number', default: 3, unit: 'readings', min: 2, max: 30, step: 1 },

  { key: 'alerts.mass_balance_roles', group: 'alerts', label: 'Told when a milling run does not add up', help: 'Everyone holding one of these roles is notified.', type: 'roles', default: ALERT_ROLES },
  { key: 'alerts.machine_anomaly_roles', group: 'alerts', label: 'Told when a machine\'s power reading is unusual', help: 'Everyone holding one of these roles is notified.', type: 'roles', default: ALERT_ROLES },

  { key: 'watchlist.default_days', group: 'watchlist', label: 'Period the Watchlist looks at', help: 'The number of recent days compared with each place\'s earlier history.', type: 'number', default: 30, unit: 'days', min: 7, max: 90, step: 1 },
  { key: 'watchlist.recovery_drop_points', group: 'watchlist', label: 'Rice recovery drop that is flagged', help: 'A milling run that gave this many percentage points less rice than the center usually does is flagged (a larger natural spread raises it automatically).', type: 'number', default: 5, unit: 'points', min: 1, max: 30, step: 0.5 },
  { key: 'watchlist.power_over_percent', group: 'watchlist', label: 'Extra power per kg that is flagged', help: 'Power used per kilogram of paddy this much above the center\'s usual is flagged.', type: 'number', default: 25, unit: '%', min: 5, max: 200, step: 5 },
  { key: 'watchlist.power_high_percent', group: 'watchlist', label: 'Extra power per kg that is serious', help: 'At this much above usual the flag is marked "Look into this".', type: 'number', default: 50, unit: '%', min: 10, max: 400, step: 5 },
  { key: 'watchlist.shortfall_percent', group: 'watchlist', label: 'Paddy arriving short that is flagged', help: 'A warehouse receiving this share less than was sent is flagged.', type: 'number', default: 1.5, unit: '%', min: 0.1, max: 20, step: 0.1 },
  { key: 'watchlist.shortfall_high_percent', group: 'watchlist', label: 'Paddy arriving short that is serious', help: 'At this share the flag is marked "Look into this".', type: 'number', default: 4, unit: '%', min: 0.5, max: 50, step: 0.5 },
  { key: 'watchlist.write_down_bags', group: 'watchlist', label: 'Stock written down that is flagged', help: 'A place that wrote down this many bags (and twice as many as its sister places) is flagged.', type: 'number', default: 20, unit: 'bags', min: 1, max: 1000, step: 1 },
  { key: 'watchlist.write_down_high_bags', group: 'watchlist', label: 'Stock written down that is serious', help: 'At this many bags (and three times its sister places) the flag is marked "Look into this".', type: 'number', default: 50, unit: 'bags', min: 1, max: 5000, step: 1 },
  { key: 'watchlist.reserved_days', group: 'watchlist', label: 'Days an order may sit reserved', help: 'Stock reserved for an order that has not left after this many days is flagged.', type: 'number', default: 3, unit: 'days', min: 1, max: 30, step: 1 },
  { key: 'watchlist.reserved_high_days', group: 'watchlist', label: 'Days reserved that is serious', help: 'After this many days the flag is marked "Look into this".', type: 'number', default: 7, unit: 'days', min: 1, max: 60, step: 1 },
  { key: 'watchlist.intake_drop_percent', group: 'watchlist', label: 'Paddy intake drop that is flagged', help: 'A farm whose approved paddy falls to this share of its usual, or less, is flagged (allowing for the season by comparing with the other farms).', type: 'number', default: 50, unit: '%', min: 10, max: 90, step: 5 },
  { key: 'watchlist.rejection_percent', group: 'watchlist', label: 'Paddy entries rejected that is flagged', help: 'A farm whose entries are rejected this often is flagged.', type: 'number', default: 25, unit: '%', min: 5, max: 90, step: 5 },
  { key: 'watchlist.spend_factor', group: 'watchlist', label: 'Spending jump that is flagged', help: 'A farm or warehouse spending this many times its usual is flagged.', type: 'number', default: 2, unit: 'times', min: 1.2, max: 10, step: 0.1 },
];

export const SETTING_BY_KEY: Map<string, SettingDef> = new Map(SETTING_DEFS.map((d) => [d.key, d] as [string, SettingDef]));

export function defOf(key: string): SettingDef {
  const def = SETTING_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown setting "${key}".`);
  return def;
}

/** The value a setting has until an administrator changes it. */
export function defaultOf<T extends number | string[]>(key: string): T {
  return defOf(key).default as T;
}

/** Pairs where the "serious" limit must not be lower than the "flag it" limit. */
export const SERIOUS_AFTER: { flag: string; serious: string; what: string }[] = [
  { flag: 'watchlist.power_over_percent', serious: 'watchlist.power_high_percent', what: 'extra power per kg' },
  { flag: 'watchlist.shortfall_percent', serious: 'watchlist.shortfall_high_percent', what: 'paddy arriving short' },
  { flag: 'watchlist.write_down_bags', serious: 'watchlist.write_down_high_bags', what: 'stock written down' },
  { flag: 'watchlist.reserved_days', serious: 'watchlist.reserved_high_days', what: 'days an order sits reserved' },
];
