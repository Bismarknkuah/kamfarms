'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import {
  masterDataApi,
  paddyGradesApi,
  paddyTypesApi,
  Product,
  PackagingSize,
  PaddyGrade,
  PaddyType,
  ApiError,
} from '@/lib/api-client';

export default function MasterDataPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [products, setProducts] = useState<Product[]>([]);
  const [packagingSizes, setPackagingSizes] = useState<PackagingSize[]>([]);
  const [paddyGrades, setPaddyGrades] = useState<PaddyGrade[]>([]);
  const [paddyTypes, setPaddyTypes] = useState<PaddyType[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);

  const [newProductName, setNewProductName] = useState('');
  const [newProductDesc, setNewProductDesc] = useState('');
  const [newSizeLabel, setNewSizeLabel] = useState('');
  const [newSizeKg, setNewSizeKg] = useState('');
  const [newGradeCode, setNewGradeCode] = useState('');
  const [newGradeLabel, setNewGradeLabel] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const loadAll = (token: string) => {
    masterDataApi.products(token).then(setProducts).catch(() => {});
    masterDataApi.packagingSizes(token).then(setPackagingSizes).catch(() => {});
    paddyGradesApi.list(token).then(setPaddyGrades).catch(() => {});
    paddyTypesApi.list(token).then(setPaddyTypes).catch(() => {});
  };

  useEffect(() => {
    if (accessToken) loadAll(accessToken);
  }, [accessToken]);

  const canManage = hasPermission('masterdata.manage');
  // Which sections this role actually sees - the real point of
  // redistributing this off Farm Director: each role sees master data
  // "in a different way based on the system flow," not the same four
  // sections shown identically to everyone who can reach this page.
  // Admin and MD/CEO (view-only, via audit.view) see everything;
  // Warehouse Manager sees only what's tied to their actual daily
  // work (packaging); Warehouse Supervisor sees the broader set they
  // oversee across every warehouse.
  const myRoleCodes = me?.roles.map((r) => r.code) ?? [];
  const isWarehouseManagerOnly = myRoleCodes.includes('WAREHOUSE_MANAGER') && !myRoleCodes.includes('ADMIN');
  const isWarehouseSupervisor = myRoleCodes.includes('WAREHOUSE_SUPERVISOR');
  const showProducts = !isWarehouseManagerOnly;
  const showPackagingSizes = true;
  const showPaddyGrades = !isWarehouseManagerOnly && !isWarehouseSupervisor;
  const showPaddyTypes = !isWarehouseManagerOnly && !isWarehouseSupervisor;

  const onAddProduct = async () => {
    if (!accessToken || !newProductName.trim()) return;
    setSaving('product');
    setPageError(null);
    try {
      await masterDataApi.createProduct(accessToken, { name: newProductName.trim(), description: newProductDesc.trim() || undefined });
      setNewProductName(''); setNewProductDesc('');
      loadAll(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to add product.');
    } finally {
      setSaving(null);
    }
  };

  const onToggleProduct = async (id: string, isActive: boolean) => {
    if (!accessToken) return;
    try {
      await masterDataApi.toggleProduct(accessToken, id, !isActive);
      loadAll(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to update product.');
    }
  };

  const onAddSize = async () => {
    if (!accessToken || !newSizeLabel.trim() || !newSizeKg) return;
    setSaving('size');
    setPageError(null);
    try {
      await masterDataApi.createPackagingSize(accessToken, { label: newSizeLabel.trim(), sizeKg: parseFloat(newSizeKg) });
      setNewSizeLabel(''); setNewSizeKg('');
      loadAll(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to add packaging size.');
    } finally {
      setSaving(null);
    }
  };

  const onToggleSize = async (id: string, isActive: boolean) => {
    if (!accessToken) return;
    try {
      await masterDataApi.togglePackagingSize(accessToken, id, !isActive);
      loadAll(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to update packaging size.');
    }
  };

  const onAddGrade = async () => {
    if (!accessToken || !newGradeCode.trim() || !newGradeLabel.trim()) return;
    setSaving('grade');
    setPageError(null);
    try {
      await paddyGradesApi.create(accessToken, { code: newGradeCode.trim().toUpperCase().replace(/\s+/g, '_'), label: newGradeLabel.trim() });
      setNewGradeCode(''); setNewGradeLabel('');
      loadAll(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to add paddy grade.');
    } finally {
      setSaving(null);
    }
  };

  const onToggleGrade = async (id: string, isActive: boolean) => {
    if (!accessToken) return;
    try {
      await paddyGradesApi.toggle(accessToken, id, !isActive);
      loadAll(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to update paddy grade.');
    }
  };

  const onAddType = async () => {
    if (!accessToken || !newTypeName.trim()) return;
    setSaving('type');
    setPageError(null);
    try {
      await paddyTypesApi.create(accessToken, newTypeName.trim());
      setNewTypeName('');
      loadAll(accessToken);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to add paddy type.');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Master Data</h1>
      <p className="mt-1 text-sm text-ink-500">
        {isWarehouseManagerOnly
          ? 'Packaging sizes - the reference data tied to your own day-to-day work.'
          : isWarehouseSupervisor
            ? 'Products and packaging sizes - what your warehouses actually produce and pack.'
            : "The real, underlying reference data every other page's dropdowns pull from."}
        {!canManage && ' View-only for your role.'}
      </p>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {showProducts && (
        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Products</h2>
          {canManage && (
            <div className="mt-3 space-y-2 rounded-lg border border-husk-300 bg-husk-100/30 p-3">
              <input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} placeholder="Name, e.g. Broken Rice" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              <input value={newProductDesc} onChange={(e) => setNewProductDesc(e.target.value)} placeholder="Description (optional)" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              <button type="button" onClick={onAddProduct} disabled={saving === 'product' || !newProductName.trim()} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                {saving === 'product' ? 'Adding…' : 'Add product'}
              </button>
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {products.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                <span className="text-ink-900">{p.name}</span>
                {canManage ? (
                  <button type="button" onClick={() => onToggleProduct(p.id, p.isActive)} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${p.isActive ? 'bg-paddy-700 text-rice-50' : 'bg-ink-500/10 text-ink-500'}`}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </button>
                ) : (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${p.isActive ? 'bg-paddy-700 text-rice-50' : 'bg-ink-500/10 text-ink-500'}`}>{p.isActive ? 'Active' : 'Inactive'}</span>
                )}
              </div>
            ))}
            {products.length === 0 && <p className="text-sm text-ink-500">No products yet.</p>}
          </div>
        </div>
        )}

        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Packaging sizes</h2>
          {canManage && (
            <div className="mt-3 space-y-2 rounded-lg border border-husk-300 bg-husk-100/30 p-3">
              <div className="grid grid-cols-2 gap-2">
                <input value={newSizeLabel} onChange={(e) => setNewSizeLabel(e.target.value)} placeholder="Label, e.g. 10KG" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
                <input type="number" value={newSizeKg} onChange={(e) => setNewSizeKg(e.target.value)} placeholder="Size in KG" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
              <button type="button" onClick={onAddSize} disabled={saving === 'size' || !newSizeLabel.trim() || !newSizeKg} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                {saving === 'size' ? 'Adding…' : 'Add size'}
              </button>
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {packagingSizes.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                <span className="text-ink-900">{s.label} <span className="text-xs text-ink-500">({s.sizeKg} KG)</span></span>
                {canManage ? (
                  <button type="button" onClick={() => onToggleSize(s.id, s.isActive)} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.isActive ? 'bg-paddy-700 text-rice-50' : 'bg-ink-500/10 text-ink-500'}`}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </button>
                ) : (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.isActive ? 'bg-paddy-700 text-rice-50' : 'bg-ink-500/10 text-ink-500'}`}>{s.isActive ? 'Active' : 'Inactive'}</span>
                )}
              </div>
            ))}
            {packagingSizes.length === 0 && <p className="text-sm text-ink-500">No packaging sizes yet.</p>}
          </div>
        </div>

        {showPaddyGrades && (
        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Paddy grades</h2>
          {canManage && (
            <div className="mt-3 space-y-2 rounded-lg border border-husk-300 bg-husk-100/30 p-3">
              <div className="grid grid-cols-2 gap-2">
                <input value={newGradeCode} onChange={(e) => setNewGradeCode(e.target.value)} placeholder="Code, e.g. SIZE_6" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm uppercase" />
                <input value={newGradeLabel} onChange={(e) => setNewGradeLabel(e.target.value)} placeholder="Label, e.g. Size 6" className="rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              </div>
              <button type="button" onClick={onAddGrade} disabled={saving === 'grade' || !newGradeCode.trim() || !newGradeLabel.trim()} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                {saving === 'grade' ? 'Adding…' : 'Add grade'}
              </button>
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {paddyGrades.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-lg bg-rice-50 px-3 py-2 text-sm">
                <span className="text-ink-900">{g.label} <span className="font-mono text-xs text-ink-500">{g.code}</span></span>
                {canManage ? (
                  <button type="button" onClick={() => onToggleGrade(g.id, g.isActive)} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${g.isActive ? 'bg-paddy-700 text-rice-50' : 'bg-ink-500/10 text-ink-500'}`}>
                    {g.isActive ? 'Active' : 'Inactive'}
                  </button>
                ) : (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${g.isActive ? 'bg-paddy-700 text-rice-50' : 'bg-ink-500/10 text-ink-500'}`}>{g.isActive ? 'Active' : 'Inactive'}</span>
                )}
              </div>
            ))}
            {paddyGrades.length === 0 && <p className="text-sm text-ink-500">No paddy grades yet.</p>}
          </div>
        </div>
        )}

        {showPaddyTypes && (
        <div className="rounded-2xl border border-paddy-100 bg-white p-5">
          <h2 className="font-display text-lg text-paddy-900">Paddy types</h2>
          {canManage && (
            <div className="mt-3 space-y-2 rounded-lg border border-husk-300 bg-husk-100/30 p-3">
              <input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="Name, e.g. Jasmine" className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm" />
              <button type="button" onClick={onAddType} disabled={saving === 'type' || !newTypeName.trim()} className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50">
                {saving === 'type' ? 'Adding…' : 'Add type'}
              </button>
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {paddyTypes.map((t) => (
              <div key={t.id} className="rounded-lg bg-rice-50 px-3 py-2 text-sm text-ink-900">{t.name}</div>
            ))}
            {paddyTypes.length === 0 && <p className="text-sm text-ink-500">No paddy types yet.</p>}
          </div>
        </div>
        )}
      </div>
    </DashboardShell>
  );
}
