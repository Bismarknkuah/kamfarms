/**
 * One picture of a dispatch for everybody who tracks it: where it is, every step it went through with who did it and when, the day it was supposed
 * to be delivered by, and who held it up. Worked out from the records the system already keeps (the request, the dispatch report, the shipment),
 * so it can never disagree with them.
 */
type When = Date | string | null | undefined;
const HOUR = 3600 * 1000;
const iso = (d: When) => (d ? new Date(d).toISOString() : null);
const ms = (d: When) => (d ? new Date(d).getTime() : null);
const hoursBetween = (a: When, b: When) => Math.max(0, ((ms(b) ?? 0) - (ms(a) ?? 0)) / HOUR);

export type JourneyKind = 'FARM_DISPATCH' | 'PADDY_TRANSFER' | 'RICE_TRANSFER';
export type JourneyStatus = 'REQUESTED' | 'IN_REVIEW' | 'IN_TRANSIT' | 'DELIVERED';
export interface JourneyStep { key: string; label: string; /** Who does this step, as a role, for when nobody has yet. */ role: string; who: string | null; at: string | null; state: 'done' | 'current' | 'upcoming'; /** Hours since the step before (while a step is waiting: how long it has waited so far). */ waitedHours: number | null; detail: string | null }
export interface JourneyLine { paddyGradeId: string | null; label: string; bags: number; receivedBags: number | null }
export interface Journey {
  id: string; kind: JourneyKind; ref: string; requestRef: string | null; status: JourneyStatus; label: string;
  from: { name: string }; to: { id: string; name: string }; lines: JourneyLine[]; totalBags: number; vehicle: string | null; driver: string | null;
  /** The day it was supposed to be delivered by, and when it really was. */
  neededBy: string | null; deliveredAt: string | null;
  /** Hours past the end of the needed-by day (delivered: how late it was; not delivered yet: how overdue it is). Null when it is not late. */
  late: { hours: number; delivered: boolean } | null;
  /** The step that took longest, and who had it. */
  slowest: { label: string; who: string | null; role: string; hours: number; running: boolean } | null;
  steps: JourneyStep[]; lastActivity: string | null;
  /** What the person looking may do about it right now. */
  action: { type: 'CONFIRM_TRUCK'; key: string } | { type: 'OPEN'; href: string; label: string } | null;
}
export interface Names { users: Map<string, string>; farms: Map<string, string>; warehouses: Map<string, string>; grades: Map<string, string>; vehicles: Map<string, string>; drivers: Map<string, string> }
const nameOf = (m: Map<string, string>, id?: string | null) => (id ? m.get(id) ?? null : null);

/** The needed-by DAY is the last moment it may arrive: the end of that day. */
export function deadlineOf(neededBy: When): Date | null {
  if (!neededBy) return null;
  const d = new Date(neededBy);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 24 * HOUR);
}

type RawStep = { key: string; label: string; role: string; who: string | null; at: When; detail?: string | null; partial?: boolean };

/** Puts the steps in order, marks which are done, the one that is waiting, and the ones to come; measures each wait; finds the slowest and the lateness. */
export function analyse(raw: RawStep[], neededBy: When, deliveredAt: When, now: Date): Pick<Journey, 'steps' | 'slowest' | 'late' | 'neededBy' | 'deliveredAt' | 'lastActivity'> {
  const steps: JourneyStep[] = [];
  let lastDoneAt: When = null; let waiting = false;
  for (const r of raw) {
    if (r.at && !r.partial) {
      steps.push({ key: r.key, label: r.label, role: r.role, who: r.who, at: iso(r.at), state: 'done', waitedHours: lastDoneAt ? hoursBetween(lastDoneAt, r.at) : null, detail: r.detail ?? null });
      lastDoneAt = r.at;
    } else if (!waiting) {
      waiting = true; // the first step not done yet is the one the dispatch is waiting for
      steps.push({ key: r.key, label: r.label, role: r.role, who: r.who, at: null, state: 'current', waitedHours: lastDoneAt ? hoursBetween(lastDoneAt, now) : null, detail: r.detail ?? null });
    } else steps.push({ key: r.key, label: r.label, role: r.role, who: null, at: null, state: 'upcoming', waitedHours: null, detail: null });
  }
  let slowest: Journey['slowest'] = null;
  for (const s of steps) {
    if (s.waitedHours === null || s.state === 'upcoming') continue;
    if (!slowest || s.waitedHours > slowest.hours) slowest = { label: s.label, who: s.who, role: s.role, hours: s.waitedHours, running: s.state === 'current' };
  }
  const deadline = deadlineOf(neededBy);
  const end = deliveredAt ? new Date(deliveredAt) : now;
  const lateHours = deadline && end.getTime() > deadline.getTime() ? hoursBetween(deadline, end) : 0;
  const stamps = raw.map((r) => ms(r.at)).filter((x): x is number => x !== null);
  return { steps, slowest, late: lateHours > 0 ? { hours: lateHours, delivered: !!deliveredAt } : null, neededBy: iso(neededBy), deliveredAt: iso(deliveredAt), lastActivity: stamps.length ? new Date(Math.max(...stamps)).toISOString() : null };
}

const LABEL: Record<JourneyStatus, string> = { REQUESTED: 'Requested: not loaded yet', IN_REVIEW: 'Waiting for approval', IN_TRANSIT: 'In transit', DELIVERED: 'Delivered' };
const bagsShort = (n: number) => `${Math.abs(n)} bag${Math.abs(n) === 1 ? '' : 's'} ${n < 0 ? 'short' : 'extra'}`;

export interface FarmGroup { key: string; orders: any[]; reports: any[]; shipments: any[] }
/** A dispatch from a farm: the request (if there was one), the truck loaded and sent for approval, approved, on the road, counted in. */
export function buildFarmJourney(g: FarmGroup, n: Names, now: Date): Journey {
  const orders = [...g.orders].sort((a, b) => ms(a.createdAt)! - ms(b.createdAt)!);
  const reports = [...g.reports].sort((a, b) => ms(a.createdAt)! - ms(b.createdAt)!);
  const first = orders[0] ?? null; const r0 = reports[0] ?? null;
  const farmId = first?.farmId ?? r0?.farmId; const whId = first?.destinationWarehouseId ?? r0?.destinationWarehouseId;
  const allReceived = g.shipments.length > 0 && g.shipments.every((s) => s.receivedAt);
  const received = g.shipments.filter((s) => s.receivedAt);
  const status: JourneyStatus = allReceived ? 'DELIVERED' : g.shipments.length > 0 || reports.some((r) => ['APPROVED', 'IN_TRANSIT', 'ARRIVED'].includes(r.status)) ? 'IN_TRANSIT' : reports.length > 0 ? 'IN_REVIEW' : 'REQUESTED';
  const earliest = (xs: When[]) => { const t = xs.map(ms).filter((x): x is number => x !== null); return t.length ? new Date(Math.min(...t)) : null; };
  const latest = (xs: When[]) => { const t = xs.map(ms).filter((x): x is number => x !== null); return t.length ? new Date(Math.max(...t)) : null; };
  const approver = reports.find((r) => r.approvedById)?.approvedById ?? null;
  const driver = nameOf(n.drivers, r0?.driverId); const vehicle = nameOf(n.vehicles, r0?.vehicleId);
  const variance = received.reduce((sum, s) => sum + ((s.receivedBags ?? s.expectedBags) - s.expectedBags), 0);
  const receiver = received.find((s) => s.receivedById)?.receivedById ?? null;
  const raw: RawStep[] = [];
  if (first?.requestRef) raw.push({ key: 'requested', label: 'Requested', role: 'Farm Supervisor', who: nameOf(n.users, first.createdById), at: first.createdAt });
  raw.push({ key: 'loaded', label: 'Loaded and sent for approval', role: 'Farm Manager', who: nameOf(n.users, r0?.submittedById), at: reports.length ? earliest(reports.map((r) => r.submittedAt ?? r.createdAt)) : null });
  raw.push({ key: 'approved', label: 'Approved', role: 'Farm Supervisor', who: nameOf(n.users, approver), at: reports.length && reports.every((r) => r.approvedAt) ? latest(reports.map((r) => r.approvedAt)) : null });
  raw.push({ key: 'departed', label: 'Left the farm', role: 'Driver', who: driver, at: g.shipments.length ? earliest(g.shipments.map((s) => s.departedAt)) : null, detail: vehicle ? `Vehicle ${vehicle}` : null });
  raw.push({
    key: 'delivered', label: 'Delivered and counted in', role: 'Warehouse Manager', who: nameOf(n.users, receiver),
    at: allReceived ? latest(received.map((s) => s.receivedAt)) : null, partial: received.length > 0 && !allReceived,
    detail: allReceived ? (variance !== 0 ? bagsShort(variance) : null) : received.length > 0 ? `${received.length} of ${g.shipments.length} sizes counted in so far` : null,
  });
  const neededBy = earliest(orders.map((o) => o.requestedDate));
  const deliveredAt = allReceived ? latest(received.map((s) => s.receivedAt)) : null;
  const lines: JourneyLine[] = g.shipments.length
    ? g.shipments.map((s) => ({ paddyGradeId: s.paddyGradeId ?? null, label: nameOf(n.grades, s.paddyGradeId) ?? 'Paddy', bags: s.expectedBags, receivedBags: s.receivedAt ? s.receivedBags ?? null : null }))
    : (reports.length ? reports : orders).map((x) => ({ paddyGradeId: x.paddyGradeId ?? null, label: nameOf(n.grades, x.paddyGradeId) ?? 'Paddy', bags: x.actualBagCount ?? x.bagCount, receivedBags: null }));
  const ref = r0?.dispatchRef ?? r0?.reportNumber ?? first?.requestRef ?? first?.orderNumber ?? g.key;
  return {
    id: g.key, kind: 'FARM_DISPATCH', ref, requestRef: first?.requestRef ?? null, status, label: LABEL[status],
    from: { name: nameOf(n.farms, farmId) ?? 'A farm' }, to: { id: whId, name: nameOf(n.warehouses, whId) ?? 'A warehouse' },
    lines, totalBags: lines.reduce((t, l) => t + l.bags, 0), vehicle, driver, ...analyse(raw, neededBy, deliveredAt, now), action: null,
  };
}

/** Paddy sent from one warehouse to another. */
export function buildPaddyTransferJourney(t: any, n: Names, neededBy: When, now: Date): Journey {
  const delivered = t.status === 'RECEIVED';
  const raw: RawStep[] = [
    { key: 'sent', label: 'Sent', role: 'Warehouse Supervisor', who: nameOf(n.users, t.sentById), at: t.sentAt, detail: [t.vehiclePlate && `Vehicle ${t.vehiclePlate}`, t.driverName && `driver ${t.driverName}`].filter(Boolean).join(', ') || null },
    { key: 'delivered', label: 'Delivered and counted in', role: 'Warehouse Manager', who: nameOf(n.users, t.receivedById), at: delivered ? t.receivedAt : null, detail: delivered && t.varianceBags ? bagsShort(t.varianceBags) : null },
  ];
  const lines: JourneyLine[] = ((t.lines ?? []) as { gradeLabel: string; bags: number }[]).map((l: any) => ({ paddyGradeId: l.paddyGradeId ?? null, label: l.gradeLabel, bags: l.bags, receivedBags: delivered ? ((t.receivedLines ?? []) as any[]).find((r) => r.gradeLabel === l.gradeLabel)?.bags ?? null : null }));
  return {
    id: `paddy:${t.id}`, kind: 'PADDY_TRANSFER', ref: t.transferNumber, requestRef: t.supplyRequestNumber ?? null, status: delivered ? 'DELIVERED' : 'IN_TRANSIT', label: delivered ? LABEL.DELIVERED : LABEL.IN_TRANSIT,
    from: { name: nameOf(n.warehouses, t.fromWarehouseId) ?? 'A warehouse' }, to: { id: t.toWarehouseId, name: nameOf(n.warehouses, t.toWarehouseId) ?? 'A warehouse' },
    lines, totalBags: Number(t.totalBags), vehicle: t.vehiclePlate ?? null, driver: t.driverName ?? null, ...analyse(raw, neededBy, delivered ? t.receivedAt : null, now), action: null,
  };
}

/** Packaged rice sent from one warehouse to another. */
export function buildRiceTransferJourney(t: any, n: Names & { products: Map<string, string> }, now: Date): Journey {
  const delivered = t.status === 'RECEIVED';
  const raw: RawStep[] = [
    { key: 'sent', label: 'Sent', role: 'Warehouse Supervisor', who: nameOf(n.users, t.requestedById), at: t.dispatchedAt ?? t.createdAt },
    { key: 'delivered', label: 'Delivered and counted in', role: 'Warehouse Manager', who: nameOf(n.users, t.receivedById), at: delivered ? t.receivedAt : null, detail: delivered && t.receivedBagCount !== null && t.receivedBagCount !== t.bagCount ? bagsShort(t.receivedBagCount - t.bagCount) : null },
  ];
  return {
    id: `rice:${t.id}`, kind: 'RICE_TRANSFER', ref: t.transferNumber, requestRef: null, status: delivered ? 'DELIVERED' : 'IN_TRANSIT', label: delivered ? LABEL.DELIVERED : LABEL.IN_TRANSIT,
    from: { name: nameOf(n.warehouses, t.sourceWarehouseId) ?? 'A warehouse' }, to: { id: t.destWarehouseId, name: nameOf(n.warehouses, t.destWarehouseId) ?? 'A warehouse' },
    lines: [{ paddyGradeId: null, label: n.products.get(t.productId) ?? 'Rice', bags: t.bagCount, receivedBags: delivered ? t.receivedBagCount ?? null : null }], totalBags: t.bagCount, vehicle: null, driver: null,
    ...analyse(raw, null, delivered ? t.receivedAt : null, now), action: null,
  };
}
