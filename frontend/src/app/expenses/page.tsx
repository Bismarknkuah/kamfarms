'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { findSingleLocationScope } from '@/lib/nav-items';
import { expensesApi, masterDataApi, Expense, ExpenseCategory, ApiError } from '@/lib/api-client';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-husk-300 text-soil-700',
  APPROVED: 'bg-paddy-700 text-rice-50',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-ink-500/10 text-ink-500',
};

export default function ExpensesPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [customCategoryLabel, setCustomCategoryLabel] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const myFarmId = me ? findSingleLocationScope(me, 'FARM') : null;
  const myWarehouseId = me ? findSingleLocationScope(me, 'WAREHOUSE') : null;
  const canApprove = hasPermission('finance.approve');
  const isOtherCategory = categories.find((c) => c.id === categoryId)?.name === 'Other';

  const load = (token: string) => {
    expensesApi.list(token).then(setExpenses).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load expenses.'));
  };

  useEffect(() => {
    if (!accessToken) return;
    load(accessToken);
    masterDataApi.expenseCategories(accessToken).then(setCategories).catch(() => {});
  }, [accessToken]);

  const onSubmit = async () => {
    if (!accessToken || !categoryId || !amount) return;
    if (isOtherCategory && !customCategoryLabel.trim()) return;
    setSubmitting(true);
    setPageError(null);
    try {
      await expensesApi.create(accessToken, {
        categoryId, amount: parseFloat(amount), date,
        farmId: myFarmId ?? undefined,
        warehouseId: myWarehouseId ?? undefined,
        paymentMethod,
        reference: reference || undefined,
        customCategoryLabel: isOtherCategory ? customCategoryLabel.trim() : undefined,
        itemDescription: itemDescription || undefined,
        notes: notes || undefined,
      });
      setAmount(''); setReference(''); setNotes(''); setCustomCategoryLabel(''); setItemDescription('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      load(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to record expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const onApprove = async (id: string) => {
    if (!accessToken) return;
    try {
      await expensesApi.approve(accessToken, id);
      load(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to approve.');
    }
  };

  const onReject = async (id: string) => {
    if (!accessToken) return;
    try {
      await expensesApi.reject(accessToken, id, 'Reviewed and rejected.');
      load(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to reject.');
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Expenses</h1>
      <p className="mt-1 text-sm text-ink-500">
        {myFarmId ? 'Log expenses for your farm — labour, transport, and other running costs.' : 'Every expense submitted, awaiting approval or already decided.'}
      </p>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {hasPermission('expense.create') && (
        <div className="mt-4 rounded-2xl border border-husk-300 bg-husk-100/30 p-5">
          <h3 className="font-display text-lg text-paddy-900">Log an expense</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="">Category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (GHS)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="BANK_DEPOSIT">Bank deposit</option>
              <option value="OTHER_APPROVED_METHOD">Other approved method</option>
            </select>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (optional)" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          </div>

          {isOtherCategory && (
            <input
              value={customCategoryLabel}
              onChange={(e) => setCustomCategoryLabel(e.target.value)}
              placeholder="What kind of expense is this? (required for 'Other')"
              className="mt-3 w-full rounded-lg border border-husk-500 px-3 py-2 text-sm"
            />
          )}
          <input
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
            placeholder="If this was for a purchase, what was received? (optional)"
            className="mt-3 w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm"
          />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="mt-3 w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
          {success && <p className="mt-2 text-sm font-medium text-paddy-700">Expense logged ✓</p>}
          <button type="button" onClick={onSubmit} disabled={submitting || !categoryId || !amount || (isOtherCategory && !customCategoryLabel.trim())} className="mt-4 rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50">
            {submitting ? 'Saving…' : 'Log expense'}
          </button>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paddy-100">
            {expenses?.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-mono text-xs text-ink-700">{e.expenseNumber}</td>
                <td className="px-4 py-3 text-ink-900">
                  {e.customCategoryLabel ? `${e.category.name}: ${e.customCategoryLabel}` : e.category.name}
                  {e.itemDescription && <p className="text-xs text-ink-500">Received: {e.itemDescription}</p>}
                </td>
                <td className="px-4 py-3 text-ink-700">GHS {e.amount.toLocaleString()}</td>
                <td className="px-4 py-3 text-ink-700">{e.farm?.name ?? e.warehouse?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[e.status] ?? 'bg-ink-500/10'}`}>{e.status}</span>
                </td>
                <td className="px-4 py-3">
                  {e.status === 'PENDING' && canApprove && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => onApprove(e.id)} className="rounded-full bg-paddy-900 px-3 py-1 text-xs font-medium text-rice-50">Approve</button>
                      <button type="button" onClick={() => onReject(e.id)} className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {expenses?.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-500">No expenses logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}
