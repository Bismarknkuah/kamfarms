/**
 * One picture of a paddy request for everybody in the chain: where it is, whose move it is, and the steps it has been through. Worked out from
 * the request and (once a farm is asked to send it) the farm's dispatch, so nothing is stored twice.
 */
import { transferLabel } from './paddy-transfer.util';
type When = Date | string | null | undefined;
const iso = (d: When) => (d ? new Date(d).toISOString() : null);
export interface SupplyLine { paddyGradeId: string; gradeLabel: string; bags: number }
export type SupplyStage = 'WITH_REVIEWER' | 'WITH_SUPPLIER' | 'DISPATCHING' | 'ON_THE_WAY' | 'RECEIVED' | 'READY' | 'DECLINED' | 'CANCELLED';
export interface SupplyStep { label: string; state: 'done' | 'current' | 'upcoming' | 'stopped'; who: string | null; at: string | null; detail: string | null }
export interface SupplyDispatch { requestRef: string; stage: string; label: string; holder: string | null; driverName: string | null; vehiclePlate: string | null; bagVariance: number | null; arrivedAt: string | null }
/** Paddy another warehouse is sending for this request (the same picture of it that the Deliveries desk shows). */
export interface SupplyTransfer { id: string; transferNumber: string; status: string; label: string; driverName: string | null; vehiclePlate: string | null; bags: number; receivedBags: number | null; bagVariance: number | null; sentAt: string | null; arrivedAt: string | null }
export interface SupplyView {
  id: string; requestNumber: string; kind: 'WAREHOUSE' | 'MILL'; status: string; stage: SupplyStage; label: string; holder: string | null; since: string | null;
  warehouse: { id: string; name: string; location: string | null }; millingCenter: { id: string; name: string } | null;
  lines: SupplyLine[]; totalBags: number; neededBy: string | null; notes: string | null;
  requestedBy: string; requestedById: string; requestedAt: string | null; forwardedBy: string | null; forwardedAt: string | null; forwardNote: string | null;
  decidedBy: string | null; decidedAt: string | null; decisionNote: string | null;
  sourceFarm: { id: string; name: string } | null; sourceWarehouse: { id: string; name: string } | null; transfer: SupplyTransfer | null; dispatch: SupplyDispatch | null;
  receivedBy: string | null; receivedAt: string | null; parentNumber: string | null; childNumber: string | null; childLabel: string | null;
  /** Where the request the warehouse raised for the shortfall has got to (null when none was raised). */
  childStage: SupplyStage | null;
  steps: SupplyStep[];
}
export interface SupplyContext {
  users: Map<string, string>; warehouses: Map<string, { name: string; location: string | null }>; centers: Map<string, string>; farms: Map<string, string>;
  cards: Map<string, any>; parents: Map<string, string>; children: Map<string, any>;
  /** The live paddy transfer for each request (by SR number) that another warehouse is sending. */
  transfers: Map<string, any>;
}
const name = (m: Map<string, string>, id?: string | null) => (id ? m.get(id) ?? '' : '');

function transferOf(t: any, ctx: SupplyContext): SupplyTransfer | null {
  if (!t) return null;
  const toName = ctx.warehouses.get(t.toWarehouseId)?.name ?? 'the warehouse';
  const got = (t.receivedLines ?? null) as { bags: number }[] | null;
  return { id: t.id, transferNumber: t.transferNumber, status: t.status, label: transferLabel(t, toName), driverName: t.driverName ?? null, vehiclePlate: t.vehiclePlate ?? null, bags: Number(t.totalBags), receivedBags: got ? got.reduce((n, l) => n + l.bags, 0) : null, bagVariance: t.varianceBags ?? null, sentAt: iso(t.sentAt), arrivedAt: iso(t.receivedAt) };
}
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
  const transfer = r.sourceWarehouseId ? transferOf(ctx.transfers.get(r.requestNumber), ctx) : null;
  const sourceWarehouseName = r.sourceWarehouseId ? ctx.warehouses.get(r.sourceWarehouseId)?.name ?? 'The warehouse' : null;
  const child = ctx.children.get(r.id) ?? null;
  const childStage: SupplyStage | null = child ? buildSupplyView(child, ctx).stage : null; // the shortfall request has no child of its own, so this stops there
  const lines = (r.lines ?? []) as SupplyLine[];

  let stage: SupplyStage; let label: string; let holder: string | null = null; let since: When = r.createdAt;
  if (r.status === 'CANCELLED') { stage = 'CANCELLED'; label = 'Cancelled'; }
  else if (r.status === 'DECLINED') { stage = 'DECLINED'; label = 'Not possible'; since = r.decidedAt; }
  else if (r.status === 'RECEIVED') { stage = 'RECEIVED'; label = `Received at ${who}`; since = r.receivedAt; }
  else if (r.status === 'READY') { stage = 'READY'; label = `Paddy is ready at ${wh.name}`; since = r.decidedAt; }
  else if (r.status === 'SUBMITTED') { stage = 'WITH_REVIEWER'; holder = r.kind === 'WAREHOUSE' ? 'Warehouse Supervisor' : 'Operations Manager'; label = `With the ${holder}`; }
  else if (r.status === 'FORWARDED') {
    stage = 'WITH_SUPPLIER'; since = r.forwardedAt ?? r.createdAt;
    if (r.kind === 'MILL' && child && childStage === 'RECEIVED') { holder = 'Warehouse Supervisor'; label = 'The paddy has arrived: check it and press "Paddy is ready"'; }
    else if (r.kind === 'MILL' && child && !['DECLINED', 'CANCELLED'].includes(child.status)) { holder = 'Farm Director'; label = `Asked the Farm Director for more (${child.requestNumber})`; }
    else { holder = r.kind === 'WAREHOUSE' ? 'Farm Director' : 'Warehouse Supervisor'; label = `With the ${holder}`; }
  } else if (r.sourceWarehouseId) { // ASSIGNED to another warehouse: its Warehouse Supervisor sends it, and the transfer knows where it is
    since = r.decidedAt;
    if (transfer?.status === 'RECEIVED') { stage = 'RECEIVED'; label = `Arrived at ${wh.name}`; since = transfer.arrivedAt ?? since; }
    else if (transfer?.status === 'IN_TRANSIT') { stage = 'ON_THE_WAY'; holder = 'On the road'; label = `On the road to ${wh.name}`; since = transfer.sentAt ?? since; }
    else { stage = 'DISPATCHING'; holder = 'Warehouse Supervisor'; label = `${sourceWarehouseName} is getting it ready`; }
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
  // A mill request is finished only when the mill has confirmed the paddy (its step 4); until then "ready" is the step just completed.
  const at = r.kind === 'MILL' ? (stage === 'RECEIVED' ? 5 : stage === 'READY' ? 4 : rank[stage] ?? 0) : (rank[stage] ?? 0) + (stage === 'RECEIVED' ? 1 : 0);
  const stopped = stage === 'DECLINED' || stage === 'CANCELLED';
  const stopAt = r.decidedById && r.forwardedAt ? 2 : 1; // declined by the supplier side, or by the first reviewer
  const mk = (label: string, n: number, who: string | null, when: When, detail: string | null = null): SupplyStep => ({
    label, who: who || null, at: iso(when), detail,
    state: stopped ? (n < stopAt ? 'done' : n === stopAt ? 'stopped' : 'upcoming') : n < at ? 'done' : n === at ? 'current' : 'upcoming',
  });
  const reviewer = r.kind === 'WAREHOUSE' ? 'Warehouse Supervisor' : 'Operations Manager';
  const via = dispatch ?? (transfer ? { label: transfer.label, driverName: transfer.driverName, vehiclePlate: transfer.vehiclePlate, bagVariance: transfer.bagVariance, arrivedAt: transfer.arrivedAt } : null);
  const steps: SupplyStep[] = r.kind === 'WAREHOUSE'
    ? [
        { label: 'Asked', state: 'done', who: name(ctx.users, r.requestedById) || null, at: iso(r.createdAt), detail: null },
        mk(`${reviewer} sends it on`, 1, name(ctx.users, r.forwardedById), r.forwardedAt),
        mk(r.sourceWarehouseId ? 'Farm Director chooses the warehouse' : 'Farm Director chooses the farm', 2, name(ctx.users, r.decidedById), r.decidedAt, r.sourceFarmId ? name(ctx.farms, r.sourceFarmId) : sourceWarehouseName ?? r.decisionNote),
        mk(r.sourceWarehouseId ? 'Warehouse Supervisor loads and sends' : 'Farm manager loads and sends', 3, null, null, via ? via.label : null),
        mk('On the road', 4, via?.driverName ?? null, null, via?.vehiclePlate ? `Vehicle ${via.vehiclePlate}` : null),
        mk('Arrived', 5, null, via?.arrivedAt, via?.bagVariance ? `${Math.abs(via.bagVariance)} bag${Math.abs(via.bagVariance) === 1 ? '' : 's'} ${via.bagVariance < 0 ? 'short' : 'extra'}` : null),
      ]
    : [
        { label: 'Asked', state: 'done', who: name(ctx.users, r.requestedById) || null, at: iso(r.createdAt), detail: null },
        mk(`${reviewer} sends it on`, 1, name(ctx.users, r.forwardedById), r.forwardedAt),
        mk('Warehouse Supervisor checks the stock', 2, name(ctx.users, r.decidedById), r.decidedAt, child ? `Asked the Farm Director for more (${child.requestNumber})` : r.decisionNote),
        mk('Paddy is ready', 3, null, r.status === 'READY' || r.status === 'RECEIVED' ? r.decidedAt : null),
        mk('Received at the mill', 4, name(ctx.users, r.receivedById), r.receivedAt),
      ];
  if (stopped && r.status === 'DECLINED') steps.forEach((s) => { if (s.state === 'stopped') s.detail = r.decisionNote ?? 'Not possible'; });

  return {
    id: r.id, requestNumber: r.requestNumber, kind: r.kind, status: r.status, stage, label, holder, since: iso(since),
    warehouse: { id: r.warehouseId, name: wh.name, location: wh.location }, millingCenter: r.millingCenterId ? { id: r.millingCenterId, name: centerName as string } : null,
    lines, totalBags: Number(r.totalBags), neededBy: iso(r.neededBy), notes: r.notes ?? null,
    requestedBy: name(ctx.users, r.requestedById), requestedById: r.requestedById, requestedAt: iso(r.createdAt),
    forwardedBy: name(ctx.users, r.forwardedById) || null, forwardedAt: iso(r.forwardedAt), forwardNote: r.forwardNote ?? null,
    decidedBy: name(ctx.users, r.decidedById) || null, decidedAt: iso(r.decidedAt), decisionNote: r.decisionNote ?? null,
    sourceFarm: r.sourceFarmId ? { id: r.sourceFarmId, name: name(ctx.farms, r.sourceFarmId) } : null,
    sourceWarehouse: r.sourceWarehouseId ? { id: r.sourceWarehouseId, name: sourceWarehouseName as string } : null, transfer, dispatch,
    receivedBy: name(ctx.users, r.receivedById) || null, receivedAt: iso(r.receivedAt),
    parentNumber: r.parentRequestId ? ctx.parents.get(r.parentRequestId) ?? null : null, childNumber: child?.requestNumber ?? null, childLabel: child ? `${child.requestNumber}` : null, childStage,
    steps,
  };
}

export const sizesText = (lines: { gradeLabel: string; bags: number }[]) => lines.map((l) => `${l.gradeLabel}: ${l.bags}`).join(', ');
