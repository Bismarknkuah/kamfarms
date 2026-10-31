import { Controller, ForbiddenException, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OverviewAnalyticsService } from './overview-analytics.service';
import { BusinessAnalyticsService } from './business-analytics.service';
import { PlaceOverviewService } from './place-overview.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PERMISSIONS } from '../common/constants/permissions';
import { ReportArea, coversArea } from '../reports/report-areas';

/** Each analytics view belongs to one area of the business; a person gets the views of their own area only, whatever else they may read. */
function inArea(actor: AuthenticatedUser, areas: ReportArea[]) {
  if (!coversArea(actor, areas)) throw new ForbiddenException({ message: 'That view is outside your area of work.', errorCode: 'ANALYTICS_OUTSIDE_AREA' });
}

@ApiTags('overview')
@ApiBearerAuth()
@Controller('overview/analytics')
export class OverviewAnalyticsController {
  constructor(private readonly analytics: OverviewAnalyticsService, private readonly business: BusinessAnalyticsService, private readonly places: PlaceOverviewService) {}

  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('farms') @Header('Cache-Control', 'no-store')
  farms(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { inArea(actor, ['farm', 'oversight']); return this.analytics.farms(actor, days); }

  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('warehouses') @Header('Cache-Control', 'no-store')
  warehouses(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { inArea(actor, ['warehouse', 'oversight']); return this.analytics.warehouses(actor, days); }

  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('operations') @Header('Cache-Control', 'no-store')
  operations(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { inArea(actor, ['milling', 'oversight']); return this.analytics.operations(actor, days); }

  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('executive') @Header('Cache-Control', 'no-store')
  executive(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { inArea(actor, ['oversight']); return this.analytics.executive(actor, days); }

  @RequirePermission([PERMISSIONS.SALES_VIEW, PERMISSIONS.SALES_CREATE, PERMISSIONS.FINANCE_VIEW]) @Get('sales') @Header('Cache-Control', 'no-store')
  sales(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { inArea(actor, ['sales', 'oversight']); return this.business.sales(actor, days); }

  @RequirePermission(PERMISSIONS.FINANCE_VIEW) @Get('finance') @Header('Cache-Control', 'no-store')
  finance(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { inArea(actor, ['finance', 'oversight']); return this.business.finance(actor, days); }

  @RequirePermission(PERMISSIONS.USERS_MANAGE) @Get('system') @Header('Cache-Control', 'no-store')
  system(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { inArea(actor, ['admin']); return this.business.system(actor, days); }

  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('pulse') @Header('Cache-Control', 'no-store')
  pulse(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { inArea(actor, ['oversight']); return this.business.pulse(actor, days); }

  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('audit') @Header('Cache-Control', 'no-store')
  audit(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { inArea(actor, ['oversight']); return this.business.audit(actor, days); }

  /** One farm, warehouse or milling center, for the people who work there: only the places they are assigned to. */
  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('my-farm') @Header('Cache-Control', 'no-store')
  myFarm(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { inArea(actor, ['farm', 'oversight']); return this.places.farms(actor, days); }

  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('my-warehouse') @Header('Cache-Control', 'no-store')
  myWarehouse(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { inArea(actor, ['warehouse', 'oversight']); return this.places.warehouses(actor, days); }

  @RequirePermission(PERMISSIONS.REPORTS_VIEW) @Get('my-mill') @Header('Cache-Control', 'no-store')
  myMill(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) { inArea(actor, ['milling', 'oversight']); return this.places.mills(actor, days); }
}
