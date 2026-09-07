import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShipmentsService } from './shipments.service';
import { ReceiveShipmentDto } from './dto/receive-shipment.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('shipments')
@ApiBearerAuth()
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  // Was WAREHOUSE_INVENTORY_VIEW only - a real, compounding bug on top
  // of the service's own scoping gap: even once the service correctly
  // supported a Farm Manager seeing their own farm's shipments, the
  // controller's permission gate would have blocked them with a 403
  // before ever reaching that logic. delivery.create (Farm Manager) and
  // delivery.approve (Farm Supervisor) added so both sides of a
  // dispatch can actually track it, not just the receiving warehouse.
  @Get()
  @RequirePermission([PERMISSIONS.WAREHOUSE_INVENTORY_VIEW, PERMISSIONS.DELIVERY_CREATE, PERMISSIONS.DELIVERY_APPROVE])
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('warehouseId') warehouseId?: string,
    @Query('farmId') farmId?: string,
    @Query('inTransitOnly') inTransitOnly?: string,
  ) {
    return this.shipmentsService.list(actor, { warehouseId, farmId, inTransitOnly: inTransitOnly === 'true' });
  }

  @Get(':id')
  @RequirePermission([PERMISSIONS.WAREHOUSE_INVENTORY_VIEW, PERMISSIONS.DELIVERY_CREATE, PERMISSIONS.DELIVERY_APPROVE])
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.shipmentsService.findById(id, actor);
  }

  @Post(':id/receive')
  @RequirePermission(PERMISSIONS.WAREHOUSE_RECEIVE)
  receive(@Param('id') id: string, @Body() dto: ReceiveShipmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.shipmentsService.receive(id, dto, actor);
  }

  @Post(':id/location')
  @RequirePermission(PERMISSIONS.DELIVERY_APPROVE)
  addLocationUpdate(@Param('id') id: string, @Body('notes') notes: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.shipmentsService.addLocationUpdate(id, notes, actor);
  }
}
