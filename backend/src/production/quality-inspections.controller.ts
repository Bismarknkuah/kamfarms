import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QualityInspectionsService } from './quality-inspections.service';
import { CreateQualityInspectionDto } from './dto/create-quality-inspection.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('quality')
@ApiBearerAuth()
@Controller('quality-inspections')
export class QualityInspectionsController {
  constructor(private readonly qualityInspectionsService: QualityInspectionsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.MILLING_VIEW)
  list(@Query('batchNumber') batchNumber?: string) {
    return this.qualityInspectionsService.list(batchNumber);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.MILLING_VIEW)
  findOne(@Param('id') id: string) {
    return this.qualityInspectionsService.findById(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.QUALITY_MANAGE)
  create(@Body() dto: CreateQualityInspectionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.qualityInspectionsService.create(dto, actor);
  }

  @Post(':id/release')
  @RequirePermission(PERMISSIONS.QUALITY_MANAGE)
  release(@Param('id') id: string, @Body('notes') notes: string | undefined, @CurrentUser() actor: AuthenticatedUser) {
    return this.qualityInspectionsService.release(id, actor, notes);
  }
}
