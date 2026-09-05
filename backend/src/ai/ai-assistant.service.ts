import { Injectable } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { ReceivablesService } from '../finance/receivables.service';
import { PrismaService } from '../prisma/prisma.service';
import { AskAssistantDto } from './dto/ask-assistant.dto';

export interface AssistantAnswer {
  answer: string;
  sourceData: string;
  dateRange: string;
  confidencePercent: number;
  assumptions: string;
}

const RECOGNIZED_TOPICS = [
  'current paddy stock',
  'which farm has the highest output',
  'sales performance this month',
  'who owes us money / top debtors',
  'recovery rate this period',
  'production this month',
];

/** A small, fixed set of recognized intents mapped to real queries —
 * NOT a general natural-language chatbot. See docs/AI_APPROACH.md for
 * why. Every recognized question returns real data with a stated date
 * range, confidence, and assumptions (spec section 22); an unrecognized
 * one says so honestly rather than fabricating an answer. */
@Injectable()
export class AiAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly receivables: ReceivablesService,
  ) {}

  async ask(dto: AskAssistantDto): Promise<AssistantAnswer> {
    const q = dto.question.toLowerCase();

    if (q.includes('paddy stock') || (q.includes('paddy') && q.includes('stock'))) {
      const summary = await this.reports.executiveSummary();
      return {
        answer: `Current paddy stock: ${summary.totalPaddyAvailableKg.toFixed(0)} KG across all active farms. An additional ${summary.paddyInTransitKg.toFixed(0)} KG is currently in transit between farms and warehouses.`,
        sourceData: 'Live inventory balances (LocationType.FARM and EXTERNAL/in-transit)',
        dateRange: 'As of now (real-time balance, not a historical snapshot)',
        confidencePercent: 100,
        assumptions: 'Reflects approved paddy entries only — pending/rejected entries are not counted.',
      };
    }

    if (q.includes('highest output') || (q.includes('farm') && q.includes('output'))) {
      const farms = await this.reports.farmReport({});
      const sorted = [...farms].sort((a, b) => b.approvedIntakeKg - a.approvedIntakeKg);
      const top = sorted[0];
      if (!top || top.approvedIntakeKg === 0) {
        return {
          answer: 'No approved paddy intake has been recorded for any farm yet.',
          sourceData: 'Approved PaddyEntry records, grouped by farm',
          dateRange: 'All time',
          confidencePercent: 100,
          assumptions: 'None — this is a direct count, not an estimate.',
        };
      }
      return {
        answer: `${top.farmName} (${top.farmCode}) has the highest recorded output: ${top.approvedIntakeKg.toFixed(0)} KG of approved paddy intake.`,
        sourceData: 'Approved PaddyEntry records, grouped by farm',
        dateRange: 'All time',
        confidencePercent: 100,
        assumptions: 'Ranks by total approved intake KG, not by recovery rate or profitability.',
      };
    }

    if (q.includes('owe') || q.includes('debtor')) {
      const topDebtors = await this.receivables.topDebtors(5);
      if (topDebtors.length === 0) {
        return {
          answer: 'No customers currently have an outstanding balance.',
          sourceData: 'Invoices and VERIFIED payment allocations',
          dateRange: 'As of now',
          confidencePercent: 100,
          assumptions: 'Only VERIFIED payments count as received — pending/rejected payments do not reduce a customer\'s outstanding balance.',
        };
      }
      const customers = await this.prisma.customer.findMany({ where: { id: { in: topDebtors.map((d) => d.customerId) } } });
      const nameFor = (id: string) => customers.find((c) => c.id === id)?.name ?? id;
      const lines = topDebtors.map((d) => `${nameFor(d.customerId)}: GHS ${d.outstanding.toFixed(2)}`).join('; ');
      return {
        answer: `Top outstanding balances: ${lines}.`,
        sourceData: 'Invoices and VERIFIED payment allocations, aggregated per customer',
        dateRange: 'As of now',
        confidencePercent: 100,
        assumptions: 'Only VERIFIED payments count as received.',
      };
    }

    if (q.includes('sales') && (q.includes('month') || q.includes('performance'))) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const result = await this.reports.salesReport({ from: startOfMonth });
      return {
        answer: `This month: ${result.totalOrders} fulfilled order(s) totaling GHS ${result.totalAmount.toFixed(2)}.`,
        sourceData: 'Fulfilled SalesOrder records for the current month',
        dateRange: `${startOfMonth.slice(0, 10)} to today`,
        confidencePercent: 100,
        assumptions: 'Only FULFILLED orders are counted — approved-but-not-yet-fulfilled orders are excluded.',
      };
    }

    if (q.includes('recovery')) {
      const recent = await this.prisma.productionRecord.findMany({
        where: { status: 'APPROVED' },
        orderBy: { date: 'desc' },
        take: 30,
        select: { recoveryPercent: true },
      });
      if (recent.length === 0) {
        return {
          answer: 'No approved production records exist yet to compute a recovery rate.',
          sourceData: 'ProductionRecord.recoveryPercent',
          dateRange: 'N/A',
          confidencePercent: 100,
          assumptions: 'None.',
        };
      }
      const avg = recent.reduce((s, r) => s + Number(r.recoveryPercent), 0) / recent.length;
      return {
        answer: `Average recovery rate across the last ${recent.length} approved production runs: ${avg.toFixed(1)}%.`,
        sourceData: 'ProductionRecord.recoveryPercent, most recent 30 approved records',
        dateRange: 'Most recent 30 approved production records (not a fixed calendar period)',
        confidencePercent: recent.length >= 5 ? 80 : 40,
        assumptions: recent.length < 5 ? 'Fewer than 5 records exist — this average is not yet statistically reliable.' : 'Simple unweighted average across records; does not adjust for grade or machine mix.',
      };
    }

    if (q.includes('production') && q.includes('month')) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const agg = await this.prisma.productionRecord.aggregate({
        where: { status: 'APPROVED', date: { gte: startOfMonth } },
        _sum: { recoveredRiceKg: true },
      });
      const total = Number(agg._sum.recoveredRiceKg ?? 0);
      return {
        answer: `${total.toFixed(0)} KG of rice recovered from approved production this month.`,
        sourceData: 'ProductionRecord.recoveredRiceKg, APPROVED records this month',
        dateRange: `${startOfMonth.toISOString().slice(0, 10)} to today`,
        confidencePercent: 100,
        assumptions: 'Counts approved production records only.',
      };
    }

    return {
      answer: `I don't have a mapped answer for that question. Recognized topics: ${RECOGNIZED_TOPICS.join('; ')}.`,
      sourceData: 'N/A',
      dateRange: 'N/A',
      confidencePercent: 0,
      assumptions: 'This assistant recognizes a fixed set of question patterns — it is not a general-purpose chatbot (see docs/AI_APPROACH.md).',
    };
  }
}
