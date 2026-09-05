import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { ApproveSalesOrderDto } from './dto/approve-sales-order.dto';
import { RejectSalesOrderDto } from './dto/reject-sales-order.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('sales-orders')
@ApiBearerAuth()
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  @Get()
  @RequirePermission([PERMISSIONS.SALES_CREATE, PERMISSIONS.SALES_APPROVE, PERMISSIONS.SALES_FULFILL, PERMISSIONS.SALES_VIEW])
  list(@Query('status') status?: string, @Query('customerId') customerId?: string) {
    return this.salesOrdersService.list({ status, customerId });
  }

  @Get(':id')
  @RequirePermission([PERMISSIONS.SALES_CREATE, PERMISSIONS.SALES_APPROVE, PERMISSIONS.SALES_FULFILL, PERMISSIONS.SALES_VIEW])
  findOne(@Param('id') id: string) {
    return this.salesOrdersService.findById(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.SALES_CREATE)
  create(@Body() dto: CreateSalesOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.create(dto, actor);
  }

  @Post(':id/submit')
  @RequirePermission(PERMISSIONS.SALES_CREATE)
  submit(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.submit(id, actor);
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.SALES_APPROVE)
  approve(@Param('id') id: string, @Body() dto: ApproveSalesOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.approve(id, dto, actor);
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.SALES_APPROVE)
  reject(@Param('id') id: string, @Body() dto: RejectSalesOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.reject(id, dto, actor);
  }

  @Post(':id/fulfill')
  @RequirePermission(PERMISSIONS.SALES_FULFILL)
  fulfill(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.fulfill(id, actor);
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSIONS.SALES_CREATE)
  cancel(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.salesOrdersService.cancel(id, actor);
  }
}
