import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PackagingBatchesService } from './packaging-batches.service';
import { CreatePackagingBatchDto } from './dto/create-packaging-batch.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('packaging')
@ApiBearerAuth()
@Controller('packaging-batches')
export class PackagingBatchesController {
  constructor(private readonly packagingBatchesService: PackagingBatchesService) {}

  @Get()
  @RequirePermission([PERMISSIONS.WAREHOUSE_INVENTORY_VIEW, PERMISSIONS.PACKAGING_CREATE])
  list(@CurrentUser() actor: AuthenticatedUser, @Query('warehouseId') warehouseId?: string) {
    return this.packagingBatchesService.list(actor, warehouseId);
  }

  @Get(':id')
  @RequirePermission([PERMISSIONS.WAREHOUSE_INVENTORY_VIEW, PERMISSIONS.PACKAGING_CREATE])
  findOne(@Param('id') id: string) {
    return this.packagingBatchesService.findById(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.PACKAGING_CREATE)
  create(@Body() dto: CreatePackagingBatchDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.packagingBatchesService.create(dto, actor);
  }
}
