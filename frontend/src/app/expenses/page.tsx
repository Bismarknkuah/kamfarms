'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { findSingleLocationScope } from '@/lib/nav-items';
import { expensesApi, masterDataApi, farmEquipmentApi, farmsApi, warehouseEquipmentApi, warehousesApi, Expense, ExpenseCategory, FarmEquipment, Farm, WarehouseEquipment, Warehouse, ApiError } from '@/lib/api-client';

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
  // A real photo/file of the receipt or the non-functional equipment
  // itself, not a text link nobody would have a real URL to paste in -
  // captured as a base64 data URI, the same approach already proven
  // for voice notes, since this project has no dedicated file storage
  // to upload to instead.
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentFileName, setAttachmentFileName] = useState('');
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [equipment, setEquipment] = useState<FarmEquipment[]>([]);
  const [equipmentFarms, setEquipmentFarms] = useState<Farm[]>([]);
  const [equipmentFarmId, setEquipmentFarmId] = useState('');
  const [newEquipmentName, setNewEquipmentName] = useState('');
  const [customEquipmentName, setCustomEquipmentName] = useState('');
  const [newEquipmentStatus, setNewEquipmentStatus] = useState('WORKING');
  const [addingEquipment, setAddingEquipment] = useState(false);

  const [whEquipment, setWhEquipment] = useState<WarehouseEquipment[]>([]);
  const [whEquipmentWarehouses, setWhEquipmentWarehouses] = useState<Warehouse[]>([]);
  const [whEquipmentWarehouseId, setWhEquipmentWarehouseId] = useState('');
  const [newWhEquipmentName, setNewWhEquipmentName] = useState('');
  const [customWhEquipmentName, setCustomWhEquipmentName] = useState('');
  const [newWhEquipmentStatus, setNewWhEquipmentStatus] = useState('WORKING');
  const [addingWhEquipment, setAddingWhEquipment] = useState(false);

  const myFarmId = me ? findSingleLocationScope(me, 'FARM') : null;
  const myWarehouseId = me ? findSingleLocationScope(me, 'WAREHOUSE') : null;
  const canApprove = hasPermission('finance.approve');
  const isOtherCategory = categories.find((c) => c.id === categoryId)?.name === 'Other';

  const load = (token: string) => {
    expensesApi.list(token).then(setExpenses).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load expenses.'));
  };

  const loadEquipment = (token: string) => {
    farmEquipmentApi.list(token).then(setEquipment).catch(() => {});
  };

  const loadWhEquipment = (token: string) => {
    warehouseEquipmentApi.list(token).then(setWhEquipment).catch(() => {});
  };

  useEffect(() => {
    if (!accessToken) return;
    load(accessToken);
    loadEquipment(accessToken);
    loadWhEquipment(accessToken);
    masterDataApi.expenseCategories(accessToken).then(setCategories).catch(() => {});
    // Deliberately not relying on findSingleLocationScope here - that
    // helper returns null for anything other than exactly one scope
    // match, which would silently hide this entire feature (no error,
    // just nothing rendered) for any Farm Manager whose scope wasn't
    // configured as a single clean match. farmsApi.list() is already
    // correctly scoped server-side and handles any count gracefully,
    // the same robust pattern already proven for the Dispatch form.
    farmsApi.list(accessToken).then((list) => {
      setEquipmentFarms(list);
      if (list.length === 1) setEquipmentFarmId(list[0].id);
    }).catch(() => {});
    warehousesApi.list(accessToken).then((list) => {
      setWhEquipmentWarehouses(list);
      if (list.length === 1) setWhEquipmentWarehouseId(list[0].id);
    }).catch(() => {});
  }, [accessToken]);

  const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024; // ~6MB original file - base64 encoding adds ~33% on top, safely under the backend's 10mb request body limit.

  const onSelectAttachment = (file: File | undefined) => {
    if (!file) return;
    setAttachmentError(null);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentError('That file is too large - please choose one under 6MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentUrl(reader.result as string);
      setAttachmentFileName(file.name);
    };
    reader.onerror = () => setAttachmentError('Failed to read that file - please try again.');
    reader.readAsDataURL(file);
  };

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
        attachmentUrl: attachmentUrl || undefined,
        notes: notes || undefined,
      });
      setAmount(''); setReference(''); setNotes(''); setCustomCategoryLabel(''); setItemDescription('');
      setAttachmentUrl(''); setAttachmentFileName('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      load(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to record expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const onAddEquipment = async () => {
    const finalName = newEquipmentName === 'Other' ? customEquipmentName.trim() : newEquipmentName;
    if (!accessToken || !equipmentFarmId || !finalName) return;
    setAddingEquipment(true);
    try {
      await farmEquipmentApi.create(accessToken, { farmId: equipmentFarmId, name: finalName, status: newEquipmentStatus });
      setNewEquipmentName('');
      setCustomEquipmentName('');
      setNewEquipmentStatus('WORKING');
      loadEquipment(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to add equipment.');
    } finally {
      setAddingEquipment(false);
    }
  };

  const onUpdateEquipmentStatus = async (id: string, status: string) => {
    if (!accessToken) return;
    try {
      await farmEquipmentApi.update(accessToken, id, { status });
      loadEquipment(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to update equipment.');
    }
  };

  const onAddWhEquipment = async () => {
    const finalName = newWhEquipmentName === 'Other' ? customWhEquipmentName.trim() : newWhEquipmentName;
    if (!accessToken || !whEquipmentWarehouseId || !finalName) return;
    setAddingWhEquipment(true);
    try {
      await warehouseEquipmentApi.create(accessToken, { warehouseId: whEquipmentWarehouseId, name: finalName, status: newWhEquipmentStatus });
      setNewWhEquipmentName('');
      setCustomWhEquipmentName('');
      setNewWhEquipmentStatus('WORKING');
      loadWhEquipment(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to add equipment.');
    } finally {
      setAddingWhEquipment(false);
    }
  };

  const onUpdateWhEquipmentStatus = async (id: string, status: string) => {
    if (!accessToken) return;
    try {
      await warehouseEquipmentApi.update(accessToken, id, { status });
      loadWhEquipment(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to update equipment.');
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
        {myFarmId ? 'Log expenses for your farm - labour, transport, and other running costs.' : 'Every expense submitted, awaiting approval or already decided.'}
      </p>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {(hasPermission('farm.equipment.manage') || hasPermission('farm.inventory.view')) && (
        <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">🔧 Machinery &amp; equipment</h2>
          <p className="mt-1 text-sm text-ink-500">
            {hasPermission('farm.equipment.manage') ? 'What you have on your farm, and whether it’s actually usable right now.' : 'Equipment status across every farm - so you know what’s working before it becomes a problem.'}
          </p>

          {hasPermission('farm.equipment.manage') && (
            <div className="mt-3 flex flex-wrap gap-2">
              {equipmentFarms.length > 1 && (
                <select value={equipmentFarmId} onChange={(e) => setEquipmentFarmId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                  <option value="">Which farm…</option>
                  {equipmentFarms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )}
              <select value={newEquipmentName} onChange={(e) => setNewEquipmentName(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                <option value="">Which equipment…</option>
                <option value="Tractor">Tractor</option>
                <option value="Water pump">Water pump</option>
                <option value="Sprayer">Sprayer</option>
                <option value="Harvester">Harvester</option>
                <option value="Plough">Plough</option>
                <option value="Trailer">Trailer</option>
                <option value="Irrigation system">Irrigation system</option>
                <option value="Generator">Generator</option>
                <option value="Weighing scale">Weighing scale</option>
                <option value="Other">Other…</option>
              </select>
              {newEquipmentName === 'Other' && (
                <input
                  value={customEquipmentName}
                  onChange={(e) => setCustomEquipmentName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onAddEquipment()}
                  placeholder="Name this equipment"
                  className="flex-1 rounded-lg border border-paddy-100 px-3 py-2 text-sm"
                />
              )}
              <select value={newEquipmentStatus} onChange={(e) => setNewEquipmentStatus(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                <option value="WORKING">Working</option>
                <option value="NOT_WORKING">Not working</option>
                <option value="NEEDS_REPLACEMENT">Needs replacement</option>
              </select>
              <button type="button" onClick={onAddEquipment} disabled={addingEquipment || !equipmentFarmId || !newEquipmentName || (newEquipmentName === 'Other' && !customEquipmentName.trim())} className="rounded-full bg-paddy-900 px-4 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">
                {addingEquipment ? 'Adding…' : 'Add'}
              </button>
            </div>
          )}
          {hasPermission('farm.equipment.manage') && equipmentFarms.length === 0 && (
            <p className="mt-2 text-xs text-red-600">No farm is assigned to your account yet - ask your Farm Supervisor to assign you to a farm before you can add equipment.</p>
          )}

          <div className="mt-4 space-y-2">
            {equipment.map((eq) => (
              <div key={eq.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rice-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-ink-900">{eq.name}{equipmentFarms.length > 1 && <span className="ml-2 text-xs font-normal text-ink-500">{eq.farm.name}</span>}</p>
                  {eq.notes && <p className="text-xs text-ink-500">{eq.notes}</p>}
                </div>
                {hasPermission('farm.equipment.manage') ? (
                  <select
                    value={eq.status}
                    onChange={(e) => onUpdateEquipmentStatus(eq.id, e.target.value)}
                    className={`rounded-full border-0 px-3 py-1 text-xs font-medium ${
                      eq.status === 'WORKING' ? 'bg-paddy-700 text-rice-50' : eq.status === 'NOT_WORKING' ? 'bg-red-100 text-red-700' : 'bg-husk-300 text-soil-700'
                    }`}
                  >
                    <option value="WORKING">Working</option>
                    <option value="NOT_WORKING">Not working</option>
                    <option value="NEEDS_REPLACEMENT">Needs replacement</option>
                  </select>
                ) : (
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    eq.status === 'WORKING' ? 'bg-paddy-700 text-rice-50' : eq.status === 'NOT_WORKING' ? 'bg-red-100 text-red-700' : 'bg-husk-300 text-soil-700'
                  }`}>
                    {eq.status === 'WORKING' ? 'Working' : eq.status === 'NOT_WORKING' ? 'Not working' : 'Needs replacement'}
                  </span>
                )}
              </div>
            ))}
            {equipment.length === 0 && <p className="text-sm text-ink-500">No equipment recorded yet.</p>}
          </div>
        </div>
      )}

      {(hasPermission('warehouse.equipment.manage') || hasPermission('warehouse.inventory.view')) && (
        <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">🔧 Warehouse machinery &amp; equipment</h2>
          <p className="mt-1 text-sm text-ink-500">
            {hasPermission('warehouse.equipment.manage') ? 'What you have at your warehouse, and whether it’s actually usable right now.' : 'Equipment status across every warehouse - so you know what’s working before it becomes a problem.'}
          </p>

          {hasPermission('warehouse.equipment.manage') && (
            <div className="mt-3 flex flex-wrap gap-2">
              {whEquipmentWarehouses.length > 1 && (
                <select value={whEquipmentWarehouseId} onChange={(e) => setWhEquipmentWarehouseId(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                  <option value="">Which warehouse…</option>
                  {whEquipmentWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              )}
              <select value={newWhEquipmentName} onChange={(e) => setNewWhEquipmentName(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                <option value="">Which equipment…</option>
                <option value="Forklift">Forklift</option>
                <option value="Weighing scale">Weighing scale</option>
                <option value="Pallet jack">Pallet jack</option>
                <option value="Moisture meter">Moisture meter</option>
                <option value="Fumigation equipment">Fumigation equipment</option>
                <option value="Generator">Generator</option>
                <option value="Sealing machine">Sealing machine</option>
                <option value="Racking / shelving">Racking / shelving</option>
                <option value="Other">Other…</option>
              </select>
              {newWhEquipmentName === 'Other' && (
                <input
                  value={customWhEquipmentName}
                  onChange={(e) => setCustomWhEquipmentName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onAddWhEquipment()}
                  placeholder="Name this equipment"
                  className="flex-1 rounded-lg border border-paddy-100 px-3 py-2 text-sm"
                />
              )}
              <select value={newWhEquipmentStatus} onChange={(e) => setNewWhEquipmentStatus(e.target.value)} className="rounded-lg border border-paddy-100 px-3 py-2 text-sm">
                <option value="WORKING">Working</option>
                <option value="NOT_WORKING">Not working</option>
                <option value="NEEDS_REPLACEMENT">Needs replacement</option>
              </select>
              <button type="button" onClick={onAddWhEquipment} disabled={addingWhEquipment || !whEquipmentWarehouseId || !newWhEquipmentName || (newWhEquipmentName === 'Other' && !customWhEquipmentName.trim())} className="rounded-full bg-paddy-900 px-4 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">
                {addingWhEquipment ? 'Adding…' : 'Add'}
              </button>
            </div>
          )}
          {hasPermission('warehouse.equipment.manage') && whEquipmentWarehouses.length === 0 && (
            <p className="mt-2 text-xs text-red-600">No warehouse is assigned to your account yet - ask your Warehouse Supervisor to assign you to a warehouse before you can add equipment.</p>
          )}

          <div className="mt-4 space-y-2">
            {whEquipment.map((eq) => (
              <div key={eq.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rice-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-ink-900">{eq.name}{whEquipmentWarehouses.length > 1 && <span className="ml-2 text-xs font-normal text-ink-500">{eq.warehouse.name}</span>}</p>
                  {eq.notes && <p className="text-xs text-ink-500">{eq.notes}</p>}
                </div>
                {hasPermission('warehouse.equipment.manage') ? (
                  <select
                    value={eq.status}
                    onChange={(e) => onUpdateWhEquipmentStatus(eq.id, e.target.value)}
                    className={`rounded-full border-0 px-3 py-1 text-xs font-medium ${
                      eq.status === 'WORKING' ? 'bg-paddy-700 text-rice-50' : eq.status === 'NOT_WORKING' ? 'bg-red-100 text-red-700' : 'bg-husk-300 text-soil-700'
                    }`}
                  >
                    <option value="WORKING">Working</option>
                    <option value="NOT_WORKING">Not working</option>
                    <option value="NEEDS_REPLACEMENT">Needs replacement</option>
                  </select>
                ) : (
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    eq.status === 'WORKING' ? 'bg-paddy-700 text-rice-50' : eq.status === 'NOT_WORKING' ? 'bg-red-100 text-red-700' : 'bg-husk-300 text-soil-700'
                  }`}>
                    {eq.status === 'WORKING' ? 'Working' : eq.status === 'NOT_WORKING' ? 'Not working' : 'Needs replacement'}
                  </span>
                )}
              </div>
            ))}
            {whEquipment.length === 0 && <p className="text-sm text-ink-500">No equipment recorded yet.</p>}
          </div>
        </div>
      )}

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
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-ink-700">
              Photo or receipt (optional) - upload directly from your phone or computer, not a link
            </label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => onSelectAttachment(e.target.files?.[0])}
              className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-full file:border-0 file:bg-paddy-900 file:px-4 file:py-2 file:text-xs file:font-medium file:text-rice-50"
            />
            {attachmentFileName && <p className="mt-1 text-xs text-paddy-700">Attached: {attachmentFileName} ✓</p>}
            {attachmentError && <p className="mt-1 text-xs text-red-600">{attachmentError}</p>}
          </div>
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
                  {e.attachmentUrl && (
                    e.attachmentUrl.startsWith('data:image') ? (
                      <a href={e.attachmentUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block">
                        <img src={e.attachmentUrl} alt="Expense attachment" className="h-16 w-16 rounded-lg border border-paddy-100 object-cover" />
                      </a>
                    ) : (
                      <a href={e.attachmentUrl} download className="mt-1 inline-block text-xs text-paddy-700 underline">View attached file</a>
                    )
                  )}
                </td>
                <td className="px-4 py-3 text-ink-700">GHS {e.amount.toLocaleString()}</td>
                <td className="px-4 py-3 text-ink-700">{e.farm?.name ?? e.warehouse?.name ?? ' - '}</td>
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
