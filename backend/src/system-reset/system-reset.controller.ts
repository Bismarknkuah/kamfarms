import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemResetService } from './system-reset.service';
import { CreateResetRequestDto } from './dto/create-reset-request.dto';
import { RejectResetRequestDto } from './dto/reject-reset-request.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('system-reset')
@ApiBearerAuth()
@Controller('reset-requests')
export class SystemResetController {
  constructor(private readonly systemResetService: SystemResetService) {}

  @Get()
  @RequirePermission([PERMISSIONS.RESET_REQUEST, PERMISSIONS.RESET_APPROVE, PERMISSIONS.RESET_EXECUTE])
  list(@Query('status') status?: string) {
    return this.systemResetService.list(status);
  }

  @Get(':id')
  @RequirePermission([PERMISSIONS.RESET_REQUEST, PERMISSIONS.RESET_APPROVE, PERMISSIONS.RESET_EXECUTE])
  findOne(@Param('id') id: string) {
    return this.systemResetService.findById(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.RESET_REQUEST)
  create(@Body() dto: CreateResetRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.systemResetService.create(dto, actor);
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.RESET_APPROVE)
  approve(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.systemResetService.approve(id, actor);
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.RESET_APPROVE)
  reject(@Param('id') id: string, @Body() dto: RejectResetRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.systemResetService.reject(id, dto, actor);
  }

  @Post(':id/execute')
  @RequirePermission(PERMISSIONS.RESET_EXECUTE)
  execute(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.systemResetService.execute(id, actor);
  }
}
