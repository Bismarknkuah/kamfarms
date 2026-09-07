import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FarmEquipmentService } from './farm-equipment.service';
import { CreateFarmEquipmentDto } from './dto/create-farm-equipment.dto';
import { UpdateFarmEquipmentDto } from './dto/update-farm-equipment.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('farm-equipment')
@ApiBearerAuth()
@Controller('farm-equipment')
export class FarmEquipmentController {
  constructor(private readonly farmEquipmentService: FarmEquipmentService) {}

  @Get()
  @RequirePermission([PERMISSIONS.FARM_EQUIPMENT_MANAGE, PERMISSIONS.FARM_INVENTORY_VIEW])
  list(@CurrentUser() actor: AuthenticatedUser, @Query('farmId') farmId?: string) {
    return this.farmEquipmentService.list(actor, farmId);
  }

  @Post()
  @RequirePermission(PERMISSIONS.FARM_EQUIPMENT_MANAGE)
  create(@Body() dto: CreateFarmEquipmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.farmEquipmentService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.FARM_EQUIPMENT_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateFarmEquipmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.farmEquipmentService.update(id, dto, actor);
  }
}
