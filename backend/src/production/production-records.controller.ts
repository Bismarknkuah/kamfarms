import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProductionRecordsService } from './production-records.service';
import { CreateProductionRecordDto } from './dto/create-production-record.dto';
import { RejectProductionRecordDto } from './dto/reject-production-record.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('production')
@ApiBearerAuth()
@Controller('production-records')
export class ProductionRecordsController {
  constructor(private readonly productionRecordsService: ProductionRecordsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.MILLING_VIEW)
  list(@CurrentUser() actor: AuthenticatedUser, @Query('millingCenterId') millingCenterId?: string, @Query('status') status?: string) {
    return this.productionRecordsService.list(actor, { millingCenterId, status });
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.MILLING_VIEW)
  findOne(@Param('id') id: string) {
    return this.productionRecordsService.findById(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.PRODUCTION_CREATE)
  create(@Body() dto: CreateProductionRecordDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.productionRecordsService.create(dto, actor);
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.PRODUCTION_APPROVE)
  approve(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.productionRecordsService.approve(id, actor);
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.PRODUCTION_APPROVE)
  reject(@Param('id') id: string, @Body() dto: RejectProductionRecordDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.productionRecordsService.reject(id, dto, actor);
  }
}
