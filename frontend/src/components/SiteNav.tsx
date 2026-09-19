'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const LINKS = [
  { href: '#chain', label: 'The chain' },
  { href: '#roles', label: 'Who uses it' },
  { href: '#principles', label: 'Principles' },
];

// Transparent over the full-bleed hero, solid cream once the reader
// scrolls into the content - a cover page that becomes a header. Below
// the md breakpoint the three links collapse into a real slide-down
// menu rather than simply disappearing, which is what the previous
// version did.
export function SiteNav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Closing on navigation (not just outside-click) matters here since
  // every link is an in-page anchor - without this the menu would
  // still be open, covering the section the visitor just jumped to.
  const closeAndGo = () => setOpen(false);

  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-all duration-500 ${solid || open ? 'border-b border-paddy-100 bg-rice-50/95 py-3 shadow-sm backdrop-blur' : 'bg-transparent py-6'}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
        <Link href="/" className={`font-display text-2xl font-semibold tracking-tight ${solid || open ? 'text-paddy-900' : 'text-rice-50'}`}>
          KAM<span className="text-husk-300">-ROMS</span>
        </Link>
        <nav className={`hidden items-center gap-8 text-sm md:flex ${solid ? 'text-ink-700' : 'text-rice-50/90'}`}>
          {LINKS.map((l) => <a key={l.href} href={l.href} className="hover:text-husk-500">{l.label}</a>)}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className={`hidden rounded-full px-5 py-2 text-sm font-medium transition sm:inline-block ${solid || open ? 'bg-paddy-900 text-rice-50 hover:bg-paddy-700' : 'border border-rice-50/60 text-rice-50 hover:bg-rice-50 hover:text-paddy-900'}`}>
            Sign in
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className={`grid h-9 w-9 place-items-center rounded-full transition md:hidden ${solid || open ? 'text-paddy-900' : 'text-rice-50'}`}
          >
            <span className="relative block h-4 w-5">
              <span className={`absolute left-0 top-0 h-0.5 w-5 bg-current transition ${open ? 'translate-y-2 rotate-45' : ''}`} />
              <span className={`absolute left-0 top-2 h-0.5 w-5 bg-current transition ${open ? 'opacity-0' : ''}`} />
              <span className={`absolute left-0 top-4 h-0.5 w-5 bg-current transition ${open ? '-translate-y-2 -rotate-45' : ''}`} />
            </span>
          </button>
        </div>
      </div>
      <div className={`overflow-hidden transition-[max-height] duration-300 md:hidden ${open ? 'max-h-64' : 'max-h-0'}`}>
        <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-6 pb-4 pt-2 text-sm text-ink-700">
          {LINKS.map((l) => <a key={l.href} href={l.href} onClick={closeAndGo} className="rounded-lg px-2 py-2.5 hover:bg-paddy-50">{l.label}</a>)}
          <Link href="/login" onClick={closeAndGo} className="mt-2 rounded-full bg-paddy-900 px-4 py-2.5 text-center font-medium text-rice-50">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}
