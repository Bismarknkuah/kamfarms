import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { DispatchTrackingService } from './dispatch-tracking.service';

@ApiTags('dispatch-tracking')
@ApiBearerAuth()
@Controller('dispatch-tracking')
export class DispatchTrackingController {
  constructor(private readonly service: DispatchTrackingService) {}

  /** The dispatches the signed-in person may track. What they see is decided from their role and places, never from anything they send. */
  @Get()
  @RequirePermission(PERMISSIONS.DISPATCH_TRACK)
  list(@CurrentUser() actor: AuthenticatedUser, @Query('status') status?: string, @Query('q') q?: string) {
    return this.service.list(actor, { status: status === 'open' || status === 'delivered' ? status : 'all', q });
  }
}
