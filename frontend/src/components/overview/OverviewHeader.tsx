'use client';

import Link from 'next/link';
import { ArrowRight, CalendarDays, CircleAlert } from 'lucide-react';
import type { MeResponse } from '@/lib/api-client';
import { roleLabel } from '@/lib/role-labels';
import { visibleNavItems } from '@/lib/nav-items';
import { ICON_MAP } from '@/components/DashboardShell';

export interface NeedsYou { label: string; count: number; href: string }

const hour = () => new Date().getHours();
const greet = () => (hour() < 12 ? 'Good morning' : hour() < 17 ? 'Good afternoon' : 'Good evening');

/** Pages worth one tap from the top of an Overview, by role. Only the ones the person's menu really offers are shown. */
const QUICK: Record<string, string[]> = {
  FARM_DIRECTOR: ['/paddy-entries', '/dispatch', '/deliveries', '/reports'],
  FARM_MANAGER: ['/log-paddy-intake', '/dispatch', '/expenses', '/shipments'],
  WAREHOUSE_SUPERVISOR: ['/shipments', '/warehouse-requests', '/inventory', '/reports'],
  WAREHOUSE_MANAGER: ['/shipments', '/packaging', '/inventory', '/expenses'],
  OPERATIONS_MANAGER: ['/production', '/quality', '/inventory', '/reports'],
  OPERATIONS_OFFICER: ['/production', '/packaging', '/quality', '/expenses'],
  SALES_OFFICER: ['/sales', '/inventory', '/tasks', '/messages'],
  FINANCE_OFFICER: ['/finance', '/expenses', '/reports', '/tasks'],
  AUDITOR: ['/audit-log', '/reports', '/trace', '/analytics'],
};

/**
 * The top of every role's Overview: who and where you are, what needs you right now (as cards you can tap), and the few pages you use most.
 * Replaces the plain "Welcome" line, so every role's Overview starts the same way and reads at a glance.
 */
export function OverviewHeader({ me, attention, hasControlCenter }: { me: MeResponse; attention: NeedsYou[]; hasControlCenter?: boolean }) {
  const codes = me.roles.map((r) => r.code);
  const wanted = codes.flatMap((c) => QUICK[c] ?? []);
  const offered = new Map(visibleNavItems(me).map((i) => [i.href, i]));
  const quick = [...new Set(wanted)].map((h) => offered.get(h)).filter((i): i is NonNullable<typeof i> => Boolean(i)).slice(0, 4);
  const total = attention.reduce((s, a) => s + a.count, 0);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <header className="mb-8" data-testid="overview-header">
      <div className="relative overflow-hidden rounded-3xl bg-paddy-900 p-6 text-rice-50 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-husk-500/15 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-paddy-500/20 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-husk-300"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> {today}</p>
            <h1 className="mt-1.5 font-display text-3xl font-medium sm:text-4xl" data-testid="overview-greeting">{greet()}, {me.firstName}</h1>
            <p className="mt-1 text-sm text-paddy-100">{me.roles.map((r) => roleLabel(r.code)).join(' · ')}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-5 py-3 text-right backdrop-blur" data-testid="overview-needs-total">
            <p className="font-display text-4xl font-medium leading-none">{total}</p>
            <p className="mt-1 text-xs text-paddy-100">{total === 0 ? 'Nothing waiting for you' : total === 1 ? 'thing needs you' : 'things need you'}</p>
          </div>
        </div>
        {quick.length > 0 && (
          <nav aria-label="Quick links" className="relative mt-5 flex flex-wrap gap-2" data-testid="overview-quick">
            {quick.map((i) => {
              const Icon = ICON_MAP[i.icon] ?? CircleAlert;
              return <Link key={i.href} href={i.href} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-rice-50 transition hover:bg-white/20"><Icon className="h-4 w-4 text-husk-300" aria-hidden /> {i.label}</Link>;
            })}
            {hasControlCenter && <Link href="/control-center" className="inline-flex items-center gap-2 rounded-full bg-husk-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-husk-700">Control center <ArrowRight className="h-4 w-4" aria-hidden /></Link>}
          </nav>
        )}
      </div>

      {attention.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="overview-attention" aria-label="Needs your attention">
          {attention.map((a) => (
            <li key={a.label}>
              <Link href={a.href} data-testid="attention-card" className="flex items-center gap-4 rounded-2xl border border-husk-500/40 bg-husk-100/40 p-4 transition hover:border-paddy-500 hover:shadow-sm">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-husk-500 font-display text-lg font-medium text-white">{a.count}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-paddy-900">{a.label}</span><span className="block text-xs text-ink-500">Tap to review</span></span>
                <ArrowRight className="h-4 w-4 text-paddy-700" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
