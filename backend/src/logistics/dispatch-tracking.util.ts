import { bagsLabel, personName } from './dispatch-request.util';

/**
 * Where a dispatch order is, in plain words, for the Farm Supervisor who asked for it (and everyone who handles it). Worked out from what
 * actually happened: the order, the farm manager's dispatch report, the supervisor's approval, the shipment on the road, and its receipt.
 */
export type DispatchStage = 'REQUESTED' | 'PREPARING' | 'IN_REVIEW' | 'ON_THE_WAY' | 'ARRIVED' | 'CANCELLED';
type When = Date | string | null | undefined;
type Person = { firstName?: string | null; lastName?: string | null } | null | undefined;

export interface ShipmentLike {
  shipmentNumber?: string; departedAt?: When; receivedAt?: When; expectedBags?: number | null; receivedBags?: number | null;
  receivedKg?: unknown; receivedKgEstimated?: boolean; varianceKg?: unknown; varianceRequiresApproval?: boolean | null; receivedCondition?: string | null;
}
export interface ReportLike {
  reportNumber?: string; status?: string; createdAt?: When; submittedAt?: When; approvedAt?: When; rejectionReason?: string | null;
  actualBagCount?: number | null; actualKg?: unknown; actualKgEstimated?: boolean;
  vehicle?: { plateNumber?: string | null } | null; driver?: { name?: string | null } | null; submittedBy?: Person; approvedBy?: Person; shipment?: ShipmentLike | null;
}
export interface TrackableOrder {
  status?: string; createdAt?: When; createdBy?: Person; bagCount?: number; destinationWarehouse?: { name?: string | null } | null; reports?: ReportLike[] | null;
}
export interface DispatchStep { id: 'requested' | 'preparing' | 'approved' | 'road' | 'arrived'; label: string; state: 'done' | 'current' | 'upcoming'; at: string | null; by: string | null; detail: string | null }
export interface DispatchTracking {
  stage: DispatchStage;
  label: string;
  /** Whose move it is; null once it has arrived or been cancelled. */
  holder: string | null;
  since: string | null;
  /** If the supervisor sent the report back, why. */
  sentBack: string | null;
  steps: DispatchStep[];
  driverName: string | null;
  vehiclePlate: string | null;
  bagsLoaded: number | null;
  bagsReceived: number | null;
  /** Bags received minus bags sent: negative means some did not arrive. Null until it arrives. */
  bagVariance: number | null;
  varianceRequiresApproval: boolean;
}

const iso = (d: When) => (d ? new Date(d).toISOString() : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const time = (d: When) => (d ? new Date(d).getTime() : 0);

export function trackingOf(order: TrackableOrder): DispatchTracking {
  const warehouse = order.destinationWarehouse?.name ?? 'the warehouse';
  const reports = [...(order.reports ?? [])].sort((a, b) => time(b.createdAt) - time(a.createdAt));
  const r = reports[0] ?? null;
  const s = r?.shipment ?? null;

  let stage: DispatchStage;
  if (order.status === 'CANCELLED') stage = 'CANCELLED';
  else if (s?.receivedAt || r?.status === 'RECONCILED') stage = 'ARRIVED';
  else if (r && (r.status === 'APPROVED' || r.status === 'IN_TRANSIT')) stage = 'ON_THE_WAY';
  else if (r?.status === 'SUPERVISOR_REVIEW') stage = 'IN_REVIEW';
  else if (r) stage = 'PREPARING';
  else stage = 'REQUESTED';

  const sentBack = stage === 'PREPARING' && r?.status === 'REJECTED' ? (r.rejectionReason ?? 'No reason was recorded.') : null;
  const bagsLoaded = r?.actualBagCount ?? null;
  const bagsReceived = s?.receivedAt ? (s.receivedBags ?? null) : null;
  const sentBags = s?.expectedBags ?? bagsLoaded;
  const bagVariance = bagsReceived !== null && sentBags !== null && sentBags !== undefined ? bagsReceived - sentBags : null;

  const label: Record<DispatchStage, string> = {
    REQUESTED: 'Waiting for the farm manager to start loading',
    PREPARING: sentBack ? 'Sent back to the farm manager' : 'The farm manager is preparing the load',
    IN_REVIEW: 'Waiting for the supervisor to approve the dispatch report',
    ON_THE_WAY: `On the way to ${warehouse}`,
    ARRIVED: `Received at ${warehouse}`,
    CANCELLED: 'Cancelled',
  };
  const holder: Record<DispatchStage, string | null> = { REQUESTED: 'Farm manager', PREPARING: 'Farm manager', IN_REVIEW: 'Farm supervisor', ON_THE_WAY: 'On the road', ARRIVED: null, CANCELLED: null };
  const since: Record<DispatchStage, When> = {
    REQUESTED: order.createdAt, PREPARING: r?.createdAt, IN_REVIEW: r?.submittedAt ?? r?.createdAt, ON_THE_WAY: s?.departedAt ?? r?.approvedAt, ARRIVED: s?.receivedAt, CANCELLED: null,
  };

  const reached = { requested: true, preparing: !!r, approved: stage === 'ON_THE_WAY' || stage === 'ARRIVED', road: stage === 'ON_THE_WAY' || stage === 'ARRIVED', arrived: stage === 'ARRIVED' };
  const currentId: DispatchStep['id'] | null = stage === 'REQUESTED' ? 'requested' : stage === 'PREPARING' ? 'preparing' : stage === 'IN_REVIEW' ? 'approved' : stage === 'ON_THE_WAY' ? 'road' : null;
  const mk = (id: DispatchStep['id'], text: string, at: When, by: string, detail: string | null): DispatchStep => ({
    id, label: text, at: iso(at), by: by || null, detail,
    state: stage === 'CANCELLED' ? (reached[id] && id !== 'arrived' ? 'done' : 'upcoming') : reached[id] && currentId !== id && !(id === 'requested' && currentId === 'requested') ? 'done' : currentId === id ? 'current' : 'upcoming',
  });
  const driver = r?.driver?.name ?? null;
  const plate = r?.vehicle?.plateNumber ?? null;
  const steps: DispatchStep[] = [
    mk('requested', 'Requested', order.createdAt, personName(order.createdBy), null),
    mk('preparing', 'Farm manager loads it', r?.createdAt, personName(r?.submittedBy), bagsLoaded !== null ? `${bagsLabel(bagsLoaded)} loaded` : null),
    mk('approved', 'Dispatch approved', r?.approvedAt, personName(r?.approvedBy), sentBack ? `Sent back: ${sentBack}` : null),
    mk('road', 'On the way', s?.departedAt ?? r?.approvedAt, '', [driver && `Driver ${driver}`, plate && `vehicle ${plate}`].filter(Boolean).join(', ') || null),
    mk('arrived', `Received at ${warehouse}`, s?.receivedAt, '', bagsReceived !== null ? `${bagsLabel(bagsReceived)} received${bagVariance ? ` (${bagVariance > 0 ? '+' : ''}${bagVariance} bags against what left)` : ''}` : null),
  ];
  return {
    stage, label: label[stage], holder: holder[stage], since: iso(since[stage]), sentBack, steps,
    driverName: driver, vehiclePlate: plate, bagsLoaded, bagsReceived, bagVariance, varianceRequiresApproval: !!s?.varianceRequiresApproval,
  };
}
