import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SettingsService, SETTING_KEYS } from './settings.service';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings/notifications')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** dashboard.view (everyone) rather than settings.manage - what the
   * sender identity currently is isn't sensitive information, and
   * hiding it would mean the person editing it (Admin) is the only
   * one who can even confirm what's configured. Editing it is the
   * part that's actually gated. */
  @Get()
  @RequirePermission(PERMISSIONS.DASHBOARD_VIEW)
  async get() {
    const settings = await this.settingsService.getAll();
    return {
      success: true,
      message: null,
      errorCode: null,
      data: {
        fromEmail: settings[SETTING_KEYS.NOTIFICATION_FROM_EMAIL] ?? null,
        fromName: settings[SETTING_KEYS.NOTIFICATION_FROM_NAME] ?? null,
        fromPhone: settings[SETTING_KEYS.NOTIFICATION_FROM_PHONE] ?? null,
      },
    };
  }

  @Patch()
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  async update(@Body() dto: UpdateNotificationSettingsDto) {
    if (dto.fromEmail !== undefined) await this.settingsService.set(SETTING_KEYS.NOTIFICATION_FROM_EMAIL, dto.fromEmail);
    if (dto.fromName !== undefined) await this.settingsService.set(SETTING_KEYS.NOTIFICATION_FROM_NAME, dto.fromName);
    if (dto.fromPhone !== undefined) await this.settingsService.set(SETTING_KEYS.NOTIFICATION_FROM_PHONE, dto.fromPhone);
    const settings = await this.settingsService.getAll();
    return {
      success: true,
      message: 'Notification settings updated.',
      errorCode: null,
      data: {
        fromEmail: settings[SETTING_KEYS.NOTIFICATION_FROM_EMAIL] ?? null,
        fromName: settings[SETTING_KEYS.NOTIFICATION_FROM_NAME] ?? null,
        fromPhone: settings[SETTING_KEYS.NOTIFICATION_FROM_PHONE] ?? null,
      },
    };
  }
}
