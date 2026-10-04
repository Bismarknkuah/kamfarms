import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PERMISSIONS } from '../common/constants/permissions';
import { scopedLocationIds } from '../common/utils/scope.util';

/**
 * Who may see which sales orders. This is what keeps each Sales Officer's work their own:
 *  - a Sales Officer (who can create orders but takes no part in approving, releasing, assigning or delivering) sees only
 *    the orders they made, never another officer's;
 *  - a warehouse team member sees only the orders assigned to their own warehouse(s);
 *  - everyone who approves, releases or assigns, and read-only oversight roles, sees the whole pipeline.
 */
export type OrderVisibility =
  | { kind: 'all' }
  | { kind: 'own'; userId: string }
  | { kind: 'warehouses'; ids: string[] }
  | { kind: 'none' };

export function orderVisibility(actor: AuthenticatedUser): OrderVisibility {
  const has = (p: string) => actor.permissionCodes?.has(p) ?? false;
  if (has(PERMISSIONS.SALES_APPROVE) || has(PERMISSIONS.SALES_RELEASE) || has(PERMISSIONS.SALES_ASSIGN) || has(PERMISSIONS.SALES_VIEW)) {
    return { kind: 'all' };
  }
  if (has(PERMISSIONS.SALES_FULFILL)) {
    const scope = scopedLocationIds(actor, 'WAREHOUSE');
    return scope.isGlobal ? { kind: 'all' } : { kind: 'warehouses', ids: scope.ids };
  }
  if (has(PERMISSIONS.SALES_CREATE)) return { kind: 'own', userId: actor.id };
  return { kind: 'none' };
}

/** The same rule as a database filter, for lists. */
export function visibilityWhere(v: OrderVisibility): Record<string, unknown> {
  switch (v.kind) {
    case 'all': return {};
    case 'own': return { OR: [{ salesOfficerId: v.userId }, { submittedById: v.userId }] };
    case 'warehouses': return { allocatedWarehouseId: { in: v.ids } };
    default: return { id: '00000000-0000-0000-0000-000000000000' };
  }
}

/** The same rule applied to one order that has been loaded. */
export function canSee(v: OrderVisibility, order: { salesOfficerId?: string | null; submittedById?: string | null; allocatedWarehouseId?: string | null }): boolean {
  switch (v.kind) {
    case 'all': return true;
    case 'own': return order.salesOfficerId === v.userId || order.submittedById === v.userId;
    case 'warehouses': return !!order.allocatedWarehouseId && v.ids.includes(order.allocatedWarehouseId);
    default: return false;
  }
}
