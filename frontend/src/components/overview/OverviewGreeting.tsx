import { CalendarDays } from 'lucide-react';
import type { MeResponse } from '@/lib/api-client';
import { roleLabel } from '@/lib/role-labels';

const greet = (h: number) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

/** The top of every Overview: the date, a greeting and the person's role. Nothing to click: every page is in the side menu. */
export function OverviewGreeting({ me, now = new Date() }: { me: MeResponse; now?: Date }) {
  const today = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <header className="relative mb-8 overflow-hidden rounded-3xl bg-paddy-900 p-6 text-rice-50 sm:p-8" data-testid="overview-greeting-card">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-husk-500/15 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-paddy-500/20 blur-2xl" />
      <p className="relative inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-husk-300"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> {today}</p>
      <h1 className="relative mt-1.5 font-display text-3xl font-medium sm:text-4xl" data-testid="overview-greeting">{greet(now.getHours())}, {me.firstName}</h1>
      <p className="relative mt-1 text-sm text-paddy-100">{me.roles.map((r) => roleLabel(r.code)).join(' · ')}</p>
    </header>
  );
}
