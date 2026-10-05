import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FinanceCenterService } from './finance-center.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('finance-center')
@ApiBearerAuth()
@Controller('finance-center')
export class FinanceCenterController {
  constructor(private readonly service: FinanceCenterService) {}

  /** The company's money at a glance, for a period: sales, what came in, what was spent at every farm, warehouse and milling center, what is owed, what waits for a decision. */
  @Get('overview') @RequirePermission(PERMISSIONS.FINANCE_VIEW)
  overview(@CurrentUser() actor: AuthenticatedUser, @Query('period') period?: string) { return this.service.overview(actor, period); }

  /** Every payment received and every expense, filterable. */
  @Get('ledger') @RequirePermission(PERMISSIONS.FINANCE_VIEW)
  ledger(@CurrentUser() actor: AuthenticatedUser, @Query('kind') kind?: string, @Query('place') place?: string, @Query('status') status?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('q') q?: string, @Query('limit') limit?: string) {
    return this.service.ledger(actor, { kind, place, status, from, to, q, limit });
  }
}
