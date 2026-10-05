/**
 * The control center: for each person who runs part of the company, the work that is waiting for THEM, with real figures, limited to the places they are
 * responsible for. Which work shows up is decided by the PERMISSIONS the person's role holds (so a role changed on the Roles page changes its control
 * center by itself); how much of it they are shown is decided by their SCOPES (a Warehouse Manager's figures count their own warehouse, never another).
 */

/** Everyone with one of these roles has a control center. (The System Administrator has their own, built from the whole system.) */
export const CONTROL_CENTER_ROLES = ['MD', 'CEO', 'FARM_DIRECTOR', 'WAREHOUSE_MANAGER', 'WAREHOUSE_SUPERVISOR', 'OPERATIONS_MANAGER', 'OPERATIONS_OFFICER', 'FINANCE_DIRECTOR'] as const;

export type TileKey =
  | 'orders-approve' | 'orders-release' | 'orders-assign' | 'orders-prepare' | 'payments-verify' | 'expenses-decide' | 'expenses-director'
  | 'paddy-entries' | 'dispatch-approvals' | 'stock-corrections' | 'production-approve' | 'supply-waiting' | 'supply-open'
  | 'trucks-coming' | 'transfers-coming' | 'rice-coming' | 'my-tasks'
  | 'mill-paddy-coming' | 'mill-products-ready' | 'mill-approvals' | 'milled-rice-coming' | 'receipts-review';

export interface TileDef {
  key: TileKey;
  label: string;
  /** One short line: what to do about it. */
  hint: string;
  /** The page where it is dealt with. */
  href: string;
  /** The person sees this tile only if they hold at least one of these permissions (empty: everyone). */
  anyOf: string[];
  /** ...and not if they hold any of these (the Managing Director's expense tile is only for expenses the Finance Director cannot decide). */
  unlessAny?: string[];
  /** Shown only to people with one of these roles (the permission alone is shared by several roles that do different things with it). */
  onlyRoles?: string[];
  /** Something to decide or do, so a figure above zero is highlighted. */
  decision: boolean;
}

/** In the order they are shown. */
export const TILES: TileDef[] = [
  { key: 'orders-approve', label: 'Orders waiting for your approval', hint: 'Submitted by the sales officers. Approve or reject each one.', href: '/sales', anyOf: ['sales.approve'], decision: true },
  { key: 'orders-release', label: 'Orders waiting for your release', hint: 'Approved by finance. Release each one so a warehouse can be chosen.', href: '/sales', anyOf: ['sales.release'], decision: true },
  { key: 'orders-assign', label: 'Released orders waiting for a warehouse', hint: 'Choose the warehouse that will prepare and send each one.', href: '/sales', anyOf: ['sales.assign'], decision: true },
  { key: 'orders-prepare', label: 'Orders to prepare and send', hint: 'Assigned to your warehouse. Start preparing, then send them.', href: '/sales', anyOf: ['sales.fulfill'], decision: true },
  { key: 'payments-verify', label: 'Payments waiting to be verified', hint: 'Customer payments recorded but not yet checked.', href: '/finance', anyOf: ['payment.verify'], decision: true },
  { key: 'expenses-decide', label: 'Expenses waiting for your decision', hint: 'Entered by staff. Approve or reject each one.', href: '/expenses', anyOf: ['finance.approve'], decision: true },
  { key: 'expenses-director', label: 'Expenses waiting for you', hint: 'Entered by the Finance Director, so they come to you.', href: '/expenses', anyOf: ['finance.approve.director'], unlessAny: ['finance.approve'], decision: true },
  { key: 'paddy-entries', label: 'Paddy entries waiting for your approval', hint: 'Logged by the farm managers on your farms.', href: '/paddy-entries', anyOf: ['paddy.approve'], decision: true },
  { key: 'dispatch-approvals', label: 'Dispatches waiting for your approval', hint: 'Trucks the farm managers have loaded and sent for your decision.', href: '/deliveries', anyOf: ['delivery.approve'], decision: true },
  { key: 'receipts-review', label: 'Damaged bags waiting for your review', hint: 'Spoiled or broken bags a warehouse manager reported when counting a delivery in. Approve or refuse each one.', href: '/track-dispatch', anyOf: ['receipt.review'], decision: true },
  { key: 'stock-corrections', label: 'Stock corrections waiting for you', hint: 'Counts someone asked to change. Approve or reject each one.', href: '/office', anyOf: ['inventory.adjust'], decision: true },
  { key: 'production-approve', label: 'Production records waiting for your approval', hint: 'Milling runs the mills have submitted.', href: '/production', anyOf: ['production.approve'], decision: true },
  { key: 'supply-waiting', label: 'Paddy requests waiting for your move', hint: 'Send a request on, choose where the paddy comes from, or send it.', href: '/warehouse-requests', anyOf: ['supply.forward', 'supply.fulfil'], decision: true },
  { key: 'trucks-coming', label: 'Trucks from farms on the road to you', hint: 'Count the paddy in when each truck arrives.', href: '/shipments', anyOf: ['warehouse.receive'], decision: true },
  { key: 'transfers-coming', label: 'Paddy coming from other warehouses', hint: 'Count it in when it arrives.', href: '/site-deliveries', anyOf: ['warehouse.receive', 'warehouse.transfer'], decision: true },
  { key: 'rice-coming', label: 'Rice transfers coming to you', hint: 'Packaged rice another warehouse sent you.', href: '/office', anyOf: ['warehouse.transfer'], decision: true },
  { key: 'mill-paddy-coming', label: 'Paddy on its way to your mill', hint: 'Count it in when it arrives.', href: '/mill-dispatch', anyOf: ['milldispatch.receive'], onlyRoles: ['OPERATIONS_OFFICER'], decision: true },
  { key: 'mill-products-ready', label: 'Finished products waiting at the mill to be sent', hint: 'Packaged rice, broken rice and hull you can send back to the warehouse.', href: '/mill-dispatch', anyOf: ['milldispatch.request'], onlyRoles: ['OPERATIONS_OFFICER'], decision: true },
  { key: 'mill-approvals', label: 'Mill dispatches waiting for your approval', hint: 'Paddy for the mill, or finished products coming back. Approve or refuse each one.', href: '/mill-dispatch', anyOf: ['milldispatch.approve'], decision: true },
  { key: 'milled-rice-coming', label: 'Milled rice on its way to your warehouse', hint: 'Count the packaged rice, broken rice and hull in when they arrive.', href: '/mill-dispatch', anyOf: ['milldispatch.receive'], onlyRoles: ['WAREHOUSE_MANAGER', 'WAREHOUSE_SUPERVISOR'], decision: true },
  { key: 'supply-open', label: 'Paddy requests in progress', hint: 'Asked for and not yet delivered, in your area.', href: '/warehouse-requests', anyOf: ['supply.view'], decision: false },
  { key: 'my-tasks', label: 'Your open tasks', hint: 'Work that has been given to you.', href: '/tasks', anyOf: [], decision: true },
];
