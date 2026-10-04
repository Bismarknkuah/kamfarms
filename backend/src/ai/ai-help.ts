/**
 * What the assistant knows about how KAM-ROMS works, for questions like "how do I...?" and "what does the Watchlist do?".
 * Written from how the system actually behaves. It is searched by keyword; anything it cannot match is said plainly, never guessed.
 */
export interface HelpEntry { id: string; title: string; keywords: string[]; body: string }

export const HELP: HelpEntry[] = [
  { id: 'sales-chain', title: 'How a sale is approved and delivered', keywords: ['sales order', 'approve a sale', 'sale approval', 'release', 'release an order', 'sales chain', 'how does a sale work', 'deliver an order', 'create a sale'],
    body: 'A Sales Officer creates the order. The Finance Director reviews and approves it. The Managing Director then releases the approved order, and the Warehouse Supervisor arranges the delivery. Nobody can approve or reject an order they created themselves.' },
  { id: 'expenses', title: 'Expenses', keywords: ['expense', 'expenses', 'receipt', 'spending', 'approve an expense', 'record an expense'],
    body: 'Staff record an expense with its category and a photo of the receipt. Finance approves expenses, and nobody can approve their own. The MD and CEO can see every expense in Oversight, on the Expenses tab.' },
  { id: 'paddy-intake', title: 'Recording paddy intake at a farm', keywords: ['paddy intake', 'log paddy', 'record paddy', 'paddy entry', 'harvest', 'intake'],
    body: 'A Farm Manager logs paddy by grade, number of bags and moisture on the "Log paddy intake" page. An entry counts in stock and reports only after it is approved.' },
  { id: 'deliveries', title: 'Deliveries and shipments', keywords: ['delivery', 'deliveries', 'shipment', 'shipments', 'in transit', 'dispatch', 'receive paddy', 'warehouse receive'],
    body: 'Paddy moves from a farm to a warehouse as a shipment. It is tracked in transit and never counted as stock early. The warehouse receives and counts it, and a difference between what was sent and what arrived beyond the accepted tolerance (set by the Administrator) needs approval.' },
  { id: 'milling-run', title: 'Recording a milling run', keywords: ['milling run', 'production record', 'record production', 'log a run', 'meter reading', 'electricity meter', 'mass balance', 'record a run'],
    body: 'An Operations Officer records the paddy put in (grade and bags or kilograms), the packaged rice, broken rice, hull (with hull bags) and waste that came out, and the electricity meter opening and closing so the power used is known. A run whose inputs and outputs do not add up is flagged. A run counts in reports, and teaches the AI, only after it is approved.' },
  { id: 'ai-learning', title: 'How the AI learns', keywords: ['ai learn', 'how does the ai learn', 'train', 'trained', 'adapt', 'accuracy', 'expected', 'prediction', 'predictions', 'learn'],
    body: 'For every milling run the AI works out what it expected before the run, from the approved runs recorded earlier, with recent runs counting more. It then compares that with what the run actually gave. Once a run is approved (and was not flagged as not adding up) it joins the history the next expectation is built from, so the AI adapts as soon as runs are recorded and approved. A run is "as expected" when its packaged rice is within the tolerance the Administrator sets (5% by default). With fewer than 3 earlier runs it uses a labelled industry benchmark and calls the result an early estimate.' },
  { id: 'ai-insights', title: 'The AI Insights page', keywords: ['ai insights', 'kwh', 'power', 'calculator', 'bags per kwh', 'work it out', 'predict rice'],
    body: 'AI Insights shows what 1 kWh of power turns into (bags of packaged rice, broken rice and hull), a calculator that works from kWh or from bags of paddy, side-by-side tables by grade and milling center, feedback on whether each milling center delivered what was expected, and a question box. The MD, CEO and Administrator see the whole company; everyone else sees only their own places.' },
  { id: 'oversight', title: 'Oversight (MD and CEO)', keywords: ['oversight', 'whole company', 'company overview'],
    body: 'Oversight gives the MD and CEO the whole company in one place, on tabs for Overview, Watchlist, Expenses, Milling and power, Farms, Warehouses and Sales.' },
  { id: 'watchlist', title: 'The Watchlist (MD and CEO)', keywords: ['watchlist', 'watch list', 'flag', 'flagged', 'drift', 'drifting'],
    body: 'The Watchlist flags places that have drifted from their own usual: a drop in rice recovery, more power per kilogram, paddy arriving short, stock written down, orders sitting reserved too long, or a fall in paddy intake. The limits are adjustable by the Administrator in System settings.' },
  { id: 'reports', title: 'Downloading reports', keywords: ['report', 'reports', 'download', 'export', 'csv', 'excel', 'pdf'],
    body: 'The Reports page lists the reports your role is allowed to download, limited to your own places if you have them. Pick dates and a format (CSV, Excel or PDF) and download.' },
  { id: 'settings', title: 'System settings (Administrator)', keywords: ['system settings', 'settings', 'change a rule', 'tolerance', 'lockout', 'bag weight', 'adjust'],
    body: 'The System Administrator can change business rules from System settings without a developer: sign-in lockout, delivery tolerance, milling checks, machine power checks, who is alerted, the Watchlist limits and the AI predictions bag weights and learning. Each change is recorded in the audit log and any rule can be put back to its standard value.' },
  { id: 'roles-access', title: 'Roles and who can see what', keywords: ['role', 'roles', 'permission', 'permissions', 'access', 'who can see', 'jurisdiction', 'my places'],
    body: 'Every person has a role that decides what they can do, and may be limited to particular farms or warehouses. The MD and CEO see every activity in the company. The System Administrator has full access to everything. Everyone else sees only their own places.' },
  { id: 'users', title: 'Creating and managing accounts', keywords: ['create account', 'new user', 'add a person', 'disable', 'unlock', 'locked out', 'users', 'temporary password'],
    body: 'The Administrator creates people on the People and accounts page, gives them a role and places and a temporary password, and can disable or unlock accounts. A person on a temporary password is asked to choose their own at their first sign-in.' },
  { id: 'password', title: 'Changing or resetting a password', keywords: ['password', 'forgot password', 'change password', 'reset password', 'sign in problem'],
    body: 'Use Change Password in the Account menu to choose a new one. If you forgot it, use "Forgot password?" on the sign-in page to be sent a reset link. After too many wrong passwords an account is locked for a while; the Administrator can unlock it sooner.' },
  { id: 'backups-resets', title: 'Backups and system resets (Administrator)', keywords: ['backup', 'backups', 'reset', 'system reset', 'restore'],
    body: 'The Admin page handles backups and controlled data resets. A reset must be requested and approved before it is carried out, and every step is recorded.' },
  { id: 'homepage', title: 'The public homepage (Administrator)', keywords: ['homepage', 'website', 'public page', 'logo', 'slideshow', 'contact details', 'demo buttons', 'demo accounts'],
    body: 'The Administrator edits the public homepage (text, pictures and videos, contact details, brand and logo, and a notice on the sign-in page) from Public homepage. The one-click demo sign-in buttons can be switched on or off from the Administrator dashboard.' },
  { id: 'audit-log', title: 'The audit log', keywords: ['audit', 'audit log', 'who did', 'history of changes', 'activity log'],
    body: 'The audit log records who did what and when across the system. The Administrator, MD, CEO, Finance Director and Auditor can view it.' },
  { id: 'trace', title: 'Trace', keywords: ['trace', 'traceability', 'batch', 'where did this rice come from', 'source'],
    body: 'Trace follows paddy and rice back through the system using the source references recorded on milling runs, so a batch can be traced from the shelf toward the field.' },
];

const STOP = new Set(['the', 'and', 'for', 'how', 'what', 'does', 'can', 'you', 'are', 'was', 'with', 'this', 'that', 'from', 'about', 'tell', 'please', 'show', 'explain', 'work', 'works', 'use', 'our', 'your', 'who', 'where', 'when', 'why', 'will', 'have', 'has', 'get', 'gets']);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));

/** A rough word stem, so "approved", "approves" and "approve" match, and "sale" matches "sales". */
const stem = (w: string) => {
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 3 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('es')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
};

/** The guides that best match a question, best first. A keyword phrase counts when all its words are in the question; shared words in the title and text count a little. */
export function searchHelp(query: string, limit = 2): { entry: HelpEntry; score: number }[] {
  const q = new Set(words(query).map(stem));
  return HELP.map((entry) => {
    let score = 0;
    for (const k of entry.keywords) {
      const ks = words(k).map(stem);
      if (ks.length > 0 && ks.every((x) => q.has(x))) score += ks.length > 1 ? 5 : 3;
    }
    const text = new Set(words(`${entry.title} ${entry.body}`).map(stem));
    for (const x of q) if (text.has(x)) score += 1;
    return { entry, score };
  }).filter((r) => r.score >= 3).sort((a, b) => b.score - a.score).slice(0, limit);
}
