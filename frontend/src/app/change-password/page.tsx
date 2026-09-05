'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { authApi, ApiError } from '@/lib/api-client';
import { clearRefreshToken } from '@/lib/session';

export default function ChangePasswordPage() {
  const { me, accessToken, loading, error } = useCurrentUser();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    if (newPassword.length < 10) {
      setFormError('New password must be at least 10 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('New password and confirmation don\u2019t match.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await authApi.changePassword(accessToken, currentPassword, newPassword);
      // The backend revokes every session on a successful password
      // change — the access token we're holding is already invalid, so
      // there's nothing to do but sign out for real and ask for a fresh
      // login, exactly as the backend's own message says.
      clearRefreshToken();
      sessionStorage.removeItem('kam_roms_access_token');
      router.replace('/login?passwordChanged=true');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to change password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">Change password</h1>
      <p className="mt-1 text-sm text-ink-500">
        You&rsquo;ll be signed out everywhere and asked to log in again with your new password.
      </p>

      <form onSubmit={onSubmit} className="mt-6 max-w-sm space-y-4 rounded-2xl border border-paddy-100 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700">New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={10}
            className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
          />
          <p className="mt-1 text-xs text-ink-500">At least 10 characters.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700">Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
          />
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-paddy-900 px-5 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50"
        >
          {submitting ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </DashboardShell>
  );
}
