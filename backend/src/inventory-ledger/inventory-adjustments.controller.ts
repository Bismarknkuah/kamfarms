import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { RejectInventoryAdjustmentDto } from './dto/reject-inventory-adjustment.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('inventory-adjustments')
@ApiBearerAuth()
@Controller('inventory-adjustments')
export class InventoryAdjustmentsController {
  constructor(private readonly inventoryAdjustmentsService: InventoryAdjustmentsService) {}

  @Get()
  @RequirePermission([PERMISSIONS.FARM_INVENTORY_VIEW, PERMISSIONS.WAREHOUSE_INVENTORY_VIEW, PERMISSIONS.INVENTORY_ADJUST])
  list(@CurrentUser() actor: AuthenticatedUser, @Query('status') status?: string) {
    return this.inventoryAdjustmentsService.list(actor, status);
  }

  @Get(':id')
  @RequirePermission([PERMISSIONS.FARM_INVENTORY_VIEW, PERMISSIONS.WAREHOUSE_INVENTORY_VIEW, PERMISSIONS.INVENTORY_ADJUST])
  findOne(@Param('id') id: string) {
    return this.inventoryAdjustmentsService.findById(id);
  }

  @Post()
  @RequirePermission([PERMISSIONS.FARM_INVENTORY_VIEW, PERMISSIONS.WAREHOUSE_INVENTORY_VIEW])
  create(@Body() dto: CreateInventoryAdjustmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.inventoryAdjustmentsService.create(dto, actor);
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.INVENTORY_ADJUST)
  approve(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.inventoryAdjustmentsService.approve(id, actor);
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.INVENTORY_ADJUST)
  reject(@Param('id') id: string, @Body() dto: RejectInventoryAdjustmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.inventoryAdjustmentsService.reject(id, dto, actor);
  }
}
