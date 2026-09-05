import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from '../constants/permissions';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Marks an endpoint as requiring a permission. Enforced by
 * PermissionGuard — never trust frontend nav hiding alone.
 *
 * Accepts either a single code, or an array for OR-matching (the caller
 * needs at least one of them) — added after a real bug: system-reset's
 * view endpoints originally required only `reset.request` (Admin-only),
 * which meant Finance Director and MD — who hold `reset.approve` but
 * never `reset.request` — could approve a reset they were structurally
 * unable to even see. Some actions genuinely need "any one of several
 * roles with a stake here", not just a single gate.
 */
export const RequirePermission = (permission: PermissionCode | PermissionCode[]) =>
  SetMetadata(PERMISSION_KEY, permission);
