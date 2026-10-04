/**
 * The journey of a sale, in the order it happens, one accountable person at each step:
 *
 *   Sales Officer submits  ->  Finance Director approves  ->  Managing Director / CEO releases  ->
 *   Warehouse Supervisor assigns a warehouse  ->  that warehouse processes it  ->  it is moved "on track"  ->  delivered
 *
 * Everything here is pure (no React, no network) and shared by every screen that shows an order, so the wording and the
 * "who is it waiting on" answer cannot drift apart between the Sales page, the dashboards and the decision desks.
 */

export interface FlowEvent {
  type: string;
  toStatus?: string | null;
  actorName?: string;
  actorRole?: string | null;
  comment?: string | null;
  createdAt: string;
  meta?: Record<string, unknown> | null;
}

export interface FlowOrder {
  status: string;
  submittedById?: string;
  salesOfficer?: { id?: string; firstName: string; lastName: string } | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  approvedBy?: { firstName: string; lastName: string } | null;
  fulfilledAt?: string | null;
  events?: FlowEvent[] | null;
}

const LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'With Finance Director',
  PARTIALLY_APPROVED: 'Partly approved',
  APPROVED: 'Awaiting MD release',
  RELEASED: 'Awaiting a warehouse',
  RESERVED: 'Assigned to a warehouse',
  PROCESSING: 'Being processed',
  ON_TRACK: 'On track',
  FULFILLED: 'Delivered',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export function salesStatusLabel(status: string): string {
  return LABELS[status] ?? status.replace(/_/g, ' ').toLowerCase();
}

const TONES: Record<string, string> = {
  DRAFT: 'bg-ink-500/10 text-ink-700',
  SUBMITTED: 'bg-husk-300 text-soil-700',
  PARTIALLY_APPROVED: 'bg-husk-300 text-soil-700',
  APPROVED: 'bg-husk-300 text-soil-700',
  RELEASED: 'bg-husk-300 text-soil-700',
  RESERVED: 'bg-paddy-100 text-paddy-700',
  PROCESSING: 'bg-paddy-100 text-paddy-700',
  ON_TRACK: 'bg-paddy-700 text-rice-50',
  FULFILLED: 'bg-paddy-900 text-rice-50',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-ink-500/10 text-ink-500',
};

export function salesStatusTone(status: string): string {
  return TONES[status] ?? 'bg-ink-500/10 text-ink-700';
}

/** The stages at the warehouse, once it has been assigned. */
export const WAREHOUSE_STAGES = ['RESERVED', 'PROCESSING', 'ON_TRACK'];
/** Everything from the Managing Director's release until delivery: "with the warehouse side". */
export const WITH_WAREHOUSE_SIDE = ['RELEASED', ...WAREHOUSE_STAGES];

/** Whose desk the order is on right now; null once it is finished. */
export function waitingOn(status: string): string | null {
  switch (status) {
    case 'DRAFT': return 'Sales Officer';
    case 'SUBMITTED':
    case 'PARTIALLY_APPROVED': return 'Finance Director';
    case 'APPROVED': return 'Managing Director';
    case 'RELEASED': return 'Warehouse Supervisor';
    case 'RESERVED':
    case 'PROCESSING':
    case 'ON_TRACK': return 'Warehouse team';
    default: return null;
  }
}

/** True when this order is waiting on the signed-in person specifically: their permission matches the stage, and the
 * maker-checker rule would actually let them act (nobody approves their own order). */
export function needsMyAction(order: FlowOrder, has: (permission: string) => boolean, myId: string): boolean {
  switch (order.status) {
    case 'DRAFT': return has('sales.create') && order.salesOfficer?.id === myId;
    case 'SUBMITTED': return has('sales.approve') && order.submittedById !== myId;
    case 'APPROVED': return has('sales.release');
    case 'RELEASED': return has('sales.assign');
    // The warehouse's own team acts here; the Supervisor can step in but it is not their turn.
    case 'RESERVED':
    case 'PROCESSING':
    case 'ON_TRACK': return has('sales.fulfill') && !has('sales.assign');
    default: return false;
  }
}

export type StepState = 'done' | 'current' | 'upcoming' | 'stopped';
export type StepId = 'submit' | 'finance' | 'release' | 'assign' | 'process' | 'track' | 'deliver';
export interface ChainStep {
  id: StepId;
  title: string;
  actor: string;
  state: StepState;
  at: string | null;
  by: string | null;
}

const fullName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

const STEPS: { id: StepId; title: string; actor: string; events: string[] }[] = [
  { id: 'submit', title: 'Submitted', actor: 'Sales Officer', events: ['SUBMITTED'] },
  { id: 'finance', title: 'Finance review', actor: 'Finance Director', events: ['APPROVED'] },
  { id: 'release', title: 'Released by the MD', actor: 'Managing Director', events: ['RELEASED'] },
  { id: 'assign', title: 'Warehouse assigned', actor: 'Warehouse Supervisor', events: ['ASSIGNED', 'REASSIGNED'] },
  { id: 'process', title: 'Processing', actor: 'Warehouse team', events: ['PROCESSING'] },
  { id: 'track', title: 'On track', actor: 'Warehouse team', events: ['ON_TRACK'] },
  { id: 'deliver', title: 'Delivered', actor: 'Warehouse team', events: ['DELIVERED'] },
];

/** The stage each in-flight status is waiting at (an index into STEPS). */
const CURRENT: Record<string, number> = { DRAFT: 0, SUBMITTED: 1, PARTIALLY_APPROVED: 1, APPROVED: 2, RELEASED: 3, RESERVED: 4, PROCESSING: 5, ON_TRACK: 6 };

const lastEvent = (o: FlowOrder, types: string[]) => [...(o.events ?? [])].reverse().find((e) => types.includes(e.type)) ?? null;

/** Where a rejection happened: read from the trail when it is there, else from whether Finance had already approved. */
export function rejectedAt(o: FlowOrder): 'FINANCE' | 'MD' {
  const stage = lastEvent(o, ['REJECTED'])?.meta?.stage;
  if (stage === 'FINANCE' || stage === 'MD') return stage;
  return o.approvedAt ? 'MD' : 'FINANCE';
}

/** The seven hand-offs, each marked done, current, upcoming or stopped (where a rejection or cancellation ended the order). */
export function chainSteps(o: FlowOrder): ChainStep[] {
  const steps: ChainStep[] = STEPS.map((def) => {
    const ev = lastEvent(o, def.events);
    let at = ev?.createdAt ?? null;
    let by = ev?.actorName ?? null;
    if (!ev && def.id === 'submit') { at = o.submittedAt ?? null; by = fullName(o.salesOfficer); }
    if (!ev && def.id === 'finance') { at = o.approvedAt ?? null; by = fullName(o.approvedBy); }
    if (!ev && def.id === 'deliver') at = o.fulfilledAt ?? null;
    return { id: def.id, title: def.title, actor: def.actor, state: 'upcoming', at, by };
  });
  const done = (n: number) => steps.forEach((s, i) => { if (i < n) s.state = 'done'; });

  if (o.status in CURRENT) {
    done(CURRENT[o.status]);
    steps[CURRENT[o.status]].state = 'current';
  } else if (o.status === 'FULFILLED') {
    done(steps.length);
  } else if (o.status === 'REJECTED') {
    if (rejectedAt(o) === 'MD') { done(2); steps[2].state = 'stopped'; steps[2].title = 'Rejected by the MD'; }
    else { done(1); steps[1].state = 'stopped'; steps[1].title = 'Rejected by Finance'; }
  } else if (o.status === 'CANCELLED') {
    // How far it got is read from what actually happened, not guessed.
    const reached = steps.map((s, i) => !!s.at || (i === 0 && !!o.submittedAt));
    let n = 0;
    while (n < steps.length && reached[n]) n++;
    done(n);
    if (n < steps.length) steps[n].state = 'stopped';
  }
  return steps;
}

/** When the order reached its current desk: what "waiting for N days" is counted from. Receipts added later do not reset it. */
export function waitingSince(o: FlowOrder): string | null {
  if (!(o.status in CURRENT) || o.status === 'DRAFT') return null;
  const stageEvents = (o.events ?? []).filter((e) => e.toStatus);
  const latest = stageEvents.length > 0 ? stageEvents[stageEvents.length - 1].createdAt : null;
  if (latest) return latest;
  if (o.status === 'SUBMITTED' || o.status === 'PARTIALLY_APPROVED') return o.submittedAt ?? null;
  if (o.status === 'APPROVED') return o.approvedAt ?? null;
  return null;
}

/** "5 min", "3 h", "2 days": how long ago, in the unit a person would say. */
export function ageLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/** An order that has waited longer than this at one desk is flagged, so nothing quietly sits. */
export const SLOW_AFTER_HOURS = 48;

/** True when the order is with someone and has been there longer than SLOW_AFTER_HOURS. */
export function isSlow(o: FlowOrder, now: Date = new Date()): boolean {
  if (waitingOn(o.status) === null || o.status === 'DRAFT') return false;
  const since = waitingSince(o);
  if (!since) return false;
  return now.getTime() - new Date(since).getTime() > SLOW_AFTER_HOURS * 3600_000;
}
