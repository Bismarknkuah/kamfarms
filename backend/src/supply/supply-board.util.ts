/**
 * One picture of a paddy request for everybody in the chain: where it is, whose move it is, and the steps it has been through. Worked out from
 * the request and (once a farm is asked to send it) the farm's dispatch, so nothing is stored twice.
 */
type When = Date | string | null | undefined;
const iso = (d: When) => (d ? new Date(d).toISOString() : null);
export interface SupplyLine { paddyGradeId: string; gradeLabel: string; bags: number }
export type SupplyStage = 'WITH_REVIEWER' | 'WITH_SUPPLIER' | 'DISPATCHING' | 'ON_THE_WAY' | 'RECEIVED' | 'READY' | 'DECLINED' | 'CANCELLED';
export interface SupplyStep { label: string; state: 'done' | 'current' | 'upcoming' | 'stopped'; who: string | null; at: string | null; detail: string | null }
export interface SupplyDispatch { requestRef: string; stage: string; label: string; holder: string | null; driverName: string | null; vehiclePlate: string | null; bagVariance: number | null; arrivedAt: string | null }
export interface SupplyView {
  id: string; requestNumber: string; kind: 'WAREHOUSE' | 'MILL'; status: string; stage: SupplyStage; label: string; holder: string | null; since: string | null;
  warehouse: { id: string; name: string; location: string | null }; millingCenter: { id: string; name: string } | null;
  lines: SupplyLine[]; totalBags: number; neededBy: string | null; notes: string | null;
  requestedBy: string; requestedById: string; requestedAt: string | null; forwardedBy: string | null; forwardedAt: string | null; forwardNote: string | null;
  decidedBy: string | null; decidedAt: string | null; decisionNote: string | null;
  sourceFarm: { id: string; name: string } | null; dispatch: SupplyDispatch | null; parentNumber: string | null; childNumber: string | null; childLabel: string | null;
  /** Where the request the warehouse raised for the shortfall has got to (null when none was raised). */
  childStage: SupplyStage | null;
  steps: SupplyStep[];
}
export interface SupplyContext {
  users: Map<string, string>; warehouses: Map<string, { name: string; location: string | null }>; centers: Map<string, string>; farms: Map<string, string>;
  cards: Map<string, any>; parents: Map<string, string>; children: Map<string, any>;
}
const name = (m: Map<string, string>, id?: string | null) => (id ? m.get(id) ?? '' : '');

function dispatchOf(ref: string | null, cards: Map<string, any>): SupplyDispatch | null {
  const c = ref ? cards.get(ref) : null;
  if (!c) return null;
  const d = (c.dispatches ?? [])[0] ?? null;
  return { requestRef: ref as string, stage: c.stage, label: c.label, holder: c.holder ?? null, driverName: d?.driverName ?? null, vehiclePlate: d?.vehiclePlate ?? null, bagVariance: c.bagVariance ?? null, arrivedAt: c.arrivedAt ?? null };
}

export function buildSupplyView(r: any, ctx: SupplyContext): SupplyView {
  const wh = ctx.warehouses.get(r.warehouseId) ?? { name: 'the warehouse', location: null };
  const centerName = r.millingCenterId ? ctx.centers.get(r.millingCenterId) ?? 'the mill' : null;
  const who = centerName ?? wh.name;
  const dispatch = dispatchOf(r.dispatchRequestRef ?? null, ctx.cards);
  const child = ctx.children.get(r.id) ?? null;
  const childStage: SupplyStage | null = child ? buildSupplyView(child, ctx).stage : null; // the shortfall request has no child of its own, so this stops there
  const lines = (r.lines ?? []) as SupplyLine[];

  let stage: SupplyStage; let label: string; let holder: string | null = null; let since: When = r.createdAt;
  if (r.status === 'CANCELLED') { stage = 'CANCELLED'; label = 'Cancelled'; }
  else if (r.status === 'DECLINED') { stage = 'DECLINED'; label = 'Not possible'; since = r.decidedAt; }
  else if (r.status === 'READY') { stage = 'READY'; label = `Paddy is ready at ${wh.name}`; since = r.decidedAt; }
  else if (r.status === 'SUBMITTED') { stage = 'WITH_REVIEWER'; holder = r.kind === 'WAREHOUSE' ? 'Warehouse Supervisor' : 'Operations Manager'; label = `With the ${holder}`; }
  else if (r.status === 'FORWARDED') {
    stage = 'WITH_SUPPLIER'; since = r.forwardedAt ?? r.createdAt;
    if (r.kind === 'MILL' && child && childStage === 'RECEIVED') { holder = 'Warehouse Supervisor'; label = 'The paddy has arrived: check it and press "Paddy is ready"'; }
    else if (r.kind === 'MILL' && child && !['DECLINED', 'CANCELLED'].includes(child.status)) { holder = 'Farm Director'; label = `Asked the Farm Director for more (${child.requestNumber})`; }
    else { holder = r.kind === 'WAREHOUSE' ? 'Farm Director' : 'Warehouse Supervisor'; label = `With the ${holder}`; }
  } else { // ASSIGNED: the farm manager has it, and the Dispatch desk knows where it is
    since = r.decidedAt;
    const s = dispatch?.stage;
    if (s === 'ARRIVED') { stage = 'RECEIVED'; label = `Arrived at ${wh.name}`; since = dispatch?.arrivedAt ?? since; }
    else if (s === 'ON_THE_WAY') { stage = 'ON_THE_WAY'; holder = 'On the road'; label = `On the road to ${wh.name}`; }
    else if (s === 'IN_REVIEW') { stage = 'DISPATCHING'; holder = 'Farm Director'; label = 'Waiting for the Farm Director to approve the dispatch'; }
    else if (s === 'CANCELLED') { stage = 'CANCELLED'; label = 'The dispatch was cancelled'; }
    else { stage = 'DISPATCHING'; holder = 'Farm manager'; label = `${name(ctx.farms, r.sourceFarmId) || 'The farm'} is getting it ready`; }
  }

  const rank = { WITH_REVIEWER: 1, WITH_SUPPLIER: 2, DISPATCHING: 3, ON_THE_WAY: 4, RECEIVED: 5, READY: 5 } as Record<string, number>;
  // A finished request (arrived, or paddy ready) has completed its last step too, not just reached it.
  const at = (rank[stage] ?? 0) + (stage === 'RECEIVED' || stage === 'READY' ? 1 : 0);
  const stopped = stage === 'DECLINED' || stage === 'CANCELLED';
  const stopAt = r.decidedById && r.forwardedAt ? 2 : 1; // declined by the supplier side, or by the first reviewer
  const mk = (label: string, n: number, who: string | null, when: When, detail: string | null = null): SupplyStep => ({
    label, who: who || null, at: iso(when), detail,
    state: stopped ? (n < stopAt ? 'done' : n === stopAt ? 'stopped' : 'upcoming') : n < at ? 'done' : n === at ? 'current' : 'upcoming',
  });
  const reviewer = r.kind === 'WAREHOUSE' ? 'Warehouse Supervisor' : 'Operations Manager';
  const steps: SupplyStep[] = r.kind === 'WAREHOUSE'
    ? [
        { label: 'Asked', state: 'done', who: name(ctx.users, r.requestedById) || null, at: iso(r.createdAt), detail: null },
        mk(`${reviewer} sends it on`, 1, name(ctx.users, r.forwardedById), r.forwardedAt),
        mk('Farm Director chooses the farm', 2, name(ctx.users, r.decidedById), r.decidedAt, r.sourceFarmId ? name(ctx.farms, r.sourceFarmId) : r.decisionNote),
        mk('Farm manager loads and sends', 3, null, null, dispatch ? dispatch.label : null),
        mk('On the road', 4, dispatch?.driverName ?? null, null, dispatch?.vehiclePlate ? `Vehicle ${dispatch.vehiclePlate}` : null),
        mk('Arrived', 5, null, dispatch?.arrivedAt, dispatch?.bagVariance ? `${Math.abs(dispatch.bagVariance)} bag${Math.abs(dispatch.bagVariance) === 1 ? '' : 's'} ${dispatch.bagVariance < 0 ? 'short' : 'extra'}` : null),
      ]
    : [
        { label: 'Asked', state: 'done', who: name(ctx.users, r.requestedById) || null, at: iso(r.createdAt), detail: null },
        mk(`${reviewer} sends it on`, 1, name(ctx.users, r.forwardedById), r.forwardedAt),
        mk('Warehouse Supervisor checks the stock', 2, name(ctx.users, r.decidedById), r.decidedAt, child ? `Asked the Farm Director for more (${child.requestNumber})` : r.decisionNote),
        mk('Paddy is ready', 3, null, r.status === 'READY' ? r.decidedAt : null),
      ];
  if (r.kind === 'MILL') { steps[3].state = stage === 'READY' ? 'done' : stopped ? 'upcoming' : 'upcoming'; }
  if (stopped && r.status === 'DECLINED') steps.forEach((s) => { if (s.state === 'stopped') s.detail = r.decisionNote ?? 'Not possible'; });

  return {
    id: r.id, requestNumber: r.requestNumber, kind: r.kind, status: r.status, stage, label, holder, since: iso(since),
    warehouse: { id: r.warehouseId, name: wh.name, location: wh.location }, millingCenter: r.millingCenterId ? { id: r.millingCenterId, name: centerName as string } : null,
    lines, totalBags: Number(r.totalBags), neededBy: iso(r.neededBy), notes: r.notes ?? null,
    requestedBy: name(ctx.users, r.requestedById), requestedById: r.requestedById, requestedAt: iso(r.createdAt),
    forwardedBy: name(ctx.users, r.forwardedById) || null, forwardedAt: iso(r.forwardedAt), forwardNote: r.forwardNote ?? null,
    decidedBy: name(ctx.users, r.decidedById) || null, decidedAt: iso(r.decidedAt), decisionNote: r.decisionNote ?? null,
    sourceFarm: r.sourceFarmId ? { id: r.sourceFarmId, name: name(ctx.farms, r.sourceFarmId) } : null, dispatch,
    parentNumber: r.parentRequestId ? ctx.parents.get(r.parentRequestId) ?? null : null, childNumber: child?.requestNumber ?? null, childLabel: child ? `${child.requestNumber}` : null, childStage,
    steps,
  };
}

export const sizesText = (lines: { gradeLabel: string; bags: number }[]) => lines.map((l) => `${l.gradeLabel}: ${l.bags}`).join(', ');
