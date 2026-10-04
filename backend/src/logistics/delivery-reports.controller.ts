import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DeliveryReportsService } from './delivery-reports.service';
import { CreateDeliveryReportDto } from './dto/create-delivery-report.dto';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { UpdateDeliveryReportDto } from './dto/update-delivery-report.dto';
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

  @Patch(':id')
  @RequirePermission(PERMISSIONS.DELIVERY_CREATE)
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryReportDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReportsService.update(id, dto, actor);
  }

  /** ONE dispatch: one truck with every size on it, prepared in one go. */
  @Post('dispatch')
  @RequirePermission(PERMISSIONS.DELIVERY_CREATE)
  createDispatch(@Body() dto: CreateDispatchDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReportsService.createDispatch(dto, actor);
  }

  @Post('dispatch/:ref/submit')
  @RequirePermission(PERMISSIONS.DELIVERY_CREATE)
  submitDispatch(@Param('ref') ref: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReportsService.submitDispatch(ref, actor);
  }

  @Post('dispatch/:ref/approve')
  @RequirePermission(PERMISSIONS.DELIVERY_APPROVE)
  approveDispatch(@Param('ref') ref: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReportsService.approveDispatch(ref, actor);
  }

  @Post('dispatch/:ref/reject')
  @RequirePermission(PERMISSIONS.DELIVERY_REJECT)
  rejectDispatch(@Param('ref') ref: string, @Body() dto: RejectDeliveryReportDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReportsService.rejectDispatch(ref, dto, actor);
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
