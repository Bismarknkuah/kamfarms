const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Fri 9 Oct 2026". Written out by hand, not through the browser's locale (which would give "Fri, Oct 9, 2026" on one phone and
 * something else on another), and from the date itself (UTC), so a "needed by 9 Oct" never slips to the 8th in another time zone. It
 * reads exactly as the task the farm manager receives from the server does.
 */
export function longDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
