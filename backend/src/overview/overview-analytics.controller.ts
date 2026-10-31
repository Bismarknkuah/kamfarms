import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OverviewAnalyticsService } from './overview-analytics.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PERMISSIONS } from '../common/constants/permissions';

@ApiTags('overview')
@ApiBearerAuth()
@Controller('overview/analytics')
export class OverviewAnalyticsController {
  constructor(private readonly analytics: OverviewAnalyticsService) {}

  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('farms') @Header('Cache-Control', 'no-store')
  farms(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { return this.analytics.farms(actor, days); }

  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('warehouses') @Header('Cache-Control', 'no-store')
  warehouses(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { return this.analytics.warehouses(actor, days); }

  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('operations') @Header('Cache-Control', 'no-store')
  operations(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { return this.analytics.operations(actor, days); }

  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('executive') @Header('Cache-Control', 'no-store')
  executive(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { return this.analytics.executive(actor, days); }
}
