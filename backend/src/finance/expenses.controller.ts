import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { RejectExpenseDto } from './dto/reject-expense.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  @RequirePermission([PERMISSIONS.FINANCE_VIEW, PERMISSIONS.EXPENSE_CREATE])
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('farmId') farmId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.expensesService.list(actor, { status, farmId, warehouseId });
  }

  @Get(':id')
  @RequirePermission([PERMISSIONS.FINANCE_VIEW, PERMISSIONS.EXPENSE_CREATE])
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.expensesService.findById(id, actor);
  }

  @Post()
  @RequirePermission(PERMISSIONS.EXPENSE_CREATE)
  create(@Body() dto: CreateExpenseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.expensesService.create(dto, actor);
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.FINANCE_APPROVE)
  approve(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.expensesService.approve(id, actor);
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.FINANCE_APPROVE)
  reject(@Param('id') id: string, @Body() dto: RejectExpenseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.expensesService.reject(id, dto, actor);
  }
}
