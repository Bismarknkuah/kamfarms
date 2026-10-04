/**
 * What the farm manager is told when a Farm Supervisor asks for a dispatch: WHERE it goes (the warehouse and its location, and who to
 * ask there), WHAT (each size and its bags), WHEN, and any instruction, all in one place, so nobody has to ask "which warehouse?".
 */
export interface RequestLine { gradeLabel: string; bagCount: number; totalKg?: number | null; totalKgEstimated?: boolean; orderNumber?: string }
export interface RequestFacts {
  requestRef: string;
  farmName: string;
  warehouseName: string;
  warehouseLocation?: string | null;
  warehouseContacts?: { name: string; phone?: string | null }[];
  requestedDate: Date | string;
  priority?: string | null;
  notes?: string | null;
  requestedByName: string;
  lines: RequestLine[];
}

export const bagsLabel = (n: number) => `${n.toLocaleString('en-US')} bag${n === 1 ? '' : 's'}`;
export const personName = (u?: { firstName?: string | null; lastName?: string | null } | null) => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '');
export const totalBagsOf = (lines: { bagCount: number }[]) => lines.reduce((t, l) => t + l.bagCount, 0);
export const warehouseWithLocation = (name: string, location?: string | null) => (location && location.trim() ? `${name} (${location.trim()})` : name);

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 9 Oct 2026". Written out by hand, not through the machine's locale data, so it reads the same on every server. */
export function longDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function dispatchTaskTitle(f: RequestFacts): string {
  return `Send ${bagsLabel(totalBagsOf(f.lines))} to ${f.warehouseName}`;
}

/**
 * One short line: what to send, and by when (and a note, if the supervisor wrote one). Not a letter: most people reading it are busy and may not
 * read much, so the task carries a button that opens the work, and everything else is on the Dispatch desk card.
 */
export function dispatchTaskDescription(f: RequestFacts): string {
  const when = longDate(f.requestedDate);
  const sizes = f.lines.map((l) => `${l.gradeLabel}: ${bagsLabel(l.bagCount)}`).join(', ');
  const out = [`${sizes}${when ? ` · by ${when}` : ''}`];
  if (f.notes && f.notes.trim()) out.push(`Note: ${f.notes.trim()}`);
  return out.join('\n');
}

/** The short version for a notification. */
export function dispatchNotificationBody(f: RequestFacts): string {
  const sizes = f.lines.map((l) => `${l.gradeLabel} ${l.bagCount}`).join(', ');
  const when = longDate(f.requestedDate);
  return `${f.requestedByName || 'The Farm Director'} asks you to send ${bagsLabel(totalBagsOf(f.lines))} to ${warehouseWithLocation(f.warehouseName, f.warehouseLocation)}: ${sizes}${when ? ` · by ${when}` : ''}`;
}
