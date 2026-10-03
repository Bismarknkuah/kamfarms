import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { ReportCatalogService } from './report-catalog.service';
import { InsightsModule } from '../insights/insights.module';

@Module({
  controllers: [ReportsController],
  imports: [InsightsModule],
  providers: [ReportsService, ExportService, ReportCatalogService],
  exports: [ReportsService, ExportService],
})
export class ReportsModule {}
