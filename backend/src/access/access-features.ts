/**
 * The features the Administrator can switch off for a role. Each is tied to the permissions that give it, so switching it off takes those permissions away from
 * the role on every request (the menu entry, the dashboard widgets and the server's own check all follow). Core work (selling, receiving, approving, paying) is
 * deliberately NOT here: switching it off would stop the business, and belongs on the Roles page. `ui` features are not tied to a permission: they are hidden by
 * the website and refused by the server directly.
 */
export interface AccessFeature { key: string; label: string; description: string; permissions: string[]; pages: string[]; ui?: boolean }

export const ACCESS_FEATURES: AccessFeature[] = [
  { key: 'control-center', label: 'Control center', description: 'The page of live figures and shortcuts for a person\'s own area, and its menu button.', permissions: [], pages: ['Control center'], ui: true },
  { key: 'quick-search', label: 'Quick search', description: 'The search box in the top bar.', permissions: [], pages: [], ui: true },
  { key: 'track-dispatch', label: 'Track dispatch', description: 'Following every truck and transfer from request to delivery, and who held it up.', permissions: ['dispatch.track'], pages: ['Track dispatch'] },
  { key: 'trace', label: 'Trace batch', description: 'Tracing a batch of paddy or rice from the farm to the customer.', permissions: ['trace.view'], pages: ['Trace'] },
  { key: 'paddy-requests', label: 'Paddy requests', description: 'Asking for paddy for a warehouse or a mill, and following the request.', permissions: ['supply.view', 'supply.request', 'supply.forward', 'supply.fulfil'], pages: ['Paddy requests'] },
  { key: 'mill-dispatch', label: 'Mill dispatch', description: 'Paddy to the mill, and finished products back to the warehouse.', permissions: ['milldispatch.view', 'milldispatch.request', 'milldispatch.approve', 'milldispatch.receive'], pages: ['Mill dispatch'] },
  { key: 'damaged-bags-review', label: 'Reviewing damaged bags', description: 'Approving or refusing the spoiled or broken bags reported when a truck is counted in.', permissions: ['receipt.review'], pages: [] },
  { key: 'ai-insights', label: 'AI Insights', description: 'The AI assistant, its predictions and the watch-list.', permissions: ['ai.view', 'ai.use', 'insights.view'], pages: ['AI Insights'] },
  { key: 'reports', label: 'Reports and analytics', description: 'The Reports, Analytics, Inventory and Oversight pages, and exporting reports.', permissions: ['reports.view', 'reports.export'], pages: ['Reports', 'Analytics', 'Inventory', 'Oversight'] },
  { key: 'messages', label: 'Messages', description: 'Sending messages and broadcasts to colleagues.', permissions: ['messages.send', 'messages.broadcast'], pages: ['Messages'] },
  { key: 'audit-log', label: 'Audit log', description: 'Reading the record of who did what.', permissions: ['audit.view'], pages: ['Audit Log'] },
];
