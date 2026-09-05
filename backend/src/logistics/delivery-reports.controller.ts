import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DeliveryReportsService } from './delivery-reports.service';
import { CreateDeliveryReportDto } from './dto/create-delivery-report.dto';
import { RejectDeliveryReportDto } from './dto/reject-delivery-report.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('delivery-reports')
@ApiBearerAuth()
@Controller('delivery-reports')
export class DeliveryReportsController {
  constructor(private readonly deliveryReportsService: DeliveryReportsService) {}

  @Get()
  @RequirePermission([PERMISSIONS.FARM_INVENTORY_VIEW, PERMISSIONS.DELIVERY_VIEW])
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('farmId') farmId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
  ) {
    return this.deliveryReportsService.list(actor, { farmId, warehouseId, status });
  }

  @Get(':id')
  @RequirePermission([PERMISSIONS.FARM_INVENTORY_VIEW, PERMISSIONS.DELIVERY_VIEW])
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReportsService.findById(id, actor);
  }

  @Post()
  @RequirePermission(PERMISSIONS.DELIVERY_CREATE)
  create(@Body() dto: CreateDeliveryReportDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReportsService.create(dto, actor);
  }

  @Post(':id/submit')
  @RequirePermission(PERMISSIONS.DELIVERY_CREATE)
  submit(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReportsService.submit(id, actor);
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.DELIVERY_APPROVE)
  approve(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReportsService.approve(id, actor);
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.DELIVERY_REJECT)
  reject(@Param('id') id: string, @Body() dto: RejectDeliveryReportDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReportsService.reject(id, dto, actor);
  }
}
