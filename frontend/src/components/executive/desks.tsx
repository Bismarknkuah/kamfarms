'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, type DirectoryUser, type InvoiceAwaiting, invoicesApi, messagingApi, tasksApi, usersApi } from '@/lib/api-client';
import { cedis2, when } from './money';
import { Panel } from './parts';

const FIELD = 'w-full rounded-xl border border-paddy-100 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20';
const BTN = 'rounded-full bg-paddy-900 px-5 py-2.5 text-sm font-medium text-rice-50 disabled:bg-ink-500/30';
const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const plusDays = (n: number) => { const d = new Date(Date.now() + n * 86_400_000); return d.toISOString().slice(0, 10); };

/** The people the system knows, for choosing who a task or an announcement is for. */
function useDirectory(accessToken: string) {
  const [people, setPeople] = useState<DirectoryUser[]>([]);
  useEffect(() => { usersApi.directory(accessToken).then((p) => setPeople(Array.isArray(p) ? p : [])).catch(() => {}); }, [accessToken]);
  const roles = useMemo(() => { const m = new Map<string, string>(); for (const p of people) if (p.roleCode) m.set(p.roleCode, p.roleName ?? p.roleCode); return [...m.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)); }, [people]);
  return { people, roles };
}

/** Fulfilled orders that have no invoice yet. The Finance Director raises each one here, with the tax, any discount and the date it is due. */
export function InvoicesToRaise({ accessToken }: { accessToken: string }) {
  const [rows, setRows] = useState<InvoiceAwaiting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tax, setTax] = useState('0'); const [discount, setDiscount] = useState('0'); const [due, setDue] = useState(plusDays(30));
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => invoicesApi.awaiting(accessToken).then((r) => { setRows(Array.isArray(r) ? r : []); setError(null); }).catch((e) => setError(msg(e, 'The orders waiting for an invoice could not be loaded.'))), [accessToken]);
  useEffect(() => { load(); }, [load]);

  const raise = async (o: InvoiceAwaiting) => {
    const t = Number(tax || 0); const d = Number(discount || 0);
    if (!(t >= 0) || !(d >= 0)) { setError('The tax and the discount must be zero or more.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const inv = await invoicesApi.create(accessToken, { salesOrderId: o.id, taxRatePercent: t || undefined, discount: d || undefined, dueDate: due ? new Date(`${due}T00:00:00Z`).toISOString() : undefined });
      setNotice(`Invoice ${inv.invoiceNumber} raised for ${o.orderNumber}: ${cedis2(Number(inv.totalAmount))}.`); setOpen(null); setTax('0'); setDiscount('0'); await load();
    } catch (e) { setError(msg(e, 'That did not go through. Nothing was invoiced: please try again.')); } finally { setBusy(false); }
  };

  const total = (rows ?? []).reduce((n, r) => n + r.amount, 0);
  return (
    <Panel title="Invoices to raise" note="Orders that have been delivered and are not invoiced yet. An order is invoiced once." id="exec-invoices">
      {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="invoice-error">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800" data-testid="invoice-notice">{notice}</p>}
      {rows === null ? <p className="text-sm text-ink-500">Loading...</p> : rows.length === 0 ? <p className="text-sm text-ink-500" data-testid="invoice-empty">Every delivered order has its invoice.</p> : (
        <>
          <p className="mb-2 text-sm text-ink-700" data-testid="invoice-summary">{rows.length} order{rows.length === 1 ? '' : 's'} waiting, {cedis2(total)} in all.</p>
          <ul className="space-y-2">
            {rows.map((o) => (
              <li key={o.id} className="rounded-xl bg-rice-50 p-3" data-testid="invoice-row" data-order={o.orderNumber} data-amount={o.amount}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0"><p className="text-sm font-medium text-ink-900">{o.orderNumber}, {o.customer}</p><p className="text-xs text-ink-500">{o.fulfilledAt ? `Delivered ${when(o.fulfilledAt)}` : 'Delivered'}</p></div>
                  <div className="flex items-center gap-3"><span className="text-sm font-semibold text-paddy-900">{cedis2(o.amount)}</span>
                    {open !== o.id && <button type="button" data-testid="invoice-open" onClick={() => { setOpen(o.id); setError(null); }} className={BTN}>Raise invoice</button>}
                  </div>
                </div>
                {open === o.id && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4" data-testid="invoice-form">
                    <label className="text-xs font-medium text-ink-700">Tax (%)<input data-testid="invoice-tax" type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} className={`${FIELD} mt-1`} /></label>
                    <label className="text-xs font-medium text-ink-700">Discount (GHS)<input data-testid="invoice-discount" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${FIELD} mt-1`} /></label>
                    <label className="text-xs font-medium text-ink-700">Due on<input data-testid="invoice-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${FIELD} mt-1`} /></label>
                    <div className="flex items-end gap-2"><button type="button" data-testid="invoice-confirm" disabled={busy} onClick={() => raise(o)} className={BTN}>{busy ? 'Saving...' : 'Create the invoice'}</button><button type="button" onClick={() => setOpen(null)} className="rounded-full border border-paddy-100 px-4 py-2.5 text-sm font-medium text-paddy-900">Cancel</button></div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/** Give a job to a person, or to everyone who holds a role. They are told at once and it shows on their task list. */
export function DelegateTask({ accessToken, meId }: { accessToken: string; meId: string }) {
  const { people, roles } = useDirectory(accessToken);
  const [title, setTitle] = useState(''); const [details, setDetails] = useState(''); const [who, setWho] = useState('');
  const [due, setDue] = useState(''); const [priority, setPriority] = useState('NORMAL');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);

  const send = async () => {
    setError(null); setNotice(null);
    if (title.trim().length < 3) { setError('Say what the task is (at least three letters).'); return; }
    if (!who) { setError('Choose who it is for: a person, or a whole role.'); return; }
    setBusy(true);
    try {
      const [kind, value] = [who.slice(0, who.indexOf(':')), who.slice(who.indexOf(':') + 1)];
      const t = await tasksApi.create(accessToken, { title: title.trim(), description: details.trim() || undefined, priority, dueDate: due ? new Date(`${due}T00:00:00Z`).toISOString() : undefined, ...(kind === 'user' ? { assignedToId: value } : { assignedRoleCode: value }) });
      const label = kind === 'user' ? (() => { const p = people.find((x) => x.id === value); return p ? `${p.firstName} ${p.lastName}` : 'them'; })() : `everyone who is ${roles.find((r) => r.code === value)?.name ?? value}`;
      setNotice(`${(t as { taskNumber?: string }).taskNumber ?? 'The task'} is given to ${label}. They have been told.`); setTitle(''); setDetails(''); setDue('');
    } catch (e) { setError(msg(e, 'The task was not created. Please try again.')); } finally { setBusy(false); }
  };

  return (
    <Panel title="Give someone a task" note="A person, or everyone who holds a role. They are told straight away." id="exec-delegate">
      {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="delegate-error">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800" data-testid="delegate-notice">{notice}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-ink-700 sm:col-span-2">What needs doing<input data-testid="delegate-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: send me the Kumasi stock count by Friday" className={`${FIELD} mt-1`} /></label>
        <label className="text-xs font-medium text-ink-700 sm:col-span-2">More detail (optional)<textarea data-testid="delegate-details" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} className={`${FIELD} mt-1`} /></label>
        <label className="text-xs font-medium text-ink-700">For
          <select data-testid="delegate-assignee" value={who} onChange={(e) => setWho(e.target.value)} className={`${FIELD} mt-1`}>
            <option value="">Choose...</option>
            {roles.length > 0 && <optgroup label="Everyone who holds a role">{roles.map((r) => <option key={r.code} value={`role:${r.code}`}>{r.name}</option>)}</optgroup>}
            {people.length > 0 && <optgroup label="One person">{people.filter((p) => p.id !== meId).map((p) => <option key={p.id} value={`user:${p.id}`}>{p.firstName} {p.lastName}{p.roleName ? ` (${p.roleName})` : ''}</option>)}</optgroup>}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-ink-700">Due<input data-testid="delegate-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${FIELD} mt-1`} /></label>
          <label className="text-xs font-medium text-ink-700">How urgent<select data-testid="delegate-priority" value={priority} onChange={(e) => setPriority(e.target.value)} className={`${FIELD} mt-1`}>{['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}</select></label>
        </div>
      </div>
      <button type="button" data-testid="delegate-submit" disabled={busy} onClick={send} className={`${BTN} mt-4`}>{busy ? 'Sending...' : 'Give the task'}</button>
    </Panel>
  );
}

/** An announcement to everyone, or to everyone who holds a role. It lands in their messages, and can ask them to acknowledge it. */
export function BroadcastPanel({ accessToken, meId }: { accessToken: string; meId: string }) {
  const { people, roles } = useDirectory(accessToken);
  const [audience, setAudience] = useState('all'); const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const others = people.filter((p) => p.id !== meId);
  const recipients = audience === 'all' ? others : others.filter((p) => p.roleCode === audience.replace('role:', ''));

  const send = async () => {
    setError(null); setNotice(null);
    if (title.trim().length < 3) { setError('Give the announcement a short title.'); return; }
    if (body.trim().length < 3) { setError('Write the message.'); return; }
    if (recipients.length === 0) { setError('There is nobody to send it to.'); return; }
    setBusy(true);
    try {
      const conv = await messagingApi.createConversation(accessToken, { type: 'ANNOUNCEMENT', title: title.trim(), memberIds: recipients.map((p) => p.id), requiresResponse: ack });
      await messagingApi.sendMessage(accessToken, conv.id, body.trim());
      setNotice(`Sent to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}.${ack ? ' They are asked to acknowledge it.' : ''}`); setTitle(''); setBody(''); setAck(false);
    } catch (e) { setError(msg(e, 'The announcement was not sent. Please try again.')); } finally { setBusy(false); }
  };

  return (
    <Panel title="Announce to the team" note="It goes to their messages. Choose everyone, or everyone who holds one role." id="exec-broadcast">
      {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="broadcast-error">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800" data-testid="broadcast-notice">{notice}</p>}
      <div className="grid grid-cols-1 gap-3">
        <label className="text-xs font-medium text-ink-700">To
          <select data-testid="broadcast-audience" value={audience} onChange={(e) => setAudience(e.target.value)} className={`${FIELD} mt-1`}>
            <option value="all">Everyone ({others.length} people)</option>
            {roles.map((r) => <option key={r.code} value={`role:${r.code}`}>All {r.name} ({others.filter((p) => p.roleCode === r.code).length})</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-700">Title<input data-testid="broadcast-title" value={title} onChange={(e) => setTitle(e.target.value)} className={`${FIELD} mt-1`} /></label>
        <label className="text-xs font-medium text-ink-700">Message<textarea data-testid="broadcast-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={`${FIELD} mt-1`} /></label>
        <label className="flex items-center gap-2 text-sm text-ink-700"><input data-testid="broadcast-ack" type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="h-4 w-4 accent-paddy-700" /> Ask people to acknowledge it</label>
      </div>
      <button type="button" data-testid="broadcast-send" disabled={busy} onClick={send} className={`${BTN} mt-4`}>{busy ? 'Sending...' : 'Send the announcement'}</button>
    </Panel>
  );
}
