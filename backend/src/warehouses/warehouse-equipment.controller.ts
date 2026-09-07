import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WarehouseEquipmentService } from './warehouse-equipment.service';
import { CreateWarehouseEquipmentDto } from './dto/create-warehouse-equipment.dto';
import { UpdateWarehouseEquipmentDto } from './dto/update-warehouse-equipment.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('warehouse-equipment')
@ApiBearerAuth()
@Controller('warehouse-equipment')
export class WarehouseEquipmentController {
  constructor(private readonly warehouseEquipmentService: WarehouseEquipmentService) {}

  @Get()
  @RequirePermission([PERMISSIONS.WAREHOUSE_EQUIPMENT_MANAGE, PERMISSIONS.WAREHOUSE_INVENTORY_VIEW])
  list(@CurrentUser() actor: AuthenticatedUser, @Query('warehouseId') warehouseId?: string) {
    return this.warehouseEquipmentService.list(actor, warehouseId);
  }

  @Post()
  @RequirePermission(PERMISSIONS.WAREHOUSE_EQUIPMENT_MANAGE)
  create(@Body() dto: CreateWarehouseEquipmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.warehouseEquipmentService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.WAREHOUSE_EQUIPMENT_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseEquipmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.warehouseEquipmentService.update(id, dto, actor);
  }
}
