import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { AssignWarehouseManagerDto } from './dto/assign-warehouse-manager.dto';
import { CreateMillingCenterDto } from './dto/create-milling-center.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequireScope } from '../common/decorators/require-scope.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('warehouses')
@ApiBearerAuth()
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.WAREHOUSE_VIEW)
  list(@CurrentUser() actor: AuthenticatedUser, @Query('includeInactive') includeInactive?: string) {
    return this.warehousesService.list(actor, includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.WAREHOUSE_VIEW)
  @RequireScope('WAREHOUSE', 'id')
  findOne(@Param('id') id: string) {
    return this.warehousesService.findById(id);
  }

  @Get(':id/inventory')
  @RequirePermission(PERMISSIONS.WAREHOUSE_INVENTORY_VIEW)
  @RequireScope('WAREHOUSE', 'id')
  getInventory(@Param('id') id: string) {
    return this.warehousesService.getInventory(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.WAREHOUSE_CREATE)
  create(@Body() dto: CreateWarehouseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.warehousesService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.WAREHOUSE_UPDATE)
  @RequireScope('WAREHOUSE', 'id')
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.warehousesService.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.WAREHOUSE_DELETE)
  deactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.warehousesService.deactivate(id, actor);
  }

  @Post(':id/managers')
  @RequirePermission(PERMISSIONS.WAREHOUSE_UPDATE)
  assignManager(@Param('id') id: string, @Body() dto: AssignWarehouseManagerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.warehousesService.assignManager(id, dto, actor);
  }

  @Delete(':id/managers/:userId')
  @RequirePermission(PERMISSIONS.WAREHOUSE_UPDATE)
  removeManager(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.warehousesService.removeManager(id, userId, actor);
  }

  @Post(':id/milling-centers')
  @RequirePermission(PERMISSIONS.MILLING_MANAGE)
  createMillingCenter(@Param('id') id: string, @Body() dto: CreateMillingCenterDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.warehousesService.createMillingCenter(id, dto, actor);
  }

  @Delete('milling-centers/:centerId')
  @RequirePermission(PERMISSIONS.MILLING_MANAGE)
  deactivateMillingCenter(@Param('centerId') centerId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.warehousesService.deactivateMillingCenter(centerId, actor);
  }
}
