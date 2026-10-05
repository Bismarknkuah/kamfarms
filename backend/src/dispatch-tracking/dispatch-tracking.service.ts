import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { scopedLocationIds } from '../common/utils/scope.util';
import { FarmGroup, Journey, JourneyStatus, Names, buildFarmJourney, buildPaddyTransferJourney, buildRiceTransferJourney } from './dispatch-journey.util';

/** The people who supervise the farm managers and the warehouses see every dispatch; everyone else sees only their own farm's and their own warehouse's. */
const SUPERVISING_ROLES = ['WAREHOUSE_SUPERVISOR', 'FARM_DIRECTOR', 'MD', 'CEO', 'ADMIN'];
const IN_FLIGHT_REPORTS = ['SUBMITTED', 'SUPERVISOR_REVIEW', 'APPROVED', 'IN_TRANSIT', 'ARRIVED', 'RECONCILED'];
export type Visibility = { all: true } | { all: false; farms: string[]; warehouses: string[] };

export function visibilityOf(actor: AuthenticatedUser): Visibility {
  if (actor.roles.some((r: any) => SUPERVISING_ROLES.includes(r.roleCode))) return { all: true };
  const farms = scopedLocationIds(actor, 'FARM'); const warehouses = scopedLocationIds(actor, 'WAREHOUSE');
  if (farms.isGlobal) return { all: true };
  return { all: false, farms: farms.ids, warehouses: warehouses.ids };
}

@Injectable()
export class DispatchTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every dispatch the person may track, newest activity first, each with its steps, times and who held it up. */
  async list(actor: AuthenticatedUser, opts: { status?: 'open' | 'delivered' | 'all'; q?: string } = {}, now = new Date()): Promise<{ journeys: Journey[]; counts: { open: number; delivered: number; late: number } }> {
    const vis = visibilityOf(actor);
    if (!vis.all && vis.farms.length === 0 && vis.warehouses.length === 0) return { journeys: [], counts: { open: 0, delivered: 0, late: 0 } };
    // What each place may see: a farm's own dispatches, and what goes into or out of a warehouse.
    const farmWh = vis.all ? {} : { OR: [...(vis.farms.length ? [{ farmId: { in: vis.farms } }] : []), ...(vis.warehouses.length ? [{ destinationWarehouseId: { in: vis.warehouses } }] : [])] };
    const transferWh = vis.all ? {} : { OR: [{ fromWarehouseId: { in: vis.warehouses } }, { toWarehouseId: { in: vis.warehouses } }] };
    const rice = vis.all ? {} : { OR: [{ sourceWarehouseId: { in: vis.warehouses } }, { destWarehouseId: { in: vis.warehouses } }] };

    const reports = await this.prisma.deliveryReport.findMany({ where: { status: { in: IN_FLIGHT_REPORTS as any }, ...farmWh } as any, orderBy: { createdAt: 'desc' }, take: 300 });
    const orderIds = [...new Set(reports.map((r) => r.deliveryOrderId))];
    const [orders, shipments, requests, paddy, riceRows] = await Promise.all([
      this.prisma.deliveryOrder.findMany({ where: { id: { in: orderIds } } }),
      this.prisma.shipment.findMany({ where: { deliveryReportId: { in: reports.map((r) => r.id) } } }),
      // A request nobody has loaded yet (or one sent back) is a dispatch that is still waiting at the farm.
      this.prisma.deliveryOrder.findMany({ where: { status: 'PENDING', requestRef: { not: null }, id: { notIn: orderIds }, ...farmWh } as any, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.paddyTransfer.findMany({ where: { status: { not: 'CANCELLED' }, ...transferWh } as any, orderBy: { sentAt: 'desc' }, take: 150 }),
      this.prisma.stockTransfer.findMany({ where: { status: { not: 'CANCELLED' }, ...rice } as any, orderBy: { dispatchedAt: 'desc' }, take: 100 }),
    ]);
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const allOrders = [...orders, ...requests];
    const [users, farms, warehouses, grades, vehicles, drivers, products, supply] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: uniq([...allOrders.map((o) => o.createdById), ...reports.flatMap((r) => [r.submittedById, r.approvedById]), ...shipments.map((s) => s.receivedById), ...paddy.flatMap((t) => [t.sentById, t.receivedById]), ...riceRows.flatMap((t) => [t.requestedById, t.receivedById])]) } }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.farm.findMany({ where: { id: { in: uniq(allOrders.map((o) => o.farmId)) } }, select: { id: true, name: true } }),
      this.prisma.warehouse.findMany({ where: { id: { in: uniq([...allOrders.map((o) => o.destinationWarehouseId), ...paddy.flatMap((t) => [t.fromWarehouseId, t.toWarehouseId]), ...riceRows.flatMap((t) => [t.sourceWarehouseId, t.destWarehouseId])]) } }, select: { id: true, name: true } }),
      this.prisma.paddyGrade.findMany({ select: { id: true, label: true } }),
      this.prisma.vehicle.findMany({ where: { id: { in: uniq(reports.map((r) => r.vehicleId)) } }, select: { id: true, plateNumber: true } }),
      this.prisma.driver.findMany({ where: { id: { in: uniq(reports.map((r) => r.driverId)) } }, select: { id: true, name: true } }),
      this.prisma.product.findMany({ where: { id: { in: uniq(riceRows.map((t) => t.productId)) } }, select: { id: true, name: true } }),
      this.prisma.supplyRequest.findMany({ where: { requestNumber: { in: uniq(paddy.map((t) => t.supplyRequestNumber)) } }, select: { requestNumber: true, neededBy: true } }),
    ]);
    const names: Names & { products: Map<string, string> } = {
      users: new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()])), farms: new Map(farms.map((f) => [f.id, f.name])), warehouses: new Map(warehouses.map((w) => [w.id, w.name])),
      grades: new Map(grades.map((g) => [g.id, g.label])), vehicles: new Map(vehicles.map((v) => [v.id, v.plateNumber])), drivers: new Map(drivers.map((d) => [d.id, d.name])), products: new Map(products.map((p) => [p.id, p.name])),
    };

    // One dispatch per truck: the orders and reports that share a dispatch reference travel together; a request nobody has loaded stands alone.
    const orderById = new Map(allOrders.map((o) => [o.id, o]));
    const groups = new Map<string, FarmGroup>();
    for (const r of reports) {
      const key = `farm:${r.dispatchRef ?? r.reportNumber}`;
      const g = groups.get(key) ?? { key, orders: [], reports: [], shipments: [] };
      g.reports.push(r); const o = orderById.get(r.deliveryOrderId); if (o && !g.orders.includes(o)) g.orders.push(o);
      g.shipments.push(...shipments.filter((s) => s.deliveryReportId === r.id)); groups.set(key, g);
    }
    for (const o of requests) { const key = `request:${o.requestRef ?? o.id}`; const g = groups.get(key) ?? { key, orders: [], reports: [], shipments: [] }; g.orders.push(o); groups.set(key, g); }

    const neededBy = new Map(supply.map((s) => [s.requestNumber, s.neededBy]));
    let journeys: Journey[] = [
      ...[...groups.values()].map((g) => buildFarmJourney(g, names, now)),
      ...paddy.map((t) => buildPaddyTransferJourney(t, names, t.supplyRequestNumber ? neededBy.get(t.supplyRequestNumber) ?? null : null, now)),
      ...riceRows.map((t) => buildRiceTransferJourney(t, names, now)),
    ];
    journeys = journeys.map((j) => ({ ...j, action: this.actionFor(j, actor, vis, groups, paddy, riceRows) }));
    const q = opts.q?.trim().toLowerCase();
    if (q) journeys = journeys.filter((j) => [j.ref, j.requestRef, j.vehicle, j.driver, j.from.name, j.to.name, ...j.lines.map((l) => l.label)].some((v) => v && v.toLowerCase().includes(q)));
    const counts = { open: journeys.filter((j) => j.status !== 'DELIVERED').length, delivered: journeys.filter((j) => j.status === 'DELIVERED').length, late: journeys.filter((j) => j.late).length };
    if (opts.status === 'open') journeys = journeys.filter((j) => j.status !== 'DELIVERED');
    if (opts.status === 'delivered') journeys = journeys.filter((j) => j.status === 'DELIVERED');
    journeys.sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''));
    return { journeys, counts };
  }

  /** What the person looking may do about a dispatch that is in transit: the warehouse it is going to counts it in. */
  private actionFor(j: Journey, actor: AuthenticatedUser, vis: Visibility, groups: Map<string, FarmGroup>, paddy: any[], rice: any[]): Journey['action'] {
    if (j.status !== 'IN_TRANSIT') return null;
    const holds = (p: string) => actor.permissionCodes?.has(p) ?? false;
    const wh = scopedLocationIds(actor, 'WAREHOUSE');
    const mine = wh.isGlobal || wh.ids.includes(j.to.id);
    if (!mine) return null;
    if (j.kind === 'FARM_DISPATCH') return holds('warehouse.receive') ? { type: 'CONFIRM_TRUCK', key: j.ref } : null;
    if (j.kind === 'PADDY_TRANSFER') { const t = paddy.find((x) => `paddy:${x.id}` === j.id); return t && (holds('warehouse.receive') || holds('warehouse.transfer')) ? { type: 'OPEN', href: `/site-deliveries?transfer=${t.id}`, label: 'Open the delivery' } : null; }
    return holds('warehouse.transfer') && rice.some((x) => `rice:${x.id}` === j.id) ? { type: 'OPEN', href: '/office', label: 'Open My Office' } : null;
  }
}
