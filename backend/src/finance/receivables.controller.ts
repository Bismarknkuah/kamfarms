import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReceivablesService } from './receivables.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('receivables')
export class ReceivablesController {
  constructor(private readonly receivablesService: ReceivablesService) {}

  @Get('top-debtors')
  @RequirePermission(PERMISSIONS.FINANCE_VIEW)
  topDebtors(@Query('limit') limit?: string) {
    return this.receivablesService.topDebtors(limit ? parseInt(limit, 10) : undefined);
  }

  @Get(':customerId')
  @RequirePermission(PERMISSIONS.FINANCE_VIEW)
  forCustomer(@Param('customerId') customerId: string) {
    return this.receivablesService.forCustomer(customerId);
  }
}
