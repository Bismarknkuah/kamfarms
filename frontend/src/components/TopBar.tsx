'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Bell, MessageSquare, ChevronDown } from 'lucide-react';
import { MeResponse, notificationsApi, messagingApi } from '@/lib/api-client';

// Every dashboard in the reference design carries this same bar: a
// search field, a notification bell, a message icon, and the
// person's own name/role. Both badge counts are real, not decorative
// - pulled from the same endpoints the Notifications and Messages
// pages themselves already use, so this bar can never show a number
// those pages would disagree with.
export function TopBar({ me, accessToken }: { me: MeResponse; accessToken: string }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    notificationsApi.unreadCount(accessToken).then(setUnreadNotifications).catch(() => {});
    messagingApi.listConversations(accessToken).then((list) =>
      setUnreadMessages(list.reduce((sum, c) => sum + c.unreadCount, 0)),
    ).catch(() => {});
  }, [accessToken]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // No unified cross-entity search endpoint exists yet - routes to
    // Reports, the one page built to filter across farms, warehouses,
    // and orders together, rather than pretending to search everything
    // this field's placeholder implies.
    if (search.trim()) router.push(`/reports?q=${encodeURIComponent(search.trim())}`);
  };

  // MeResponse only ever carries the raw role code (confirmed against
  // its real type - no display-name field exists anywhere in this
  // app, every other page shows the bare code). MD/CEO are genuine
  // acronyms and stay as-is; everything else is title-cased from its
  // underscored form.
  const roleCode = me.roles[0]?.code ?? '';
  const primaryRole = roleCode === 'MD' || roleCode === 'CEO' ? roleCode : roleCode.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
  const initials = `${me.firstName[0] ?? ''}${me.lastName[0] ?? ''}`.toUpperCase();

  return (
    <div className="hidden items-center gap-4 border-b border-paddy-100 bg-white px-6 py-3 md:flex">
      <form onSubmit={onSearch} className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search farms, warehouses, orders, reports…"
          className="w-full rounded-full border border-paddy-100 bg-rice-50 py-2 pl-9 pr-4 text-sm outline-none focus:border-paddy-500"
        />
      </form>

      <Link href="/notifications" className="relative rounded-full p-2 text-ink-700 hover:bg-rice-50" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unreadNotifications > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadNotifications > 99 ? '99+' : unreadNotifications}
          </span>
        )}
      </Link>

      <Link href="/messages" className="relative rounded-full p-2 text-ink-700 hover:bg-rice-50" aria-label="Messages">
        <MessageSquare className="h-5 w-5" />
        {unreadMessages > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadMessages > 99 ? '99+' : unreadMessages}
          </span>
        )}
      </Link>

      <div className="relative">
        <button type="button" onClick={() => setProfileOpen((v) => !v)} className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 hover:bg-rice-50">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-husk-500 text-xs font-semibold text-white">{initials}</div>
          <span className="text-left text-sm leading-tight">
            <span className="block font-medium text-ink-900">{me.firstName} {me.lastName}</span>
            <span className="block text-xs text-ink-500">{primaryRole}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-ink-500" />
        </button>
        {profileOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
            <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-paddy-100 bg-white py-1 shadow-lg">
              <Link href="/profile" onClick={() => setProfileOpen(false)} className="block px-4 py-2 text-sm text-ink-700 hover:bg-rice-50">My profile</Link>
              <Link href="/change-password" onClick={() => setProfileOpen(false)} className="block px-4 py-2 text-sm text-ink-700 hover:bg-rice-50">Change password</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
