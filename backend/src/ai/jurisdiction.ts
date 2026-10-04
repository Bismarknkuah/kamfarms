import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { scopedLocationIds } from '../common/utils/scope.util';

/**
 * Whose activities the AI may look at.
 *
 * The Managing Director, the CEO and the System Administrator work across the whole company, whatever scope their
 * account carries. Everyone else is limited to the places they are assigned to: the AI never shows a person more
 * than they could already open elsewhere in the system, and never outside their own farms and warehouses.
 */
export const COMPANY_WIDE_ROLES: readonly string[] = ['MD', 'CEO', 'ADMIN'];

export interface Jurisdiction {
  /** True for the MD, CEO, Administrator, and anyone holding a company-wide (GLOBAL) scope. */
  companyWide: boolean;
  farmIds: string[];
  warehouseIds: string[];
}

export function jurisdictionOf(actor: AuthenticatedUser): Jurisdiction {
  const roles = actor.roles ?? [];
  const safe = { ...actor, roles } as AuthenticatedUser;
  const farms = scopedLocationIds(safe, 'FARM');
  const warehouses = scopedLocationIds(safe, 'WAREHOUSE');
  const byRole = roles.some((r) => COMPANY_WIDE_ROLES.includes(r.roleCode));
  return { companyWide: byRole || farms.isGlobal || warehouses.isGlobal, farmIds: farms.ids, warehouseIds: warehouses.ids };
}

/**
 * The filter that limits production records to the jurisdiction. Milling centers belong to warehouses, and the
 * warehouse is what a person is scoped to, so it filters through the center's warehouse.
 * Returns null when nothing at all is visible (a scoped person with no warehouse), so callers skip the query.
 */
export function productionScope(j: Jurisdiction): Record<string, unknown> | null {
  if (j.companyWide) return {};
  if (j.warehouseIds.length === 0) return null;
  return { millingCenter: { warehouseId: { in: j.warehouseIds } } };
}

export function assertWarehouseInJurisdiction(j: Jurisdiction, warehouseId: string, what = 'this place') {
  if (j.companyWide || j.warehouseIds.includes(warehouseId)) return;
  throw new ForbiddenException({ message: `${what[0].toUpperCase()}${what.slice(1)} is outside your jurisdiction.`, errorCode: 'SCOPE_DENIED' });
}

export const hasPermission = (actor: AuthenticatedUser, ...codes: string[]) => codes.some((c) => actor.permissionCodes?.has(c));

/** Refuses a milling center that belongs to a warehouse outside the jurisdiction. Company-wide people skip the lookup. */
export async function assertCenterInJurisdiction(prisma: PrismaService, j: Jurisdiction, millingCenterId: string) {
  if (j.companyWide) return;
  const center = await prisma.millingCenter.findUnique({ where: { id: millingCenterId }, select: { warehouseId: true } });
  if (!center) throw new NotFoundException('Milling center not found.');
  assertWarehouseInJurisdiction(j, center.warehouseId, 'this milling center');
}
