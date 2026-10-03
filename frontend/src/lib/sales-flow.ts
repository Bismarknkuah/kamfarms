/**
 * The journey of a sale, in the order it happens:
 *
 *   Sales Officer submits  ->  Finance Director approves  ->
 *   Managing Director / CEO releases it to the Warehouse Supervisor  ->
 *   Warehouse Supervisor delivers
 *
 * Everything here is pure (no React, no network) and shared by every
 * screen that shows an order, so the wording and the "who is it waiting
 * on" answer cannot drift apart between the Sales page, the dashboards
 * and the decision desks.
 */

export interface FlowOrder {
  status: string;
  submittedById?: string;
  salesOfficer?: { id?: string; firstName: string; lastName: string } | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  approvedBy?: { firstName: string; lastName: string } | null;
  fulfilledAt?: string | null;
  tasks?: { title?: string; createdAt: string; createdBy: { firstName: string; lastName: string } }[] | null;
}

const LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'With Finance Director',
  PARTIALLY_APPROVED: 'Partly approved',
  APPROVED: 'Awaiting MD release',
  RESERVED: 'Released for delivery',
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
  RESERVED: 'bg-paddy-100 text-paddy-700',
  FULFILLED: 'bg-paddy-700 text-rice-50',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-ink-500/10 text-ink-500',
};

export function salesStatusTone(status: string): string {
  return TONES[status] ?? 'bg-ink-500/10 text-ink-700';
}

/** Whose desk the order is on right now; null once it is finished. */
export function waitingOn(status: string): string | null {
  switch (status) {
    case 'DRAFT': return 'Sales Officer';
    case 'SUBMITTED':
    case 'PARTIALLY_APPROVED': return 'Finance Director';
    case 'APPROVED': return 'Managing Director';
    case 'RESERVED': return 'Warehouse Supervisor';
    default: return null;
  }
}

/** True when this order is waiting on the signed-in person specifically:
 * their permission matches the stage, and the maker-checker rule would
 * actually let them act (nobody approves their own order). */
export function needsMyAction(order: FlowOrder, has: (permission: string) => boolean, myId: string): boolean {
  switch (order.status) {
    case 'DRAFT': return has('sales.create') && order.salesOfficer?.id === myId;
    case 'SUBMITTED': return has('sales.approve') && order.submittedById !== myId;
    case 'APPROVED': return has('sales.release');
    case 'RESERVED': return has('sales.fulfill');
    default: return false;
  }
}

export type StepState = 'done' | 'current' | 'upcoming' | 'stopped';
export interface ChainStep {
  id: 'submit' | 'finance' | 'release' | 'deliver';
  title: string;
  actor: string;
  state: StepState;
  at: string | null;
  by: string | null;
}

const fullName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

/** The four hand-offs, each marked done, current, upcoming or stopped
 * (where a rejection or cancellation ended the order). */
export function chainSteps(o: FlowOrder): ChainStep[] {
  const release = o.tasks && o.tasks.length > 0 ? [...o.tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] : null;
  const steps: ChainStep[] = [
    { id: 'submit', title: 'Submitted', actor: 'Sales Officer', state: 'upcoming', at: o.submittedAt ?? null, by: fullName(o.salesOfficer) },
    { id: 'finance', title: 'Finance review', actor: 'Finance Director', state: 'upcoming', at: o.approvedAt ?? null, by: fullName(o.approvedBy) },
    { id: 'release', title: 'Released for delivery', actor: 'Managing Director', state: 'upcoming', at: release?.createdAt ?? null, by: fullName(release?.createdBy) },
    { id: 'deliver', title: 'Delivered', actor: 'Warehouse Supervisor', state: 'upcoming', at: o.fulfilledAt ?? null, by: null },
  ];

  const done = (n: number) => steps.forEach((s, i) => { if (i < n) s.state = 'done'; });

  switch (o.status) {
    case 'DRAFT': steps[0].state = 'current'; break;
    case 'SUBMITTED':
    case 'PARTIALLY_APPROVED': done(1); steps[1].state = 'current'; break;
    case 'APPROVED': done(2); steps[2].state = 'current'; break;
    case 'RESERVED': done(3); steps[3].state = 'current'; break;
    case 'FULFILLED': done(4); break;
    case 'REJECTED': done(1); steps[1].state = 'stopped'; steps[1].title = 'Rejected by Finance'; break;
    case 'CANCELLED': {
      // How far it got is read from what actually happened, not guessed.
      const reached = [!!o.submittedAt, !!o.approvedAt, !!release, !!o.fulfilledAt];
      let n = 0;
      while (n < 4 && reached[n]) n++;
      done(n);
      if (n < 4) steps[n].state = 'stopped';
      break;
    }
  }
  return steps;
}

/** When the order reached its current desk: what "waiting for N days" is
 * counted from. Null when that moment is not known. */
export function waitingSince(o: FlowOrder): string | null {
  switch (o.status) {
    case 'SUBMITTED':
    case 'PARTIALLY_APPROVED': return o.submittedAt ?? null;
    case 'APPROVED': return o.approvedAt ?? null;
    case 'RESERVED': {
      const t = o.tasks && o.tasks.length > 0 ? [...o.tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] : null;
      return t?.createdAt ?? o.approvedAt ?? null;
    }
    default: return null;
  }
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
