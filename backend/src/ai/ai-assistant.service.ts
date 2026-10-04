import { Injectable } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { ReceivablesService } from '../finance/receivables.service';
import { PrismaService } from '../prisma/prisma.service';
import { AskAssistantDto } from './dto/ask-assistant.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PERMISSIONS } from '../common/constants/permissions';
import { AiInsightsService } from './ai-insights.service';
import { hasPermission, jurisdictionOf, productionScope } from './jurisdiction';

export interface AssistantAnswer {
  answer: string;
  sourceData: string;
  dateRange: string;
  confidencePercent: number;
  assumptions: string;
  /** Whose activities the answer covers: "Whole company", or the person's own places. */
  jurisdiction: string;
}

const RECOGNIZED_TOPICS = [
  'what 1 kWh of power produces (bags of packaged rice, broken rice and hull)',
  'current paddy stock',
  'which farm has the highest output',
  'sales performance this month',
  'who owes us money / top debtors',
  'recovery rate this period',
  'production this month',
];

const bags = (n: number) => (n < 10 ? n.toFixed(2) : n.toFixed(1));
const CONFIDENCE_PERCENT = { high: 85, medium: 65, low: 25 } as const;

/** A small, fixed set of recognized intents mapped to real queries  - 
 * NOT a general natural-language chatbot. See docs/AI_APPROACH.md for
 * why. Every recognized question returns real data with a stated date
 * range, confidence, and assumptions (spec section 22); an unrecognized
 * one says so honestly rather than fabricating an answer.
 *
 * Every answer is limited to the asker's jurisdiction: the MD, CEO and Administrator see the whole company, everyone
 * else only their own places. The assistant also only answers what the person's role could already open elsewhere
 * in the system, so asking it is never a way around a permission. */
@Injectable()
export class AiAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly receivables: ReceivablesService,
    private readonly insights: AiInsightsService,
  ) {}

  async ask(dto: AskAssistantDto, actor: AuthenticatedUser): Promise<AssistantAnswer> {
    const q = dto.question.toLowerCase();
    const j = jurisdictionOf(actor);
    const where = (await this.insights.describeJurisdiction(j)).label;
    const reply = (a: Omit<AssistantAnswer, 'jurisdiction'>): AssistantAnswer => ({ ...a, jurisdiction: where });
    const noAccess = (what: string) =>
      reply({ answer: `Your role does not include ${what}, so I cannot answer this for you.`, sourceData: 'N/A', dateRange: 'N/A', confidencePercent: 0, assumptions: 'The assistant only shows what you could already open elsewhere in the system.' });
    const companyOnly = (what: string) =>
      reply({ answer: `${what} are tracked for the whole company, so I only answer this for people whose access covers the whole company. Your jurisdiction is: ${where}.`, sourceData: 'N/A', dateRange: 'N/A', confidencePercent: 0, assumptions: 'The MD and CEO see every activity; everyone else sees their own places only.' });
    const noPlaces = (what: string) =>
      reply({ answer: `No ${what} are assigned to you yet, so there is nothing to report in your jurisdiction.`, sourceData: 'N/A', dateRange: 'N/A', confidencePercent: 0, assumptions: 'Your jurisdiction is set by the System Administrator.' });
    const canSeeMilling = hasPermission(actor, PERMISSIONS.MILLING_VIEW);

    // ---- what power turns into
    if (q.includes('kwh') || q.includes('kilowatt') || q.includes('electricity') || (q.includes('power') && !q.includes('powerful'))) {
      if (!canSeeMilling) return noAccess('milling figures');
      const data = await this.insights.overview(actor);
      if (!data.available) return noAccess('milling figures');
      const r = data.overall, b = data.bagSizes, k = r.perKwh;
      const dateRange = data.window.from && data.window.to ? `${data.window.from.slice(0, 10)} to ${data.window.to.slice(0, 10)}` : 'N/A';
      return reply({
        answer: `${r.basis === 'benchmark' ? 'On an industry benchmark, ' : ''}1 kWh of power mills about ${k.paddyKg.toFixed(1)} kg of paddy and should give ${bags(k.riceKg / b.riceKg)} bags of packaged rice (${k.riceKg.toFixed(1)} kg), ${bags(k.brokenKg / b.brokenKg)} bags of broken rice (${k.brokenKg.toFixed(1)} kg) and ${bags(k.hullKg / b.hullKg)} bags of hull (${k.hullKg.toFixed(1)} kg).`,
        sourceData: r.basis === 'benchmark' ? 'Industry benchmark (too few approved runs with a power reading)' : 'Approved milling runs that recorded their power (ProductionRecord)',
        dateRange,
        confidencePercent: CONFIDENCE_PERCENT[r.confidence],
        assumptions: `Packaged rice bags are ${b.riceKg} kg, broken rice ${b.brokenKg} kg and hull ${b.hullKg} kg (${b.hullBasis === 'history' ? 'measured from your runs' : 'a setting'}). ${r.basis === 'benchmark' ? 'These are not your company\'s own figures yet.' : `Drawn from ${r.runs} runs.`}`,
      });
    }

    if (q.includes('paddy stock') || (q.includes('paddy') && q.includes('stock'))) {
      if (j.companyWide) {
        const summary = await this.reports.executiveSummary();
        return reply({
          answer: `Current paddy stock: ${summary.totalPaddyAvailableKg.toFixed(0)} KG across all active farms. An additional ${summary.paddyInTransitKg.toFixed(0)} KG is currently in transit.`,
          sourceData: 'Live inventory balances (LocationType.FARM and EXTERNAL/in-transit)',
          dateRange: 'As of now (real-time balance, not a historical snapshot)',
          confidencePercent: 100,
          assumptions: 'Reflects approved paddy entries only - pending/rejected entries are not counted.',
        });
      }
      if (j.farmIds.length === 0 && j.warehouseIds.length === 0) return noPlaces('farms or warehouses');
      const balances = await this.prisma.inventoryBalance.findMany({
        where: {
          paddyGradeId: { not: null },
          OR: [
            ...(j.farmIds.length ? [{ locationType: 'FARM' as const, locationId: { in: j.farmIds } }] : []),
            ...(j.warehouseIds.length ? [{ locationType: 'WAREHOUSE' as const, locationId: { in: j.warehouseIds } }] : []),
          ],
        },
        select: { quantityKg: true },
      });
      const total = balances.reduce((s, b) => s + Number(b.quantityKg), 0);
      return reply({
        answer: `Current paddy stock in your jurisdiction (${where}): ${total.toFixed(0)} KG.`,
        sourceData: 'Live inventory balances at your own farms and warehouses',
        dateRange: 'As of now (real-time balance, not a historical snapshot)',
        confidencePercent: 100,
        assumptions: 'Only the places assigned to you are counted. Paddy in transit between places is not included.',
      });
    }

    if (q.includes('highest output') || (q.includes('farm') && q.includes('output'))) {
      const farms = await this.reports.farmReport({}, actor);
      const sorted = [...farms].sort((a, b) => b.approvedIntakeKg - a.approvedIntakeKg);
      const top = sorted[0];
      if (!j.companyWide && farms.length === 0) return noPlaces('farms');
      if (!top || top.approvedIntakeKg === 0) {
        return reply({
          answer: j.companyWide ? 'No approved paddy intake has been recorded for any farm yet.' : 'No approved paddy intake has been recorded for the farms in your jurisdiction yet.',
          sourceData: 'Approved PaddyEntry records, grouped by farm',
          dateRange: 'All time',
          confidencePercent: 100,
          assumptions: 'None - this is a direct count, not an estimate.',
        });
      }
      return reply({
        answer: `${top.farmName} (${top.farmCode}) has the highest recorded output${j.companyWide ? '' : ' among the farms in your jurisdiction'}: ${top.approvedIntakeKg.toFixed(0)} KG of approved paddy intake.`,
        sourceData: 'Approved PaddyEntry records, grouped by farm',
        dateRange: 'All time',
        confidencePercent: 100,
        assumptions: 'Ranks by total approved intake KG, not by recovery rate or profitability.',
      });
    }

    if (q.includes('owe') || q.includes('debtor')) {
      if (!hasPermission(actor, PERMISSIONS.FINANCE_VIEW)) return noAccess('finance figures');
      if (!j.companyWide) return companyOnly('Customer balances');
      const topDebtors = await this.receivables.topDebtors(5);
      if (topDebtors.length === 0) {
        return reply({
          answer: 'No customers currently have an outstanding balance.',
          sourceData: 'Invoices and VERIFIED payment allocations',
          dateRange: 'As of now',
          confidencePercent: 100,
          assumptions: 'Only VERIFIED payments count as received - pending/rejected payments do not reduce a customer\'s outstanding balance.',
        });
      }
      const customers = await this.prisma.customer.findMany({ where: { id: { in: topDebtors.map((d) => d.customerId) } } });
      const nameFor = (id: string) => customers.find((c) => c.id === id)?.name ?? id;
      const lines = topDebtors.map((d) => `${nameFor(d.customerId)}: GHS ${d.outstanding.toFixed(2)}`).join('; ');
      return reply({
        answer: `Top outstanding balances: ${lines}.`,
        sourceData: 'Invoices and VERIFIED payment allocations, aggregated per customer',
        dateRange: 'As of now',
        confidencePercent: 100,
        assumptions: 'Only VERIFIED payments count as received.',
      });
    }

    if (q.includes('sales') && (q.includes('month') || q.includes('performance'))) {
      if (!hasPermission(actor, PERMISSIONS.FINANCE_VIEW, PERMISSIONS.SALES_CREATE)) return noAccess('sales figures');
      if (!j.companyWide) return companyOnly('Sales figures');
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const result = await this.reports.salesReport({ from: startOfMonth });
      return reply({
        answer: `This month: ${result.totalOrders} fulfilled order(s) totaling GHS ${result.totalAmount.toFixed(2)}.`,
        sourceData: 'Fulfilled SalesOrder records for the current month',
        dateRange: `${startOfMonth.slice(0, 10)} to today`,
        confidencePercent: 100,
        assumptions: 'Only FULFILLED orders are counted - approved-but-not-yet-fulfilled orders are excluded.',
      });
    }

    if (q.includes('recovery')) {
      if (!canSeeMilling) return noAccess('milling figures');
      const scope = productionScope(j);
      if (scope === null) return noPlaces('milling centers');
      const recent = await this.prisma.productionRecord.findMany({
        where: { ...scope, status: 'APPROVED' },
        orderBy: { date: 'desc' },
        take: 30,
        select: { recoveryPercent: true },
      });
      if (recent.length === 0) {
        return reply({
          answer: 'No approved production records exist yet to compute a recovery rate.',
          sourceData: 'ProductionRecord.recoveryPercent',
          dateRange: 'N/A',
          confidencePercent: 100,
          assumptions: 'None.',
        });
      }
      const avg = recent.reduce((s, r) => s + Number(r.recoveryPercent), 0) / recent.length;
      return reply({
        answer: `Average recovery rate across the last ${recent.length} approved production runs: ${avg.toFixed(1)}%.`,
        sourceData: 'ProductionRecord.recoveryPercent, most recent 30 approved records',
        dateRange: 'Most recent 30 approved production records (not a fixed calendar period)',
        confidencePercent: recent.length >= 5 ? 80 : 40,
        assumptions: recent.length < 5 ? 'Fewer than 5 records exist - this average is not yet statistically reliable.' : 'Simple unweighted average across records; does not account for run size.',
      });
    }

    if (q.includes('production') && q.includes('month')) {
      if (!canSeeMilling) return noAccess('milling figures');
      const scope = productionScope(j);
      if (scope === null) return noPlaces('milling centers');
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const agg = await this.prisma.productionRecord.aggregate({
        where: { ...scope, status: 'APPROVED', date: { gte: startOfMonth } },
        _sum: { recoveredRiceKg: true },
      });
      const total = Number(agg._sum.recoveredRiceKg ?? 0);
      return reply({
        answer: `${total.toFixed(0)} KG of rice recovered from approved production this month.`,
        sourceData: 'ProductionRecord.recoveredRiceKg, APPROVED records this month',
        dateRange: `${startOfMonth.toISOString().slice(0, 10)} to today`,
        confidencePercent: 100,
        assumptions: 'Counts approved production records only.',
      });
    }

    return reply({
      answer: `I don't have a mapped answer for that question. Recognized topics: ${RECOGNIZED_TOPICS.join('; ')}.`,
      sourceData: 'N/A',
      dateRange: 'N/A',
      confidencePercent: 0,
      assumptions: 'This assistant recognizes a fixed set of question patterns - it is not a general-purpose chatbot (see docs/AI_APPROACH.md).',
    });
  }
}
