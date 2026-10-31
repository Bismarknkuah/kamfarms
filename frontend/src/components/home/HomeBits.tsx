'use client';

import { useEffect, useRef, useState, type ElementType } from 'react';

/** A slim band of words that drifts sideways forever (it stops under the pointer, and for visitors who asked for less motion). */
export function Marquee({ items, className = '' }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-10 pr-10 kam-marquee-row">
      {items.map((t, i) => (
        <li key={`${t}-${i}`} className="flex items-center gap-10 whitespace-nowrap font-display text-xl font-medium tracking-wide sm:text-2xl">
          {t}<span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className={`kam-marquee flex overflow-hidden ${className}`} data-testid="home-marquee">
      {row(false)}{row(true)}
    </div>
  );
}

/** Shows a figure like "12,000+" or "98%" counting up from zero the first time it scrolls into view. Anything that does not start with a number is shown as it is. */
export function CountUp({ text, className = '' }: { text: string; className?: string }) {
  const m = /^(\D*)([\d][\d,.]*)(.*)$/.exec(text);
  const target = m ? parseFloat(m[2].replace(/,/g, '')) : NaN;
  const decimals = m && m[2].includes('.') ? (m[2].split('.')[1] ?? '').length : 0;
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !Number.isFinite(target) || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now(); const span = 1300;
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / span);
        setShown(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(tick); else setShown(null);
      };
      setShown(0); raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target]);

  if (!m || !Number.isFinite(target) || shown === null) return <span ref={ref} className={className}>{text}</span>;
  const grouped = m[2].includes(',');
  const n = shown.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
  return <span ref={ref} className={className} aria-label={text}>{m[1]}{n}{m[3]}</span>;
}

export interface ChainStep { step: string; title: string; body: string; icon: ElementType }

/** The journey from field to customer as a connected path: a line through numbered stops (across on a wide screen, down on a phone). */
export function ChainTimeline({ steps }: { steps: ChainStep[] }) {
  return (
    <ol className="relative mt-14 grid grid-cols-1 gap-8 lg:grid-cols-3 2xl:grid-cols-6" data-testid="home-chain">
      <span aria-hidden className="absolute bottom-6 left-6 top-6 w-px bg-gradient-to-b from-husk-300/80 via-husk-300/30 to-transparent lg:hidden" />
      {steps.map((s, i) => (
        <li key={s.step} className="group relative pl-16 lg:pl-0" style={{ ['--reveal-delay' as string]: `${i * 80}ms` }}>
          <span className="absolute left-0 top-0 grid h-12 w-12 place-items-center rounded-full border border-husk-300/50 bg-paddy-900 text-husk-300 shadow-[0_0_0_6px_rgba(19,44,26,1)] transition duration-300 group-hover:scale-110 group-hover:bg-husk-500 group-hover:text-paddy-900 lg:static">
            <s.icon className="h-5 w-5" aria-hidden />
          </span>
          {i < steps.length - 1 && <span aria-hidden className="absolute left-12 right-[-2rem] top-6 hidden h-px bg-gradient-to-r from-husk-300/50 to-transparent 2xl:block" />}
          <p className="mt-0 text-xs font-bold tracking-[0.25em] text-husk-300 lg:mt-5">{s.step}</p>
          <h3 className="mt-1 text-xl font-bold text-white">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-paddy-100">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
