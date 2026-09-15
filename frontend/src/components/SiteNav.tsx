'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Transparent over the full-bleed hero, solid cream once the reader
// scrolls into the content - a cover page that becomes a header.
export function SiteNav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-all duration-500 ${solid ? 'border-b border-paddy-100 bg-rice-50/95 py-3 shadow-sm backdrop-blur' : 'bg-transparent py-6'}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
        <Link href="/" className={`font-display text-2xl font-semibold tracking-tight ${solid ? 'text-paddy-900' : 'text-rice-50'}`}>
          KAM<span className="text-husk-300">-ROMS</span>
        </Link>
        <nav className={`hidden items-center gap-8 text-sm md:flex ${solid ? 'text-ink-700' : 'text-rice-50/90'}`}>
          <a href="#chain" className="hover:text-husk-500">The chain</a>
          <a href="#roles" className="hover:text-husk-500">Who uses it</a>
          <a href="#principles" className="hover:text-husk-500">Principles</a>
        </nav>
        <Link href="/login" className={`rounded-full px-5 py-2 text-sm font-medium transition ${solid ? 'bg-paddy-900 text-rice-50 hover:bg-paddy-700' : 'border border-rice-50/60 text-rice-50 hover:bg-rice-50 hover:text-paddy-900'}`}>
          Sign in
        </Link>
      </div>
    </header>
  );
}
