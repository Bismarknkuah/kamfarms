'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { organizationApi, Company, Facility, ApiError } from '@/lib/api-client';

export default function OrganizationPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const [company, setCompany] = useState<Company | null>(null);
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<Company>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    organizationApi.getCompany(accessToken).then((c) => { setCompany(c); setForm(c); }).catch((err: unknown) => setPageError(err instanceof ApiError ? err.message : 'Failed to load company details.'));
    organizationApi.listFacilities(accessToken).then(setFacilities).catch(() => {});
  }, [accessToken]);

  const canEdit = hasPermission('organization.manage');

  const onSave = async () => {
    if (!accessToken) return;
    setSaving(true);
    setPageError(null);
    try {
      const updated = await organizationApi.updateCompany(accessToken, {
        name: form.name,
        poBox: form.poBox ?? undefined,
        address: form.address ?? undefined,
        email: form.email ?? undefined,
        phone1: form.phone1 ?? undefined,
        phone2: form.phone2 ?? undefined,
        facebook: form.facebook ?? undefined,
        currency: form.currency,
        timezone: form.timezone,
      });
      setCompany(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  const field = (label: string, key: keyof Company, placeholder?: string) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      <input
        value={(form[key] as string) ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        disabled={!canEdit}
        placeholder={placeholder}
        className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500 disabled:bg-rice-50 disabled:text-ink-500"
      />
    </div>
  );

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Organization</h1>
      <p className="mt-1 text-sm text-ink-500">Company details and every facility — headquarters and manufacturing sites.</p>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {company && (
        <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-paddy-900">Company details</h2>
            {canEdit && (
              <button type="button" onClick={onSave} disabled={saving} className="rounded-full bg-paddy-900 px-5 py-2 text-sm font-medium text-rice-50 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>
          {saved && <p className="mt-2 text-sm font-medium text-paddy-700">Saved ✓</p>}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {field('Company name', 'name')}
            {field('P.O. Box', 'poBox')}
            {field('Address', 'address')}
            {field('Email', 'email')}
            {field('Phone 1', 'phone1')}
            {field('Phone 2', 'phone2')}
            {field('Facebook', 'facebook')}
            {field('Currency', 'currency', 'GHS')}
            {field('Timezone', 'timezone', 'Africa/Accra')}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-6">
        <h2 className="font-display text-lg text-paddy-900">Facilities</h2>
        <div className="mt-3 space-y-2">
          {facilities?.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg border border-paddy-100 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink-900">{f.name}</p>
                <p className="text-xs text-ink-500">{[f.townOrArea, f.region].filter(Boolean).join(', ') || 'No location set'}</p>
              </div>
              <span className="rounded-full bg-husk-100 px-2.5 py-0.5 text-xs font-medium text-soil-700">{f.type}</span>
            </div>
          ))}
          {facilities?.length === 0 && <p className="text-sm text-ink-500">No facilities on file.</p>}
        </div>
      </div>
    </DashboardShell>
  );
}
