import { useEffect, useState } from 'react';
import { siteApi, siteMediaUrl } from './api-client';

/**
 * The public homepage's editable content. The System Administrator edits this
 * in the Homepage editor; DEFAULT_SITE_CONTENT is what the page shows until
 * somebody does, and what it falls back to if the server cannot be reached,
 * so the homepage can never come up empty.
 */

export type SlideType = 'IMAGE' | 'VIDEO';

export interface SiteSlide {
  id: string;
  type: SlideType;
  mediaId: string | null;
  url: string | null;
  alt: string;
  caption: string;
  enabled: boolean;
}
export interface SiteStat { id: string; label: string; value: string; sub: string }
export interface SiteLabelled { id: string; label: string; detail: string }
export interface SiteCard { id: string; title: string; body: string }
export interface SiteLocation { id: string; name: string; phones: string[] }
export type ContactKind = 'text' | 'phone' | 'email' | 'whatsapp' | 'link';
export interface SiteContactDetail { id: string; label: string; value: string; kind: ContactKind }

export interface SiteContent {
  hero: {
    eyebrow: string; headlineAccent: string; headline: string; subheadline: string; checklist: string[];
    primaryLabel: string; primaryHref: string; secondaryLabel: string; secondaryHref: string;
  };
  slideshow: { intervalSeconds: number; slides: SiteSlide[] };
  stats: SiteStat[];
  about: { eyebrow: string; heading: string; paragraphs: string[]; highlights: string[]; workHeading: string; work: SiteLabelled[] };
  operations: { eyebrow: string; heading: string; intro: string; items: SiteCard[] };
  products: { eyebrow: string; name: string; tagline: string; description: string; sizesHeading: string; sizes: string[]; highlights: string[]; ctaLabel: string };
  contact: { eyebrow: string; heading: string; intro: string; details: SiteContactDetail[]; locations: SiteLocation[] };
  footer: { company: string; tagline: string; signInLabel: string };
  brand: { name: string; subtitle: string; logoMediaId: string | null };
  signin: { showDemoAccounts: boolean; notice: string };
}

export const DEFAULT_SITE_CONTENT: SiteContent = {
  hero: {
    eyebrow: 'KAM Trading and Farms Limited',
    headlineAccent: 'Quality Rice',
    headline: 'from Our Farms to Your Table',
    subheadline:
      'We grow, mill, store and sell Pectra Rice, a Superfine Perfumed Rice, with every bag recorded and traceable from the field it came from to the table it ends up on.',
    checklist: ['Farm fresh', 'Superfine and perfumed', 'Sales points across Ghana'],
    primaryLabel: 'Our Products',
    primaryHref: '#products',
    secondaryLabel: 'Learn More',
    secondaryHref: '#about',
  },
  slideshow: { intervalSeconds: 6, slides: [] },
  stats: [
    { id: 'stat-farms', label: 'Farms', value: '6', sub: 'growing and logging paddy' },
    { id: 'stat-warehouses', label: 'Warehouses', value: '3', sub: 'storing paddy and rice' },
    { id: 'stat-milling', label: 'Milling centers', value: '3', sub: 'turning paddy into rice' },
    { id: 'stat-quality', label: 'Quality guarantee', value: '100%', sub: 'on every bag of Pectra Rice' },
  ],
  about: {
    eyebrow: 'About us',
    heading: 'Grown, milled and sold by one company',
    paragraphs: [
      'KAM Trading and Farms Limited grows, mills, stores and sells Pectra Rice. Six farms feed three warehouses, each with its own milling center, with milling at Sefwi Kanchabio and every sale going out through our base in Adenta, Accra.',
      'Every step is recorded and approved, so every bag can be traced back to the field it came from. That is how we can stand behind the quality of what reaches your table.',
    ],
    highlights: ['Our own farms, warehouses and milling centers', 'Every handoff recorded and approved', 'A quality guarantee on every bag'],
    workHeading: 'Where we work',
    work: [
      { id: 'work-farms', label: 'Farms', detail: 'Six farms growing paddy for Pectra Rice' },
      { id: 'work-milling', label: 'Milling', detail: 'Sefwi Kanchabio' },
      { id: 'work-base', label: 'Sales base', detail: 'Adenta, Accra' },
      { id: 'work-points', label: 'Sales points', detail: 'Lapaz, Tema, Koforidua, Akuse, Cape Coast, East Legon and Sefwi' },
    ],
  },
  operations: {
    eyebrow: 'What we do',
    heading: 'Our Core Operations',
    intro: 'From the farm to the market, every step is handled with care and recorded as it happens.',
    items: [
      { id: 'op-farming', title: 'Farming', body: 'Every paddy delivery is logged by grade, bags and moisture, then approved before it counts as stock.' },
      { id: 'op-milling', title: 'Milling', body: 'Paddy becomes rice, broken rice and hull, with the mass balance checked on every single run.' },
      { id: 'op-warehousing', title: 'Warehousing', body: 'Stock is counted by the bag at every site, so what the screen says is what is on the floor.' },
      { id: 'op-distribution', title: 'Distribution', body: 'Paddy and rice move by tracked delivery, and are never counted as available until they arrive.' },
      { id: 'op-sales', title: 'Sales', body: 'Each order is approved by Finance, released by the Managing Director and delivered by the warehouse. Stock is reserved at release, so no bag is promised twice.' },
    ],
  },
  products: {
    eyebrow: 'Our products',
    name: 'Pectra Rice',
    tagline: 'Superfine Perfumed Rice',
    description:
      'Grown on our own farms, milled in our own centers and packed for the table. Every bag carries the same promise: farm fresh, fragrant, and traceable back to where it was grown.',
    sizesHeading: 'Available in bags of',
    sizes: ['1 kg', '2 kg', '5 kg', '10 kg', '25 kg', '50 kg'],
    highlights: ['Farm fresh', 'Superfine and perfumed', '100% quality guarantee', 'Traced from the field it grew in'],
    ctaLabel: 'Find a sales point',
  },
  contact: {
    eyebrow: 'Contact',
    heading: 'Where to buy Pectra Rice',
    intro: 'Visit or call a Pectra Rice sales point near you.',
    details: [],
    // Sales points exactly as printed on the Pectra Rice sales poster.
    locations: [
      { id: 'loc-lapaz', name: 'Lapaz, Awoshie', phones: ['0541589964'] },
      { id: 'loc-tema', name: 'Tema Community 18', phones: ['0548254399'] },
      { id: 'loc-koforidua', name: 'Koforidua', phones: ['0557706731'] },
      { id: 'loc-adenta', name: 'Adenta', phones: ['0241730440'] },
      { id: 'loc-akuse', name: 'Akuse', phones: ['0543761009'] },
      { id: 'loc-capecoast', name: 'Cape Coast', phones: ['0246130986'] },
      { id: 'loc-eastlegon', name: 'East Legon', phones: ['0266696189'] },
      { id: 'loc-sefwi', name: 'Sefwi Asawinso, Asafo, Juaboso, Wiawso', phones: ['0541771795'] },
    ],
  },
  footer: {
    company: 'KAM Trading and Farms Limited',
    tagline: 'Pectra Rice · Adenta, Accra · Milling at Sefwi Kanchabio',
    signInLabel: 'KAM team and partners: sign in',
  },
  brand: { name: 'KAM', subtitle: 'TRADING & FARMS LTD.', logoMediaId: null },
  // On until the System Administrator turns it off (Admin dashboard, or Homepage > Sign-in page): the one-click
  // demo buttons are how the team tests each role. Switch off before real staff use the system.
  signin: { showDemoAccounts: true, notice: '' },
};

/** Saved content laid over the defaults, section by section, so a field added later never leaves a hole. */
export function mergeSiteContent(stored: unknown): SiteContent {
  if (!stored || typeof stored !== 'object') return DEFAULT_SITE_CONTENT;
  const s = stored as Partial<SiteContent>;
  const d = DEFAULT_SITE_CONTENT;
  return {
    hero: { ...d.hero, ...(s.hero ?? {}) },
    slideshow: {
      intervalSeconds: typeof s.slideshow?.intervalSeconds === 'number' ? s.slideshow.intervalSeconds : d.slideshow.intervalSeconds,
      slides: Array.isArray(s.slideshow?.slides) ? s.slideshow.slides : d.slideshow.slides,
    },
    stats: Array.isArray(s.stats) ? s.stats : d.stats,
    about: { ...d.about, ...(s.about ?? {}) },
    operations: { ...d.operations, ...(s.operations ?? {}) },
    products: { ...d.products, ...(s.products ?? {}) },
    contact: { ...d.contact, ...(s.contact ?? {}) },
    footer: { ...d.footer, ...(s.footer ?? {}) },
    brand: { ...d.brand, ...(s.brand ?? {}) },
    signin: { ...d.signin, ...(s.signin ?? {}) },
  };
}

/** Where a slide's picture or video comes from, or null if it has no source. */
/** Blank rows are dropped rather than rejected, so an unused "Add" never blocks saving. */
export function cleanSiteContentForSave(d: SiteContent): SiteContent {
  const lines = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
  return {
    ...d,
    hero: { ...d.hero, checklist: lines(d.hero.checklist) },
    stats: d.stats.filter((s) => s.label.trim() || s.value.trim()),
    about: { ...d.about, paragraphs: lines(d.about.paragraphs), highlights: lines(d.about.highlights), work: d.about.work.filter((w) => w.label.trim() || w.detail.trim()) },
    operations: { ...d.operations, items: d.operations.items.filter((i) => i.title.trim() || i.body.trim()) },
    products: { ...d.products, sizes: lines(d.products.sizes), highlights: lines(d.products.highlights) },
    contact: { ...d.contact, details: d.contact.details.filter((x) => x.label.trim() || x.value.trim()), locations: d.contact.locations.map((l) => ({ ...l, phones: lines(l.phones) })).filter((l) => l.name.trim() || l.phones.length > 0) },
  };
}

export function slideSrc(slide: SiteSlide): string | null {
  if (slide.mediaId) return siteMediaUrl(slide.mediaId);
  return slide.url || null;
}

/** 0541589964 -> 054 158 9964. Anything else is shown as typed. */
export function formatPhone(n: string): string {
  return /^\d{10}$/.test(n) ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : n;
}

/** Where a contact line goes when tapped (nowhere for plain text). */
export function contactHref(d: SiteContactDetail): string | null {
  const digits = d.value.replace(/[^\d]/g, '');
  if (d.kind === 'phone') return `tel:${dialable(d.value)}`;
  if (d.kind === 'whatsapp') return `https://wa.me/${digits.length === 10 && digits.startsWith('0') ? '233' + digits.slice(1) : digits}`;
  if (d.kind === 'email') return `mailto:${d.value}`;
  if (d.kind === 'link') return d.value;
  return null;
}

/** The dial string for a tel: link. */
export function dialable(n: string): string {
  return n.replace(/[^\d+]/g, '');
}

/** An id for a new list entry (the server accepts letters, digits, - and _). */
export function newEntryId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  return c && 'randomUUID' in c ? c.randomUUID() : `id-${Math.random().toString(36).slice(2, 12)}`;
}

const CACHE_KEY = 'kam_site_content_v1';

/**
 * The homepage content for the current visitor. It starts from the built-in
 * text (so server and browser agree on first paint), shows the last content
 * this browser saw straight away, then replaces it with whatever the server
 * has now. If the server cannot be reached, what is on screen simply stays.
 */
export function useSiteContent() {
  const [content, setContent] = useState<SiteContent>(DEFAULT_SITE_CONTENT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    try {
      const cached = window.localStorage.getItem(CACHE_KEY);
      if (cached) setContent(mergeSiteContent(JSON.parse(cached)));
    } catch {
      // a blocked or corrupt cache just means starting from the defaults
    }
    siteApi
      .getContent()
      .then((res) => {
        if (!live) return;
        setContent(mergeSiteContent(res.content));
        try {
          if (res.content) window.localStorage.setItem(CACHE_KEY, JSON.stringify(res.content));
          else window.localStorage.removeItem(CACHE_KEY);
        } catch {
          // storage is optional
        }
      })
      .catch(() => {
        // keep what is on screen
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return { content, loaded };
}
