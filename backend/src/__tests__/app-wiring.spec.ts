import './wiring-env';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuthService } from '../auth/auth.service';
import { ShipmentsService } from '../logistics/shipments.service';
import { MachinesService } from '../machines/machines.service';
import { ProductionRecordsService } from '../production/production-records.service';
import { PaddyMillingReceiptsService } from '../production/paddy-milling-receipts.service';
import { InsightsService } from '../insights/insights.service';
import { SystemOverviewService } from '../system-overview/system-overview.service';
import { AiInsightsService } from '../ai/ai-insights.service';
import { ReportCatalogService } from '../reports/report-catalog.service';
import { ReportsController } from '../reports/reports.controller';
import { SiteService } from '../site/site.service';

/**
 * Builds the whole application's dependency graph, with only the database replaced, and checks the pieces added
 * for the settings and reports are really connected. This matters most for the OPTIONAL settings dependency: if it
 * were not wired, a service would quietly use the built-in default and the administrator's changes would do nothing.
 */
describe('the whole application wires up', () => {
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn(), onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .compile();
  }, 60_000);
  afterAll(async () => { await moduleRef?.close(); });

  const settingsOf = (token: new (...args: any[]) => unknown) => (moduleRef.get(token as any, { strict: false }) as { settings?: unknown }).settings;

  it('builds every provider from its dependencies, with no missing or circular ones', () => {
    expect(moduleRef.get(SettingsService, { strict: false })).toBeDefined();
    expect(moduleRef.get(SiteService, { strict: false })).toBeDefined();
    expect(moduleRef.get(SystemOverviewService, { strict: false })).toBeDefined();
  });

  it.each([
    ['AuthService', AuthService], ['ShipmentsService', ShipmentsService], ['MachinesService', MachinesService],
    ['ProductionRecordsService', ProductionRecordsService], ['PaddyMillingReceiptsService', PaddyMillingReceiptsService], ['InsightsService', InsightsService], ['SystemOverviewService', SystemOverviewService],
    ['AiInsightsService', AiInsightsService],
  ])('%s really received the settings service (so the administrator\'s changes reach it)', (_name, token) => {
    expect(settingsOf(token as any)).toBeInstanceOf(SettingsService);
  });

  it('gives the reports controller the report catalog, and the catalog the watchlist', () => {
    expect((moduleRef.get(ReportsController, { strict: false }) as unknown as { catalog?: unknown }).catalog).toBeInstanceOf(ReportCatalogService);
    expect((moduleRef.get(ReportCatalogService, { strict: false }) as unknown as { insights?: unknown }).insights).toBeInstanceOf(InsightsService);
  });
});
