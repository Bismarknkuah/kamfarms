import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InsightsService } from '../insights/insights.service';
import { PERMISSIONS } from '../common/constants/permissions';
import { scopedLocationIds } from '../common/utils/scope.util';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

/**
 * The reports each role may download. A report appears for a person only if their role holds BOTH the right to
 * export reports and the permission that covers that data, and what it contains is cut down to their own
 * jurisdiction (the farms, warehouses and milling centers they are assigned to) on the server, never on the screen.
 */
export type ReportRow = Record<string, string | number | boolean | null>;
type Scope = { isGlobal: boolean; ids: string[] };
type Jurisdiction = 'company' | 'farms' | 'warehouses' | 'farms-and-warehouses' | 'milling';

interface Ctx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  actor: AuthenticatedUser;
  from?: Date;
  to?: Date;
  farm: Scope;
  warehouse: Scope;
  /** null means every milling center */
  centers: string[] | null;
  insights?: InsightsService;
}

export interface ReportDef {
  id: string;
  title: string;
  description: string;
  group: string;
  anyOf: string[];
  dated: boolean;
  jurisdiction: Jurisdiction;
  build: (c: Ctx) => Promise<ReportRow[]>;
}

export const ROW_LIMIT = 20_000;
export const PDF_ROW_LIMIT = 2_000;

const day = (d: unknown) => (d ? new Date(d as string).toISOString().slice(0, 10) : null);
const moment = (d: unknown) => (d ? new Date(d as string).toISOString().replace('T', ' ').slice(0, 16) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;
const dated = (c: Ctx, field: string) => (c.from || c.to ? { [field]: { ...(c.from ? { gte: c.from } : {}), ...(c.to ? { lte: c.to } : {}) } } : {});
const inIds = (ids: string[]) => ({ in: ids });
const orScopes = (parts: Record<string, unknown>[]) => (parts.length === 0 ? { id: { in: [] as string[] } } : parts.length === 1 ? parts[0] : { OR: parts });

/**
 * A report's `anyOf` is exactly the permissions on the app's own list screen for the same data (a test reads those
 * screens and fails if the two ever differ), so a role can download what it can already open, and no more.
 */
export const REPORTS: ReportDef[] = [
  {
    id: 'paddy-intake', title: 'Paddy intake', group: 'Farms', anyOf: [PERMISSIONS.FARM_INVENTORY_VIEW], dated: true, jurisdiction: 'farms',
    description: 'Every paddy entry: farm, grade, bags, weight, moisture and whether it was approved.',
    async build(c) {
      const rows = await c.db.paddyEntry.findMany({
        where: { ...(c.farm.isGlobal ? {} : { farmId: inIds(c.farm.ids) }), ...dated(c, 'entryDate') }, orderBy: { entryDate: 'desc' }, take: ROW_LIMIT,
        select: { entryNumber: true, entryDate: true, farm: { select: { name: true } }, paddyGrade: { select: { label: true } }, bagCount: true, weightKg: true, weightEstimated: true, moisturePercent: true, status: true, rejectionReason: true },
      });
      return rows.map((r: any): ReportRow => ({ 'Entry number': r.entryNumber, Date: day(r.entryDate), Farm: r.farm?.name ?? null, Grade: r.paddyGrade?.label ?? null, Bags: r.bagCount, 'Weight (kg)': num(r.weightKg), 'Weight is an estimate': !!r.weightEstimated, 'Moisture (%)': num(r.moisturePercent), Status: r.status, 'Rejection reason': r.rejectionReason ?? null }));
    },
  },
  {
    id: 'deliveries', title: 'Deliveries and receipts', group: 'Warehouses', anyOf: [PERMISSIONS.WAREHOUSE_INVENTORY_VIEW, PERMISSIONS.DELIVERY_CREATE, PERMISSIONS.DELIVERY_APPROVE], dated: true, jurisdiction: 'farms-and-warehouses',
    description: 'Paddy sent from farms to warehouses: what was expected, what was received, and the difference.',
    async build(c) {
      const scope = c.farm.isGlobal ? {} : orScopes([...(c.farm.ids.length ? [{ farmId: inIds(c.farm.ids) }] : []), ...(c.warehouse.ids.length ? [{ warehouseId: inIds(c.warehouse.ids) }] : [])]);
      const rows = await c.db.shipment.findMany({
        where: { ...scope, ...dated(c, 'departedAt') }, orderBy: { departedAt: 'desc' }, take: ROW_LIMIT,
        select: { shipmentNumber: true, farm: { select: { name: true } }, warehouse: { select: { name: true } }, paddyGrade: { select: { label: true } }, expectedBags: true, receivedBags: true, expectedKg: true, receivedKg: true, varianceKg: true, varianceRequiresApproval: true, departedAt: true, receivedAt: true },
      });
      return rows.map((r: any): ReportRow => ({ Shipment: r.shipmentNumber, From: r.farm?.name ?? null, To: r.warehouse?.name ?? null, Grade: r.paddyGrade?.label ?? null, 'Bags expected': r.expectedBags, 'Bags received': r.receivedBags ?? null, 'Kg expected': num(r.expectedKg), 'Kg received': num(r.receivedKg), 'Difference (kg)': num(r.varianceKg), 'Needed approval': !!r.varianceRequiresApproval, Sent: day(r.departedAt), Received: day(r.receivedAt) }));
    },
  },
  {
    id: 'stock-corrections', title: 'Stock corrections', group: 'Warehouses', anyOf: [PERMISSIONS.FARM_INVENTORY_VIEW, PERMISSIONS.WAREHOUSE_INVENTORY_VIEW, PERMISSIONS.INVENTORY_ADJUST], dated: true, jurisdiction: 'farms-and-warehouses',
    description: 'Every request to change a stock count, with the reason given and whether it was approved.',
    async build(c) {
      const scope = c.farm.isGlobal ? {} : orScopes([
        ...(c.farm.ids.length ? [{ locationType: 'FARM', locationId: inIds(c.farm.ids) }] : []),
        ...(c.warehouse.ids.length ? [{ locationType: 'WAREHOUSE', locationId: inIds(c.warehouse.ids) }] : []),
        ...(c.centers && c.centers.length ? [{ locationType: 'MILLING_CENTER', locationId: inIds(c.centers) }] : []),
      ]);
      const [rows, farms, warehouses, centers] = await Promise.all([
        c.db.inventoryAdjustment.findMany({ where: { ...scope, ...dated(c, 'requestedAt') }, orderBy: { requestedAt: 'desc' }, take: ROW_LIMIT, select: { adjustmentNumber: true, locationType: true, locationId: true, adjustmentBags: true, adjustmentKg: true, reason: true, status: true, requestedAt: true, approvedAt: true, rejectionReason: true } }),
        c.db.farm.findMany({ select: { id: true, name: true } }), c.db.warehouse.findMany({ select: { id: true, name: true } }), c.db.millingCenter.findMany({ select: { id: true, name: true } }),
      ]);
      const names = new Map<string, string>();
      for (const x of [...farms, ...warehouses, ...centers]) names.set(x.id, x.name);
      return rows.map((r: any): ReportRow => ({ Correction: r.adjustmentNumber, Place: names.get(r.locationId) ?? r.locationType, Bags: r.adjustmentBags, 'Kilograms': num(r.adjustmentKg), Reason: r.reason, Status: r.status, Requested: day(r.requestedAt), Decided: day(r.approvedAt), 'Rejection reason': r.rejectionReason ?? null }));
    },
  },
  {
    id: 'production-runs', title: 'Milling runs', group: 'Milling', anyOf: [PERMISSIONS.MILLING_VIEW], dated: true, jurisdiction: 'milling',
    description: 'Each milling run: paddy in, rice out, the recovery rate and power used.',
    async build(c) {
      const rows = await c.db.productionRecord.findMany({
        where: { ...(c.centers === null ? {} : { millingCenterId: inIds(c.centers) }), ...dated(c, 'date') }, orderBy: { date: 'desc' }, take: ROW_LIMIT,
        select: { recordNumber: true, date: true, millingCenter: { select: { name: true } }, paddyGrade: { select: { label: true } }, paddyProcessedKg: true, recoveredRiceKg: true, energyConsumptionKwh: true, status: true },
      });
      return rows.map((r: any): ReportRow => {
        const paddy = Number(r.paddyProcessedKg); const rice = Number(r.recoveredRiceKg);
        return { Run: r.recordNumber, Date: day(r.date), 'Milling center': r.millingCenter?.name ?? null, Grade: r.paddyGrade?.label ?? null, 'Paddy in (kg)': paddy, 'Rice out (kg)': rice, 'Recovery (%)': paddy > 0 ? round2((rice / paddy) * 100) : null, 'Power (kWh)': num(r.energyConsumptionKwh), Status: r.status };
      });
    },
  },
  {
    id: 'machine-power', title: 'Machine power readings', group: 'Milling', anyOf: [PERMISSIONS.MACHINE_VIEW], dated: true, jurisdiction: 'milling',
    description: 'Power meter readings for each machine, with any reading flagged as unusual.',
    async build(c) {
      const rows = await c.db.meterReading.findMany({
        where: { ...(c.centers === null ? {} : { machine: { millingCenterId: inIds(c.centers) } }), ...dated(c, 'date') }, orderBy: { date: 'desc' }, take: ROW_LIMIT,
        select: { date: true, machine: { select: { machineName: true, machineCode: true, millingCenter: { select: { name: true } } } }, openingReading: true, closingReading: true, consumption: true, unit: true, isAnomalous: true, anomalyReason: true },
      });
      return rows.map((r: any): ReportRow => ({ Date: day(r.date), 'Milling center': r.machine?.millingCenter?.name ?? null, Machine: r.machine ? `${r.machine.machineName} (${r.machine.machineCode})` : null, Opening: num(r.openingReading), Closing: num(r.closingReading), Used: num(r.consumption), Unit: r.unit, Unusual: !!r.isAnomalous, 'Why flagged': r.anomalyReason ?? null }));
    },
  },
  {
    id: 'expenses', title: 'Expenses', group: 'Finance', anyOf: [PERMISSIONS.FINANCE_VIEW, PERMISSIONS.EXPENSE_CREATE, PERMISSIONS.EXPENSE_VIEW], dated: true, jurisdiction: 'farms-and-warehouses',
    description: 'Every expense with its category, amount and approval status. Receipt photos are not included.',
    async build(c) {
      const scope = c.farm.isGlobal ? {} : orScopes([...(c.farm.ids.length ? [{ farmId: inIds(c.farm.ids) }] : []), ...(c.warehouse.ids.length ? [{ warehouseId: inIds(c.warehouse.ids) }] : [])]);
      const rows = await c.db.expense.findMany({
        where: { ...scope, ...dated(c, 'date') }, orderBy: { date: 'desc' }, take: ROW_LIMIT,
        select: { expenseNumber: true, date: true, category: { select: { name: true } }, amount: true, farm: { select: { name: true } }, warehouse: { select: { name: true } }, paymentMethod: true, status: true, itemDescription: true },
      });
      return rows.map((r: any): ReportRow => ({ Expense: r.expenseNumber, Date: day(r.date), Category: r.category?.name ?? null, 'Amount (GHS)': num(r.amount), Place: r.farm?.name ?? r.warehouse?.name ?? 'Head office', 'Paid by': r.paymentMethod ?? null, Status: r.status, Description: r.itemDescription ?? null }));
    },
  },
  {
    id: 'audit-log', title: 'Audit log', group: 'Administration', anyOf: [PERMISSIONS.AUDIT_VIEW], dated: true, jurisdiction: 'company',
    description: 'Who did what and when, across the whole system.',
    async build(c) {
      const rows = await c.db.auditLog.findMany({ where: { ...dated(c, 'createdAt') }, orderBy: { createdAt: 'desc' }, take: ROW_LIMIT, select: { createdAt: true, user: { select: { firstName: true, lastName: true, email: true } }, action: true, entity: true, entityId: true, reason: true } });
      return rows.map((r: any): ReportRow => ({ When: moment(r.createdAt), Who: r.user ? `${r.user.firstName} ${r.user.lastName}` : 'The system', Email: r.user?.email ?? null, Action: r.action, Item: r.entity, 'Item id': r.entityId ?? null, Reason: r.reason ?? null }));
    },
  },
  {
    id: 'users-and-access', title: 'People and access', group: 'Administration', anyOf: [PERMISSIONS.USERS_MANAGE], dated: false, jurisdiction: 'company',
    description: 'Every account with its roles, status and when the person last signed in.',
    async build(c) {
      const rows = await c.db.user.findMany({ where: { deletedAt: null }, orderBy: { firstName: 'asc' }, take: ROW_LIMIT, select: { firstName: true, lastName: true, email: true, status: true, mustChangePassword: true, lastLoginAt: true, createdAt: true, roles: { select: { role: { select: { name: true } } } } } });
      return rows.map((r: any): ReportRow => ({ Name: `${r.firstName} ${r.lastName}`, Email: r.email, Roles: (r.roles ?? []).map((x: any) => x.role?.name).filter(Boolean).join(', '), Status: r.status, 'On a temporary password': !!r.mustChangePassword, 'Last signed in': moment(r.lastLoginAt), Created: day(r.createdAt) }));
    },
  },
  {
    id: 'watchlist', title: 'Watchlist flags', group: 'Oversight', anyOf: [PERMISSIONS.INSIGHTS_VIEW], dated: false, jurisdiction: 'company',
    description: 'Everything the Watchlist currently flags, with what each place\'s history predicts and what was recorded.',
    async build(c) {
      if (!c.insights) return [];
      const w = await c.insights.watchlist();
      return w.signals.map((s): ReportRow => ({ Level: s.severity === 'HIGH' ? 'Look into this' : s.severity === 'MEDIUM' ? 'Keep an eye on' : 'For information', Place: s.locationName, Finding: s.title, Detail: s.detail, 'History predicts': s.expected, Recorded: s.actual, Records: s.evidence.join('; '), 'What to check': s.whatToCheck }));
    },
  },
];

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

@Injectable()
export class ReportCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly insights?: InsightsService,
  ) {}

  private allowed(def: ReportDef, actor: AuthenticatedUser) {
    return actor.permissionCodes.has(PERMISSIONS.REPORTS_EXPORT) && def.anyOf.some((p) => actor.permissionCodes.has(p));
  }

  /** What "your jurisdiction" means for this person and this report, in words. */
  private jurisdictionText(def: ReportDef, actor: AuthenticatedUser): string {
    if (def.jurisdiction === 'company') return 'Company-wide';
    const farm = scopedLocationIds(actor, 'FARM');
    if (farm.isGlobal) return 'Everything in the company';
    const wh = scopedLocationIds(actor, 'WAREHOUSE');
    const mc = scopedLocationIds(actor, 'MILLING_CENTER');
    const parts: string[] = [];
    if ((def.jurisdiction === 'farms' || def.jurisdiction === 'farms-and-warehouses') && farm.ids.length) parts.push(plural(farm.ids.length, 'farm'));
    if ((def.jurisdiction === 'warehouses' || def.jurisdiction === 'farms-and-warehouses' || def.jurisdiction === 'milling') && wh.ids.length) parts.push(plural(wh.ids.length, 'warehouse'));
    if (def.jurisdiction === 'milling' && mc.ids.length) parts.push(plural(mc.ids.length, 'milling center'));
    return parts.length > 0 ? `Only your ${parts.join(' and ')}` : 'None yet: you are not assigned to any place for this report';
  }

  list(actor: AuthenticatedUser) {
    return REPORTS.filter((d) => this.allowed(d, actor)).map((d) => ({ id: d.id, title: d.title, description: d.description, group: d.group, dated: d.dated, jurisdiction: this.jurisdictionText(d, actor) }));
  }

  private async centerIds(actor: AuthenticatedUser): Promise<string[] | null> {
    const mc = scopedLocationIds(actor, 'MILLING_CENTER');
    if (mc.isGlobal) return null;
    const wh = scopedLocationIds(actor, 'WAREHOUSE');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = this.prisma as any;
    const viaWarehouse: string[] = wh.ids.length ? (await db.millingCenter.findMany({ where: { warehouseId: inIds(wh.ids) }, select: { id: true } })).map((m: { id: string }) => m.id) : [];
    return Array.from(new Set([...mc.ids, ...viaWarehouse]));
  }

  private parseDay(value: string | undefined, endOfDay: boolean): Date | undefined {
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Dates must look like 2026-09-30.');
    const d = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Dates must look like 2026-09-30.');
    return d;
  }

  async build(id: string, actor: AuthenticatedUser, q: { from?: string; to?: string; format?: string }) {
    const def = REPORTS.find((r) => r.id === id);
    if (!def) throw new NotFoundException('That report does not exist.');
    if (!this.allowed(def, actor)) throw new ForbiddenException('Your role does not include this report.');
    const from = this.parseDay(q.from, false);
    const to = this.parseDay(q.to, true);
    if (from && to && from > to) throw new BadRequestException('The start date must not be after the end date.');

    const rows = await def.build({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: this.prisma as any, actor, from, to,
      farm: scopedLocationIds(actor, 'FARM'), warehouse: scopedLocationIds(actor, 'WAREHOUSE'), centers: await this.centerIds(actor), insights: this.insights,
    });
    if (q.format === 'pdf' && rows.length > PDF_ROW_LIMIT) {
      throw new BadRequestException(`This report has ${rows.length} rows, which is too many for a PDF. Download it as Excel or CSV, or choose a shorter period.`);
    }
    return {
      title: def.title,
      filenameBase: `${def.id}-${new Date().toISOString().slice(0, 10)}`,
      // an empty file is confusing, so say why it is empty
      rows: rows.length > 0 ? rows : [{ Note: 'No records match your access and the dates chosen.' }],
    };
  }
}
