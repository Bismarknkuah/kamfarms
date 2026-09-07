import { Injectable } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertScope, scopedLocationIds } from '../common/utils/scope.util';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

export interface DateRangeFilter {
  from?: string;
  to?: string;
}

function dateRangeWhere(filter: DateRangeFilter, field = 'createdAt') {
  if (!filter.from && !filter.to) return undefined;
  const range: Record<string, Date> = {};
  if (filter.from) range.gte = new Date(filter.from);
  if (filter.to) range.lte = new Date(filter.to);
  return { [field]: range };
}

/**
 * Every number here comes from a real query against the ledger, sales,
 * or finance tables built in Phases 3-8 -- nothing is a placeholder or a
 * hard-coded example figure. Where the spec asks for a figure this
 * codebase doesn't yet have inputs for, the method simply omits that
 * field rather than inventing a number.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Spec section 30 -- Managing Director / CEO executive dashboard KPIs. */
  async executiveSummary() {
    const [farmBalances, transitBalances, warehouseBalances, millingBalances] = await Promise.all([
      this.prisma.inventoryBalance.findMany({ where: { locationType: LocationType.FARM }, include: { paddyGrade: true } }),
      this.prisma.inventoryBalance.findMany({ where: { locationType: LocationType.EXTERNAL } }),
      this.prisma.inventoryBalance.findMany({ where: { locationType: LocationType.WAREHOUSE }, include: { product: true, packagingSize: true } }),
      this.prisma.inventoryBalance.findMany({ where: { locationType: LocationType.MILLING_CENTER }, include: { product: true } }),
    ]);

    const totalPaddyAvailableKg = farmBalances.reduce((sum, b) => sum + Number(b.quantityKg), 0);
    const totalPaddyAvailableBags = farmBalances.reduce((sum, b) => sum + b.bagCount, 0);
    const paddyInTransitKg = transitBalances.reduce((sum, b) => sum + Number(b.quantityKg), 0);
    const paddyInTransitBags = transitBalances.reduce((sum, b) => sum + b.bagCount, 0);
    const paddyInWarehousesKg = warehouseBalances.filter((b) => !b.productId).reduce((sum, b) => sum + Number(b.quantityKg), 0);
    const bulkRiceAtMillingKg = millingBalances.filter((b) => b.productId && !b.packagingSizeId).reduce((sum, b) => sum + Number(b.quantityKg), 0);
    const packagedRiceAvailableKg = warehouseBalances.filter((b) => b.productId && b.packagingSizeId).reduce((sum, b) => sum + Number(b.quantityKg), 0);

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [salesToday, salesThisMonth, invoicesForReceivables, expensesThisMonth] = await Promise.all([
      this.prisma.salesOrder.aggregate({
        where: { status: 'FULFILLED', fulfilledAt: { gte: startOfToday } },
        _sum: { totalAmount: true },
      }),
      this.prisma.salesOrder.aggregate({
        where: { status: 'FULFILLED', fulfilledAt: { gte: startOfMonth } },
        _sum: { totalAmount: true },
      }),
      this.prisma.invoice.findMany({ include: { allocations: { include: { payment: true } } } }),
      this.prisma.expense.aggregate({
        where: { status: 'APPROVED', date: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
    ]);

    const outstandingReceivables = invoicesForReceivables.reduce((sum, inv) => {
      const paid = inv.allocations.filter((a) => a.payment.status === 'VERIFIED').reduce((s, a) => s + Number(a.amountApplied), 0);
      return sum + Math.max(Number(inv.totalAmount) - paid, 0);
    }, 0);

    return {
      totalPaddyAvailableKg,
      totalPaddyAvailableBags,
      paddyInTransitKg,
      paddyInTransitBags,
      paddyInWarehousesKg,
      bulkRiceAtMillingKg,
      packagedRiceAvailableKg,
      salesTodayAmount: Number(salesToday._sum.totalAmount ?? 0),
      salesThisMonthAmount: Number(salesThisMonth._sum.totalAmount ?? 0),
      outstandingReceivables,
      expensesThisMonth: Number(expensesThisMonth._sum.amount ?? 0),
    };
  }

  /** Spec section 31 -- per-farm paddy intake, rejections, deliveries, costs. */
  /** Was accepting a raw farmId with zero scope enforcement - a real,
   * confirmed gap: a Farm Manager could see any other farm's report
   * just by changing the query parameter. Fixed the same way as every
   * other farm-scoped list this session: a non-global caller without
   * an explicit farmId sees only their own farm(s); an explicit farmId
   * outside their scope is silently narrowed back to their own, not
   * trusted outright. */
  async farmReport(filters: { farmId?: string } & DateRangeFilter, actor: AuthenticatedUser) {
    const { isGlobal, ids } = scopedLocationIds(actor, 'FARM');
    let farmWhere: Record<string, unknown>;
    if (isGlobal) {
      farmWhere = filters.farmId ? { id: filters.farmId } : { isActive: true };
    } else {
      if (ids.length === 0) return [];
      farmWhere = { id: filters.farmId && ids.includes(filters.farmId) ? filters.farmId : { in: ids } };
    }
    const farms = await this.prisma.farm.findMany({ where: farmWhere });

    return Promise.all(
      farms.map(async (farm) => {
        const entryWhere = { farmId: farm.id, ...dateRangeWhere(filters, 'entryDate') };
        const [approvedAgg, rejectedCount, deliveryAgg] = await Promise.all([
          this.prisma.paddyEntry.aggregate({ where: { ...entryWhere, status: 'APPROVED' }, _sum: { weightKg: true }, _count: true }),
          this.prisma.paddyEntry.count({ where: { ...entryWhere, status: 'REJECTED' } }),
          this.prisma.deliveryReport.aggregate({
            where: { farmId: farm.id, status: { in: ['IN_TRANSIT', 'ARRIVED', 'RECONCILED'] } },
            _sum: { totalDeliveryCost: true, labourCost: true, transportationFee: true },
          }),
        ]);

        return {
          farmId: farm.id,
          farmCode: farm.code,
          farmName: farm.name,
          approvedIntakeKg: Number(approvedAgg._sum.weightKg ?? 0),
          approvedEntryCount: approvedAgg._count,
          rejectedEntryCount: rejectedCount,
          totalDeliveryCost: Number(deliveryAgg._sum.totalDeliveryCost ?? 0),
          totalLabourCost: Number(deliveryAgg._sum.labourCost ?? 0),
          totalTransportCost: Number(deliveryAgg._sum.transportationFee ?? 0),
        };
      }),
    );
  }

  /** Spec section 32 -- per-warehouse paddy/packaged-rice/production summary. */
  async warehouseReport(filters: { warehouseId?: string }) {
    const warehouses = await this.prisma.warehouse.findMany({
      where: filters.warehouseId ? { id: filters.warehouseId } : { isActive: true },
    });

    return Promise.all(
      warehouses.map(async (warehouse) => {
        const balances = await this.prisma.inventoryBalance.findMany({
          where: { locationType: LocationType.WAREHOUSE, locationId: warehouse.id },
          include: { paddyGrade: true, product: true, packagingSize: true },
        });

        const paddyAvailableKg = balances.filter((b) => b.paddyGradeId).reduce((sum, b) => sum + Number(b.quantityKg), 0);
        const packagedRiceKg = balances.filter((b) => b.productId && b.packagingSizeId).reduce((sum, b) => sum + Number(b.quantityKg), 0);

        const incomingShipments = await this.prisma.shipment.count({ where: { warehouseId: warehouse.id, receivedAt: null } });

        const fulfilledOrders = await this.prisma.salesOrder.aggregate({
          where: { allocatedWarehouseId: warehouse.id, status: 'FULFILLED' },
          _sum: { totalAmount: true, totalKg: true },
          _count: true,
        });

        return {
          warehouseId: warehouse.id,
          warehouseCode: warehouse.code,
          warehouseName: warehouse.name,
          paddyAvailableKg,
          packagedRiceKg,
          incomingShipmentsCount: incomingShipments,
          fulfilledOrdersCount: fulfilledOrders._count,
          fulfilledOrdersAmount: Number(fulfilledOrders._sum.totalAmount ?? 0),
          fulfilledOrdersKg: Number(fulfilledOrders._sum.totalKg ?? 0),
        };
      }),
    );
  }

  /** Spec section 33 -- sales by salesperson / by product. */
  async salesReport(filters: { salesOfficerId?: string; productId?: string } & DateRangeFilter) {
    const orders = await this.prisma.salesOrder.findMany({
      where: {
        status: 'FULFILLED',
        salesOfficerId: filters.salesOfficerId,
        ...dateRangeWhere(filters, 'fulfilledAt'),
      },
      include: { salesOfficer: true, customer: true, items: { include: { product: true, packagingSize: true } } },
    });

    const bySalesperson = new Map();
    const byProduct = new Map();

    for (const order of orders) {
      const key = order.salesOfficerId;
      const existing = bySalesperson.get(key) ?? { name: `${order.salesOfficer.firstName} ${order.salesOfficer.lastName}`, orderCount: 0, totalAmount: 0 };
      existing.orderCount += 1;
      existing.totalAmount += Number(order.totalAmount);
      bySalesperson.set(key, existing);

      for (const item of order.items) {
        if (filters.productId && item.productId !== filters.productId) continue;
        const pKey = item.productId;
        const pExisting = byProduct.get(pKey) ?? { name: item.product.name, bagCount: 0, totalAmount: 0 };
        pExisting.bagCount += item.bagCount;
        pExisting.totalAmount += Number(item.lineTotal);
        byProduct.set(pKey, pExisting);
      }
    }

    return {
      totalOrders: orders.length,
      totalAmount: orders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
      bySalesperson: Array.from(bySalesperson.values()),
      byProduct: Array.from(byProduct.values()),
    };
  }

  /** Spec section 33 -- revenue / payments / receivables / expenses. */
  async financeReport(filters: DateRangeFilter) {
    const [revenueAgg, verifiedPayments, expenseAgg, expensesByCategory] = await Promise.all([
      this.prisma.invoice.aggregate({ where: dateRangeWhere(filters, 'issueDate'), _sum: { totalAmount: true } }),
      this.prisma.payment.aggregate({ where: { status: 'VERIFIED', ...dateRangeWhere(filters, 'verifiedAt') }, _sum: { amount: true } }),
      this.prisma.expense.aggregate({ where: { status: 'APPROVED', ...dateRangeWhere(filters, 'date') }, _sum: { amount: true } }),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where: { status: 'APPROVED', ...dateRangeWhere(filters, 'date') },
        _sum: { amount: true },
      }),
    ]);

    const categories = await this.prisma.expenseCategory.findMany();
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    const totalRevenue = Number(revenueAgg._sum.totalAmount ?? 0);
    const totalExpenses = Number(expenseAgg._sum.amount ?? 0);

    return {
      totalInvoiced: totalRevenue,
      totalPaymentsVerified: Number(verifiedPayments._sum.amount ?? 0),
      totalExpenses,
      estimatedProfit: totalRevenue - totalExpenses,
      expensesByCategory: expensesByCategory.map((e: { categoryId: string; _sum: { amount: unknown } }) => ({
        category: categoryMap.get(e.categoryId) ?? 'Unknown',
        amount: Number(e._sum.amount ?? 0),
      })),
    };
  }

  /** Real trend and comparison data for executives, not just point-in-
   * time totals - the gap the earlier KPI grid always had. Aggregated
   * in JS after a single fetch per source, not raw SQL grouping: at
   * this company's actual scale (a handful of farms, one sales team)
   * the dataset is small enough that this is simpler and safer than
   * hand-written GROUP BY, and avoids a second query-building surface
   * to keep in sync with schema changes. */
  async executiveAnalytics() {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [fulfilledOrders, approvedExpenses, approvedPaddy] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: { status: 'FULFILLED', fulfilledAt: { gte: sixMonthsAgo } },
        select: { totalAmount: true, fulfilledAt: true, items: { select: { product: { select: { name: true } }, lineTotal: true } } },
      }),
      this.prisma.expense.findMany({
        where: { status: 'APPROVED', date: { gte: sixMonthsAgo } },
        select: { amount: true, date: true },
      }),
      this.prisma.paddyEntry.findMany({
        where: { status: 'APPROVED', entryDate: { gte: sixMonthsAgo } },
        select: { weightKg: true, farm: { select: { name: true } } },
      }),
    ]);

    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabels: string[] = [];
    for (let i = 5; i >= 0; i--) {
      monthLabels.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    }

    const salesByMonth = new Map(monthLabels.map((m) => [m, 0]));
    for (const o of fulfilledOrders) {
      if (!o.fulfilledAt) continue;
      const key = monthKey(o.fulfilledAt);
      if (salesByMonth.has(key)) salesByMonth.set(key, salesByMonth.get(key)! + Number(o.totalAmount));
    }

    const expensesByMonth = new Map(monthLabels.map((m) => [m, 0]));
    for (const e of approvedExpenses) {
      const key = monthKey(e.date);
      if (expensesByMonth.has(key)) expensesByMonth.set(key, expensesByMonth.get(key)! + Number(e.amount));
    }

    const salesByProduct = new Map<string, number>();
    for (const o of fulfilledOrders) {
      for (const item of o.items) {
        const name = item.product.name;
        salesByProduct.set(name, (salesByProduct.get(name) ?? 0) + Number(item.lineTotal));
      }
    }

    const paddyByFarm = new Map<string, number>();
    for (const p of approvedPaddy) {
      const name = p.farm.name;
      paddyByFarm.set(name, (paddyByFarm.get(name) ?? 0) + Number(p.weightKg));
    }

    return {
      monthlySales: monthLabels.map((m) => ({ month: m, amount: salesByMonth.get(m) ?? 0 })),
      monthlyExpenses: monthLabels.map((m) => ({ month: m, amount: expensesByMonth.get(m) ?? 0 })),
      salesByProduct: Array.from(salesByProduct.entries()).map(([product, amount]) => ({ product, amount })),
      paddyByFarm: Array.from(paddyByFarm.entries()).map(([farm, kg]) => ({ farm, kg })),
    };
  }

  /** A genuine, comprehensive stock view - every non-zero balance across
   * every stage (farm, warehouse, milling center), broken down by
   * grade/product/size, not just the handful of summary totals the
   * Overview page shows. InventoryBalance has no native relation to
   * Farm/Warehouse (locationId is polymorphic - it means a different
   * table depending on locationType), so names are resolved with two
   * extra lookups and mapped by id in application code rather than a
   * single join, which Prisma can't express here anyway. */
  /** The spec's own words: "the most important dashboard feature."
   * Rebuilt around what already exists rather than assumed missing  - 
   * StockReservation already correctly tracks reserved stock separately
   * from physical balance (verified by reading sales-orders.service.ts
   * directly), and EXTERNAL is already the real in-transit pseudo-
   * location for paddy. This surfaces both properly for the first time,
   * matching the spec's exact table shape: available / reserved /
   * in-transit / total per package size for finished rice, and
   * farm / warehouse / in-transit / at-milling for paddy. */
  async inventoryOverview(actor: AuthenticatedUser) {
    const farmScope = scopedLocationIds(actor, 'FARM');
    const warehouseScope = scopedLocationIds(actor, 'WAREHOUSE');
    const isGlobal = farmScope.isGlobal;

    const farmWhere = isGlobal ? {} : { locationId: { in: farmScope.ids } };
    const warehouseWhere = isGlobal ? {} : { locationId: { in: warehouseScope.ids } };

    // "In transit" balances are keyed by shipment id (EXTERNAL locationType,
    // locationId = the shipment's own id), not by farm id - a real, confirmed
    // gap this fixes: this previously had no scope filter at all, meaning a
    // Farm Manager's "in transit" figure silently included every other farm's
    // shipments company-wide. Scoping it correctly means resolving which
    // shipments actually belong to this actor's farm(s)/warehouse(s) first,
    // then filtering the EXTERNAL balances down to just those shipment ids.
    const transitShipmentWhere = isGlobal
      ? {}
      : { OR: [{ farmId: { in: farmScope.ids } }, { warehouseId: { in: warehouseScope.ids } }] };
    const relevantShipmentIds = isGlobal
      ? null
      : (await this.prisma.shipment.findMany({ where: transitShipmentWhere, select: { id: true } })).map((s) => s.id);

    // Same real gap as the "in transit" fix above, for the same reason:
    // a milling center's own id is what InventoryBalance keys on for
    // MILLING_CENTER rows, not its parent warehouse's id, so a plain
    // warehouse-scope filter would never have matched anything  - 
    // and the previous unfiltered version meant a Warehouse Manager
    // scoped to one warehouse could see every other warehouse's
    // milling data too.
    const relevantMillingCenterIds = isGlobal
      ? null
      : (await this.prisma.millingCenter.findMany({ where: { warehouseId: { in: warehouseScope.ids } }, select: { id: true } })).map((m) => m.id);

    const [farmBalances, transitBalances, warehouseBalances, millingBalances, activeReservations] = await Promise.all([
      this.prisma.inventoryBalance.findMany({ where: { locationType: 'FARM', ...farmWhere }, include: { paddyGrade: true } }),
      this.prisma.inventoryBalance.findMany({
        where: { locationType: 'EXTERNAL', ...(relevantShipmentIds ? { locationId: { in: relevantShipmentIds } } : {}) },
      }),
      this.prisma.inventoryBalance.findMany({ where: { locationType: 'WAREHOUSE', ...warehouseWhere }, include: { product: true, packagingSize: true } }),
      this.prisma.inventoryBalance.findMany({
        where: { locationType: 'MILLING_CENTER', ...(relevantMillingCenterIds ? { locationId: { in: relevantMillingCenterIds } } : {}) },
        include: { product: true },
      }),
      this.prisma.stockReservation.findMany({
        where: { status: 'ACTIVE', ...(isGlobal ? {} : { warehouseId: { in: warehouseScope.ids } }) },
        include: { product: true, packagingSize: true },
      }),
    ]);

    // Paddy - Section 16's exact breakdown, not just a single "total".
    const paddy = {
      farmKg: farmBalances.reduce((sum, b) => sum + Number(b.quantityKg), 0),
      farmBags: farmBalances.reduce((sum, b) => sum + b.bagCount, 0),
      warehouseKg: warehouseBalances.filter((b) => !b.productId).reduce((sum, b) => sum + Number(b.quantityKg), 0),
      inTransitKg: transitBalances.reduce((sum, b) => sum + Number(b.quantityKg), 0),
      inTransitBags: transitBalances.reduce((sum, b) => sum + b.bagCount, 0),
      atMillingKg: millingBalances.filter((b) => !b.productId).reduce((sum, b) => sum + Number(b.quantityKg), 0),
      byFarm: farmBalances.map((b) => ({ gradeLabel: b.paddyGrade?.label ?? 'Unspecified', kg: Number(b.quantityKg), bags: b.bagCount })),
    };

    // Finished rice - Section 18's exact table: available, reserved,
    // in-transit, and total, per package size. "Available" here means
    // available-to-sell (physical minus reserved), matching the
    // system's own real sales-approval math, not just raw physical
    // stock - showing raw physical would silently contradict what the
    // Sales page actually enforces when approving an order.
    const bySize = new Map<string, { label: string; availableBags: number; availableKg: number; reservedBags: number; reservedKg: number; sizeKg: number }>();
    for (const b of warehouseBalances) {
      if (!b.productId || !b.packagingSizeId || !b.packagingSize) continue;
      const key = b.packagingSizeId;
      const entry = bySize.get(key) ?? { label: b.packagingSize.label, availableBags: 0, availableKg: 0, reservedBags: 0, reservedKg: 0, sizeKg: Number(b.packagingSize.sizeKg) };
      entry.availableBags += b.bagCount;
      entry.availableKg += Number(b.quantityKg);
      bySize.set(key, entry);
    }
    for (const r of activeReservations) {
      const key = r.packagingSizeId;
      const entry = bySize.get(key) ?? { label: r.packagingSize.label, availableBags: 0, availableKg: 0, reservedBags: 0, reservedKg: 0, sizeKg: Number(r.packagingSize.sizeKg) };
      entry.reservedBags += r.bagCount;
      entry.reservedKg += Number(r.totalKg);
      bySize.set(key, entry);
    }
    const finishedRice = Array.from(bySize.values())
      .sort((a, b) => a.sizeKg - b.sizeKg)
      .map((e) => ({
        label: e.label,
        availableBags: Math.max(e.availableBags - e.reservedBags, 0),
        availableKg: Math.max(e.availableKg - e.reservedKg, 0),
        reservedBags: e.reservedBags,
        reservedKg: e.reservedKg,
        totalBags: e.availableBags,
        totalKg: e.availableKg,
      }));

    // Milling byproducts - Rice Hull and Broken Rice are real,
    // dynamically-created Products (see ProductionRecordsService's
    // upsertByproduct), tracked as an actual InventoryBalance at the
    // milling center, not just a number sitting on the production
    // record itself. Surfaced here so "available rice hulls" is a
    // real, live balance, not something inferred from historical
    // records after the fact.
    const riceHullBalance = millingBalances.filter((b) => b.product?.name === 'Rice Hull').reduce((sum, b) => sum + Number(b.quantityKg), 0);
    const brokenRiceBalance = millingBalances.filter((b) => b.product?.name === 'Broken Rice').reduce((sum, b) => sum + Number(b.quantityKg), 0);

    return { paddy, finishedRice, riceHullKg: riceHullBalance, brokenRiceKg: brokenRiceBalance };
  }

  /** Kept for the older, simpler farm/warehouse/milling grouped view
   * still used elsewhere (the Inventory page's location-by-location
   * section) - the method above is the new, spec-accurate company
   * summary; this one answers "what does Farm B actually have sitting
   * there" rather than "what's our real available-to-sell position." */
  async inventoryByLocation(actor: AuthenticatedUser) {
    const farmScope = scopedLocationIds(actor, 'FARM');
    const warehouseScope = scopedLocationIds(actor, 'WAREHOUSE');
    const isGlobal = farmScope.isGlobal; // same value regardless of scope type passed in

    const locationFilter: Record<string, unknown>[] = [];
    if (isGlobal) {
      locationFilter.push({ locationType: { in: ['FARM', 'WAREHOUSE', 'MILLING_CENTER'] } });
    } else {
      if (farmScope.ids.length) locationFilter.push({ locationType: 'FARM', locationId: { in: farmScope.ids } });
      if (warehouseScope.ids.length) {
        // A warehouse-scoped caller also sees that warehouse's own
        // milling centers - the milling side of their own site is part
        // of "their" inventory, not a different location's.
        const centers = await this.prisma.millingCenter.findMany({ where: { warehouseId: { in: warehouseScope.ids } } });
        locationFilter.push({ locationType: 'WAREHOUSE', locationId: { in: warehouseScope.ids } });
        if (centers.length) locationFilter.push({ locationType: 'MILLING_CENTER', locationId: { in: centers.map((c) => c.id) } });
      }
      if (locationFilter.length === 0) return { farms: [], warehouses: [], millingCenters: [] };
    }

    const balances = await this.prisma.inventoryBalance.findMany({
      where: { AND: [{ OR: [{ quantityKg: { gt: 0 } }, { bagCount: { gt: 0 } }] }, { OR: locationFilter }] },
      include: { paddyGrade: true, product: true, packagingSize: true },
      orderBy: { locationType: 'asc' },
    });

    const farmIds = balances.filter((b) => b.locationType === 'FARM').map((b) => b.locationId);
    const warehouseIds = balances.filter((b) => b.locationType === 'WAREHOUSE').map((b) => b.locationId);
    const millingCenterIds = balances.filter((b) => b.locationType === 'MILLING_CENTER').map((b) => b.locationId);

    const [farms, warehouses, millingCenters] = await Promise.all([
      // Always queried, even with an empty id list - `{ in: [] }`
      // already correctly returns zero rows in Prisma, and skipping the
      // call via a ternary with a bare `[]` fallback is exactly what
      // produced a real, deploy-blocking type error: TypeScript
      // couldn't unify the Prisma result type with a bare empty-array
      // literal and collapsed these to `never[]`, so every .find() call
      // below failed to compile once run against the actual generated
      // Prisma client (something this sandbox can't produce, which is
      // why it wasn't caught until the real build).
      this.prisma.farm.findMany({ where: { id: { in: farmIds } } }),
      this.prisma.warehouse.findMany({ where: { id: { in: warehouseIds } } }),
      this.prisma.millingCenter.findMany({ where: { id: { in: millingCenterIds } } }),
    ]);
    const nameFor = (locationType: string, locationId: string): string => {
      if (locationType === 'FARM') return farms.find((f) => f.id === locationId)?.name ?? 'Unknown farm';
      if (locationType === 'WAREHOUSE') return warehouses.find((w) => w.id === locationId)?.name ?? 'Unknown warehouse';
      return millingCenters.find((m) => m.id === locationId)?.name ?? 'Unknown milling center';
    };

    const rows = balances.map((b) => ({
      locationType: b.locationType,
      locationName: nameFor(b.locationType, b.locationId),
      itemLabel: b.paddyGrade?.label ?? (b.product ? `${b.product.name}${b.packagingSize ? ` (${b.packagingSize.label})` : ''}` : 'Unspecified'),
      quantityKg: Number(b.quantityKg),
      bagCount: b.bagCount,
    }));

    return {
      farms: rows.filter((r) => r.locationType === 'FARM'),
      warehouses: rows.filter((r) => r.locationType === 'WAREHOUSE'),
      millingCenters: rows.filter((r) => r.locationType === 'MILLING_CENTER'),
    };
  }

  /** The three-section Warehouse Manager overview: paddy (received,
   * available, in transit) by grade in bags, milling oversight in
   * bags, and packaged rice by size in KG - each section genuinely
   * distinct in what it measures and what unit it uses, matching the
   * real business distinction between raw paddy (bags) and finished,
   * packaged product (KG by pack size).
   *
   * Also serves Warehouse Supervisor's centralized view: with no
   * warehouseId given and a GLOBAL scope, this aggregates across every
   * warehouse; with a warehouseId given, it drills into just that one -
   * the same "aggregate then drill down" shape already proven correct
   * for Farm Supervisor's own farm-by-farm view. */
  async warehouseOverview(actor: AuthenticatedUser, warehouseId?: string) {
    const warehouseScope = scopedLocationIds(actor, 'WAREHOUSE');

    let targetWarehouseIds: string[];
    if (warehouseId) {
      assertScope(actor, 'WAREHOUSE', warehouseId, 'this warehouse');
      targetWarehouseIds = [warehouseId];
    } else if (warehouseScope.isGlobal) {
      const allWarehouses = await this.prisma.warehouse.findMany({ where: { isActive: true }, select: { id: true } });
      targetWarehouseIds = allWarehouses.map((w) => w.id);
    } else {
      targetWarehouseIds = warehouseScope.ids;
    }
    if (targetWarehouseIds.length === 0) {
      return { paddy: { received: [], available: [], inTransit: [] }, atMilling: [], packagedRice: [] };
    }

    const aggregateByGrade = (rows: { paddyGrade: { label: string } | null; quantityKg: unknown; bagCount: number | null }[]) => {
      const map = new Map<string, { gradeLabel: string; bags: number; kg: number }>();
      for (const row of rows) {
        const label = row.paddyGrade?.label ?? 'Unspecified';
        const existing = map.get(label) ?? { gradeLabel: label, bags: 0, kg: 0 };
        existing.bags += row.bagCount ?? 0;
        existing.kg += Number(row.quantityKg);
        map.set(label, existing);
      }
      return Array.from(map.values());
    };

    // 1. Received - historical, cumulative, from the transaction log,
    // not the current balance - "how much have we ever taken in,"
    // which keeps decreasing as stock is milled or sold, unlike this
    // figure.
    const receivedTxns = await this.prisma.inventoryTransaction.findMany({
      where: { type: 'PADDY_RECEIVED_AT_WAREHOUSE', destLocationType: LocationType.WAREHOUSE, destLocationId: { in: targetWarehouseIds } },
      include: { paddyGrade: true },
    });

    // 2. Available - the current balance sitting at the warehouse as
    // raw paddy (paddyGradeId set, as opposed to packaged product).
    const availableBalances = await this.prisma.inventoryBalance.findMany({
      where: { locationType: LocationType.WAREHOUSE, locationId: { in: targetWarehouseIds }, paddyGradeId: { not: null } },
      include: { paddyGrade: true },
    });

    // 3. In transit - shipments heading to these warehouses that
    // haven't been received yet, resolved through Shipment since
    // EXTERNAL balances are keyed by shipment id, not warehouse id -
    // the same real lesson already learned about location-keyed data
    // needing a join, not a direct id-in-list filter.
    const incomingShipments = await this.prisma.shipment.findMany({
      where: { warehouseId: { in: targetWarehouseIds }, receivedAt: null },
      select: { id: true },
    });
    const inTransitBalances = incomingShipments.length === 0 ? [] : await this.prisma.inventoryBalance.findMany({
      where: { locationType: LocationType.EXTERNAL, locationId: { in: incomingShipments.map((s) => s.id) } },
      include: { paddyGrade: true },
    });

    // 4. At milling - raw paddy sent from these warehouses to their
    // own milling centers, not yet processed into rice.
    const millingCenters = await this.prisma.millingCenter.findMany({
      where: { warehouseId: { in: targetWarehouseIds } },
      select: { id: true },
    });
    const millingBalances = millingCenters.length === 0 ? [] : await this.prisma.inventoryBalance.findMany({
      where: { locationType: LocationType.MILLING_CENTER, locationId: { in: millingCenters.map((m) => m.id) }, paddyGradeId: { not: null } },
      include: { paddyGrade: true },
    });

    // 5. Packaged rice - the finished product actually in KG, by real
    // pack size (1KG, 2KG, 5KG, 10KG, 25KG, 50KG), unlike raw paddy
    // which is always described in bags throughout this app.
    const packagedBalances = await this.prisma.inventoryBalance.findMany({
      where: { locationType: LocationType.WAREHOUSE, locationId: { in: targetWarehouseIds }, productId: { not: null } },
      include: { product: true, packagingSize: true },
    });
    const packagedMap = new Map<string, { label: string; kg: number; bags: number }>();
    for (const row of packagedBalances) {
      const label = row.packagingSize?.label ?? 'Unspecified size';
      const existing = packagedMap.get(label) ?? { label, kg: 0, bags: 0 };
      existing.kg += Number(row.quantityKg);
      existing.bags += row.bagCount ?? 0;
      packagedMap.set(label, existing);
    }

    return {
      paddy: {
        received: aggregateByGrade(receivedTxns),
        available: aggregateByGrade(availableBalances),
        inTransit: aggregateByGrade(inTransitBalances),
      },
      atMilling: aggregateByGrade(millingBalances),
      packagedRice: Array.from(packagedMap.values()),
    };
  }

  /** The Farm Director's equivalent of warehouseOverview() - built the
   * same way, deliberately not sharing warehouse figures at all. A
   * farm's own jurisdiction ends at dispatch: paddy received and
   * currently on-hand at the farm, and what's been dispatched but not
   * yet received at a warehouse (resolved through Shipment, same
   * lesson as warehouseOverview's in-transit figure - EXTERNAL
   * balances are keyed by shipment id, not farm id). */
  async farmOverview(actor: AuthenticatedUser, farmId?: string) {
    const farmScope = scopedLocationIds(actor, 'FARM');

    let targetFarmIds: string[];
    if (farmId) {
      assertScope(actor, 'FARM', farmId, 'this farm');
      targetFarmIds = [farmId];
    } else if (farmScope.isGlobal) {
      const allFarms = await this.prisma.farm.findMany({ where: { isActive: true }, select: { id: true } });
      targetFarmIds = allFarms.map((f) => f.id);
    } else {
      targetFarmIds = farmScope.ids;
    }
    if (targetFarmIds.length === 0) {
      return { paddy: { received: [], available: [], dispatched: [] } };
    }

    const aggregateByGrade = (rows: { paddyGrade: { label: string } | null; quantityKg: unknown; bagCount: number | null }[]) => {
      const map = new Map<string, { gradeLabel: string; bags: number; kg: number }>();
      for (const row of rows) {
        const label = row.paddyGrade?.label ?? 'Unspecified';
        const existing = map.get(label) ?? { gradeLabel: label, bags: 0, kg: 0 };
        existing.bags += row.bagCount ?? 0;
        existing.kg += Number(row.quantityKg);
        map.set(label, existing);
      }
      return Array.from(map.values());
    };

    // 1. Received - historical, cumulative, every approved paddy
    // intake logged at these farms, regardless of what's since been
    // dispatched onward. Confirmed directly against where this
    // transaction is actually written (paddy-entries.service.ts) - it
    // records as PADDY_APPROVED, not a separate PADDY_RECEIVED type
    // that a farm overview might naively assume exists.
    const receivedTxns = await this.prisma.inventoryTransaction.findMany({
      where: { type: 'PADDY_APPROVED', destLocationType: LocationType.FARM, destLocationId: { in: targetFarmIds } },
      include: { paddyGrade: true },
    });

    // 2. Available - the current balance actually sitting at the farm.
    const availableBalances = await this.prisma.inventoryBalance.findMany({
      where: { locationType: LocationType.FARM, locationId: { in: targetFarmIds }, paddyGradeId: { not: null } },
      include: { paddyGrade: true },
    });

    // 3. Dispatched / in transit - shipments from these farms not yet
    // received at their destination warehouse.
    const outgoingShipments = await this.prisma.shipment.findMany({
      where: { farmId: { in: targetFarmIds }, receivedAt: null },
      select: { id: true },
    });
    const dispatchedBalances = outgoingShipments.length === 0 ? [] : await this.prisma.inventoryBalance.findMany({
      where: { locationType: LocationType.EXTERNAL, locationId: { in: outgoingShipments.map((s) => s.id) } },
      include: { paddyGrade: true },
    });

    return {
      paddy: {
        received: aggregateByGrade(receivedTxns),
        available: aggregateByGrade(availableBalances),
        dispatched: aggregateByGrade(dispatchedBalances),
      },
    };
  }

  /** Operations Manager's own centralized overview - deliberately not
   * a repeat of Warehouse Supervisor's "at milling" (paddy waiting to
   * be processed) or "packaged rice" (finished product) figures,
   * which are inventory balances, not production activity. This is
   * the actual milling process itself this month: paddy processed,
   * and what it turned into - recovered rice, broken rice, rice hull -
   * plus the real recovery rate and energy used, the same real data
   * this session's yield-prediction feature will be built on. */
  async productionOverview(actor: AuthenticatedUser, millingCenterId?: string) {
    const millingScope = scopedLocationIds(actor, 'MILLING_CENTER');

    let targetMillingCenterIds: string[];
    if (millingCenterId) {
      assertScope(actor, 'MILLING_CENTER', millingCenterId, 'this milling center');
      targetMillingCenterIds = [millingCenterId];
    } else if (millingScope.isGlobal) {
      const allCenters = await this.prisma.millingCenter.findMany({ where: { isActive: true }, select: { id: true } });
      targetMillingCenterIds = allCenters.map((c) => c.id);
    } else {
      targetMillingCenterIds = millingScope.ids;
    }
    if (targetMillingCenterIds.length === 0) {
      return { processed: [], recoveredRiceKg: 0, brokenRiceKg: 0, riceHullKg: 0, recoveryPercent: 0, energyConsumedKwh: 0 };
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const records = await this.prisma.productionRecord.findMany({
      where: {
        millingCenterId: { in: targetMillingCenterIds },
        status: { in: ['APPROVED', 'SUBMITTED'] },
        date: { gte: monthStart },
      },
      include: { paddyGrade: true },
    });

    const processedMap = new Map<string, { gradeLabel: string; bags: number; kg: number }>();
    let recoveredRiceKg = 0;
    let brokenRiceKg = 0;
    let riceHullKg = 0;
    let energyConsumedKwh = 0;
    let totalPaddyKg = 0;

    for (const r of records) {
      const label = r.paddyGrade?.label ?? 'Unspecified';
      const existing = processedMap.get(label) ?? { gradeLabel: label, bags: 0, kg: 0 };
      existing.bags += r.paddyProcessedBags ?? 0;
      existing.kg += Number(r.paddyProcessedKg);
      processedMap.set(label, existing);

      totalPaddyKg += Number(r.paddyProcessedKg);
      recoveredRiceKg += Number(r.recoveredRiceKg);
      brokenRiceKg += Number(r.brokenRiceKg);
      riceHullKg += Number(r.riceHullKg);
      energyConsumedKwh += Number(r.energyConsumptionKwh ?? 0);
    }

    return {
      processed: Array.from(processedMap.values()),
      recoveredRiceKg,
      brokenRiceKg,
      riceHullKg,
      // Recomputed from this batch of records' totals rather than
      // averaging each record's own stored recoveryPercent - avoids a
      // small run skewing the average as much as a large one would.
      recoveryPercent: totalPaddyKg > 0 ? (recoveredRiceKg / totalPaddyKg) * 100 : 0,
      energyConsumedKwh,
    };
  }
}
