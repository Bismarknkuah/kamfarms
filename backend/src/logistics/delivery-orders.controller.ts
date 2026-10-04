import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DeliveryOrdersService } from './delivery-orders.service';
import { CreateDeliveryOrderDto } from './dto/create-delivery-order.dto';
import { CreateDispatchRequestDto } from './dto/create-dispatch-request.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('delivery-orders')
@ApiBearerAuth()
@Controller('delivery-orders')
export class DeliveryOrdersController {
  constructor(private readonly deliveryOrdersService: DeliveryOrdersService) {}

  @Get()
  @RequirePermission([PERMISSIONS.FARM_INVENTORY_VIEW, PERMISSIONS.DELIVERY_VIEW])
  list(@CurrentUser() actor: AuthenticatedUser, @Query('farmId') farmId?: string, @Query('warehouseId') warehouseId?: string) {
    return this.deliveryOrdersService.list(actor, { farmId, warehouseId });
  }

  // Declared before ':id' deliberately - a literal path segment
  // ("trace") needs to be registered ahead of a single-segment
  // wildcard, the same lesson already applied to warehouses/directory
  // earlier this session. Two segments here vs one for ':id' means
  // there's actually no ambiguity either way, but the ordering
  // convention stays consistent regardless.
  /** Every dispatch request as one card, shared by the supervisor and the farm manager. */
  @Get('requests')
  @RequirePermission([PERMISSIONS.FARM_INVENTORY_VIEW, PERMISSIONS.DELIVERY_VIEW])
  requests(@CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryOrdersService.board(actor);
  }

  @Get('trace/:orderNumber')
  @RequirePermission([PERMISSIONS.FARM_INVENTORY_VIEW, PERMISSIONS.DELIVERY_VIEW])
  getFullTrace(@Param('orderNumber') orderNumber: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryOrdersService.getFullTrace(orderNumber, actor);
  }

  @Get(':id')
  @RequirePermission([PERMISSIONS.FARM_INVENTORY_VIEW, PERMISSIONS.DELIVERY_VIEW])
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryOrdersService.findById(id, actor);
  }

  @Post()
  @RequirePermission(PERMISSIONS.DELIVERY_CREATE)
  create(@Body() dto: CreateDeliveryOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryOrdersService.create(dto, actor);
  }

  /** A request to a farm manager: every size in one go, to one warehouse, with a needed-by date and instructions. It also becomes a task. */
  @Post('request')
  @RequirePermission(PERMISSIONS.DELIVERY_CREATE)
  createRequest(@Body() dto: CreateDispatchRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryOrdersService.createRequest(dto, actor);
  }
}
