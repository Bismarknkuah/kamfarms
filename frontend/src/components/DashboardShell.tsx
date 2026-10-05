'use client';

import { roleLabel } from '@/lib/role-labels';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SlidersHorizontal,
  LayoutTemplate,
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
  Database,
  Search,
  FileDown,
  ClipboardEdit,
  Inbox,
  Eye,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { MeResponse, authApi } from '@/lib/api-client';
import { clearRefreshToken, readRefreshToken } from '@/lib/session';
import { InstallPrompt } from './InstallPrompt';
import { NAV_ITEMS, adminNavSections, hasNavPermission, type NavItem } from '@/lib/nav-items';
import { isAdministrator } from '@/lib/access';
import { CallOverlay } from './CallOverlay';
import { TopBar } from './TopBar';

// Every icon name used anywhere in nav-items.ts or ACCOUNT_ITEMS below
// must have a real entry here - statically imported once at module
// scope, not re-resolved on every render (dynamic() inside a component
// body creates a new component type each render, which flashes/
// remounts; a plain lookup object doesn't have that problem).
const ICON_MAP: Record<string, LucideIcon> = {
  'layout-template': LayoutTemplate,
  'sliders-horizontal': SlidersHorizontal,
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
  database: Database,
  search: Search,
  'file-down': FileDown,
  'clipboard-edit': ClipboardEdit,
  'inbox': Inbox,
  eye: Eye,
  tag: Tag,
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
  // Dismissible for this session only (not persisted) - the person
  // asked explicitly not to be blocked from the system, just reminded.
  // Re-shows on next login since it reads directly from me.mustChangePassword
  // each time this component mounts fresh, rather than a
  // once-ever-dismissed flag that would make the reminder easy to
  // forget about permanently.
  const [reminderDismissed, setReminderDismissed] = useState(false);

  // Read directly rather than adding a new prop to every one of the
  // 30+ call sites across the app - same sessionStorage key auth
  // already uses elsewhere (see onLogout's removeItem below).
  const [accessToken, setAccessToken] = useState('');
  useEffect(() => { setAccessToken(sessionStorage.getItem('kam_roms_access_token') ?? ''); }, []);

  const myRoleCodes = me.roles.map((r) => r.code);
  // The System Administrator has their own menu, in groups (see ADMIN_NAV_SECTIONS); everyone else shares the flat list.
  const adminMode = isAdministrator(me);
  const adminSections = adminMode ? adminNavSections() : [];
  const visibleItems = adminMode
    ? adminSections.flatMap((section) => section.items)
    : NAV_ITEMS.filter(
        (item) =>
          hasNavPermission(me, item.permission) &&
          !item.hideForRoles?.some((code) => myRoleCodes.includes(code)) &&
          (!item.onlyForRoles || item.onlyForRoles.some((code) => myRoleCodes.includes(code))) &&
          !(item.feature && me.hiddenFeatures?.includes(item.feature)),
      );
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

  const renderNavItem = (item: NavItem) => {
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
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-paddy-900 text-rice-50">
      <div className="border-b border-paddy-700 p-5">
        <Link href="/dashboard" className="font-display text-lg font-medium">
          KAM<span className="text-husk-300">-ROMS</span>
        </Link>
        <p className="mt-0.5 text-xs text-paddy-300">KAM Trading and Farms Limited</p>
        {adminMode && (
          <span data-testid="admin-badge" className="mt-2 inline-block rounded-full bg-husk-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white">
            Administrator console
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 border-b border-paddy-700 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-husk-500 font-display text-sm font-medium text-white">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-rice-50">{me.firstName} {me.lastName}</p>
          <p className="truncate text-xs text-paddy-300">{me.roles.map((r) => roleLabel(r.code)).join(', ')}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {adminMode
          ? adminSections.map((section) => (
              <div key={section.title} data-testid="admin-nav-section" className="mb-3">
                <p className="mb-1 px-3 pt-2 text-[11px] font-semibold uppercase tracking-widest text-husk-300">{section.title}</p>
                {section.items.map(renderNavItem)}
              </div>
            ))
          : visibleItems.map(renderNavItem)}
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

        {me.mustChangePassword && !reminderDismissed && pathname !== '/change-password' && (
          <div className="flex items-center justify-between gap-3 bg-husk-300 px-4 py-2.5 text-sm text-soil-700 sm:px-6">
            <p>
              You&rsquo;re signed in with a temporary password.{' '}
              <Link href="/change-password" className="font-medium underline">Change it now</Link> to keep your account secure.
            </p>
            <button type="button" onClick={() => setReminderDismissed(true)} className="shrink-0 text-xs text-soil-700 underline">
              Remind me later
            </button>
          </div>
        )}

        {accessToken && <TopBar me={me} accessToken={accessToken} />}

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
      <CallOverlay me={me} />
    </div>
  );
}
