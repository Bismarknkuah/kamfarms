'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Bell, MessageSquare, ChevronDown } from 'lucide-react';
import { MeResponse, SearchGroup, notificationsApi, messagingApi, searchApi } from '@/lib/api-client';

/** Answers already fetched, kept 30 seconds (per sign-in), so backspacing or retyping is instant. */
const searchMemo = new Map<string, { at: number; groups: SearchGroup[] }>();
const remember = (key: string, groups: SearchGroup[]) => { if (searchMemo.size >= 60) searchMemo.delete(searchMemo.keys().next().value as string); searchMemo.set(key, { at: Date.now(), groups }); };
const KIND_ORDER = ['orders', 'dispatches', 'paddy-requests', 'farms', 'warehouses', 'milling-centers'];
import { adminNavSections, visibleNavItems } from '@/lib/nav-items';

// Every dashboard in the reference design carries this same bar: a
// search field, a notification bell, a message icon, and the
// person's own name/role. Both badge counts are real, not decorative
// - pulled from the same endpoints the Notifications and Messages
// pages themselves already use, so this bar can never show a number
// those pages would disagree with.
export function TopBar({ me, accessToken }: { me: MeResponse; accessToken: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  // Search is asked in two parts: the quick kinds answer first, the slower assembled ones (dispatches, paddy requests) follow. What is on screen is kept until
  // something better arrives, and a slow or failed part says so in words: the list never just empties.
  const [fastGroups, setFastGroups] = useState<SearchGroup[]>([]);
  const [slowGroups, setSlowGroups] = useState<SearchGroup[]>([]);
  const [fastBusy, setFastBusy] = useState(false);
  const [slowBusy, setSlowBusy] = useState(false);
  const [gaps, setGaps] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const searching = fastBusy || slowBusy;
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    notificationsApi.unreadCount(accessToken).then(setUnreadNotifications).catch(() => {});
    messagingApi.listConversations(accessToken).then((list) =>
      setUnreadMessages(list.reduce((sum, c) => sum + c.unreadCount, 0)),
    ).catch(() => {});
  }, [accessToken]);

  // Quick search. Pages are matched here, instantly, from the menu the person is already offered; records (orders, dispatches, farms, warehouses...) come from
  // the server, which only searches what this person's role may see, in the places they are responsible for.
  const menu = useMemo(() => (me.roles.some((r) => r.code === 'ADMIN') ? adminNavSections().flatMap((section) => section.items) : visibleNavItems(me)), [me]);
  const needle = query.trim().toLowerCase();
  const pageHits = needle.length >= 2 ? menu.filter((i) => i.label.toLowerCase().includes(needle) || i.description.toLowerCase().includes(needle)).slice(0, 5) : [];
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setFastBusy(false); setSlowBusy(false); setGaps([]); setFailed(false); return; }
    const ac = new AbortController();
    setGaps([]); setFailed(false);
    const t = setTimeout(() => {
      const ask = (scope: 'fast' | 'slow', put: (g: SearchGroup[]) => void, busy: (b: boolean) => void) => {
        const key = `${accessToken.slice(-16)}:${scope}:${q.toLowerCase()}`; const hit = searchMemo.get(key);
        if (hit && Date.now() - hit.at < 30_000) { put(hit.groups); busy(false); return; }
        busy(true);
        searchApi.search(accessToken, q, scope, ac.signal)
          .then((r) => {
            const gs = Array.isArray(r?.groups) ? r.groups : []; put(gs);
            if (r?.incomplete?.length) setGaps((g) => [...g, ...r.incomplete!]); else remember(key, gs);
            busy(false);
          })
          .catch(() => { if (!ac.signal.aborted) { setFailed(true); busy(false); } });   // keep what is on screen; say it did not work
      };
      ask('fast', setFastGroups, setFastBusy); ask('slow', setSlowGroups, setSlowBusy);
    }, 200);
    return () => { clearTimeout(t); ac.abort(); };
  }, [query, accessToken]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setSearchOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const groups = [...fastGroups, ...slowGroups].sort((x, y) => KIND_ORDER.indexOf(x.key) - KIND_ORDER.indexOf(y.key));
  const sections: { label: string; items: { href: string; title: string; subtitle: string; index: number }[] }[] = [];
  let n = 0;
  if (pageHits.length > 0) sections.push({ label: 'Pages', items: pageHits.map((i) => ({ href: i.href, title: i.label, subtitle: i.description, index: n++ })) });
  for (const g of groups) sections.push({ label: g.label, items: g.results.map((r) => ({ href: r.href, title: r.title, subtitle: r.subtitle, index: n++ })) });
  const flat = sections.flatMap((x) => x.items);
  const show = searchOpen && needle.length >= 2;

  const go = (href: string) => { setSearchOpen(false); setQuery(''); setFastGroups([]); setSlowGroups([]); setGaps([]); setFailed(false); setActive(-1); router.push(href); };
  const onSearch = (e: React.FormEvent) => { e.preventDefault(); const hit = flat[active >= 0 ? active : 0]; if (hit) go(hit.href); };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSearchOpen(true); setActive((i) => (flat.length === 0 ? -1 : (i + 1) % flat.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (flat.length === 0 ? -1 : i <= 0 ? flat.length - 1 : i - 1)); }
    else if (e.key === 'Escape') { setSearchOpen(false); setActive(-1); }
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
    // On a laptop screen and wider the search field is placed exactly in the middle of the bar, as wide as the room allows (never wider than 34rem)
    // while leaving space for the person's tools on the right; the tools sit at the right edge. (Below 1360px the name is dropped from the tools so
    // they stay narrow, and above it the name is capped at 10rem; on a tablet the bar is simply search on the left, tools on the right.)
    <div className="relative hidden items-center gap-4 border-b border-paddy-100 bg-white px-6 py-3 [--bar-side:14rem] md:flex min-[1360px]:[--bar-side:24rem]" data-testid="top-bar">
      <form ref={box} onSubmit={onSearch} role="search" hidden={me.hiddenFeatures?.includes('quick-search')} className="relative w-full md:flex-1 lg:absolute lg:left-1/2 lg:top-1/2 lg:w-[min(34rem,calc(100%_-_2*var(--bar-side)))] lg:flex-none lg:-translate-x-1/2 lg:-translate-y-1/2" data-testid="top-bar-search">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <input
          data-testid="search-input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); setActive(-1); }}
          onFocus={() => setSearchOpen(true)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={show}
          aria-controls="quick-search-results"
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Search farms, warehouses, orders, reports…"
          className="w-full rounded-full border border-paddy-100 bg-rice-50 py-2 pl-9 pr-4 text-sm outline-none focus:border-paddy-500"
        />
        {show && (
          <div id="quick-search-results" role="listbox" aria-busy={searching} data-testid="search-results" className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-paddy-100 bg-white p-2 shadow-lg">
            {sections.map((sec) => (
              <div key={sec.label} data-testid="search-group" data-label={sec.label} className="py-1">
                <p className="px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-ink-500">{sec.label}</p>
                {sec.items.map((it) => (
                  <Link key={`${it.href}-${it.index}`} href={it.href} role="option" aria-selected={active === it.index} data-testid="search-result" data-href={it.href} onClick={(e) => { e.preventDefault(); go(it.href); }}
                    className={`block rounded-xl px-3 py-2 ${active === it.index ? 'bg-paddy-50' : 'hover:bg-rice-50'}`}>
                    <span className="block text-sm font-medium text-ink-900">{it.title}</span>
                    <span className="block truncate text-xs text-ink-500">{it.subtitle}</span>
                  </Link>
                ))}
              </div>
            ))}
            {flat.length === 0 && <p className="px-3 py-3 text-sm text-ink-500" data-testid="search-empty">{searching ? 'Searching...' : failed ? 'Search could not reach the server just now. Try again in a moment.' : gaps.length > 0 ? `${gaps.join(' and ')} could not be searched just now. Try again in a moment.` : `Nothing found for \u201c${query.trim()}\u201d.`}</p>}
            {flat.length > 0 && slowBusy && <p className="px-3 py-2 text-xs text-ink-500" data-testid="search-more">Still looking in dispatches and paddy requests...</p>}
            {flat.length > 0 && !searching && (failed || gaps.length > 0) && <p className="px-3 py-2 text-xs text-amber-700" data-testid="search-gap">{failed ? 'Some results could not be loaded.' : `${gaps.join(' and ')} could not be searched just now.`} Keep typing to try again.</p>}
          </div>
        )}
      </form>

      <div className="ml-auto flex items-center justify-end gap-4" data-testid="top-bar-tools">
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
          <span className="hidden max-w-[10rem] text-left text-sm leading-tight min-[1360px]:block">
            <span className="block truncate font-medium text-ink-900">{me.firstName} {me.lastName}</span>
            <span className="block truncate text-xs text-ink-500">{primaryRole}</span>
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
    </div>
  );
}
