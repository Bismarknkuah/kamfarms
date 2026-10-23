/**
 * The features the Administrator can switch off for a role. Each is tied to the permissions that give it, so switching it off takes those permissions away from
 * the role on every request (the menu entry, the dashboard widgets and the server's own check all follow). Core work (selling, receiving, approving, paying) is
 * deliberately NOT here: switching it off would stop the business, and belongs on the Roles page. `ui` features are not tied to a permission: they are hidden by
 * the website and refused by the server directly.
 */
export interface AccessFeature { key: string; label: string; description: string; permissions: string[]; pages: string[]; ui?: boolean; module?: string }

export const ACCESS_FEATURES: AccessFeature[] = [
  { key: 'control-center', module: 'general', label: 'Control center', description: 'The page of live figures and shortcuts for a person\'s own area, and its menu button.', permissions: [], pages: ['Control center'], ui: true },
  { key: 'quick-search', module: 'general', label: 'Quick search', description: 'The search box in the top bar.', permissions: [], pages: [], ui: true },
  { key: 'track-dispatch', module: 'logistics', label: 'Track dispatch', description: 'Following every truck and transfer from request to delivery, and who held it up.', permissions: ['dispatch.track'], pages: ['Track dispatch'] },
  { key: 'trace', module: 'logistics', label: 'Trace batch', description: 'Tracing a batch of paddy or rice from the farm to the customer.', permissions: ['trace.view'], pages: ['Trace'] },
  { key: 'paddy-requests', module: 'logistics', label: 'Paddy requests', description: 'Asking for paddy for a warehouse or a mill, and following the request.', permissions: ['supply.view', 'supply.request', 'supply.forward', 'supply.fulfil'], pages: ['Paddy requests'] },
  { key: 'mill-dispatch', module: 'logistics', label: 'Mill dispatch', description: 'Paddy to the mill, and finished products back to the warehouse.', permissions: ['milldispatch.view', 'milldispatch.request', 'milldispatch.approve', 'milldispatch.receive'], pages: ['Mill dispatch'] },
  { key: 'damaged-bags-review', module: 'logistics', label: 'Reviewing damaged bags', description: 'Approving or refusing the spoiled or broken bags reported when a truck is counted in.', permissions: ['receipt.review'], pages: [] },
  { key: 'ai-insights', module: 'insight', label: 'AI Insights', description: 'The AI assistant, its predictions and the watch-list.', permissions: ['ai.view', 'ai.use', 'insights.view'], pages: ['AI Insights'] },
  { key: 'reports', module: 'insight', label: 'Reports and analytics', description: 'The Reports, Analytics, Inventory and Oversight pages, and exporting reports.', permissions: ['reports.view', 'reports.export'], pages: ['Reports', 'Analytics', 'Inventory', 'Oversight'] },
  { key: 'messages', module: 'people', label: 'Messages', description: 'Sending messages and broadcasts to colleagues.', permissions: ['messages.send', 'messages.broadcast'], pages: ['Messages'] },
  { key: 'audit-log', module: 'insight', label: 'Audit log', description: 'Reading the record of who did what.', permissions: ['audit.view'], pages: ['Audit Log'] },
  { key: 'finance-view', module: 'finance', label: 'Money pages', description: 'Seeing the money figures: spending, sales booked, receivables and the money ledger.', permissions: ['finance.view'], pages: ['Finance'] },
  { key: 'expense-approve', module: 'finance', label: 'Approving expenses', description: 'Approving or refusing expenses other people logged.', permissions: ['finance.approve', 'finance.approve.director'], pages: [] },
  { key: 'messages-broadcast', module: 'people', label: 'Messages to everyone', description: 'Sending one message to a whole role, farm or warehouse.', permissions: ['messages.broadcast'], pages: [] },
  { key: 'tasks-assign', module: 'people', label: 'Giving out tasks', description: 'Assigning tasks to other people.', permissions: ['tasks.assign'], pages: [] },
  { key: 'quality', module: 'operations', label: 'Quality checks', description: 'Recording quality inspections and releasing or holding a batch.', permissions: ['quality.manage'], pages: ['Quality'] },
  { key: 'stock-correction', module: 'operations', label: 'Stock corrections', description: 'Approving corrections to stock counts.', permissions: ['inventory.adjust'], pages: ['Stock correction'] },
];
