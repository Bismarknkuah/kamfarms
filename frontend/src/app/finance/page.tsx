'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { invoicesApi, paymentsApi, receivablesApi, customersApi, Invoice, Payment, TopDebtor, Customer, ApiError } from '@/lib/api-client';

function fmtGHS(amount: number) {
  return `GHS ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

const TABS = ['Invoices', 'Payments', 'Receivables'] as const;

export default function FinancePage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Invoices');
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [debtors, setDebtors] = useState<TopDebtor[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [payCustomerId, setPayCustomerId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('BANK_TRANSFER');
  const [recording, setRecording] = useState(false);

  const loadPayments = (token: string) => {
    paymentsApi.list(token).then(setPayments).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load payments.'));
  };

  useEffect(() => {
    if (!accessToken) return;
    invoicesApi.list(accessToken).then(setInvoices).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load invoices.'));
    loadPayments(accessToken);
    receivablesApi.topDebtors(accessToken).then(setDebtors).catch(() => {});
    customersApi.list(accessToken).then(setCustomers).catch(() => {});
  }, [accessToken]);

  const onVerify = async (id: string) => {
    if (!accessToken) return;
    try {
      await paymentsApi.verify(accessToken, id);
      loadPayments(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to verify payment.');
    }
  };

  const onRecordPayment = async () => {
    if (!accessToken || !payCustomerId || !payAmount) return;
    setRecording(true);
    try {
      await paymentsApi.create(accessToken, {
        customerId: payCustomerId,
        amount: parseFloat(payAmount),
        method: payMethod,
        paymentDate: new Date().toISOString().slice(0, 10),
      });
      setShowRecordPayment(false);
      setPayCustomerId('');
      setPayAmount('');
      loadPayments(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to record payment.');
    } finally {
      setRecording(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Finance</h1>

      <div className="mt-4 flex gap-1 border-b border-paddy-100">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-husk-500 text-paddy-900' : 'text-ink-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {tab === 'Invoices' && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paddy-100">
              {invoices?.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-ink-900">{inv.customer.name}</td>
                  <td className="px-4 py-3 text-ink-700">{fmtGHS(inv.totalAmount)}</td>
                  <td className="px-4 py-3 text-ink-700">{fmtGHS(inv.balance)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${inv.status === 'PAID' ? 'bg-paddy-700 text-rice-50' : inv.status === 'PARTIALLY_PAID' ? 'bg-husk-300 text-soil-700' : 'bg-ink-500/10 text-ink-700'}`}>
                      {inv.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
              {invoices?.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-500">No invoices yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Payments' && (
        <div className="mt-6">
          {hasPermission('payment.create') && (
            <button type="button" onClick={() => setShowRecordPayment((v) => !v)} className="mb-4 rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50">
              {showRecordPayment ? 'Cancel' : 'Record payment'}
            </button>
          )}
          {showRecordPayment && (
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-husk-300 bg-husk-100/30 p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Customer</label>
                <select value={payCustomerId} onChange={(e) => setPayCustomerId(e.target.value)} className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm">
                  <option value="">Select…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Amount (GHS)</label>
                <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-32 rounded-lg border border-paddy-100 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-700">Method</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="rounded-lg border border-paddy-100 px-2 py-1.5 text-sm">
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="BANK_DEPOSIT">Bank deposit</option>
                  <option value="CASH">Cash</option>
                  <option value="OTHER_APPROVED_METHOD">Other</option>
                </select>
              </div>
              <button type="button" onClick={onRecordPayment} disabled={recording} className="rounded-full bg-paddy-900 px-4 py-1.5 text-sm font-medium text-rice-50 disabled:opacity-50">
                {recording ? 'Recording…' : 'Record'}
              </button>
            </div>
          )}
          <div className="overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paddy-100">
                {payments?.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-mono text-xs text-ink-700">{p.paymentNumber}</td>
                    <td className="px-4 py-3 text-ink-900">{p.customer.name}</td>
                    <td className="px-4 py-3 text-ink-700">{fmtGHS(p.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${p.status === 'VERIFIED' ? 'bg-paddy-700 text-rice-50' : p.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-husk-300 text-soil-700'}`}>
                        {p.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.status === 'PENDING_VERIFICATION' && hasPermission('payment.verify') && (
                        <button type="button" onClick={() => onVerify(p.id)} className="rounded-full border border-husk-500 px-3 py-1 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white">
                          Verify
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {payments?.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-500">No payments yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Receivables' && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-paddy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paddy-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Invoiced</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paddy-100">
              {debtors?.map((d) => {
                const customer = customers.find((c) => c.id === d.customerId);
                return (
                  <tr key={d.customerId}>
                    <td className="px-4 py-3 text-ink-900">{customer?.name ?? d.customerId}</td>
                    <td className="px-4 py-3 text-ink-700">{fmtGHS(d.totalInvoiced)}</td>
                    <td className="px-4 py-3 text-ink-700">{fmtGHS(d.totalPaid)}</td>
                    <td className="px-4 py-3 font-medium text-red-700">{fmtGHS(d.outstanding)}</td>
                  </tr>
                );
              })}
              {debtors?.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-500">No outstanding balances.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
