import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { scopedLocationIds } from '../common/utils/scope.util';

export interface WhereaboutsPlace {
  type: 'FARM' | 'ROAD' | 'WAREHOUSE' | 'MILL';
  id: string;
  name: string;
  location: string | null;
  /** On the road: who is driving, and in what. */
  detail: string | null;
  bags: Record<string, number>;
  total: number;
}

/**
 * Where the paddy is right now, size by size: at each farm, on the road (with the driver and vehicle), at each warehouse, at each mill. Each
 * person sees only the places they are responsible for (a farm manager their farm, a warehouse manager their warehouse), the Farm Director and
 * the management see everything. Worked out from the stock the system already keeps, so it can never disagree with it.
 */
@Injectable()
export class PaddyWhereaboutsService {
  constructor(private readonly prisma: PrismaService) {}

  async whereabouts(actor: AuthenticatedUser) {
    const farmScope = scopedLocationIds(actor, 'FARM');
    const whScope = scopedLocationIds(actor, 'WAREHOUSE');
    const millScope = scopedLocationIds(actor, 'MILLING_CENTER');
    const sees = (scope: { isGlobal: boolean; ids: string[] }, id: string) => scope.isGlobal || scope.ids.includes(id);

    const [grades, balances, shipments] = await Promise.all([
      this.prisma.paddyGrade.findMany({ where: { isActive: true }, orderBy: { label: 'asc' } }),
      this.prisma.inventoryBalance.findMany({ where: { paddyGradeId: { not: null }, locationType: { in: ['FARM', 'WAREHOUSE', 'MILLING_CENTER'] as any }, bagCount: { gt: 0 } } }),
      this.prisma.shipment.findMany({ where: { receivedAt: null }, include: { farm: true, warehouse: true, deliveryReport: { include: { driver: true, vehicle: true } } } }),
    ]);

    const visible = balances.filter((b) => (b.locationType === 'FARM' ? sees(farmScope, b.locationId) : b.locationType === 'WAREHOUSE' ? sees(whScope, b.locationId) : sees(millScope, b.locationId)));
    const onRoad = shipments.filter((s: any) => sees(farmScope, s.farmId) || sees(whScope, s.warehouseId));
    const ids = (type: string) => [...new Set(visible.filter((b) => b.locationType === type).map((b) => b.locationId))];
    const [farms, whs, mills] = await Promise.all([
      this.prisma.farm.findMany({ where: { id: { in: ids('FARM') } }, select: { id: true, name: true } }),
      this.prisma.warehouse.findMany({ where: { id: { in: ids('WAREHOUSE') } }, select: { id: true, name: true, location: true } }),
      this.prisma.millingCenter.findMany({ where: { id: { in: ids('MILLING_CENTER') } }, select: { id: true, name: true } }),
    ]);

    const places = new Map<string, WhereaboutsPlace>();
    const add = (key: string, base: Omit<WhereaboutsPlace, 'bags' | 'total'>, gradeId: string, bags: number) => {
      const p = places.get(key) ?? { ...base, bags: {}, total: 0 };
      p.bags[gradeId] = (p.bags[gradeId] ?? 0) + bags;
      p.total += bags;
      places.set(key, p);
    };
    for (const b of visible) {
      const gradeId = b.paddyGradeId as string;
      if (b.locationType === 'FARM') add(`F${b.locationId}`, { type: 'FARM', id: b.locationId, name: farms.find((f) => f.id === b.locationId)?.name ?? 'A farm', location: null, detail: null }, gradeId, b.bagCount);
      else if (b.locationType === 'WAREHOUSE') { const w = whs.find((x) => x.id === b.locationId); add(`W${b.locationId}`, { type: 'WAREHOUSE', id: b.locationId, name: w?.name ?? 'A warehouse', location: w?.location ?? null, detail: null }, gradeId, b.bagCount); }
      else add(`M${b.locationId}`, { type: 'MILL', id: b.locationId, name: mills.find((m) => m.id === b.locationId)?.name ?? 'A mill', location: null, detail: null }, gradeId, b.bagCount);
    }
    // the road: one entry per truck (every size on it together), not per size
    for (const s of onRoad as any[]) {
      const trip = s.deliveryReport?.dispatchRef ?? s.id;
      const who = [s.deliveryReport?.driver?.name && `Driver ${s.deliveryReport.driver.name}`, s.deliveryReport?.vehicle?.plateNumber && `vehicle ${s.deliveryReport.vehicle.plateNumber}`].filter(Boolean).join(', ');
      add(`R${trip}`, { type: 'ROAD', id: trip, name: `${s.farm?.name ?? 'The farm'} to ${s.warehouse?.name ?? 'the warehouse'}`, location: null, detail: who || null }, s.paddyGradeId, Number(s.expectedBags ?? 0));
    }

    const order = { FARM: 0, ROAD: 1, WAREHOUSE: 2, MILL: 3 } as const;
    const list = [...places.values()].sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name));
    const totals: Record<string, number> = {};
    for (const p of list) for (const [g, n] of Object.entries(p.bags)) totals[g] = (totals[g] ?? 0) + n;
    return { sizes: grades.map((g) => ({ id: g.id, label: g.label })), places: list, totals };
  }
}
