'use client';

import Link from 'next/link';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ApiError, Expense, Payment, SalesOrder, expensesApi, paymentsApi, salesOrdersApi } from '@/lib/api-client';
import { WAREHOUSE_STAGES, WITH_WAREHOUSE_SIDE, ageLabel, salesStatusLabel, salesStatusTone, waitingSince } from '@/lib/sales-flow';
import { AssignWarehouse, FinanceDecision, ReleaseForDelivery, WarehouseSteps } from '@/components/sales/Decisions';
import { OrderEvidence } from '@/components/sales/OrderEvidence';

/*
 * The "desks": what each person in the sales chain sees first on their
 * Overview, with the actions they need right there rather than one
 * click away. Each desk shows only the work that is waiting on that
 * role, using the same shared rules as the Sales page.
 */

const ghs = (n: number) => `GHS ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const itemsLine = (o: SalesOrder) => o.items.map((i) => `${i.product.name} ${i.packagingSize.label} × ${i.bagCount}`).join(', ');
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'That did not go through. Please try again.');

function useLoad<T>(fn: () => Promise<T>, label: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    fn()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch(() => setError(`Could not load ${label}.`));
  }, [fn, label]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

function Section({ title, hint, count, children }: { title: string; hint?: string; count: number; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-paddy-100 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base text-paddy-900">{title}</h3>
          {hint && <p className="text-xs text-ink-500">{hint}</p>}
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${count > 0 ? 'bg-husk-300 text-soil-700' : 'bg-ink-500/10 text-ink-500'}`}>{count}</span>
      </div>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="rounded-lg bg-rice-50 px-3 py-2 text-sm text-ink-500">{text}</p>;
const ErrorLine = ({ text }: { text: string | null }) => (text ? <p role="alert" className="text-xs text-red-600">{text}</p> : null);

function Row({ open, onToggle, title, subtitle, trailing, children }: { open: boolean; onToggle: () => void; title: string; subtitle: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-paddy-100">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink-900">{title}</span>
          <span className="block truncate text-xs text-ink-500">{subtitle}</span>
        </span>
        {trailing && <span className="shrink-0 text-right text-xs text-ink-500">{trailing}</span>}
      </button>
      {open && <div className="space-y-3 border-t border-paddy-100 p-4">{children}</div>}
    </div>
  );
}

function ApproveReject({ approveLabel, onApprove, onReject }: { approveLabel: string; onApprove: () => Promise<unknown>; onReject: (reason: string) => Promise<unknown> }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      {rejecting ? (
        <>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (the person who entered it will see this)" aria-label="Reason for rejecting" className="w-full rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => run(() => onReject(reason.trim()))} className="rounded-full bg-red-700 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {busy ? 'Sending…' : 'Confirm rejection'}
            </button>
            <button type="button" onClick={() => setRejecting(false)} className="text-xs text-ink-500">Back</button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => run(onApprove)} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
            {busy ? 'Working…' : approveLabel}
          </button>
          <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">Reject</button>
        </div>
      )}
      <ErrorLine text={error} />
    </div>
  );
}

function ExpenseRow({ e, open, onToggle, onChanged, accessToken }: { e: Expense; open: boolean; onToggle: () => void; onChanged: () => void; accessToken: string }) {
  return (
    <Row
      open={open}
      onToggle={onToggle}
      title={`${e.expenseNumber}, ${e.customCategoryLabel ?? e.category.name}`}
      subtitle={`${e.farm?.name ?? e.warehouse?.name ?? e.millingCenter?.name ?? 'Head office'} · entered by ${fullName(e.submittedBy)} · ${new Date(e.date).toLocaleDateString()}`}
      trailing={<span className="font-medium text-ink-900">{ghs(e.amount)}</span>}
    >
      {(e.itemDescription || e.notes) && <p className="text-sm text-ink-700">{e.itemDescription ?? e.notes}</p>}
      {e.attachmentUrl && <p className="text-xs text-ink-500">A receipt is attached. <Link href="/expenses" className="font-medium text-paddy-700 underline">Open Expenses to view it</Link>.</p>}
      <ApproveReject
        approveLabel="Approve"
        onApprove={async () => { await expensesApi.approve(accessToken, e.id); onChanged(); }}
        onReject={async (reason) => { await expensesApi.reject(accessToken, e.id, reason); onChanged(); }}
      />
    </Row>
  );
}

/* ───────────────────────── Finance Director ───────────────────────── */

export function FinanceDesk({ accessToken, meId }: { accessToken: string; meId: string }) {
  const orders = useLoad(useCallback(() => salesOrdersApi.list(accessToken, 'SUBMITTED'), [accessToken]), 'sales orders');
  const expenses = useLoad(useCallback(() => expensesApi.list(accessToken, 'PENDING'), [accessToken]), 'expenses');
  const payments = useLoad(useCallback(() => paymentsApi.list(accessToken, 'PENDING_VERIFICATION'), [accessToken]), 'payments');
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  // Nobody decides their own entry; expenses the Finance Director entered go to the MD or CEO.
  const toReview = (orders.data ?? []).filter((o) => o.status === 'SUBMITTED' && o.submittedById !== meId);
  const toApprove = (expenses.data ?? []).filter((e) => e.status === 'PENDING' && !e.submittedByFinanceDirector && e.submittedById !== meId);
  const toVerify = (payments.data ?? []).filter((p: Payment) => p.status === 'PENDING_VERIFICATION' && p.recordedBy.id !== meId);
  const total = toReview.length + toApprove.length + toVerify.length;
  const loaded = !!orders.data && !!expenses.data && !!payments.data;

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Awaiting your decision</p>
        {loaded && <span className="text-xs text-ink-500">{total === 0 ? 'You are all caught up' : `${total} item${total === 1 ? '' : 's'} waiting`}</span>}
      </div>
      <div className="space-y-4">
        <Section title="Sales orders to review" hint="Open one to see its receipts and history. Approve it and it goes to the Managing Director." count={toReview.length}>
          <ErrorLine text={orders.error} />
          {orders.data && !orders.error && toReview.length === 0 && <Empty text="No orders are waiting for your review." />}
          {toReview.map((o) => (
            <Row
              key={o.id}
              open={open === o.id}
              onToggle={() => toggle(o.id)}
              title={`${o.orderNumber}, ${o.customer.name}`}
              subtitle={itemsLine(o)}
              trailing={<><span className="block font-medium text-ink-900">{ghs(o.totalAmount)}</span><span>waiting {ageLabel(waitingSince(o))}</span></>}
            >
              <p className="text-xs text-ink-500">
                Sold by {fullName(o.salesOfficer)}
                {o.deliveryLocation ? ` · delivery to ${o.deliveryLocation}` : ''}
              </p>
              <OrderEvidence orderId={o.id} accessToken={accessToken} />
              <FinanceDecision order={o} accessToken={accessToken} onDone={() => { setOpen(null); orders.reload(); }} />
            </Row>
          ))}
        </Section>

        <Section title="Expenses to approve" hint="Every expense across the company is yours to decide." count={toApprove.length}>
          <ErrorLine text={expenses.error} />
          {expenses.data && !expenses.error && toApprove.length === 0 && <Empty text="No expenses are waiting for approval." />}
          {toApprove.map((e) => <ExpenseRow key={e.id} e={e} accessToken={accessToken} open={open === e.id} onToggle={() => toggle(e.id)} onChanged={() => { setOpen(null); expenses.reload(); }} />)}
        </Section>

        <Section title="Payments to verify" hint="Money customers say they have paid, waiting for you to confirm it arrived." count={toVerify.length}>
          <ErrorLine text={payments.error} />
          {payments.data && !payments.error && toVerify.length === 0 && <Empty text="No payments are waiting to be verified." />}
          {toVerify.map((p) => (
            <Row
              key={p.id}
              open={open === p.id}
              onToggle={() => toggle(p.id)}
              title={`${p.paymentNumber}, ${p.customer.name}`}
              subtitle={`${p.method.replace(/_/g, ' ').toLowerCase()} · recorded by ${fullName(p.recordedBy)} · ${new Date(p.paymentDate).toLocaleDateString()}`}
              trailing={<span className="font-medium text-ink-900">{ghs(p.amount)}</span>}
            >
              {p.notes && <p className="text-sm text-ink-700">{p.notes}</p>}
              {p.receiptUrl && /^https?:/.test(p.receiptUrl) && <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-paddy-700 underline">View the receipt</a>}
              <ApproveReject
                approveLabel="Verify payment"
                onApprove={async () => { await paymentsApi.verify(accessToken, p.id); setOpen(null); payments.reload(); }}
                onReject={async (reason) => { await paymentsApi.reject(accessToken, p.id, reason); setOpen(null); payments.reload(); }}
              />
            </Row>
          ))}
        </Section>
      </div>
    </div>
  );
}

/* ───────────────────────── Managing Director / CEO ───────────────────────── */

export function ReleaseDesk({ accessToken, canApproveDirectorExpenses }: { accessToken: string; canApproveDirectorExpenses: boolean }) {
  const approved = useLoad(useCallback(() => salesOrdersApi.list(accessToken, 'APPROVED'), [accessToken]), 'approved orders');
  const out = useLoad(useCallback(() => salesOrdersApi.list(accessToken), [accessToken]), 'orders with the warehouse side');
  const expenses = useLoad(useCallback(() => (canApproveDirectorExpenses ? expensesApi.list(accessToken, 'PENDING') : Promise.resolve([] as Expense[])), [accessToken, canApproveDirectorExpenses]), 'expenses');
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  const toRelease = (approved.data ?? []).filter((o) => o.status === 'APPROVED');
  const delivering = (out.data ?? []).filter((o) => WITH_WAREHOUSE_SIDE.includes(o.status));
  const financeDirectorExpenses = (expenses.data ?? []).filter((e) => e.status === 'PENDING' && e.submittedByFinanceDirector);

  return (
    <div className="mb-8">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Awaiting your release</p>
      <div className="space-y-4">
        <Section title="Approved by Finance, ready to release" hint="Check the details and receipts, then release it. The Warehouse Supervisor chooses the warehouse." count={toRelease.length}>
          <ErrorLine text={approved.error} />
          {approved.data && !approved.error && toRelease.length === 0 && <Empty text="No approved orders are waiting for you." />}
          {toRelease.map((o) => (
            <Row
              key={o.id}
              open={open === o.id}
              onToggle={() => toggle(o.id)}
              title={`${o.orderNumber}, ${o.customer.name}`}
              subtitle={itemsLine(o)}
              trailing={<><span className="block font-medium text-ink-900">{ghs(o.totalAmount)}</span><span>approved {ageLabel(waitingSince(o))} ago</span></>}
            >
              <p className="text-xs text-ink-500">
                Approved by {o.approvedBy ? fullName(o.approvedBy) : 'the Finance Director'}
                {o.deliveryLocation ? ` · delivery to ${o.deliveryLocation}` : ''}
                {o.requestedDeliveryDate ? ` · wanted by ${new Date(o.requestedDeliveryDate).toLocaleDateString()}` : ''}
              </p>
              <OrderEvidence orderId={o.id} accessToken={accessToken} />
              <ReleaseForDelivery order={o} accessToken={accessToken} onDone={() => { setOpen(null); approved.reload(); out.reload(); }} />
            </Row>
          ))}
        </Section>

        {canApproveDirectorExpenses && (
          <Section title="Expenses the Finance Director entered" hint="Nobody approves their own entry, so these come to you." count={financeDirectorExpenses.length}>
            <ErrorLine text={expenses.error} />
            {expenses.data && !expenses.error && financeDirectorExpenses.length === 0 && <Empty text="None waiting." />}
            {financeDirectorExpenses.map((e) => <ExpenseRow key={e.id} e={e} accessToken={accessToken} open={open === e.id} onToggle={() => toggle(e.id)} onChanged={() => { setOpen(null); expenses.reload(); }} />)}
          </Section>
        )}

        <Section title="With the warehouse side" hint="Released by you and not yet delivered: where each one is." count={delivering.length}>
          <ErrorLine text={out.error} />
          {out.data && !out.error && delivering.length === 0 && <Empty text="Nothing is with the warehouse side right now." />}
          {delivering.map((o) => (
            <Link key={o.id} href={`/sales?order=${o.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-paddy-100 px-4 py-3 hover:bg-rice-50">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink-900">{o.orderNumber}, {o.customer.name}</span>
                <span className="block truncate text-xs text-ink-500">{o.allocatedWarehouse ? `At ${o.allocatedWarehouse.name}` : 'Not yet assigned to a warehouse'} · {itemsLine(o)}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-ink-500"><span className={`rounded-full px-2 py-0.5 font-medium ${salesStatusTone(o.status)}`}>{salesStatusLabel(o.status)}</span>{waitingSince(o) && <span className="mt-1 block">{ageLabel(waitingSince(o))} here</span>}</span>
            </Link>
          ))}
        </Section>
      </div>
    </div>
  );
}

/* ------------------------- Warehouse Supervisor / Manager ------------------ */

export function DeliveryDesk({ accessToken, onlyWarehouseIds, canAssign = false }: { accessToken: string; onlyWarehouseIds?: string[] | null; canAssign?: boolean }) {
  const all = useLoad(useCallback(() => salesOrdersApi.list(accessToken), [accessToken]), 'warehouse orders');
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));
  const inScope = (o: SalesOrder) => !onlyWarehouseIds || (!!o.allocatedWarehouse && onlyWarehouseIds.includes(o.allocatedWarehouse.id));
  const toAssign = canAssign ? (all.data ?? []).filter((o) => o.status === 'RELEASED') : [];
  const atWarehouse = (all.data ?? []).filter((o) => WAREHOUSE_STAGES.includes(o.status) && inScope(o));
  const reload = () => { setOpen(null); all.reload(); };

  return (
    <div className="mb-8">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Orders to move</p>
      <div className="space-y-4">
        {canAssign && (
          <Section title="Released by the Managing Director: choose a warehouse" hint="Each one needs a warehouse to prepare and send it. Its stock is held there once you choose." count={toAssign.length}>
            <ErrorLine text={all.error} />
            {all.data && !all.error && toAssign.length === 0 && <Empty text="No released orders are waiting for a warehouse." />}
            {toAssign.map((o) => (
              <Row key={o.id} open={open === o.id} onToggle={() => toggle(o.id)} title={`${o.orderNumber}, ${o.customer.name}`} subtitle={`${itemsLine(o)} · to ${o.deliveryLocation ?? 'the address on the order'}`} trailing={<span>{ageLabel(waitingSince(o))} waiting</span>}>
                {o.requestedDeliveryDate && <p className="text-xs text-ink-500">Wanted by {new Date(o.requestedDeliveryDate).toLocaleDateString()}</p>}
                <AssignWarehouse order={o} accessToken={accessToken} onDone={reload} />
              </Row>
            ))}
          </Section>
        )}

        <Section title="At the warehouse" hint="Start processing, move it on track once it has left, then confirm delivery." count={atWarehouse.length}>
          {!canAssign && <ErrorLine text={all.error} />}
          {all.data && !all.error && atWarehouse.length === 0 && <Empty text="No orders are waiting at your warehouse." />}
          {atWarehouse.map((o) => (
            <Row
              key={o.id}
              open={open === o.id}
              onToggle={() => toggle(o.id)}
              title={`${o.orderNumber}, ${o.customer.name}`}
              subtitle={`${o.allocatedWarehouse?.name ?? 'a warehouse'} · to ${o.deliveryLocation ?? 'the address on the order'}`}
              trailing={<span className={`rounded-full px-2 py-0.5 font-medium ${salesStatusTone(o.status)}`}>{salesStatusLabel(o.status)}</span>}
            >
              <p className="text-sm text-ink-700">{itemsLine(o)}</p>
              {o.requestedDeliveryDate && <p className="text-xs text-ink-500">Wanted by {new Date(o.requestedDeliveryDate).toLocaleDateString()}</p>}
              <WarehouseSteps order={o} accessToken={accessToken} onDone={reload} />
            </Row>
          ))}
        </Section>
      </div>
    </div>
  );
}

/* ───────────────────────── Sales Officer ───────────────────────── */

export function MyOrdersDesk({ accessToken, meId, firstName }: { accessToken: string; meId: string; firstName?: string }) {
  const all = useLoad(useCallback(() => salesOrdersApi.list(accessToken), [accessToken]), 'your orders');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mine = (all.data ?? []).filter((o) => o.salesOfficer.id === meId);
  const count = (statuses: string[]) => mine.filter((o) => statuses.includes(o.status)).length;
  const stages = [
    { key: 'DRAFT', label: 'Not sent yet', statuses: ['DRAFT'], hint: 'your drafts' },
    { key: 'SUBMITTED', label: 'With Finance', statuses: ['SUBMITTED'], hint: 'Finance Director' },
    { key: 'APPROVED', label: 'With the MD', statuses: ['APPROVED'], hint: 'Managing Director' },
    { key: 'WAREHOUSE', label: 'With the warehouse', statuses: WITH_WAREHOUSE_SIDE, hint: 'being prepared or on its way' },
  ];
  const recentCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const drafts = mine.filter((o) => o.status === 'DRAFT');
  const rejected = mine.filter((o) => o.status === 'REJECTED' && new Date(o.createdAt).getTime() > recentCutoff);

  const submit = async (o: SalesOrder) => {
    setBusyId(o.id);
    setError(null);
    try {
      await salesOrdersApi.submit(accessToken, o.id);
      all.reload();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusyId(null);
    }
  };

  const moving = mine.filter((o) => WITH_WAREHOUSE_SIDE.includes(o.status) || ['SUBMITTED', 'APPROVED'].includes(o.status)).length;
  const needsYou = drafts.length + rejected.length;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const deliveredThisMonth = mine.filter((o) => o.status === 'FULFILLED' && o.fulfilledAt && new Date(o.fulfilledAt).getTime() >= monthStart).length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="mb-8">
      {all.data && (
        <div className="mb-4 rounded-2xl bg-paddy-900 px-5 py-4 text-rice-50" data-testid="officer-greeting">
          <p className="font-display text-xl">{greeting}{firstName ? `, ${firstName}` : ''}.</p>
          <p className="mt-1 text-sm text-rice-50/80">
            {moving === 0 && needsYou === 0 ? 'No orders are in motion yet. Ready when you are.' : `${moving} order${moving === 1 ? ' is' : 's are'} moving through the chain${needsYou > 0 ? `, and ${needsYou} ${needsYou === 1 ? 'needs' : 'need'} you` : ''}.`}
            {deliveredThisMonth > 0 ? ` ${deliveredThisMonth} delivered this month. Well done.` : ''}
          </p>
        </div>
      )}
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-soil-500">Where your orders are</p>
      <ErrorLine text={all.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stages.map((s) => (
          <Link key={s.key} href="/sales" className="rounded-2xl border border-paddy-100 bg-white p-4 hover:bg-rice-50">
            <p className="text-xs text-ink-500">{s.label}</p>
            <p className="mt-1 font-display text-2xl text-paddy-900">{all.data ? count(s.statuses) : '…'}</p>
            <p className="text-xs text-ink-500">{s.hint}</p>
          </Link>
        ))}
      </div>

      {(drafts.length > 0 || rejected.length > 0) && (
        <div className="mt-4 space-y-2 rounded-2xl border-2 border-husk-500 bg-husk-100/30 p-5">
          <h3 className="font-display text-base text-paddy-900">Needs you</h3>
          <ErrorLine text={error} />
          {drafts.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate text-ink-900">{o.orderNumber}, {o.customer.name} <span className="text-xs text-ink-500">(draft, not yet sent to Finance)</span></span>
              <button type="button" disabled={busyId === o.id} onClick={() => submit(o)} className="shrink-0 rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50 disabled:opacity-50">
                {busyId === o.id ? 'Sending…' : 'Send to Finance Director'}
              </button>
            </div>
          ))}
          {rejected.map((o) => (
            <Link key={o.id} href={`/sales?order=${o.id}`} className="block rounded-lg bg-white px-4 py-2.5 text-sm hover:bg-rice-50">
              <span className="text-ink-900">{o.orderNumber}, {o.customer.name}</span>
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${salesStatusTone('REJECTED')}`}>{salesStatusLabel('REJECTED')}</span>
              {o.rejectionReason && <span className="mt-0.5 block text-xs text-red-700">Reason: {o.rejectionReason}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
