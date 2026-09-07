import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.PERMISSIONS_MANAGE)
  list(@Query('grouped') grouped?: string) {
    return grouped === 'true' ? this.permissionsService.listGroupedByModule() : this.permissionsService.list();
  }
}
