'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Wheat, ArrowLeft } from 'lucide-react';
import { authApi, ApiError, siteMediaUrl } from '@/lib/api-client';
import { storeRefreshToken } from '@/lib/session';
import { SlideshowStage, useSlideshow } from '@/components/SiteSlideshow';
import { useSiteContent } from '@/lib/site-content';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// Seeded demo accounts (prisma/seed.ts) - every account shares the same
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
      { email: 'farmmanager.a@kam.local', name: 'Farm Manager - Farm A' },
      { email: 'farmmanager.b@kam.local', name: 'Farm Manager - Farm B' },
    ],
  },
  {
    label: 'Warehouses & Milling',
    accounts: [
      { email: 'warehousesupervisor@kam.local', name: 'Warehouse Supervisor' },
      { email: 'warehousemanager.1@kam.local', name: 'Warehouse Manager - WH1' },
      { email: 'warehousemanager.2@kam.local', name: 'Warehouse Manager - WH2' },
      { email: 'warehousemanager.3@kam.local', name: 'Warehouse Manager - WH3' },
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
    ],
  },
];

// The six handoffs, shown on the left of the page with the current one lit in turn.
const JOURNEY = [
  { title: 'Farm', body: 'Paddy logged by grade, bags and moisture' },
  { title: 'Delivery', body: 'Tracked in transit, never counted early' },
  { title: 'Warehouse', body: 'Received, counted and checked' },
  { title: 'Milling', body: 'Mass balance checked on every run' },
  { title: 'Packaging', body: '1 to 50 kg bags of Pectra Rice' },
  { title: 'Sale', body: 'Approved by Finance, released, delivered' },
];

export default function LoginPage() {
  const router = useRouter();

  // The pictures the System Administrator has chosen for the homepage slideshow also dress this page (pictures only:
  // a sign-in page should load fast). With none chosen it shows the product photo.
  const { content } = useSiteContent();
  const show = useSlideshow(content.slideshow.slides, content.slideshow.intervalSeconds, true);
  const hasPictures = show.playable.length > 0;
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setStep((n) => (n + 1) % JOURNEY.length), 2400);
    return () => clearInterval(t);
  }, []);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoLoadingEmail, setDemoLoadingEmail] = useState<string | null>(null);

  // Two real, everyday usability affordances rather than decoration:
  // a show/hide toggle (mistyped passwords are the most common reason
  // a sign-in fails on a shared farm-office computer) and a live Caps
  // Lock warning, which catches the second most common one before the
  // form is even submitted.
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  // Visual only, matching the reference - there is no "remember me"
  // concept on the backend (every session already persists via the
  // stored refresh token regardless of this checkbox), so this never
  // claims to change actual session behavior.
  const [rememberMe, setRememberMe] = useState(true);

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
    <main className="min-h-screen bg-rice-50 lg:grid lg:grid-cols-[1.12fr_1fr]">
      {/* LEFT: a banner on a phone, a full panel from a laptop up */}
      <aside className="relative isolate flex h-56 flex-col justify-between overflow-hidden bg-paddy-900 p-6 sm:h-64 lg:h-auto lg:min-h-screen lg:p-12 xl:p-16" data-testid="login-art">
        {hasPictures ? (
          <SlideshowStage show={show} className="absolute inset-0 -z-20" label="Pictures from KAM Trading and Farms" />
        ) : (
          <Image src="/pectra-rice.jpg" alt="" fill priority sizes="(min-width: 1024px) 56vw, 100vw" className="-z-20 object-cover object-top opacity-45" />
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-paddy-900/95 via-paddy-900/80 to-paddy-900/55" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(55%_50%_at_90%_8%,rgba(201,151,43,0.28),transparent_70%)]" />
        <div aria-hidden className="absolute inset-0 -z-10 opacity-50 [background-image:radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
        <svg aria-hidden viewBox="0 0 1200 200" preserveAspectRatio="none" className="kam-drift pointer-events-none absolute -bottom-2 left-0 -z-10 hidden h-44 w-[130%] text-husk-500/30 lg:block">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M0 ${70 + i * 20} C 200 ${40 + i * 20}, 400 ${100 + i * 20}, 600 ${70 + i * 20} S 1000 ${40 + i * 20}, 1200 ${70 + i * 20}`} fill="none" stroke="currentColor" strokeWidth="1.5" />
          ))}
        </svg>

        <Link href="/" className="flex items-center gap-3 text-rice-50" aria-label="KAM-ROMS, back to the homepage">
          {content.brand.logoMediaId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={siteMediaUrl(content.brand.logoMediaId)} alt="" className="h-11 w-11 rounded-full bg-white object-cover" />
          ) : (
            <span className="grid h-11 w-11 place-items-center rounded-full bg-husk-500 text-paddy-900"><Wheat className="h-5 w-5" /></span>
          )}
          <span className="leading-tight">
            <span className="block font-display text-2xl font-medium">KAM<span className="text-husk-300">-ROMS</span></span>
            <span className="block text-[11px] tracking-[0.14em] text-paddy-100">KAM TRADING AND FARMS LIMITED</span>
          </span>
        </Link>

        <p className="max-w-xs font-display text-xl leading-snug text-rice-50 lg:hidden">From paddy field to Pectra Rice, one ledger the whole way.</p>

        <div className="hidden max-w-xl lg:block">
          <p className="kam-rise font-display text-base italic text-husk-300">One company, one ledger</p>
          <h2 className="kam-rise mt-3 font-display text-5xl font-medium leading-[1.08] text-rice-50 xl:text-6xl" style={{ ['--kam-delay' as string]: '120ms' }}>
            From paddy field to Pectra Rice, one ledger the whole way.
          </h2>
          <p className="kam-rise mt-5 max-w-md text-sm leading-relaxed text-paddy-100 [@media(max-height:800px)]:hidden" style={{ ['--kam-delay' as string]: '240ms' }}>
            Six farms, three warehouses, one milling operation. Every stage is tracked and every handoff approved.
          </p>

          <ol className="mt-8 space-y-0" aria-label="The journey of every bag">
            {JOURNEY.map((j, i) => {
              const on = i === step;
              return (
                <li key={j.title} className="kam-rise relative flex gap-4 pb-3.5 last:pb-0" style={{ ['--kam-delay' as string]: `${360 + i * 90}ms` }}>
                  {i < JOURNEY.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-1.25rem)] w-px bg-white/15" />}
                  <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors duration-500 ${on ? 'kam-pulse-ring bg-husk-500 text-paddy-900' : 'border border-white/25 bg-paddy-900/60 text-paddy-100'}`}>{i + 1}</span>
                  <span className="pt-0.5 leading-tight">
                    <span className={`block text-sm font-semibold transition-colors duration-500 ${on ? 'text-husk-300' : 'text-rice-50'}`}>{j.title}</span>
                    <span className={`block text-xs transition-colors duration-500 ${on ? 'text-rice-50' : 'text-paddy-200'}`}>{j.body}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="mt-8 flex flex-wrap gap-2 [@media(max-height:820px)]:hidden">
            {['Every handoff approved', 'Traceable to the field', 'A role for every person'].map((t) => (
              <span key={t} className="rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-rice-50 backdrop-blur-sm">{t}</span>
            ))}
          </div>
        </div>

        <p className="hidden text-xs text-paddy-300 lg:block">Adenta, Accra &middot; Sefwi Kanchabio, Western North Region</p>
      </aside>

      {/* RIGHT: the sign-in form */}
      <section className="relative flex flex-col items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <Link href="/" className="absolute right-5 top-5 inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 transition hover:text-paddy-900 sm:right-8 sm:top-7">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to homepage
        </Link>

        <div className="w-full max-w-md">
        {content.signin.notice && (
          <p role="status" data-testid="signin-notice" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{content.signin.notice}</p>
        )}
        <div className="rounded-2xl border border-paddy-100 bg-white p-8 shadow-sm">
          <div className="mb-7 text-center">
            <p className="font-display text-base italic text-soil-500">KAM-ROMS</p>
            <h1 className="mt-1 font-display text-3xl font-medium text-paddy-900">Welcome back</h1>
            <p className="mt-2 text-sm text-ink-500">Sign in to KAM Rice Operations Management.</p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-700">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  {...register('email')}
                  className="w-full rounded-lg border border-paddy-100 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
                />
              </div>
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
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  {...register('password')}
                  onKeyUp={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                  onBlur={() => setCapsLockOn(false)}
                  className="w-full rounded-lg border border-paddy-100 py-2.5 pl-9 pr-10 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-paddy-900"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {capsLockOn && (
                <p className="mt-1 text-xs font-medium text-amber-700" role="status">Caps Lock is on.</p>
              )}
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-paddy-100 text-paddy-900 focus:ring-paddy-500/30" />
              Remember me
            </label>

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
              {submitting ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rice-50/40 border-t-rice-50" />
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-paddy-100" />
            <span className="text-xs text-ink-500">OR</span>
            <div className="h-px flex-1 bg-paddy-100" />
          </div>

          <button
            type="button"
            disabled
            title="Not built yet - shown honestly disabled rather than left out, since it's part of the design this page is matching."
            className="w-full cursor-not-allowed rounded-lg border border-paddy-100 px-4 py-2.5 text-sm font-medium text-ink-500 opacity-60"
          >
            Login with OTP - coming soon
          </button>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-ink-500">
          <ShieldCheck className="h-3.5 w-3.5 text-paddy-700" />
          Secure &middot; Your session stays on this device only &middot; Sign out when you leave a shared computer
        </p>

        {/* Quick demo access: off unless the System Administrator turns it on (Homepage > Sign-in page) */}
        {content.signin.showDemoAccounts && (
          <>
        <div className="mt-6 rounded-2xl border border-husk-300 bg-husk-100/50 p-5">
          <button
            type="button"
            onClick={() => setDemoOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left text-sm font-medium text-soil-700"
          >
            <span>Try a demo account - no password needed</span>
            <span className="text-lg leading-none">{demoOpen ? '−' : '+'}</span>
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
                Demo accounts only - from the seeded development database, not real company data.
              </p>
            </div>
          )}
        </div>
          </>
        )}
        </div>
      </section>

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
