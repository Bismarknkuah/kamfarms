'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { authApi, ApiError } from '@/lib/api-client';

export default function ProfilePage() {
  const { me, accessToken, loading, error } = useCurrentUser();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me) {
      setFirstName(me.firstName);
      setLastName(me.lastName);
    }
  }, [me]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await authApi.updateProfile(accessToken, { firstName, lastName, phone: phone || undefined });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">My profile</h1>
      <p className="mt-1 text-sm text-ink-500">
        {me.roles.map((r) => r.code).join(', ')} — email and role changes go through Admin.
      </p>

      <form onSubmit={onSave} className="mt-6 max-w-sm space-y-4 rounded-2xl border border-paddy-100 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700">Email</label>
          <input value={me.email} disabled className="w-full cursor-not-allowed rounded-lg border border-paddy-100 bg-rice-50 px-3 py-2 text-sm text-ink-500" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700">First name</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700">Last name</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
          />
        </div>

        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        {saved && <p className="text-sm text-paddy-700">Profile updated ✓</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-full bg-paddy-900 px-5 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </DashboardShell>
  );
}
