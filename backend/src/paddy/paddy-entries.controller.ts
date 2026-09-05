import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaddyEntryStatus } from '@prisma/client';
import { PaddyEntriesService } from './paddy-entries.service';
import { CreatePaddyEntryDto } from './dto/create-paddy-entry.dto';
import { UpdatePaddyEntryDto } from './dto/update-paddy-entry.dto';
import { RejectPaddyEntryDto } from './dto/reject-paddy-entry.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('paddy-entries')
@ApiBearerAuth()
@Controller('paddy-entries')
export class PaddyEntriesController {
  constructor(private readonly paddyEntriesService: PaddyEntriesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.FARM_INVENTORY_VIEW)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('farmId') farmId?: string,
    @Query('status') status?: PaddyEntryStatus,
  ) {
    return this.paddyEntriesService.list(actor, { farmId, status });
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.FARM_INVENTORY_VIEW)
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.paddyEntriesService.findById(id, actor);
  }

  @Post()
  @RequirePermission(PERMISSIONS.PADDY_CREATE)
  create(@Body() dto: CreatePaddyEntryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.paddyEntriesService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.PADDY_CREATE)
  update(@Param('id') id: string, @Body() dto: UpdatePaddyEntryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.paddyEntriesService.update(id, dto, actor);
  }

  @Post(':id/submit')
  @RequirePermission(PERMISSIONS.PADDY_SUBMIT)
  submit(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.paddyEntriesService.submit(id, actor);
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.PADDY_APPROVE)
  approve(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.paddyEntriesService.approve(id, actor);
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.PADDY_REJECT)
  reject(@Param('id') id: string, @Body() dto: RejectPaddyEntryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.paddyEntriesService.reject(id, dto, actor);
  }
}
