/**
 * The website and the server (API) are deployed separately, so one can end up newer than the other. The server says
 * which features it has (GET /health); the website knows which it needs. When something is missing the Admin
 * dashboard says so in plain words, instead of pages quietly failing with "404".
 */
export const REQUIRED_API_FEATURES = ['site-content', 'insights', 'settings-registry', 'system-overview', 'reports-catalog', 'admin-access', 'ai-predictions', 'sales-chain', 'ai-feedback', 'multi-size-intake', 'dispatch-requests', 'dispatch-desk', 'paddy-requests', 'paddy-transfers', 'control-center', 'dispatch-tracking', 'quick-search', 'mill-dispatch', 'damaged-bags-review', 'role-access', 'finance-center', 'invoices-awaiting'] as const;

export const FEATURE_LABELS: Record<string, string> = {
  'site-content': 'The homepage editor',
  insights: 'The Watchlist for the MD and CEO',
  'settings-registry': 'System settings',
  'system-overview': 'The Admin control center figures',
  'reports-catalog': 'Report downloads by role',
  'admin-access': 'Full System Administrator access to every screen',
  'ai-feedback': 'The AI feedback on each milling center and the broader question box',
  'sales-chain': 'The new sales chain: warehouse assignment, receipt uploads and the order activity trail',
  'multi-size-intake': 'One intake with several sizes saved together, and kilograms optional where there is no scale',
  'dispatch-requests': 'Dispatch requests to the farm manager: the task, the tracking and the notifications',
  'control-center': 'A control center, with a menu button, for the Managing Director, CEO, Farm Supervisor, Warehouse, Operations and Finance roles',
  'damaged-bags-review': 'Spoiled or broken bags reported when a truck is counted in, held out of the stock until the Warehouse Supervisor decides',
  'role-access': 'Who can use what: the Administrator switches features off per role',
  'invoices-awaiting': 'Raising invoices from the Finance Director\'s dashboard (the list of delivered orders still to be invoiced)',
  'finance-center': 'The company\'s money for the Finance Director, MD and CEO: spending at every farm, warehouse and milling center, sales, and the money ledger',
  'dispatch-tracking': 'Track dispatch: every step, who handled it and when, and counting a whole truck in',
  'mill-dispatch': 'Paddy sent to the milling center and finished products sent back, with approval and counting in',
  'quick-search': 'Quick search from the top bar',
  'paddy-transfers': 'Paddy sent between warehouses, counted in at the other end, and the mill confirming paddy received',
  'paddy-requests': 'Paddy requests passed up the chain: warehouse to Farm Director, mill to warehouse, with stock checks and where-is-the-paddy',
  'dispatch-desk': 'The shared Dispatch desk: one dispatch with every size, approved as one, for the Farm Supervisor and the farm manager',
  'ai-predictions': 'The AI predictions and answers limited to each person\'s own places',
};

/** The commit this website was built from (empty when run locally). */
export const WEB_COMMIT = (process.env.NEXT_PUBLIC_WEB_COMMIT ?? '').slice(0, 7);

/** What the website needs that the server does not have. A server that reports no features at all is missing all of them. */
export function missingFeatures(features: string[] | undefined | null): string[] {
  return REQUIRED_API_FEATURES.filter((f) => !(features ?? []).includes(f));
}
