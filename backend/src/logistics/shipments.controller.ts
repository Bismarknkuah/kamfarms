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

  @Get()
  @RequirePermission(PERMISSIONS.WAREHOUSE_INVENTORY_VIEW)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('warehouseId') warehouseId?: string,
    @Query('farmId') farmId?: string,
    @Query('inTransitOnly') inTransitOnly?: string,
  ) {
    return this.shipmentsService.list(actor, { warehouseId, farmId, inTransitOnly: inTransitOnly === 'true' });
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.WAREHOUSE_INVENTORY_VIEW)
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.shipmentsService.findById(id, actor);
  }

  @Post(':id/receive')
  @RequirePermission(PERMISSIONS.WAREHOUSE_RECEIVE)
  receive(@Param('id') id: string, @Body() dto: ReceiveShipmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.shipmentsService.receive(id, dto, actor);
  }
}
