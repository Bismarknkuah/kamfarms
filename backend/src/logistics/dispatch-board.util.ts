import { DispatchStage, DispatchStep, trackingOf } from './dispatch-tracking.util';
import { bagsLabel, personName } from './dispatch-request.util';

/**
 * ONE picture of every dispatch request, shared by the Farm Supervisor who asked and the farm manager who does it: what was asked and where it
 * goes, which sizes, where it is now and whose move it is, the dispatch (one truck, every size) the manager prepared, and what the supervisor
 * has to approve. Worked out from the orders and their reports: nothing is stored twice.
 */
type When = Date | string | null | undefined;
const iso = (d: When) => (d ? new Date(d).toISOString() : null);
const t = (d: When) => (d ? new Date(d).getTime() : 0);
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export const STAGE_RANK: Record<DispatchStage, number> = { REQUESTED: 0, PREPARING: 1, IN_REVIEW: 2, ON_THE_WAY: 3, ARRIVED: 4, CANCELLED: 9 };

export interface DispatchLineView {
  reportId: string; reportNumber: string; orderNumber: string; gradeLabel: string; bags: number; kg: number; kgEstimated: boolean; status: string;
  shipment: { shipmentNumber: string | null; expectedBags: number | null; receivedBags: number | null; receivedAt: string | null; varianceRequiresApproval: boolean } | null;
}
export interface DispatchView {
  /** The dispatch reference (DS-...), or the report number for a report made the old one-size-at-a-time way. */
  ref: string; dispatchRef: string | null; status: string; lines: DispatchLineView[]; totalBags: number; totalKg: number;
  preparedBy: string; preparedById: string | null; preparedAt: string | null; submittedAt: string | null;
  approvedBy: string; approvedAt: string | null; rejectionReason: string | null;
  driverName: string | null; driverPhone: string | null; vehiclePlate: string | null; vehicleType: string | null;
  departureDate: string | null; departureTime: string | null; expectedArrivalTime: string | null; remarks: string | null;
  labourCost: number; numberOfLabourers: number | null; transportationFee: number; otherCosts: number; otherCostsDescription: string | null; totalCost: number;
}
export interface RequestLineView { orderId: string; orderNumber: string; gradeLabel: string; bagCount: number; totalKg: number; totalKgEstimated: boolean; stage: DispatchStage; label: string }
export interface RequestCard {
  key: string; requestRef: string | null;
  farm: { id: string; name: string }; warehouse: { id: string; name: string; location: string | null };
  requestedDate: string | null; priority: string; notes: string | null; requestedBy: string; requestedById: string | null; createdAt: string | null;
  lines: RequestLineView[]; totalBags: number; dispatches: DispatchView[];
  stage: DispatchStage; label: string; holder: string | null; since: string | null; sentBack: string | null; steps: DispatchStep[];
  /** Needed-by date has passed and the bags have not yet left. */
  overdue: boolean; daysOverdue: number;
  /** A dispatch is waiting for the supervisor's approval. */
  awaitingApproval: boolean;
  arrivedAt: string | null; bagVariance: number | null; varianceRequiresApproval: boolean;
}

function dispatchesOf(orders: any[]): DispatchView[] {
  // the CURRENT report of each order (the latest one that was not cancelled), grouped by the trip it belongs to
  const groups = new Map<string, any[]>();
  for (const o of orders) {
    const current = [...(o.reports ?? [])].filter((r) => r.status !== 'CANCELLED').sort((a, b) => t(b.createdAt) - t(a.createdAt))[0];
    if (!current) continue;
    const key = current.dispatchRef ?? current.reportNumber ?? current.id;
    groups.set(key, [...(groups.get(key) ?? []), { report: current, order: o }]);
  }
  return [...groups.entries()].map(([ref, items]) => {
    items.sort((a, b) => String(a.report.reportNumber).localeCompare(String(b.report.reportNumber)));
    const lead = items[0].report;
    const lines: DispatchLineView[] = items.map(({ report: r, order }) => ({
      reportId: r.id, reportNumber: r.reportNumber, orderNumber: order.orderNumber, gradeLabel: r.paddyGrade?.label ?? order.paddyGrade?.label ?? 'Paddy', bags: num(r.actualBagCount), kg: num(r.actualKg),
      kgEstimated: !!r.actualKgEstimated, status: r.status,
      shipment: r.shipment ? { shipmentNumber: r.shipment.shipmentNumber ?? null, expectedBags: r.shipment.expectedBags ?? null, receivedBags: r.shipment.receivedBags ?? null, receivedAt: iso(r.shipment.receivedAt), varianceRequiresApproval: !!r.shipment.varianceRequiresApproval } : null,
    }));
    const sum = (f: (r: any) => number) => items.reduce((n, { report }) => n + f(report), 0);
    return {
      ref, dispatchRef: lead.dispatchRef ?? null, status: lead.status, lines, totalBags: lines.reduce((n, l) => n + l.bags, 0), totalKg: lines.reduce((n, l) => n + l.kg, 0),
      preparedBy: personName(lead.submittedBy), preparedById: lead.submittedById ?? null, preparedAt: iso(lead.createdAt), submittedAt: iso(lead.submittedAt),
      approvedBy: personName(lead.approvedBy), approvedAt: iso(lead.approvedAt), rejectionReason: lead.rejectionReason ?? null,
      driverName: lead.driver?.name ?? null, driverPhone: lead.driver?.phone ?? null, vehiclePlate: lead.vehicle?.plateNumber ?? null, vehicleType: lead.vehicle?.vehicleType ?? null,
      departureDate: iso(lead.departureDate), departureTime: lead.departureTime ?? null, expectedArrivalTime: lead.expectedArrivalTime ?? null, remarks: lead.remarks ?? null,
      labourCost: sum((r) => num(r.labourCost)), numberOfLabourers: lead.numberOfLabourers ?? null, transportationFee: sum((r) => num(r.transportationFee)), otherCosts: sum((r) => num(r.otherCosts)),
      otherCostsDescription: lead.otherCostsDescription ?? null, totalCost: sum((r) => num(r.totalDeliveryCost)),
    };
  });
}

/** Group orders into requests (orders made together share a request reference) and work out where each request is. */
export function buildRequestCards(orders: any[], now: Date = new Date()): RequestCard[] {
  const groups = new Map<string, any[]>();
  for (const o of orders) groups.set(o.requestRef ?? o.orderNumber ?? o.id, [...(groups.get(o.requestRef ?? o.orderNumber ?? o.id) ?? []), o]);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const cards = [...groups.entries()].map(([key, group]) => {
    group.sort((a, b) => String(a.orderNumber).localeCompare(String(b.orderNumber)));
    const first = group[0];
    const tracked = group.map((o) => ({ o, tr: trackingOf(o) }));
    const live = tracked.filter((x) => x.tr.stage !== 'CANCELLED');
    // The request is as far along as its SLOWEST size: it has arrived only when every size has.
    const slowest = (live.length ? live : tracked).reduce((a, b) => (STAGE_RANK[b.tr.stage] < STAGE_RANK[a.tr.stage] ? b : a));
    const stage: DispatchStage = live.length === 0 ? 'CANCELLED' : slowest.tr.stage;
    const requestedMs = t(first.requestedDate);
    const unfinished = stage === 'REQUESTED' || stage === 'PREPARING' || stage === 'IN_REVIEW';
    const dispatches = dispatchesOf(group);
    const arrived = stage === 'ARRIVED' ? group.map((o) => (o.reports ?? []).map((r: any) => r.shipment?.receivedAt)).flat().filter(Boolean).sort((a: any, b: any) => t(b) - t(a))[0] : null;
    const variance = stage === 'ARRIVED' ? live.reduce((n, x) => n + (x.tr.bagVariance ?? 0), 0) : null;
    return {
      key, requestRef: first.requestRef ?? null,
      farm: { id: first.farmId, name: first.farm?.name ?? 'the farm' },
      warehouse: { id: first.destinationWarehouseId, name: first.destinationWarehouse?.name ?? 'the warehouse', location: first.destinationWarehouse?.location ?? null },
      requestedDate: iso(first.requestedDate), priority: first.priority ?? 'NORMAL', notes: first.notes ?? null,
      requestedBy: personName(first.createdBy), requestedById: first.createdById ?? null, createdAt: iso(first.createdAt),
      lines: tracked.map(({ o, tr }) => ({ orderId: o.id, orderNumber: o.orderNumber, gradeLabel: o.paddyGrade?.label ?? 'Paddy', bagCount: num(o.bagCount), totalKg: num(o.totalKg), totalKgEstimated: !!o.totalKgEstimated, stage: tr.stage, label: tr.label })),
      totalBags: group.reduce((n, o) => n + num(o.bagCount), 0), dispatches,
      stage, label: stage === 'CANCELLED' ? 'Cancelled' : slowest.tr.label, holder: stage === 'CANCELLED' ? null : slowest.tr.holder, since: slowest.tr.since, sentBack: slowest.tr.sentBack, steps: slowest.tr.steps,
      overdue: unfinished && requestedMs > 0 && requestedMs < today, daysOverdue: unfinished && requestedMs > 0 && requestedMs < today ? Math.floor((today - requestedMs) / 86400000) : 0,
      awaitingApproval: dispatches.some((d) => d.status === 'SUPERVISOR_REVIEW'),
      arrivedAt: iso(arrived as any), bagVariance: variance, varianceRequiresApproval: live.some((x) => x.tr.varianceRequiresApproval),
    } as RequestCard;
  });
  return cards.sort((a, b) => t(b.createdAt) - t(a.createdAt));
}

export const describeDispatch = (d: Pick<DispatchView, 'lines' | 'totalBags'>) =>
  d.lines.length === 1 ? `${bagsLabel(d.totalBags)} of ${d.lines[0].gradeLabel}` : `${bagsLabel(d.totalBags)} (${d.lines.map((l) => `${l.gradeLabel} ${l.bags}`).join(', ')})`;
