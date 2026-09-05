'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Sprout,
  Wheat,
  Truck,
  Warehouse,
  Ship,
  DollarSign,
  Landmark,
  Factory,
  Package,
  MessageSquare,
  Bot,
  SquareCheck,
  Bell,
  Users,
  Shield,
  User,
  Lock,
  LogOut,
  Menu,
  X,
  Building2,
  FlaskConical,
  BriefcaseBusiness,
  Receipt,
  BarChart3,
  Boxes,
  ShieldAlert,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { MeResponse, authApi } from '@/lib/api-client';
import { clearRefreshToken, readRefreshToken } from '@/lib/session';
import { InstallPrompt } from './InstallPrompt';
import { NAV_ITEMS, hasNavPermission } from '@/lib/nav-items';

// Every icon name used anywhere in nav-items.ts or ACCOUNT_ITEMS below
// must have a real entry here — statically imported once at module
// scope, not re-resolved on every render (dynamic() inside a component
// body creates a new component type each render, which flashes/
// remounts; a plain lookup object doesn't have that problem).
const ICON_MAP: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  sprout: Sprout,
  wheat: Wheat,
  truck: Truck,
  warehouse: Warehouse,
  ship: Ship,
  'dollar-sign': DollarSign,
  landmark: Landmark,
  factory: Factory,
  package: Package,
  'message-square': MessageSquare,
  bot: Bot,
  'square-check': SquareCheck,
  bell: Bell,
  users: Users,
  shield: Shield,
  user: User,
  lock: Lock,
  'log-out': LogOut,
  menu: Menu,
  'building-2': Building2,
  'flask-conical': FlaskConical,
  'briefcase-business': BriefcaseBusiness,
  receipt: Receipt,
  'bar-chart-3': BarChart3,
  boxes: Boxes,
  'shield-alert': ShieldAlert,
  search: Search,
};

function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}

const ACCOUNT_ITEMS = [
  { label: 'My Profile', href: '/profile', icon: 'user' },
  { label: 'Change Password', href: '/change-password', icon: 'lock' },
];

export function DashboardShell({ me, children }: { me: MeResponse; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => hasNavPermission(me, item.permission));
  const initials = `${me.firstName[0] ?? ''}${me.lastName[0] ?? ''}`.toUpperCase();

  const onLogout = async () => {
    const refreshToken = readRefreshToken();
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // logging out client-side regardless of server response
    }
    clearRefreshToken();
    sessionStorage.removeItem('kam_roms_access_token');
    router.replace('/login');
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-paddy-900 text-rice-50">
      <div className="border-b border-paddy-700 p-5">
        <Link href="/dashboard" className="font-display text-lg font-medium">
          KAM<span className="text-husk-300">-ROMS</span>
        </Link>
        <p className="mt-0.5 text-xs text-paddy-300">KAM Trading and Farms Limited</p>
      </div>

      <div className="flex items-center gap-3 border-b border-paddy-700 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-husk-500 font-display text-sm font-medium text-white">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-rice-50">{me.firstName} {me.lastName}</p>
          <p className="truncate text-xs text-paddy-300">{me.roles.map((r) => r.code).join(', ')}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {visibleItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setDrawerOpen(false)}
              className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active ? 'bg-husk-500 text-white' : 'text-paddy-100 hover:bg-paddy-700'
              }`}
            >
              <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-paddy-700 p-3">
        <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-paddy-300">Account</p>
        {ACCOUNT_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setDrawerOpen(false)}
              className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active ? 'bg-husk-500 text-white' : 'text-paddy-100 hover:bg-paddy-700'
              }`}
            >
              <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onLogout}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-paddy-100 transition hover:bg-paddy-700"
        >
          <NavIcon name="log-out" className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-rice-50">
      {/* Desktop: permanent sidebar */}
      <aside className="hidden w-64 shrink-0 md:block">
        <div className="fixed h-screen w-64">{sidebarContent}</div>
      </aside>

      {/* Mobile: slide-out drawer + backdrop */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 z-10 rounded-full bg-paddy-700 p-1.5 text-rice-50"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only top bar with hamburger */}
        <header className="flex items-center justify-between border-b border-paddy-100 bg-white px-4 py-3 md:hidden">
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="text-paddy-900">
            <NavIcon name="menu" className="h-6 w-6" />
          </button>
          <Link href="/dashboard" className="font-display text-base font-medium text-paddy-900">
            KAM<span className="text-husk-500">-ROMS</span>
          </Link>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-husk-500 text-xs font-medium text-white">
            {initials}
          </div>
        </header>

        <InstallPrompt />

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
