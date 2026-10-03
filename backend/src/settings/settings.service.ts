import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { SERIOUS_AFTER, SETTING_BY_KEY, SETTING_DEFS, SettingDef, SettingGroup, SettingType, defOf } from './settings.registry';

/** The notification sender identity keys (edited on the Admin page). Business rules live in settings.registry.ts. */
export const SETTING_KEYS = {
  NOTIFICATION_FROM_EMAIL: 'notification_from_email',
  NOTIFICATION_FROM_NAME: 'notification_from_name',
  NOTIFICATION_FROM_PHONE: 'notification_from_phone',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export interface EffectiveSetting {
  key: string;
  group: SettingGroup;
  label: string;
  help: string;
  type: SettingType;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  default: number | string[];
  value: number | string[];
  isDefault: boolean;
}

type Value = number | string[];
const CACHE_MS = 15_000;

const same = (a: Value, b: Value) => (Array.isArray(a) && Array.isArray(b) ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()) : a === b);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function numberFrom(raw: string | undefined, def: SettingDef): number {
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(n)) return def.default as number;
  return Math.min(def.max ?? n, Math.max(def.min ?? n, n)); // a hand-edited value can never take the system outside its safe range
}
function rolesFrom(raw: string | undefined, def: SettingDef): string[] {
  try {
    const parsed = raw === undefined ? null : JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((x) => typeof x === 'string')) return parsed as string[];
  } catch {
    // a damaged value falls back to the default
  }
  return def.default as string[];
}

function parseNumber(def: SettingDef, v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new BadRequestException(`${def.label}: enter a number.`);
  if ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) {
    throw new BadRequestException(`${def.label}: must be between ${def.min} and ${def.max}${def.unit ? ' ' + def.unit : ''}.`);
  }
  return round3(n);
}

@Injectable()
export class SettingsService {
  private cache: { at: number; map: Map<string, string> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  // ----- the notification sender identity (unchanged) -----

  async get(key: SettingKey): Promise<string | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemSetting.findMany({ where: { key: { in: Object.values(SETTING_KEYS) } } });
    return Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
  }

  async set(key: SettingKey, value: string): Promise<void> {
    await this.prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    this.cache = null;
  }

  // ----- business rules, read by the services -----

  private async map(): Promise<Map<string, string>> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.map;
    const rows = (await this.prisma.systemSetting.findMany({ select: { key: true, value: true } })) as { key: string; value: string }[];
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.key, r.value);
    this.cache = { at: now, map };
    return map;
  }

  /** Forget what was read, so the next read sees the database. */
  invalidate() {
    this.cache = null;
  }

  async getNumber(key: string): Promise<number> {
    const def = defOf(key);
    return numberFrom((await this.map()).get(key), def);
  }

  async getRoles(key: string): Promise<string[]> {
    const def = defOf(key);
    return rolesFrom((await this.map()).get(key), def);
  }

  // ----- the administrator's screen -----

  async effective(): Promise<EffectiveSetting[]> {
    const map = await this.map();
    return SETTING_DEFS.map((d) => {
      const value: Value = d.type === 'number' ? numberFrom(map.get(d.key), d) : rolesFrom(map.get(d.key), d);
      return { key: d.key, group: d.group, label: d.label, help: d.help, type: d.type, unit: d.unit, min: d.min, max: d.max, step: d.step, default: d.default, value, isDefault: same(value, d.default) };
    });
  }

  private async parseRoles(def: SettingDef, v: unknown): Promise<string[]> {
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new BadRequestException(`${def.label}: choose roles from the list.`);
    const codes = Array.from(new Set(v as string[]));
    if (codes.length === 0) throw new BadRequestException(`${def.label}: choose at least one role, otherwise nobody would be told.`);
    const found = (await this.prisma.role.findMany({ where: { code: { in: codes } }, select: { code: true } })) as { code: string }[];
    const known = new Set(found.map((r) => r.code));
    const missing = codes.filter((c) => !known.has(c));
    if (missing.length > 0) throw new BadRequestException(`${def.label}: ${missing.join(', ')} ${missing.length === 1 ? 'is not a role' : 'are not roles'} in this system.`);
    return codes;
  }

  async updateMany(values: Record<string, unknown>, actor: AuthenticatedUser): Promise<EffectiveSetting[]> {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new BadRequestException('Send the settings to change as a list of keys and values.');
    const keys = Object.keys(values);
    if (keys.length === 0) throw new BadRequestException('There is nothing to change.');

    const current = await this.effective();
    const before = new Map<string, Value>(current.map((c) => [c.key, c.value] as [string, Value]));
    const next = new Map<string, Value>(before);
    for (const key of keys) {
      const def = SETTING_BY_KEY.get(key);
      if (!def) throw new BadRequestException(`"${key}" is not a setting this system has.`);
      next.set(key, def.type === 'number' ? parseNumber(def, values[key]) : await this.parseRoles(def, values[key]));
    }
    for (const pair of SERIOUS_AFTER) {
      if ((next.get(pair.serious) as number) < (next.get(pair.flag) as number)) {
        throw new BadRequestException(`The serious limit for ${pair.what} must be at least as high as the limit at which it is first flagged.`);
      }
    }

    const changed = keys.filter((k) => !same(before.get(k) as Value, next.get(k) as Value));
    for (const key of changed) {
      const def = defOf(key);
      const value = next.get(key) as Value;
      if (same(value, def.default)) {
        await this.prisma.systemSetting.deleteMany({ where: { key } }); // back to the default: nothing to store
      } else {
        const stored = JSON.stringify(value) === undefined ? '' : def.type === 'roles' ? JSON.stringify(value) : String(value);
        await this.prisma.systemSetting.upsert({ where: { key }, update: { value: stored }, create: { key, value: stored } });
      }
    }
    this.cache = null;
    if (changed.length > 0 && this.audit) {
      await this.audit.record({
        userId: actor.id,
        action: 'settings.update',
        entity: 'SystemSetting',
        entityId: 'registry',
        beforeValue: Object.fromEntries(changed.map((k) => [k, before.get(k)])),
        afterValue: Object.fromEntries(changed.map((k) => [k, next.get(k)])),
      });
    }
    return this.effective();
  }

  async resetOne(key: string, actor: AuthenticatedUser): Promise<EffectiveSetting[]> {
    const def = SETTING_BY_KEY.get(key);
    if (!def) throw new BadRequestException(`"${key}" is not a setting this system has.`);
    const before = (await this.effective()).find((e) => e.key === key)?.value;
    await this.prisma.systemSetting.deleteMany({ where: { key } });
    this.cache = null;
    if (this.audit && !same(before as Value, def.default)) {
      await this.audit.record({ userId: actor.id, action: 'settings.reset', entity: 'SystemSetting', entityId: key, beforeValue: { [key]: before }, afterValue: { [key]: def.default } });
    }
    return this.effective();
  }
}

/** For services that take the settings service as an optional extra: with none, the registry default applies. */
export async function settingNumber(settings: SettingsService | undefined, key: string): Promise<number> {
  return settings ? settings.getNumber(key) : (defOf(key).default as number);
}
export async function settingRoles(settings: SettingsService | undefined, key: string): Promise<string[]> {
  return settings ? settings.getRoles(key) : (defOf(key).default as string[]);
}
