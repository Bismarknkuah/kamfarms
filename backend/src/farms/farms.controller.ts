import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FarmsService } from './farms.service';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { AssignFarmManagerDto } from './dto/assign-farm-manager.dto';
import { CreateFarmManagerDto } from './dto/create-farm-manager.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequireScope } from '../common/decorators/require-scope.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('farms')
@ApiBearerAuth()
@Controller('farms')
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.FARM_VIEW)
  list(@CurrentUser() actor: AuthenticatedUser, @Query('includeInactive') includeInactive?: string) {
    return this.farmsService.list(actor, includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.FARM_VIEW)
  @RequireScope('FARM', 'id')
  findOne(@Param('id') id: string) {
    return this.farmsService.findById(id);
  }

  @Get(':id/inventory')
  @RequirePermission(PERMISSIONS.FARM_INVENTORY_VIEW)
  @RequireScope('FARM', 'id')
  getInventory(@Param('id') id: string) {
    return this.farmsService.getInventory(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.FARM_CREATE)
  create(@Body() dto: CreateFarmDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.farmsService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.FARM_UPDATE)
  @RequireScope('FARM', 'id')
  update(@Param('id') id: string, @Body() dto: UpdateFarmDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.farmsService.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.FARM_DELETE)
  deactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.farmsService.deactivate(id, actor);
  }

  @Post(':id/managers')
  @RequirePermission(PERMISSIONS.FARM_UPDATE)
  assignManager(@Param('id') id: string, @Body() dto: AssignFarmManagerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.farmsService.assignManager(id, dto, actor);
  }

  @Post(':id/managers/new')
  @RequirePermission(PERMISSIONS.FARM_UPDATE)
  @RequireScope('FARM', 'id')
  createManager(@Param('id') id: string, @Body() dto: CreateFarmManagerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.farmsService.createManager(id, dto, actor);
  }

  @Delete(':id/managers/:userId')
  @RequirePermission(PERMISSIONS.FARM_UPDATE)
  removeManager(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.farmsService.removeManager(id, userId, actor);
  }
}
