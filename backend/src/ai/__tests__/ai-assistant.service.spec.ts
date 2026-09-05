import { AiAssistantService } from '../ai-assistant.service';
import { ReportsService } from '../../reports/reports.service';
import { ReceivablesService } from '../../finance/receivables.service';

describe('AiAssistantService', () => {
  function buildService() {
    const prisma = {
      customer: { findMany: jest.fn().mockResolvedValue([{ id: 'cust-1', name: 'Adom Enterprises' }]) },
      productionRecord: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { recoveredRiceKg: 0 } }) },
    };
    const reports = {
      executiveSummary: jest.fn().mockResolvedValue({ totalPaddyAvailableKg: 105000, paddyInTransitKg: 20000 }),
      farmReport: jest.fn().mockResolvedValue([
        { farmName: 'Farm A', farmCode: 'FARM_A', approvedIntakeKg: 62500 },
        { farmName: 'Farm B', farmCode: 'FARM_B', approvedIntakeKg: 30000 },
      ]),
      salesReport: jest.fn().mockResolvedValue({ totalOrders: 12, totalAmount: 450000 }),
    } as unknown as ReportsService;
    const receivables = {
      topDebtors: jest.fn().mockResolvedValue([{ customerId: 'cust-1', outstanding: 5000 }]),
    } as unknown as ReceivablesService;

    const service = new AiAssistantService(prisma as any, reports, receivables);
    return { service, prisma, reports, receivables };
  }

  it('answers a recognized "paddy stock" question with real data and full confidence', async () => {
    const { service } = buildService();

    const result = await service.ask({ question: 'What is the current paddy stock?' });

    expect(result.answer).toContain('105000');
    expect(result.confidencePercent).toBe(100);
    expect(result.sourceData).toBeTruthy();
    expect(result.dateRange).toBeTruthy();
  });

  it('answers "which farm has the highest output" by picking the actual top farm, not the first in the list', async () => {
    const { service } = buildService();

    const result = await service.ask({ question: 'Which farm has the highest output?' });

    expect(result.answer).toContain('Farm A');
    expect(result.answer).not.toContain('Farm B');
  });

  it('answers a "who owes us money" question using real receivables data', async () => {
    const { service } = buildService();

    const result = await service.ask({ question: 'Which customers owe us money?' });

    expect(result.answer).toContain('Adom Enterprises');
    expect(result.answer).toContain('5000');
  });

  it('honestly declines an unrecognized question instead of fabricating an answer', async () => {
    const { service } = buildService();

    const result = await service.ask({ question: 'What is the meaning of life?' });

    expect(result.confidencePercent).toBe(0);
    expect(result.answer).toContain("don't have a mapped answer");
  });
});
