import { Module } from '@nestjs/common';
import { OverviewAnalyticsController } from './overview-analytics.controller';
import { OverviewAnalyticsService } from './overview-analytics.service';
import { BusinessAnalyticsService } from './business-analytics.service';

@Module({ controllers: [OverviewAnalyticsController], providers: [OverviewAnalyticsService, BusinessAnalyticsService] })
export class OverviewModule {}
