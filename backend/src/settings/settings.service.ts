import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** The only keys this app currently reads or writes - kept as an
 * explicit, typed list rather than letting callers pass arbitrary
 * strings, so a typo in a key name fails at compile time instead of
 * silently reading/writing nothing. Add here first if a new setting
 * is ever needed. */
export const SETTING_KEYS = {
  NOTIFICATION_FROM_EMAIL: 'notification_from_email',
  NOTIFICATION_FROM_NAME: 'notification_from_name',
  NOTIFICATION_FROM_PHONE: 'notification_from_phone',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(key: SettingKey): Promise<string | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemSetting.findMany({ where: { key: { in: Object.values(SETTING_KEYS) } } });
    return Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
  }

  async set(key: SettingKey, value: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
