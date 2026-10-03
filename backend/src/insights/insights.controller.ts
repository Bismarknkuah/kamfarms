import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InsightsService } from './insights.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';

@ApiTags('insights')
@ApiBearerAuth()
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  /** Where recent records look unusual against each place's own history. Read-only; for the MD and CEO. */
  @RequirePermission(PERMISSIONS.INSIGHTS_VIEW)
  @Get('watchlist')
  @Header('Cache-Control', 'no-store')
  watchlist(@Query('days') days?: string) {
    return this.insights.watchlist(days);
  }
}
