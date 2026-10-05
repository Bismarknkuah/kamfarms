import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleAccessService } from './role-access.service';
import { SetRoleFeaturesDto } from './dto/set-role-features.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('access')
@ApiBearerAuth()
@Controller('access')
export class AccessController {
  constructor(private readonly service: RoleAccessService) {}

  /** Every feature that can be switched off, every role, and what is switched off for each. */
  @Get('features') @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  features() { return this.service.matrix(); }

  /** Replace the list of features switched off for one role. */
  @Put('features/:roleCode') @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  save(@Param('roleCode') roleCode: string, @Body() dto: SetRoleFeaturesDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.setForRole(roleCode, dto.denied, actor); }
}
