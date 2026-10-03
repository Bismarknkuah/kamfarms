'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { User, Wheat } from 'lucide-react';

const LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'features', label: 'Features' },
  { id: 'products', label: 'Our Products' },
  { id: 'contact', label: 'Contact' },
];

// Transparent over the hero, solid white once the reader scrolls into the
// content. The link for whichever section is currently on screen is marked,
// so the bar doubles as a "you are here" indicator. Below the md breakpoint
// the links collapse into a slide-down menu rather than disappearing.
export function SiteNav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('home');

  useEffect(() => {
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter((el): el is HTMLElement => el !== null);
    const onScroll = () => {
      setSolid(window.scrollY > 24);
      // The current section is the last one whose top has passed a probe
      // line a third of the way down the screen.
      const probe = window.innerHeight * 0.35;
      let current = LINKS[0].id;
      for (const s of sections) {
        if (s.getBoundingClientRect().top <= probe) current = s.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const light = solid || open;

  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-all duration-500 ${light ? 'border-b border-paddy-100 bg-white/95 py-3 shadow-sm backdrop-blur' : 'bg-transparent py-5'}`}>
      <div className="mx-auto flex w-full max-w-[1760px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-14 2xl:px-20">
        <a href="#home" className={`flex items-center gap-2.5 ${light ? 'text-paddy-900' : 'text-white'}`} aria-label="KAM Trading and Farms, home">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-husk-500 text-paddy-900"><Wheat className="h-5 w-5" /></span>
          <span className="leading-none">
            <span className="block text-xl font-bold tracking-tight">KAM</span>
            <span className="mt-0.5 block text-[9px] font-semibold tracking-[0.18em] opacity-80">TRADING &amp; FARMS LTD.</span>
          </span>
        </a>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
          {LINKS.map((l) => {
            const on = active === l.id;
            return (
              <a
                key={l.id}
                href={`#${l.id}`}
                aria-current={on ? 'true' : undefined}
                className={`relative rounded-full px-3.5 py-2 text-sm font-medium transition ${
                  light ? (on ? 'text-paddy-900' : 'text-ink-700 hover:text-paddy-900') : on ? 'text-white' : 'text-white/75 hover:text-white'
                }`}
              >
                {l.label}
                <span className={`absolute inset-x-3.5 -bottom-0.5 h-0.5 rounded-full transition ${on ? (light ? 'bg-paddy-900' : 'bg-husk-300') : 'bg-transparent'}`} />
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${
              light ? 'bg-paddy-900 text-white hover:bg-paddy-700' : 'bg-husk-500 text-paddy-900 hover:bg-husk-300'
            }`}
          >
            <User className="h-4 w-4" /> Login
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className={`grid h-10 w-10 place-items-center rounded-full transition md:hidden ${light ? 'text-paddy-900' : 'text-white'}`}
          >
            <span className="relative block h-4 w-5">
              <span className={`absolute left-0 top-0 h-0.5 w-5 bg-current transition ${open ? 'translate-y-2 rotate-45' : ''}`} />
              <span className={`absolute left-0 top-2 h-0.5 w-5 bg-current transition ${open ? 'opacity-0' : ''}`} />
              <span className={`absolute left-0 top-4 h-0.5 w-5 bg-current transition ${open ? '-translate-y-2 -rotate-45' : ''}`} />
            </span>
          </button>
        </div>
      </div>

      <div className={`overflow-hidden transition-[max-height] duration-300 md:hidden ${open ? 'max-h-80' : 'invisible max-h-0'}`}>
        <nav className="mx-auto flex w-full max-w-[1760px] flex-col gap-1 px-5 pb-4 pt-2 text-sm sm:px-8" aria-label="Sections">
          {LINKS.map((l) => (
            <a key={l.id} href={`#${l.id}`} onClick={() => setOpen(false)} className={`rounded-lg px-3 py-2.5 font-medium ${active === l.id ? 'bg-paddy-50 text-paddy-900' : 'text-ink-700 hover:bg-paddy-50'}`}>
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
