import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MachinesService } from './machines.service';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineStatusDto } from './dto/update-machine-status.dto';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { CreateMeterReadingDto } from './dto/create-meter-reading.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('machines')
@ApiBearerAuth()
@Controller('machines')
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.MACHINE_VIEW)
  list(@CurrentUser() actor: AuthenticatedUser, @Query('millingCenterId') millingCenterId?: string) {
    return this.machinesService.list(actor, millingCenterId);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.MACHINE_VIEW)
  findOne(@Param('id') id: string) {
    return this.machinesService.findById(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.MACHINE_MANAGE)
  create(@Body() dto: CreateMachineDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.machinesService.create(dto, actor);
  }

  @Patch(':id/status')
  @RequirePermission(PERMISSIONS.MACHINE_MANAGE)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateMachineStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.machinesService.updateStatus(id, dto, actor);
  }

  @Post(':id/maintenance')
  @RequirePermission(PERMISSIONS.MACHINE_MANAGE)
  recordMaintenance(@Param('id') id: string, @Body() dto: CreateMaintenanceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.machinesService.recordMaintenance(id, dto, actor);
  }

  @Post(':id/meter-readings')
  @RequirePermission(PERMISSIONS.METER_CREATE)
  recordMeterReading(@Param('id') id: string, @Body() dto: CreateMeterReadingDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.machinesService.recordMeterReading(id, dto, actor);
  }
}
