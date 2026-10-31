import { Module } from '@nestjs/common';
import { OverviewAnalyticsController } from './overview-analytics.controller';
import { OverviewAnalyticsService } from './overview-analytics.service';
import { BusinessAnalyticsService } from './business-analytics.service';
import { PlaceOverviewService } from './place-overview.service';

@Module({ controllers: [OverviewAnalyticsController], providers: [OverviewAnalyticsService, BusinessAnalyticsService, PlaceOverviewService] })
export class OverviewModule {}
