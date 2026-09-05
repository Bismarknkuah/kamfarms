'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi, ApiError } from '@/lib/api-client';
import { storeRefreshToken } from '@/lib/session';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// Seeded demo accounts (prisma/seed.ts) — every account shares the same
// development-only password. Grouped the way the org chart actually reads,
// not alphabetically.
const DEMO_PASSWORD = 'KamRoms#2026Dev';
const DEMO_GROUPS: { label: string; accounts: { email: string; name: string }[] }[] = [
  {
    label: 'Executive & Admin',
    accounts: [
      { email: 'md@kam.local', name: 'Managing Director' },
      { email: 'ceo@kam.local', name: 'Chief Executive Officer' },
      { email: 'admin@kam.local', name: 'System Administrator' },
      { email: 'auditor@kam.local', name: 'Auditor (read-only)' },
    ],
  },
  {
    label: 'Farms',
    accounts: [
      { email: 'farmdirector@kam.local', name: 'Farm Supervisor' },
      { email: 'farmmanager.a@kam.local', name: 'Farm Manager — Farm A' },
      { email: 'farmmanager.b@kam.local', name: 'Farm Manager — Farm B' },
    ],
  },
  {
    label: 'Warehouses & Milling',
    accounts: [
      { email: 'warehousesupervisor@kam.local', name: 'Warehouse Supervisor' },
      { email: 'warehousemanager.1@kam.local', name: 'Warehouse Manager — WH1' },
      { email: 'warehousemanager.2@kam.local', name: 'Warehouse Manager — WH2' },
      { email: 'warehousemanager.3@kam.local', name: 'Warehouse Manager — WH3' },
      { email: 'operationsmanager.1@kam.local', name: 'Operations Manager' },
      { email: 'operations.1@kam.local', name: 'Operations Officer' },
    ],
  },
  {
    label: 'Sales & Finance',
    accounts: [
      { email: 'sales.1@kam.local', name: 'Sales Officer 1' },
      { email: 'sales.2@kam.local', name: 'Sales Officer 2' },
      { email: 'financedirector@kam.local', name: 'Finance Director' },
      { email: 'finance.1@kam.local', name: 'Finance Officer' },
    ],
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoLoadingEmail, setDemoLoadingEmail] = useState<string | null>(null);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const performLogin = async (email: string, password: string) => {
    setServerError(null);
    try {
      const result = await authApi.login(email, password);
      storeRefreshToken(result.refreshToken);
      sessionStorage.setItem('kam_roms_access_token', result.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      throw err;
    }
  };

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitting(true);
    try {
      await performLogin(values.email, values.password);
    } catch {
      // error already set in performLogin
    } finally {
      setSubmitting(false);
    }
  };

  const onDemoClick = async (email: string) => {
    setDemoLoadingEmail(email);
    setValue('email', email);
    try {
      await performLogin(email, DEMO_PASSWORD);
    } catch {
      // error already surfaced
    } finally {
      setDemoLoadingEmail(null);
    }
  };

  const onForgotSubmit = async () => {
    if (!forgotEmail) return;
    setForgotStatus('sending');
    try {
      await authApi.forgotPassword(forgotEmail);
      setForgotStatus('sent');
    } catch {
      setForgotStatus('error');
    }
  };

  return (
    <main className="flex min-h-screen bg-rice-50">
      {/* Left panel — the real Pectra Rice product photo, hidden below md so
          the form is never pushed off-screen on mobile. A dark gradient
          overlay keeps the page's own text legible over the image's own
          bright background and printed text. */}
      <div className="relative hidden w-1/2 overflow-hidden bg-paddy-900 md:block">
        <Image
          src="/pectra-rice.jpg"
          alt="Pectra Rice — Superfine Perfumed Rice, 25KG and 5KG bags"
          fill
          priority
          className="object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-paddy-900 via-paddy-900/70 to-paddy-900/20" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="font-display text-xl font-medium text-rice-50">
            KAM<span className="text-husk-300">-ROMS</span>
          </Link>
          <div className="max-w-sm">
            <p className="font-display text-sm italic text-husk-300">KAM Trading and Farms Limited</p>
            <h2 className="mt-3 font-display text-3xl font-medium leading-tight text-rice-50">
              From paddy field to Pectra Rice, one ledger the whole way.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-paddy-100">
              Six farms, three warehouses, one milling operation — every stage tracked, every handoff approved.
            </p>
          </div>
          <p className="text-xs text-paddy-300">Adenta, Accra · Sefwi Kanchabio, Western North Region</p>
        </div>
      </div>

      {/* Right panel — the actual sign-in form */}
      <div className="flex w-full items-center justify-center px-4 py-12 md:w-1/2">
        <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center font-display text-lg font-medium text-paddy-900 md:hidden">
          KAM<span className="text-husk-500">-ROMS</span>
        </Link>

        <div className="rounded-2xl border border-paddy-100 bg-white p-8 shadow-sm">
          <div className="mb-7 text-center">
            <h1 className="font-display text-2xl font-medium text-paddy-900">Welcome back</h1>
            <p className="mt-2 text-sm text-ink-500">Sign in to KAM Rice Operations Management.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                {...register('email')}
                className="w-full rounded-lg border border-paddy-100 px-3 py-2.5 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-ink-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotOpen(true);
                    setForgotStatus('idle');
                  }}
                  className="text-xs font-medium text-soil-500 underline underline-offset-2"
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
                className="w-full rounded-lg border border-paddy-100 px-3 py-2.5 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
              />
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            {serverError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-paddy-900 px-4 py-2.5 text-sm font-medium text-rice-50 transition hover:bg-paddy-700 disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        {/* Quick demo access */}
        <div className="mt-6 rounded-2xl border border-husk-300 bg-husk-100/50 p-5">
          <button
            type="button"
            onClick={() => setDemoOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left text-sm font-medium text-soil-700"
          >
            <span>Try a demo account — no password needed</span>
            <span className="text-lg leading-none">{demoOpen ? '\u2212' : '+'}</span>
          </button>

          {demoOpen && (
            <div className="mt-4 space-y-4">
              {DEMO_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="mb-1.5 text-xs font-medium text-soil-500">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.accounts.map((account) => (
                      <button
                        key={account.email}
                        type="button"
                        disabled={demoLoadingEmail !== null}
                        onClick={() => onDemoClick(account.email)}
                        className="rounded-full border border-husk-500 bg-white px-3 py-1.5 text-xs font-medium text-paddy-900 transition hover:bg-husk-500 hover:text-white disabled:opacity-50"
                      >
                        {demoLoadingEmail === account.email ? 'Signing in…' : account.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <p className="pt-1 text-xs text-ink-500">
                Demo accounts only — from the seeded development database, not real company data.
              </p>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Forgot password modal */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between">
              <h2 className="font-display text-lg font-medium text-paddy-900">Reset your password</h2>
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="text-ink-500 hover:text-ink-900"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {forgotStatus === 'sent' ? (
              <div className="space-y-4">
                <p className="text-sm text-ink-700">
                  If that account exists, a reset link has been sent. Check your inbox and follow the
                  link to set a new password.
                </p>
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  className="w-full rounded-lg bg-paddy-900 px-4 py-2.5 text-sm font-medium text-rice-50"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-ink-500">
                  Enter the email on your account and we&rsquo;ll send a link to reset your password.
                </p>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@kam.local"
                  className="w-full rounded-lg border border-paddy-100 px-3 py-2.5 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
                />
                {forgotStatus === 'error' && (
                  <p className="text-sm text-red-600">Something went wrong. Please try again.</p>
                )}
                <button
                  type="button"
                  onClick={onForgotSubmit}
                  disabled={forgotStatus === 'sending' || !forgotEmail}
                  className="w-full rounded-lg bg-paddy-900 px-4 py-2.5 text-sm font-medium text-rice-50 transition hover:bg-paddy-700 disabled:opacity-60"
                >
                  {forgotStatus === 'sending' ? 'Sending…' : 'Send reset link'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
