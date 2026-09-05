'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi, ApiError } from '@/lib/api-client';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError('New password must be at least 10 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setStatus('saving');
    try {
      await authApi.resetPassword(token, password);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof ApiError ? err.message : 'The reset link is invalid or has expired.');
    }
  };

  if (!token) {
    return (
      <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-ink-700">
          This link is missing its reset token. Request a new reset link from the sign-in page.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-soil-500 underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center shadow-sm">
        <h1 className="font-display text-xl font-medium text-paddy-900">Password reset</h1>
        <p className="mt-2 text-sm text-ink-700">You can now sign in with your new password.</p>
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="mt-6 w-full rounded-lg bg-paddy-900 px-4 py-2.5 text-sm font-medium text-rice-50"
        >
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-paddy-100 bg-white p-8 shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="font-display text-xl font-medium text-paddy-900">Set a new password</h1>
        <p className="mt-2 text-sm text-ink-500">Choose a new password for your account.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-700">
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-paddy-100 px-3 py-2.5 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-ink-700">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-paddy-100 px-3 py-2.5 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
          />
        </div>
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={status === 'saving'}
          className="w-full rounded-lg bg-paddy-900 px-4 py-2.5 text-sm font-medium text-rice-50 transition hover:bg-paddy-700 disabled:opacity-60"
        >
          {status === 'saving' ? 'Saving…' : 'Reset password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-rice-50 px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center font-display text-lg font-medium text-paddy-900">
          KAM<span className="text-husk-500">-ROMS</span>
        </Link>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
