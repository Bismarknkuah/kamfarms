import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemOverviewService } from './system-overview.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';

@ApiTags('system')
@ApiBearerAuth()
@Controller('system')
export class SystemOverviewController {
  constructor(private readonly overview: SystemOverviewService) {}

  /** The System Administrator's control center. */
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  @Get('overview')
  @Header('Cache-Control', 'no-store')
  get() {
    return this.overview.overview();
  }
}
