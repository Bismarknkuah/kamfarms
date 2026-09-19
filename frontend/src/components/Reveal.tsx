'use client';

import { useEffect, useRef, useState } from 'react';

// Fades a section up once it's actually scrolled into view, instead of
// on page load - the hero already had that treatment; nothing below it
// did. Fires once and stays revealed, so scrolling back up never
// re-hides content. Respects prefers-reduced-motion via the .reveal
// class's own animation, which the browser already disables for users
// who've asked for it.
export function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={visible ? `reveal ${className}` : `opacity-0 ${className}`} style={visible ? { ['--reveal-delay' as string]: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
