import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { ReceivablesService } from '../finance/receivables.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { outputsFromEnergy, outputsFromPaddy, outputsFromRice } from './ai-yield.util';
import type { Outputs } from './ai-yield.util';
import { PERMISSIONS } from '../common/constants/permissions';
import { AiInsightsService } from './ai-insights.service';
import { AiPredictionsService } from './ai-predictions.service';
import { Jurisdiction, hasPermission, jurisdictionOf, productionScope } from './jurisdiction';
import { PERIOD_KEYS, PeriodKey, resolvePeriod } from './ai-periods.util';
import { HELP, searchHelp } from './ai-help';
import { fmtBags } from './ai-learning.util';

/**
 * The lookups the assistant answers from, whether the built-in answerer or Claude is asking. Each one checks the person's
 * permission and applies their jurisdiction ITSELF, on the server: whoever (or whatever) asks, it can only return what
 * the person could already open elsewhere in the system, inside their own places. A tool never returns anything it was
 * not allowed to, so a clever question cannot get round a rule.
 */
export interface ToolResult {
  ok: boolean;
  /** Plain words, ready to read out. */
  summary: string;
  data?: unknown;
  source: string;
  period: string;
  confidencePercent: number;
  /** True when the person's role or jurisdiction does not allow this. */
  denied?: boolean;
}
export interface ToolDef { name: string; label: string; description: string; input_schema: Record<string, unknown> }

const periodProp = { type: 'string', enum: PERIOD_KEYS, description: 'The period asked about. Use last_30_days when none is named.' };
const centerProp = { type: 'string', description: 'The name or code of one milling center, when the question names one.' };

export const TOOL_DEFS: ToolDef[] = [
  { name: 'get_my_access', label: 'Your access', description: 'Who is asking, which places they may see, and what can be looked up for them. Use for "what can I see?" or "who am I?".', input_schema: { type: 'object', properties: {} } },
  { name: 'production_summary', label: 'Production summary', description: 'Approved milling runs in a period: paddy milled, packaged rice, broken rice, hull and waste (kg and bags), power used and recovery, by milling center. Use for any question about production or output.', input_schema: { type: 'object', properties: { period: periodProp, milling_center: centerProp } } },
  { name: 'power_yield', label: 'What power gives', description: 'What 1 kWh of power turns into: kilograms and bags of packaged rice, broken rice and hull, learned from approved milling runs. Use for questions about kWh, electricity or power versus output, and for "I milled N bags of paddy, what should it give?" (paddy_bags) or "how much paddy and power for N bags of rice?" (rice_bags).', input_schema: { type: 'object', properties: { grade: { type: 'string', description: 'A paddy grade name or code (optional).' }, milling_center: centerProp, paddy_bags: { type: 'number', description: 'Bags of paddy milled or to be milled: answers how much packaged rice, broken rice, hull and power that gives.' }, rice_bags: { type: 'number', description: 'Bags of packaged rice recovered or wanted: answers how much paddy, power, broken rice and hull that takes.' }, kwh: { type: 'number', description: 'An amount of power in kWh: answers how much it mills and gives.' } } } },
  { name: 'output_vs_expected', label: 'Output against what was expected', description: 'For each milling center: did its runs give more than, as much as, or less than the AI expected for the power used, plus how accurate the AI has been. Use for questions about performance, whether a center delivered what it should, or under- or over-delivery.', input_schema: { type: 'object', properties: { period: periodProp, milling_center: centerProp } } },
  { name: 'stock_levels', label: 'Stock levels', description: 'Current stock (paddy and finished goods) at farms, warehouses and milling centers, in kg and bags.', input_schema: { type: 'object', properties: { location: { type: 'string', description: 'Part of a farm, warehouse or milling center name (optional).' } } } },
  { name: 'paddy_intake', label: 'Paddy intake', description: 'Approved paddy intake per farm in a period.', input_schema: { type: 'object', properties: { period: periodProp } } },
  { name: 'sales_summary', label: 'Sales summary', description: 'Fulfilled sales orders and their total value in a period. Whole-company figure, for people with finance or sales access.', input_schema: { type: 'object', properties: { period: periodProp } } },
  { name: 'top_debtors', label: 'Customers who owe money', description: 'The customers with the largest outstanding balances. Whole-company figure, for people with finance access.', input_schema: { type: 'object', properties: {} } },
  { name: 'pending_approvals', label: 'Waiting for approval', description: 'How many milling runs are submitted and waiting for approval, by milling center.', input_schema: { type: 'object', properties: {} } },
  { name: 'watch_outs', label: 'Watch-outs', description: 'Unusual machine power readings and milling runs that did not add up in the last 30 days.', input_schema: { type: 'object', properties: {} } },
  { name: 'system_help', label: 'How the system works', description: 'A guide to how KAM-ROMS works and how to do things in it: recording paddy, milling runs, expenses, sales approval, reports, settings, roles, accounts, the Watchlist, the AI.', input_schema: { type: 'object', properties: { topic: { type: 'string', description: 'What the person wants to know how to do.' } }, required: ['topic'] } },
];
export const TOOL_LABEL = Object.fromEntries(TOOL_DEFS.map((t) => [t.name, t.label])) as Record<string, string>;

const done = (r: Partial<ToolResult> & { summary: string }): ToolResult => ({ ok: true, source: 'N/A', period: 'N/A', confidencePercent: 100, ...r });
const denied = (summary: string): ToolResult => ({ ok: false, denied: true, summary, source: 'N/A', period: 'N/A', confidencePercent: 0 });
const fail = (summary: string): ToolResult => ({ ok: false, summary, source: 'N/A', period: 'N/A', confidencePercent: 0 });
const n0 = (n: number) => Math.round(n).toLocaleString('en-US');
const kg = (n: number) => `${n0(n)} kg`;

@Injectable()
export class AiToolsService {
  private readonly log = new Logger(AiToolsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly receivables: ReceivablesService,
    private readonly insights: AiInsightsService,
    private readonly predictions: AiPredictionsService,
  ) {}

  async run(name: string, args: Record<string, unknown> | undefined, actor: AuthenticatedUser): Promise<ToolResult> {
    const a = args ?? {};
    try {
      switch (name) {
        case 'get_my_access': return await this.myAccess(actor);
        case 'production_summary': return await this.productionSummary(actor, a);
        case 'power_yield': return await this.powerYield(actor, a);
        case 'output_vs_expected': return await this.outputVsExpected(actor, a);
        case 'stock_levels': return await this.stockLevels(actor, a);
        case 'paddy_intake': return await this.paddyIntake(actor, a);
        case 'sales_summary': return await this.salesSummary(actor, a);
        case 'top_debtors': return await this.topDebtors(actor);
        case 'pending_approvals': return await this.pendingApprovals(actor);
        case 'watch_outs': return await this.watchOuts(actor);
        case 'system_help': return this.systemHelp(a);
        default: return fail(`There is no lookup called "${name}".`);
      }
    } catch (err) {
      if (err instanceof ForbiddenException) return denied(err.message);
      this.log.warn(`The ${name} lookup failed: ${(err as Error).message}`);
      return fail('I could not look that up right now. Please try again in a moment.');
    }
  }

  // ---- places named in a question, always within the person's own jurisdiction
  private async centers(j: Jurisdiction) {
    return this.prisma.millingCenter.findMany({ where: { ...(j.companyWide ? {} : { warehouseId: { in: j.warehouseIds } }), isActive: true }, select: { id: true, name: true, code: true } });
  }
  async findCenter(j: Jurisdiction, text: string) {
    const t = text.toLowerCase().trim();
    const all = await this.centers(j);
    return all.find((c) => c.name.toLowerCase() === t || c.code.toLowerCase() === t) ?? all.find((c) => c.name.toLowerCase().includes(t) || t.includes(c.name.toLowerCase()) || t.includes(c.code.toLowerCase()));
  }
  /** The milling center a question names, if any (so "how is Mill A doing" finds Mill A). */
  async centerNamedIn(actor: AuthenticatedUser, question: string): Promise<string | undefined> {
    const q = question.toLowerCase();
    const all = await this.centers(jurisdictionOf(actor));
    return all.find((c) => q.includes(c.name.toLowerCase()) || new RegExp(`\\b${c.code.toLowerCase()}\\b`).test(q))?.name;
  }
  private async centerList(j: Jurisdiction) {
    const names = (await this.centers(j)).map((c) => c.name);
    return names.length ? `The milling centers you can see are: ${names.join(', ')}.` : 'You have no milling center in your jurisdiction.';
  }
  private async whose(j: Jurisdiction) {
    const info = await this.insights.describeJurisdiction(j);
    return info.companyWide ? 'the whole company' : info.label;
  }

  // ---- the lookups
  private async myAccess(actor: AuthenticatedUser): Promise<ToolResult> {
    const j = jurisdictionOf(actor);
    const info = await this.insights.describeJurisdiction(j);
    const roles = [...new Set((actor.roles ?? []).map((r) => r.roleCode))].join(', ') || 'no role';
    const can = ['how the system works'];
    if (hasPermission(actor, PERMISSIONS.MILLING_VIEW)) can.unshift('milling production, power and the AI predictions and feedback');
    if (hasPermission(actor, PERMISSIONS.REPORTS_VIEW)) can.unshift('stock and paddy intake');
    if (hasPermission(actor, PERMISSIONS.FINANCE_VIEW, PERMISSIONS.SALES_CREATE)) can.unshift(j.companyWide ? 'sales and customer balances' : 'sales and customer balances (company-wide figures, so not available when you are limited to your own places)');
    return done({ summary: `You are signed in as ${roles}. You can see: ${info.label}. I can look up ${can.join('; ')}.`, source: 'Your account', period: 'Now' });
  }

  private async productionSummary(actor: AuthenticatedUser, a: Record<string, unknown>): Promise<ToolResult> {
    if (!hasPermission(actor, PERMISSIONS.MILLING_VIEW)) return denied('Your role does not include milling figures, so I cannot answer this for you.');
    const j = jurisdictionOf(actor);
    const scope = productionScope(j);
    if (scope === null) return fail('No milling center is assigned to you yet, so there is nothing to report in your jurisdiction.');
    const period = resolvePeriod(a.period as PeriodKey | undefined);
    let center: { id: string; name: string } | undefined;
    if (typeof a.milling_center === 'string' && a.milling_center.trim()) {
      center = await this.findCenter(j, a.milling_center);
      if (!center) return fail(`I could not find a milling center called "${a.milling_center}" in your jurisdiction. ${await this.centerList(j)}`);
    }
    const rows = await this.prisma.productionRecord.findMany({
      where: { ...scope, status: 'APPROVED', date: { gte: period.from ?? undefined, lte: period.to }, ...(center ? { millingCenterId: center.id } : {}) },
      select: { millingCenterId: true, paddyProcessedKg: true, energyConsumptionKwh: true, recoveredRiceKg: true, brokenRiceKg: true, riceHullKg: true, riceHullBags: true, wasteLossKg: true, millingCenter: { select: { name: true } } },
      take: 5000,
    });
    const where = center ? center.name : await this.whose(j);
    if (rows.length === 0) return done({ summary: `No approved milling runs were recorded in ${period.label} for ${where}.`, source: 'Approved milling runs', period: period.label });
    const bags = await this.insights.bagSizes(rows.map((r) => ({ hullKg: Number(r.riceHullKg), hullBags: r.riceHullBags ?? null })));
    const sum = (list: typeof rows, pick: (r: (typeof rows)[number]) => number) => list.reduce((t, r) => t + pick(r), 0);
    const total = (list: typeof rows) => ({
      runs: list.length, paddy: sum(list, (r) => Number(r.paddyProcessedKg)), rice: sum(list, (r) => Number(r.recoveredRiceKg)), broken: sum(list, (r) => Number(r.brokenRiceKg)),
      hull: sum(list, (r) => Number(r.riceHullKg)), waste: sum(list, (r) => Number(r.wasteLossKg)), kwh: sum(list, (r) => Number(r.energyConsumptionKwh ?? 0)),
      withPower: list.filter((r) => Number(r.energyConsumptionKwh ?? 0) > 0).length,
    });
    const t = total(rows);
    const byCenter = [...new Set(rows.map((r) => r.millingCenterId))].map((id) => ({ name: rows.find((r) => r.millingCenterId === id)!.millingCenter?.name ?? 'Unknown', ...total(rows.filter((r) => r.millingCenterId === id)) }));
    let text = `${where}, ${period.label}: ${t.runs} approved milling run${t.runs === 1 ? '' : 's'}. ${fmtBags(t.paddy / bags.paddyKg)} bags of paddy (${kg(t.paddy)}) were milled and gave ${fmtBags(t.rice / bags.riceKg)} bags of packaged rice (${kg(t.rice)}), ${fmtBags(t.broken / bags.brokenKg)} bags of broken rice (${kg(t.broken)}) and ${fmtBags(t.hull / bags.hullKg)} bags of hull (${kg(t.hull)}). Recovery was ${t.paddy > 0 ? ((t.rice / t.paddy) * 100).toFixed(1) : '0'}%.`;
    if (t.kwh > 0) text += ` Power recorded: ${n0(t.kwh)} kWh across ${t.withPower} run${t.withPower === 1 ? '' : 's'}.`;
    if (byCenter.length > 1) text += ` By center: ${byCenter.slice(0, 8).map((c) => `${c.name} ${c.runs} run${c.runs === 1 ? '' : 's'}, ${kg(c.paddy)} paddy, ${kg(c.rice)} rice (${c.paddy > 0 ? ((c.rice / c.paddy) * 100).toFixed(1) : '0'}%)`).join('; ')}.`;
    return done({ summary: text, data: { total: t, byCenter, bagSizes: bags }, source: 'Approved milling runs (ProductionRecord)', period: period.label });
  }

  private async powerYield(actor: AuthenticatedUser, a: Record<string, unknown>): Promise<ToolResult> {
    if (!hasPermission(actor, PERMISSIONS.MILLING_VIEW)) return denied('Your role does not include milling figures, so I cannot answer this for you.');
    const data = await this.insights.overview(actor);
    if (!data.available) return denied(data.reason);
    const j = jurisdictionOf(actor);
    let pick = { rates: data.overall, note: data.overallNote, label: await this.whose(j) };
    if (typeof a.milling_center === 'string' && a.milling_center.trim()) {
      const t = a.milling_center.toLowerCase();
      const c = data.byCenter.find((x) => x.name.toLowerCase().includes(t) || t.includes(x.name.toLowerCase()) || x.code.toLowerCase() === t);
      if (!c) return fail(`I could not find a milling center called "${a.milling_center}" with recorded power in your jurisdiction.`);
      pick = { rates: c.rates, note: c.note, label: c.name };
    } else if (typeof a.grade === 'string' && a.grade.trim()) {
      const t = a.grade.toLowerCase();
      const g = data.byGrade.find((x) => x.label.toLowerCase().includes(t) || x.code.toLowerCase() === t);
      if (!g) return fail(`I could not find a paddy grade called "${a.grade}" with recorded power.`);
      pick = { rates: g.rates, note: g.note, label: `grade ${g.label}` };
    }
    const k = pick.rates.perKwh, b = data.bagSizes;
    // A question with a number in it ("5 bags of Size 4", "100 bags of rice", "200 kWh") gets that answer first, then the per-kWh basis.
    const give = (o: Outputs) => `${fmtBags(o.riceBags)} bags of packaged rice (${kg(o.riceKg)}), ${fmtBags(o.brokenBags)} bags of broken rice (${kg(o.brokenKg)}) and ${fmtBags(o.hullBags)} bags of hull (${kg(o.hullKg)})`;
    const kwhAsked = Number(a.kwh), paddyBagsAsked = Number(a.paddy_bags), riceBagsAsked = Number(a.rice_bags);
    let asked = '';
    if (kwhAsked > 0) { const o = outputsFromEnergy(pick.rates, kwhAsked, b); asked = `${n0(kwhAsked)} kWh mills about ${fmtBags(o.paddyBags)} bags of paddy and should give ${give(o)}. `; }
    else if (paddyBagsAsked > 0) { const o = outputsFromPaddy(pick.rates, paddyBagsAsked * b.paddyKg, b); asked = `${fmtBags(paddyBagsAsked)} bags of paddy should take about ${fmtBags(o.kwh)} kWh of power and give ${give(o)}. `; }
    else if (riceBagsAsked > 0) { const o = outputsFromRice(pick.rates, riceBagsAsked * b.riceKg, b); asked = `${fmtBags(riceBagsAsked)} bags of packaged rice takes about ${fmtBags(o.paddyBags)} bags of paddy (${kg(o.paddyKg)}) and about ${fmtBags(o.kwh)} kWh of power, and comes with ${fmtBags(o.brokenBags)} bags of broken rice (${kg(o.brokenKg)}) and ${fmtBags(o.hullBags)} bags of hull (${kg(o.hullKg)}). `; }
    return done({
      summary: `${asked}${pick.rates.basis === 'benchmark' ? 'On an industry benchmark, ' : ''}for ${pick.label}, 1 kWh of power mills about ${k.paddyKg.toFixed(1)} kg of paddy and should give ${fmtBags(k.riceKg / b.riceKg)} bags of packaged rice (${k.riceKg.toFixed(1)} kg), ${fmtBags(k.brokenKg / b.brokenKg)} bags of broken rice (${k.brokenKg.toFixed(1)} kg) and ${fmtBags(k.hullKg / b.hullKg)} bags of hull (${k.hullKg.toFixed(1)} kg). ${pick.note}`,
      data: { perKwh: k, bagSizes: b, runs: pick.rates.runs, basis: pick.rates.basis },
      source: pick.rates.basis === 'benchmark' ? 'Industry benchmark (too few approved runs with a power reading)' : 'Approved milling runs that recorded their power',
      period: data.window.from && data.window.to ? `${data.window.from.slice(0, 10)} to ${data.window.to.slice(0, 10)}` : 'N/A',
      confidencePercent: pick.rates.confidence === 'high' ? 85 : pick.rates.confidence === 'medium' ? 65 : 25,
    });
  }

  private async outputVsExpected(actor: AuthenticatedUser, a: Record<string, unknown>): Promise<ToolResult> {
    if (!hasPermission(actor, PERMISSIONS.MILLING_VIEW)) return denied('Your role does not include milling figures, so I cannot answer this for you.');
    const j = jurisdictionOf(actor);
    const period = resolvePeriod(a.period as PeriodKey | undefined);
    let center: { id: string; name: string } | undefined;
    if (typeof a.milling_center === 'string' && a.milling_center.trim()) {
      center = await this.findCenter(j, a.milling_center);
      if (!center) return fail(`I could not find a milling center called "${a.milling_center}" in your jurisdiction. ${await this.centerList(j)}`);
    }
    const fb = await this.insights.feedback(actor, { days: period.days, millingCenterId: center?.id });
    if (!fb.available) return denied(fb.reason);
    if (fb.summary.runs === 0) return done({ summary: `No milling runs with a power reading were recorded in ${period.label}${center ? ` at ${center.name}` : ''}, so there is nothing to compare with what was expected.`, source: 'Milling runs and the AI\'s expectations', period: period.label });
    const s = fb.summary, l = fb.learning;
    const judged = s.more + s.asExpected + s.less;
    let text = `${s.runs} milling run${s.runs === 1 ? '' : 's'} in ${period.label}: ${s.asExpected} as expected, ${s.more} more than expected, ${s.less} less than expected${s.early ? `, ${s.early} early estimate${s.early === 1 ? '' : 's'} (not enough history yet to judge)` : ''}${s.pendingApproval ? `, ${s.pendingApproval} still waiting for approval` : ''}. `;
    text += fb.centers.slice(0, 6).map((c) => c.sentence).join(' ');
    const worst = [...fb.runs].filter((r) => !r.early).sort((x, y) => Math.abs(y.variance.ricePercent) - Math.abs(x.variance.ricePercent))[0];
    if (worst && Math.abs(worst.variance.ricePercent) > fb.tolerancePercent) text += ` The biggest difference was ${worst.recordNumber}: ${worst.sentence}`;
    text += l.accuracyPercent === null ? ' The AI is still learning, so it has no accuracy figure yet.' : ` The AI's expectations have been about ${l.accuracyPercent}% accurate on its latest runs (${l.trend}).`;
    return done({ summary: text, data: { summary: s, centers: fb.centers, learning: l }, source: 'Milling runs compared with what the AI expected before each run', period: period.label, confidencePercent: judged === 0 ? 25 : l.accuracyPercent === null ? 60 : 85 });
  }

  private async stockLevels(actor: AuthenticatedUser, a: Record<string, unknown>): Promise<ToolResult> {
    if (!hasPermission(actor, PERMISSIONS.REPORTS_VIEW)) return denied('Your role does not include stock figures, so I cannot answer this for you.');
    const inv = await this.reports.inventoryByLocation(actor);
    const needle = typeof a.location === 'string' ? a.location.toLowerCase().trim() : '';
    const rows = [...inv.farms, ...inv.warehouses, ...inv.millingCenters].filter((r) => !needle || r.locationName.toLowerCase().includes(needle));
    if (rows.length === 0) return done({ summary: needle ? `I found no stock recorded at a place matching "${a.location}" in your jurisdiction.` : 'No stock is recorded at the places in your jurisdiction.', source: 'Live inventory balances', period: 'As of now' });
    const places = [...new Set(rows.map((r) => r.locationName))].map((name) => {
      const mine = rows.filter((r) => r.locationName === name);
      return { name, kg: mine.reduce((t, r) => t + r.quantityKg, 0), items: [...mine].sort((x, y) => y.quantityKg - x.quantityKg) };
    }).sort((x, y) => y.kg - x.kg);
    const text = `Stock at ${places.length} place${places.length === 1 ? '' : 's'}: ` + places.slice(0, 6).map((p) => `${p.name} holds ${kg(p.kg)} (${p.items.slice(0, 3).map((i) => `${i.itemLabel} ${kg(i.quantityKg)}, ${n0(i.bagCount)} bags`).join('; ')})`).join('. ') + '.';
    return done({ summary: text, data: places.slice(0, 20), source: 'Live inventory balances at the places you can see', period: 'As of now (real-time balance)' });
  }

  private async paddyIntake(actor: AuthenticatedUser, a: Record<string, unknown>): Promise<ToolResult> {
    if (!hasPermission(actor, PERMISSIONS.REPORTS_VIEW)) return denied('Your role does not include paddy intake figures, so I cannot answer this for you.');
    const period = resolvePeriod(a.period as PeriodKey | undefined);
    const farms = await this.reports.farmReport({ from: period.from?.toISOString(), to: period.to.toISOString() }, actor);
    const sorted = [...farms].sort((x, y) => y.approvedIntakeKg - x.approvedIntakeKg);
    const total = sorted.reduce((t, f) => t + f.approvedIntakeKg, 0);
    if (sorted.length === 0) return done({ summary: 'No farms are in your jurisdiction.', source: 'Approved paddy entries', period: period.label });
    return done({ summary: `Approved paddy intake in ${period.label}: ${kg(total)} across ${sorted.length} farm${sorted.length === 1 ? '' : 's'}. ${sorted.slice(0, 6).map((f) => `${f.farmName} ${kg(f.approvedIntakeKg)}`).join('; ')}.`, data: sorted.slice(0, 20), source: 'Approved paddy entries, grouped by farm', period: period.label });
  }

  private async salesSummary(actor: AuthenticatedUser, a: Record<string, unknown>): Promise<ToolResult> {
    if (!hasPermission(actor, PERMISSIONS.FINANCE_VIEW, PERMISSIONS.SALES_CREATE)) return denied('Your role does not include sales figures, so I cannot answer this for you.');
    if (!jurisdictionOf(actor).companyWide) return denied('Sales figures are tracked for the whole company, so I only answer this for people whose access covers the whole company.');
    const period = resolvePeriod(a.period as PeriodKey | undefined, new Date());
    const r = await this.reports.salesReport({ from: period.from?.toISOString(), to: period.to.toISOString() });
    return done({ summary: `${period.label}: ${r.totalOrders} fulfilled order${r.totalOrders === 1 ? '' : 's'} totalling GHS ${r.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`, data: { orders: r.totalOrders, amount: r.totalAmount }, source: 'Fulfilled sales orders', period: period.label });
  }

  private async topDebtors(actor: AuthenticatedUser): Promise<ToolResult> {
    if (!hasPermission(actor, PERMISSIONS.FINANCE_VIEW)) return denied('Your role does not include finance figures, so I cannot answer this for you.');
    if (!jurisdictionOf(actor).companyWide) return denied('Customer balances are tracked for the whole company, so I only answer this for people whose access covers the whole company.');
    const top = await this.receivables.topDebtors(5);
    if (top.length === 0) return done({ summary: 'No customers currently have an outstanding balance.', source: 'Invoices and verified payments', period: 'As of now' });
    const customers = await this.prisma.customer.findMany({ where: { id: { in: top.map((d) => d.customerId) } } });
    const name = (id: string) => customers.find((c) => c.id === id)?.name ?? id;
    return done({ summary: `Top outstanding balances: ${top.map((d) => `${name(d.customerId)} GHS ${d.outstanding.toFixed(2)}`).join('; ')}.`, data: top, source: 'Invoices and verified payments, per customer', period: 'As of now' });
  }

  private async pendingApprovals(actor: AuthenticatedUser): Promise<ToolResult> {
    if (!hasPermission(actor, PERMISSIONS.MILLING_VIEW)) return denied('Your role does not include milling figures, so I cannot answer this for you.');
    const scope = productionScope(jurisdictionOf(actor));
    if (scope === null) return fail('No milling center is assigned to you yet, so there is nothing waiting in your jurisdiction.');
    const rows = await this.prisma.productionRecord.findMany({ where: { ...scope, status: 'SUBMITTED' }, select: { millingCenter: { select: { name: true } } }, take: 2000 });
    if (rows.length === 0) return done({ summary: 'No milling runs are waiting for approval.', source: 'Submitted milling runs', period: 'As of now' });
    const counts = new Map<string, number>();
    rows.forEach((r) => counts.set(r.millingCenter?.name ?? 'Unknown', (counts.get(r.millingCenter?.name ?? 'Unknown') ?? 0) + 1));
    return done({ summary: `${rows.length} milling run${rows.length === 1 ? ' is' : 's are'} waiting for approval: ${[...counts].map(([n, c]) => `${n} ${c}`).join('; ')}.`, data: [...counts], source: 'Submitted milling runs', period: 'As of now' });
  }

  private async watchOuts(actor: AuthenticatedUser): Promise<ToolResult> {
    if (!hasPermission(actor, PERMISSIONS.MILLING_VIEW, PERMISSIONS.MACHINE_VIEW)) return denied('Your role does not include milling or machine figures, so I cannot answer this for you.');
    const a = await this.predictions.recentAnomalies(actor);
    const m = a.meterAnomalies, p = a.productionAnomalies;
    if (m.length === 0 && p.length === 0) return done({ summary: 'In the last 30 days no unusual power readings and no milling runs that failed to add up were found.', source: 'Machine meter readings and milling runs', period: 'The last 30 days' });
    const parts = [`In the last 30 days: ${m.length} unusual power reading${m.length === 1 ? '' : 's'} and ${p.length} milling run${p.length === 1 ? '' : 's'} that did not add up.`];
    if (m.length) parts.push(`Power: ${m.slice(0, 3).map((x) => `${x.machine?.machineName ?? 'a machine'} (${x.anomalyReason ?? 'unusual reading'})`).join('; ')}.`);
    if (p.length) parts.push(`Runs: ${p.slice(0, 3).map((x) => `${x.recordNumber} at ${x.millingCenter?.name ?? 'a milling center'}`).join('; ')}.`);
    return done({ summary: parts.join(' '), data: { meter: m.length, runs: p.length }, source: 'Machine meter readings and milling runs', period: 'The last 30 days' });
  }

  private systemHelp(a: Record<string, unknown>): ToolResult {
    const topic = typeof a.topic === 'string' ? a.topic : '';
    const hits = searchHelp(topic, 2);
    if (hits.length === 0) return done({ summary: `I do not have a guide for that. I can explain: ${HELP.map((h) => h.title.toLowerCase()).slice(0, 12).join('; ')}.`, source: 'The KAM-ROMS guide', period: 'N/A', confidencePercent: 30 });
    return done({ summary: hits.map((h) => `${h.entry.title}: ${h.entry.body}`).join(' '), data: hits.map((h) => h.entry.id), source: 'The KAM-ROMS guide', period: 'N/A', confidencePercent: 90 });
  }
}
