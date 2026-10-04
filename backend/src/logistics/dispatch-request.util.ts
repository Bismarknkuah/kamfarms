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
  return `Dispatch ${bagsLabel(totalBagsOf(f.lines))} to ${f.warehouseName}`;
}

/** A line per fact, readable on a phone, so the farm manager can act on it without asking anyone. */
export function dispatchTaskDescription(f: RequestFacts): string {
  const total = totalBagsOf(f.lines);
  const out: string[] = [];
  out.push(`Dispatch from ${f.farmName} to ${warehouseWithLocation(f.warehouseName, f.warehouseLocation)}.`);
  const when = longDate(f.requestedDate);
  if (when) out.push(`Needed there by: ${when}.`);
  if (f.priority && f.priority !== 'NORMAL') out.push(`Priority: ${f.priority}.`);
  out.push('What to send:');
  for (const l of f.lines) out.push(`- ${l.gradeLabel}: ${bagsLabel(l.bagCount)}${l.totalKg && !l.totalKgEstimated ? ` (${Math.round(l.totalKg).toLocaleString('en-US')} kg weighed)` : ''}`);
  if (f.lines.length > 1) out.push(`Total: ${bagsLabel(total)}.`);
  const contacts = (f.warehouseContacts ?? []).filter((c) => c.name);
  if (contacts.length > 0) out.push(`Who to ask at the warehouse: ${contacts.map((c) => (c.phone ? `${c.name} (${c.phone})` : c.name)).join(', ')}.`);
  if (f.notes && f.notes.trim()) out.push(`Instructions from ${f.requestedByName || 'the Farm Supervisor'}: ${f.notes.trim()}`);
  out.push(`When the bags are loaded, open the Dispatch desk and submit one dispatch${f.lines.length > 1 ? ' with every size on the truck' : ''}. Request ${f.requestRef}.`);
  return out.join('\n');
}

/** The short version for a notification. */
export function dispatchNotificationBody(f: RequestFacts): string {
  const sizes = f.lines.map((l) => `${l.gradeLabel} ${l.bagCount}`).join(', ');
  const when = longDate(f.requestedDate);
  return `${f.requestedByName || 'The Farm Supervisor'} asks you to dispatch ${bagsLabel(totalBagsOf(f.lines))} (${sizes}) to ${warehouseWithLocation(f.warehouseName, f.warehouseLocation)}${when ? `, needed by ${when}` : ''}.`;
}
