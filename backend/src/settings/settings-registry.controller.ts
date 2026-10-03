import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { SETTING_GROUPS } from './settings.registry';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

/** The business rules and policies the System Administrator can change from the screen. */
@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings/registry')
export class SettingsRegistryController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  async list() {
    return { groups: SETTING_GROUPS, items: await this.settings.effective() };
  }

  @Patch()
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  async update(@Body() body: { values?: Record<string, unknown> }, @CurrentUser() actor: AuthenticatedUser) {
    return { groups: SETTING_GROUPS, items: await this.settings.updateMany(body?.values ?? {}, actor) };
  }

  @Delete(':key')
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  async reset(@Param('key') key: string, @CurrentUser() actor: AuthenticatedUser) {
    return { groups: SETTING_GROUPS, items: await this.settings.resetOne(key, actor) };
  }
}
