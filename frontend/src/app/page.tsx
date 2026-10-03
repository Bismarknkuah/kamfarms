'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Eye,
  Factory,
  Gauge,
  Leaf,
  MapPin,
  Phone,
  ShieldCheck,
  Sprout,
  Truck,
  Warehouse,
  Zap,
} from 'lucide-react';
import { SiteNav } from '@/components/SiteNav';
import { Reveal } from '@/components/Reveal';
import { SlideshowCaption, SlideshowControls, SlideshowStage, useSlideshow } from '@/components/SiteSlideshow';
import { dialable, formatPhone, useSiteContent } from '@/lib/site-content';

// Everything the System Administrator can edit comes from useSiteContent(). What stays here is the
// description of the software itself (features and the six handoffs), which is not company content.

const STAT_ICONS = [Sprout, Warehouse, Factory, ShieldCheck];
const OPERATION_ICONS = [Sprout, Factory, Warehouse, Truck, BarChart3, Leaf];

const FEATURES = [
  { icon: ClipboardList, title: 'Approved at every handoff', body: 'Paddy, deliveries, production runs and expenses each need an approval before they count.' },
  { icon: Boxes, title: 'Counted by the bag', body: 'Farms and warehouses count in bags. A weight is optional, and clearly marked whenever it is an estimate.' },
  { icon: ShieldCheck, title: 'Nothing edits history', body: 'Stock is the sum of everything that happened. A mistake is fixed with a new, explained correction, never a silent edit.' },
  { icon: Gauge, title: 'A dashboard for every role', body: 'Twelve roles, each seeing exactly its own work, from the farm gate to the Managing Director.' },
  { icon: Zap, title: 'Yield and power predictions', body: 'Expected rice and power use for each milling run, built from the company\u2019s own approved history.' },
  { icon: Eye, title: 'A full audit trail', body: 'Every action across the company is recorded, most recent first, and open to the people who oversee it.' },
];

const ROLE_NAMES = [
  'Managing Director', 'CEO', 'Farm Director', 'Farm Manager', 'Warehouse Supervisor', 'Warehouse Manager', 'Operations Manager',
  'Operations Officer', 'Sales Officer', 'Finance Director', 'Auditor', 'System Administrator',
];

const CHAIN = [
  { step: '01', title: 'Farm', body: 'Farm managers log every paddy delivery: grade, bags, moisture, harvest date. Farm Supervisors approve it before it ever counts as stock.' },
  { step: '02', title: 'Delivery', body: 'Approved paddy moves to a warehouse by truck. It is tracked as in transit the whole way and never counted as available until it arrives.' },
  { step: '03', title: 'Warehouse', body: 'The receiving warehouse manager logs the actual quantity that arrived. Any shortfall against what was expected is flagged, not quietly absorbed.' },
  { step: '04', title: 'Milling', body: 'Paddy becomes rice, broken rice and hull. The mass balance is checked automatically, so output can never exceed input.' },
  { step: '05', title: 'Packaging', body: 'Recovered rice is bagged into 1, 2, 5, 10, 25 and 50 kg sizes as Pectra Rice, ready for the warehouse floor.' },
  { step: '06', title: 'Sale', body: 'The Finance Director approves each order, then the Managing Director releases it to the Warehouse Supervisor for delivery. Stock is reserved at release, so two customers can never be promised the same bag.' },
];

// One wide, fluid container for every section: on a large monitor the page fills the screen instead of sitting in a narrow column.
const WIDE = 'mx-auto w-full max-w-[1760px] px-5 sm:px-8 lg:px-14 2xl:px-20';

const eyebrow = 'text-xs font-semibold uppercase tracking-[0.2em] text-husk-700';
const h2 = 'mt-3 text-3xl font-bold tracking-tight text-paddy-900 sm:text-4xl xl:text-5xl';

// Class names are written out in full so Tailwind can see them (it cannot read ones built from a number).
const STAT_COLUMNS: Record<number, string> = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' };
const OPERATION_COLUMNS: Record<number, string> = {
  1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-3 2xl:grid-cols-6',
};

/** A page path uses Next's router; an anchor or an outside address is a plain link (outside ones open in a new tab). */
function Cta({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  if (href.startsWith('/')) return <Link href={href} className={className}>{children}</Link>;
  const outside = /^https?:/.test(href);
  return (
    <a href={href} className={className} {...(outside ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  );
}

export default function HomePage() {
  const { content: c } = useSiteContent();
  const show = useSlideshow(c.slideshow.slides, c.slideshow.intervalSeconds);
  const hasSlides = show.playable.length > 0;

  return (
    <main className="bg-rice-50 font-sans">
      <SiteNav />

      {/* HERO: fills the whole screen. The slideshow, when there is one, is its background. */}
      <section id="home" className="relative isolate flex min-h-[100svh] flex-col justify-center overflow-hidden bg-paddy-900 pb-40 pt-28 sm:pt-32 lg:pb-52">
        <div aria-hidden className="absolute inset-0 -z-20 bg-[radial-gradient(60%_55%_at_82%_18%,rgba(201,151,43,0.30),transparent_70%)]" />
        <div aria-hidden className="absolute inset-0 -z-20 bg-[radial-gradient(55%_60%_at_8%_95%,rgba(59,130,102,0.40),transparent_70%)]" />
        <div aria-hidden className="absolute inset-0 -z-20 opacity-60 [background-image:radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:24px_24px]" />

        <SlideshowStage show={show} className="absolute inset-0 -z-10">
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-paddy-900/90 via-paddy-900/55 to-paddy-900/10" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-paddy-900 via-paddy-900/60 to-transparent" />
        </SlideshowStage>

        <div className={`${WIDE} grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]`}>
          <div>
            {c.hero.eyebrow && (
              <p className="reveal inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium tracking-wide text-husk-300 backdrop-blur-sm">
                <Leaf className="h-3.5 w-3.5" /> {c.hero.eyebrow}
              </p>
            )}
            <h1 className="reveal mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl 2xl:text-[5.25rem]" style={{ ['--reveal-delay' as string]: '100ms' }}>
              {c.hero.headlineAccent && <><span className="text-husk-300">{c.hero.headlineAccent}</span>{' '}</>}
              {c.hero.headline}
            </h1>
            {c.hero.subheadline && (
              <p className="reveal mt-6 max-w-xl text-lg leading-relaxed text-paddy-100 xl:max-w-2xl xl:text-xl" style={{ ['--reveal-delay' as string]: '200ms' }}>
                {c.hero.subheadline}
              </p>
            )}
            <div className="reveal mt-9 flex flex-wrap items-center gap-3" style={{ ['--reveal-delay' as string]: '300ms' }}>
              {c.hero.primaryLabel && c.hero.primaryHref && (
                <Cta href={c.hero.primaryHref} className="inline-flex items-center gap-2 rounded-full bg-husk-500 px-7 py-3.5 text-sm font-semibold text-paddy-900 transition hover:bg-husk-300">
                  {c.hero.primaryLabel} <ArrowRight className="h-4 w-4" />
                </Cta>
              )}
              {c.hero.secondaryLabel && c.hero.secondaryHref && (
                <Cta href={c.hero.secondaryHref} className="inline-flex items-center rounded-full border border-white/30 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10">
                  {c.hero.secondaryLabel}
                </Cta>
              )}
            </div>
            {c.hero.checklist.length > 0 && (
              <ul className="reveal mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-paddy-100" style={{ ['--reveal-delay' as string]: '400ms' }}>
                {c.hero.checklist.map((t) => (
                  <li key={t} className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-husk-300" /> {t}</li>
                ))}
              </ul>
            )}
          </div>

          {/* The product photo, until the Administrator adds a slideshow of their own. */}
          {!hasSlides && (
            <div className="reveal relative mx-auto w-full max-w-md xl:max-w-lg" style={{ ['--reveal-delay' as string]: '200ms' }}>
              <div aria-hidden className="absolute -inset-5 rounded-[2.5rem] bg-husk-500/25 blur-2xl" />
              <div className="relative aspect-[912/866] rotate-2 overflow-hidden rounded-3xl border border-white/20 shadow-2xl shadow-black/40 transition duration-700 hover:rotate-0">
                <Image src="/pectra-hero.jpg" alt="Pectra Rice, Superfine Perfumed Rice, in 25 kg and 5 kg bags beside a bowl of cooked rice" fill priority sizes="(min-width: 1280px) 512px, (min-width: 1024px) 440px, 90vw" className="object-cover" />
              </div>
              <div className="absolute -left-3 -top-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl sm:-left-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-paddy-100 text-paddy-900"><Sprout className="h-5 w-5" /></span>
                <span className="text-sm leading-tight"><span className="block font-semibold text-paddy-900">Traced from the field</span><span className="block text-xs text-ink-500">Every bag recorded end to end</span></span>
              </div>
            </div>
          )}
        </div>

        {hasSlides && (
          <div className={`${WIDE} absolute inset-x-0 bottom-28 z-10 flex items-end justify-between gap-6 lg:bottom-40`}>
            <SlideshowCaption show={show} className="max-w-md rounded-xl bg-black/35 px-4 py-2 text-sm text-white backdrop-blur" />
            <SlideshowControls show={show} className="ml-auto" />
          </div>
        )}
      </section>

      {/* STATS, overlapping the hero */}
      {c.stats.length > 0 && (
        <section className="relative z-10 -mt-16 px-5 sm:px-8 lg:-mt-24 lg:px-14 2xl:px-20">
          <Reveal className={`mx-auto grid max-w-[1760px] grid-cols-2 gap-x-4 gap-y-8 rounded-3xl border border-paddy-100 bg-white p-6 shadow-xl shadow-paddy-900/10 md:divide-x md:divide-paddy-100 md:p-8 ${STAT_COLUMNS[c.stats.length] ?? 'md:grid-cols-4'}`}>
            {c.stats.map((s, i) => {
              const Icon = STAT_ICONS[i % STAT_ICONS.length];
              return (
                <div key={s.id} className="flex items-center gap-4 md:px-6 md:first:pl-0 md:last:pr-0">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-paddy-100 text-paddy-900"><Icon className="h-6 w-6" /></span>
                  <div>
                    <p className="text-2xl font-bold leading-none text-paddy-900 xl:text-3xl">{s.value}</p>
                    <p className="mt-1 text-sm font-semibold text-ink-900">{s.label}</p>
                    {s.sub && <p className="text-xs text-ink-500">{s.sub}</p>}
                  </div>
                </div>
              );
            })}
          </Reveal>
        </section>
      )}

      {/* ABOUT */}
      <section id="about" className={`${WIDE} py-24 lg:py-32`}>
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 xl:gap-20">
          <Reveal>
            {c.about.eyebrow && <p className={eyebrow}>{c.about.eyebrow}</p>}
            <h2 className={h2}>{c.about.heading}</h2>
            {c.about.paragraphs.map((p, i) => (
              <p key={i} className="mt-5 max-w-2xl text-ink-700 xl:text-lg">{p}</p>
            ))}
            {c.about.highlights.length > 0 && (
              <ul className="mt-6 space-y-2.5 text-sm text-ink-700 xl:text-base">
                {c.about.highlights.map((t) => (
                  <li key={t} className="flex items-center gap-2.5"><CheckCircle2 className="h-5 w-5 shrink-0 text-paddy-700" /> {t}</li>
                ))}
              </ul>
            )}
          </Reveal>

          {c.about.work.length > 0 && (
            <Reveal delay={120}>
              <div className="rounded-3xl border border-paddy-100 bg-white p-7 shadow-sm xl:p-10">
                {c.about.workHeading && <p className="text-sm font-semibold text-paddy-900">{c.about.workHeading}</p>}
                <ul className="mt-4 divide-y divide-paddy-100">
                  {c.about.work.map((w) => (
                    <li key={w.id} className="flex items-start gap-3 py-3.5">
                      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-husk-700" />
                      <div><p className="text-sm font-semibold text-ink-900">{w.label}</p>{w.detail && <p className="text-sm text-ink-500">{w.detail}</p>}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* CORE OPERATIONS */}
      {c.operations.items.length > 0 && (
        <section className="bg-white py-24 lg:py-28">
          <div className={WIDE}>
            <Reveal className="mx-auto max-w-2xl text-center">
              {c.operations.eyebrow && <p className={eyebrow}>{c.operations.eyebrow}</p>}
              <h2 className={h2}>{c.operations.heading}</h2>
              {c.operations.intro && <p className="mt-4 text-ink-500">{c.operations.intro}</p>}
            </Reveal>
            <div className={`mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 ${OPERATION_COLUMNS[c.operations.items.length] ?? 'lg:grid-cols-3'}`}>
              {c.operations.items.map((o, i) => {
                const Icon = OPERATION_ICONS[i % OPERATION_ICONS.length];
                return (
                  <Reveal key={o.id} delay={i * 70} className="group rounded-2xl border border-paddy-100 bg-rice-50 p-6 text-center transition duration-300 hover:-translate-y-1.5 hover:border-husk-300 hover:bg-white hover:shadow-xl">
                    <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-paddy-100 text-paddy-900 transition group-hover:bg-paddy-900 group-hover:text-husk-300"><Icon className="h-7 w-7" /></span>
                    <h3 className="mt-5 text-lg font-bold text-paddy-900">{o.title}</h3>
                    {o.body && <p className="mt-2 text-sm leading-relaxed text-ink-500">{o.body}</p>}
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* FEATURES */}
      <section id="features" className={`${WIDE} py-24 lg:py-32`}>
        <Reveal className="max-w-2xl">
          <p className={eyebrow}>Features</p>
          <h2 className={h2}>Traceable by design</h2>
          <p className="mt-4 text-ink-500">
            Behind every bag is KAM-ROMS, the system we built to run the company: every handoff recorded and approved, and never quietly edited.
          </p>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60} className="rounded-2xl border border-paddy-100 bg-white p-7 transition duration-300 hover:-translate-y-1 hover:border-husk-300 hover:shadow-lg">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-paddy-900 text-husk-300"><f.icon className="h-5 w-5" /></span>
              <h3 className="mt-5 text-lg font-bold text-paddy-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10 rounded-2xl border border-paddy-100 bg-white p-6">
          <p className="text-sm font-semibold text-paddy-900">One system, twelve roles</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ROLE_NAMES.map((r) => <span key={r} className="rounded-full bg-paddy-50 px-3 py-1.5 text-xs font-medium text-paddy-900">{r}</span>)}
          </div>
        </Reveal>
      </section>

      {/* THE CHAIN */}
      <section className="bg-paddy-900 py-24 lg:py-28">
        <div className={WIDE}>
          <Reveal className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-husk-300">From field to bag</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl xl:text-5xl">Six handoffs, each approved before it counts.</h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {CHAIN.map((s, i) => (
              <Reveal key={s.step} delay={i * 60} className="bg-paddy-900 p-8 transition hover:bg-paddy-700/60 xl:p-10">
                <span className="text-sm font-bold tracking-widest text-husk-300">{s.step}</span>
                <h3 className="mt-3 text-xl font-bold text-white">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-paddy-100">{s.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCTS */}
      <section id="products" className="bg-white py-24 lg:py-32">
        <div className={`${WIDE} grid grid-cols-1 items-center gap-14 lg:grid-cols-2 xl:gap-24`}>
          <Reveal className="mx-auto w-full max-w-sm xl:max-w-md">
            <div className="relative aspect-[912/1280] overflow-hidden rounded-3xl border border-paddy-100 shadow-2xl shadow-paddy-900/15">
              <Image src="/pectra-rice.jpg" alt="Pectra Rice sales poster: 25 kg and 5 kg bags of Superfine Perfumed Rice with the list of sales points" fill sizes="(min-width: 1280px) 448px, (min-width: 1024px) 384px, 90vw" className="object-cover" />
            </div>
          </Reveal>
          <Reveal delay={120}>
            {c.products.eyebrow && <p className={eyebrow}>{c.products.eyebrow}</p>}
            <h2 className={h2}>{c.products.name}</h2>
            {c.products.tagline && <p className="mt-1 text-lg font-medium text-soil-500">{c.products.tagline}</p>}
            {c.products.description && <p className="mt-5 max-w-2xl text-ink-700 xl:text-lg">{c.products.description}</p>}
            {c.products.sizes.length > 0 && (
              <>
                {c.products.sizesHeading && <p className="mt-6 text-sm font-semibold text-paddy-900">{c.products.sizesHeading}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.products.sizes.map((s) => <span key={s} className="rounded-full border border-paddy-100 bg-rice-50 px-4 py-1.5 text-sm font-medium text-paddy-900">{s}</span>)}
                </div>
              </>
            )}
            {c.products.highlights.length > 0 && (
              <ul className="mt-6 space-y-2.5 text-sm text-ink-700 xl:text-base">
                {c.products.highlights.map((t) => (
                  <li key={t} className="flex items-center gap-2.5"><CheckCircle2 className="h-5 w-5 shrink-0 text-paddy-700" /> {t}</li>
                ))}
              </ul>
            )}
            {c.products.ctaLabel && (
              <a href="#contact" className="mt-8 inline-flex items-center gap-2 rounded-full bg-paddy-900 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-paddy-700">
                {c.products.ctaLabel} <ArrowRight className="h-4 w-4" />
              </a>
            )}
          </Reveal>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="relative isolate overflow-hidden bg-paddy-900 py-24 lg:py-32">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_85%_10%,rgba(201,151,43,0.22),transparent_70%)]" />
        <div className={WIDE}>
          <Reveal className="max-w-2xl">
            {c.contact.eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-husk-300">{c.contact.eyebrow}</p>}
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl xl:text-5xl">{c.contact.heading}</h2>
            {c.contact.intro && <p className="mt-4 text-paddy-100">{c.contact.intro}</p>}
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
            {c.contact.locations.map((p, i) => (
              <Reveal key={p.id} delay={(i % 8) * 50} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition hover:border-husk-300/50 hover:bg-white/10">
                <MapPin className="h-5 w-5 text-husk-300" />
                <p className="mt-3 min-h-[2.5rem] text-sm font-semibold leading-snug text-white">{p.name}</p>
                <div className="mt-3 flex flex-col gap-1.5">
                  {p.phones.map((phone) => (
                    <a key={phone} href={`tel:${dialable(phone)}`} className="inline-flex items-center gap-2 text-sm font-medium text-husk-300 hover:text-husk-500">
                      <Phone className="h-4 w-4" /> {formatPhone(phone)}
                    </a>
                  ))}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-paddy-900">
        <div className="border-t border-white/10 bg-black/25">
          <div className={`${WIDE} flex flex-col items-start justify-between gap-6 py-10 sm:flex-row sm:items-center`}>
            <div>
              <p className="text-lg font-bold text-white">{c.footer.company}</p>
              {c.footer.tagline && <p className="text-sm text-paddy-100">{c.footer.tagline}</p>}
            </div>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-husk-500 px-6 py-3 text-sm font-semibold text-paddy-900 transition hover:bg-husk-300">
              {c.footer.signInLabel || 'Sign in'} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="border-t border-white/10 px-6 py-4 text-center text-xs text-paddy-300" suppressHydrationWarning>&copy; {new Date().getFullYear()} {c.footer.company}. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
